const Queue = require('bull');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const DocumentProcessor = require('../documentProcessor');
const { toBlocks } = require('../services/textDocument');
const { buildSegments } = require('../services/translationDocument');
const { buildTranslationDocument } = require('../services/pipeline');
const LiteLLMProvider = require('../adapters/ai/LiteLLMProvider');
const { saveResult, getResult, recentUsage } = require('../services/resultStore');
const { validateMagicBytes } = require('../middleware/fileValidation');
const { emitToSession } = require('../socket/rooms');
const { extractParagraphs, writeBack } = require('../services/docxInplace');
const { assertDocxSafe } = require('../services/zipGuard');
const { extractBlocks, renderOverlay } = require('../services/pdfOverlay');

// Инициализируем сервисы
const documentProcessor = new DocumentProcessor();
const aiProvider = new LiteLLMProvider();

// Жёсткий предел на число сегментов в одном документе (DoS-guard + бюджет).
const MAX_SEGMENTS = Number(process.env.MAX_SEGMENTS) || 1500;

// Предел числа страниц PDF для positional overlay (DoS-guard + бюджет рендера).
const MAX_PAGES = Number(process.env.MAX_PAGES) || 50;

// Предел распакованного размера DOCX (zip-bomb guard) для воркера.
const MAX_DOCX_UNCOMPRESSED = Number(process.env.MAX_DOCX_UNCOMPRESSED_MB || 100) * 1024 * 1024;

// Создаем очередь для обработки документов
const documentQueue = new Queue('document-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Настраиваем обработчики событий очереди
documentQueue.on('progress', (job, progress) => {
  const io = global.app.get('io');
  emitToSession(io, job.data.sessionId, 'translation:progress', {
    jobId: job.id,
    progress,
    status: 'processing'
  });
});

documentQueue.on('completed', (job, result) => {
  const io = global.app.get('io');
  emitToSession(io, job.data.sessionId, 'translation:complete', {
    jobId: job.id,
    message: 'Перевод завершен',
    downloadUrl: `/api/download/${result.filename}`,
    resultToken: result.resultToken
  });
});

documentQueue.on('failed', (job, error) => {
  const io = global.app.get('io');
  emitToSession(io, job.data.sessionId, 'translation:error', {
    jobId: job.id,
    message: error.message
  });
});

// Обработчик процесса перевода
documentQueue.process('translate', async (job) => {
  try {
    const { filePath, sourceLang, targetLang, originalName } = job.data;

    // Обновляем прогресс: Начало обработки
    await job.progress(10);

    const ext = path.extname(filePath).slice(1).toLowerCase();
    let doc = null, outputPath = null, usedInplace = false;

    // DOCX: переводим документ "на месте", сохраняя исходную вёрстку.
    // Любая ошибка → откатываемся на плоский путь ниже, чтобы скачивание не ломалось.
    if (ext === 'docx') {
      try {
        await assertDocxSafe(filePath, MAX_DOCX_UNCOMPRESSED);
        const buffer = await fs.readFile(filePath);
        const { paragraphs, zip, documentXml } = await extractParagraphs(buffer);
        const blocks = paragraphs.map(p => ({ type: 'paragraph', content: p.content }));
        const { blocks: docBlocks, segments } = buildSegments(blocks);
        if (docBlocks.length !== paragraphs.length) {
          throw new Error(`paragraph/segment count mismatch ${docBlocks.length} != ${paragraphs.length}`);
        }
        await job.progress(40);
        doc = await buildTranslationDocument(
          { blocks: docBlocks, segments },
          (chunk) => aiProvider.translateBatchAligned(chunk, sourceLang || 'he', targetLang),
          { sourceLang: sourceLang || 'he', targetLang, maxSegments: MAX_SEGMENTS,
            concurrency: 2, maxPerChunk: 8, maxTokens: 1200,
            owner: 'anon', jobId: String(job.id), ts: Date.now(),
            onCap: (info) => console.warn(`Segment cap hit: ${info.total} > ${info.cap} (job ${job.id})`) }
        );
        await job.progress(80);
        const mapping = {};
        docBlocks.forEach((b, i) => { mapping[paragraphs[i].pIndex] = b.sentences.map(s => s.target).join(' '); });
        const outBuf = await writeBack(zip, documentXml, mapping);
        outputPath = path.join(path.dirname(filePath), `translated_${crypto.randomUUID()}.docx`);
        await fs.writeFile(outputPath, outBuf);
        usedInplace = true;
      } catch (e) {
        console.warn('DOCX in-place failed, falling back to flat:', e.message);
      }
    } else if (ext === 'pdf') {
      // PDF: positional overlay поверх копии оригинала (сохраняем картинки/вёрстку).
      // Сканы (нет текстового слоя) или любая ошибка → плоский путь ниже.
      try {
        const buffer = await fs.readFile(filePath);
        const { blocks: pblocks, noTextLayer } = await extractBlocks(buffer);
        if (noTextLayer || pblocks.length === 0) throw new Error('no text layer (scanned?)');
        const maxPage = pblocks.reduce((m, b) => Math.max(m, b.page), 0);
        if (maxPage + 1 > MAX_PAGES) throw new Error(`too many pages: ${maxPage + 1} > ${MAX_PAGES}`);
        const blocks = pblocks.map(b => ({ type: 'paragraph', content: b.content }));
        const { blocks: docBlocks, segments } = buildSegments(blocks);
        if (docBlocks.length !== pblocks.length) {
          throw new Error(`block/segment mismatch ${docBlocks.length} != ${pblocks.length}`);
        }
        await job.progress(40);
        doc = await buildTranslationDocument(
          { blocks: docBlocks, segments },
          (chunk) => aiProvider.translateBatchAligned(chunk, sourceLang || 'he', targetLang),
          { sourceLang: sourceLang || 'he', targetLang, maxSegments: MAX_SEGMENTS,
            concurrency: 2, maxPerChunk: 8, maxTokens: 1200,
            owner: 'anon', jobId: String(job.id), ts: Date.now(),
            onCap: (info) => console.warn(`Segment cap hit: ${info.total} > ${info.cap} (job ${job.id})`) }
        );
        await job.progress(80);
        const overlayBlocks = pblocks.map((b, i) => ({
          page: b.page,
          bbox: b.bbox,
          pageHeight: b.pageHeight,
          target: docBlocks[i].sentences.map(s => s.target).join(' ')
        }));
        const outBuf = await renderOverlay(buffer, overlayBlocks);
        outputPath = path.join(path.dirname(filePath), `translated_${crypto.randomUUID()}.pdf`);
        await fs.writeFile(outputPath, outBuf);
        usedInplace = true;
      } catch (e) {
        console.warn('PDF overlay failed, falling back to flat:', e.message);
      }
    }

    // Плоский путь (PDF всегда, DOCX как fallback): извлекаем текст и собираем
    // переведённый документ заново, теряя вёрстку, но гарантируя результат.
    if (!usedInplace) {
      // Обрабатываем документ (плоский текст)
      const processed = await documentProcessor.processDocument(filePath, targetLang);
      await job.progress(40);

      // Разбиваем на блоки и сегменты, затем строим TranslationDocument
      const rawBlocks = toBlocks(processed.content);
      const { blocks: docBlocks, segments } = buildSegments(rawBlocks);
      doc = await buildTranslationDocument(
        { blocks: docBlocks, segments },
        (chunk) => aiProvider.translateBatchAligned(chunk, sourceLang || 'he', targetLang),
        { sourceLang: sourceLang || 'he', targetLang, maxSegments: MAX_SEGMENTS,
          concurrency: 2, maxPerChunk: 8, maxTokens: 1200,
          owner: 'anon', jobId: String(job.id), ts: Date.now(),
          onCap: (info) => console.warn(`Segment cap hit: ${info.total} > ${info.cap} (job ${job.id})`) }
      );
      await job.progress(80);

      // downloadable file: flatten translated sentences per block
      const fileBlocks = doc.blocks.map(b => ({ type: 'text', content: b.sentences.map(s => s.target).join(' ') }));
      outputPath = path.join(
        path.dirname(filePath),
        `translated_${crypto.randomUUID()}${path.extname(filePath)}`
      );
      await documentProcessor.generateTranslatedDocument(fileBlocks, outputPath);
    }

    // result for the viewer
    const resultToken = crypto.randomUUID();
    saveResult(resultToken, doc);
    await job.progress(100);

    return {
      filename: path.basename(outputPath),
      resultToken,
      success: true
    };
  } catch (error) {
    console.error('Translation error:', error);
    throw new Error(`Ошибка перевода: ${error.message}`);
  }
});

// Создаем директорию для загрузок, если она не существует
const createUploadsDir = async () => {
  const uploadDir = path.join(__dirname, '../uploads');
  try {
    await fs.access(uploadDir);
  } catch (error) {
    await fs.mkdir(uploadDir, { recursive: true });
  }
  return uploadDir;
};

// Инициализируем директорию при запуске
createUploadsDir().catch(console.error);

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      const uploadDir = await createUploadsDir();
      cb(null, uploadDir);
    } catch (error) {
      console.error('Error creating upload directory:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    // Сохраняем оригинальное расширение файла
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  console.log('Uploading file:', file);
  const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const allowedExtensions = ['.pdf', '.docx'];
  
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Неподдерживаемый тип файла: ${file.mimetype}. Разрешены только PDF и DOCX.`));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: (Number(process.env.MAX_FILE_MB) || 25) * 1024 * 1024
  }
}).single('file');

// Обработчик загрузки файла
router.post('/translate', (req, res) => {
  upload(req, res, async function(err) {
    try {
      if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({
          success: false,
          message: `Ошибка загрузки: ${err.message}`
        });
      } else if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        console.error('No file uploaded');
        return res.status(400).json({
          success: false,
          message: 'Файл не был загружен'
        });
      }

      // Проверяем реальное содержимое файла по магическим байтам.
      // mimetype/расширение легко подделать, поэтому доверяем только сигнатуре.
      const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
      const magic = await validateMagicBytes(req.file.path, ext);
      if (!magic.valid) {
        console.error('Magic-byte validation failed:', { ext, reason: magic.reason });
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          success: false,
          message: 'Файл не прошёл проверку: содержимое не соответствует типу'
        });
      }

      const sourceLang = req.body.sourceLang || 'he';
      const targetLang = req.body.targetLang || 'ru';
      const sessionId = req.body.sessionId;

      console.log('Starting translation:', {
        file: req.file.filename,
        sourceLang,
        targetLang
      });

      // Добавляем задачу в очередь
      const job = await documentQueue.add('translate', {
        filePath: req.file.path,
        sourceLang,
        targetLang,
        originalName: req.file.originalname,
        sessionId
      }, {
        // DoS guard: kill stuck jobs and don't pile up retries on bad input.
        timeout: 120000,
        attempts: 1
      });

      res.json({
        success: true,
        message: 'Файл успешно загружен',
        jobId: job.id,
        file: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          path: req.file.path
        }
      });

    } catch (error) {
      console.error('Error in upload handler:', error);
      res.status(500).json({
        success: false,
        message: 'Внутренняя ошибка сервера при загрузке файла'
      });
    }
  });
});

// Допустимое имя скачиваемого файла: только токен-имена переведённых документов
const DOWNLOAD_FILENAME_RE = /^translated_[0-9a-fA-F-]+\.(pdf|docx)$/;
const DOWNLOAD_TTL_MS = Number(process.env.DOWNLOAD_TTL_MS) || 15 * 60 * 1000;

// Допустимый формат токена результата: hex-символы и дефисы (UUID-подобный),
// минимум 8 символов. Отсекает path-traversal и любой мусор до обращения в стор.
const RESULT_TOKEN_RE = /^[0-9a-fA-F-]{8,}$/;

// Маршрут для скачивания переведенного документа
router.get('/download/:filename', async (req, res) => {
  try {
    // Нормализуем имя, чтобы исключить любые попытки обхода пути (path traversal)
    const filename = path.basename(req.params.filename);

    if (!DOWNLOAD_FILENAME_RE.test(filename)) {
      return res.status(400).json({
        success: false,
        message: 'Недопустимое имя файла'
      });
    }

    const filePath = path.join(__dirname, '../uploads', filename);

    // Проверяем существование файла
    await fs.access(filePath);

    // После завершения отдачи планируем удаление файла по TTL
    res.on('finish', () => {
      setTimeout(() => {
        fs.unlink(filePath).catch(() => {});
      }, DOWNLOAD_TTL_MS);
    });

    res.download(filePath);
  } catch (error) {
    console.error('Download error:', error);
    res.status(404).json({
      success: false,
      message: 'Файл не найден'
    });
  }
});

// Маршрут просмотра результата перевода по токену.
// Возвращает TranslationDocument без админского поля usage; payload приватный.
router.get('/result/:token', (req, res) => {
  const token = req.params.token;
  if (!RESULT_TOKEN_RE.test(token)) {
    return res.status(400).json({ success: false, message: 'invalid token' });
  }

  const doc = getResult(token);
  if (!doc) {
    return res.status(404).json({ success: false, message: 'not found' });
  }

  // Документ содержит полный текст перевода — запрещаем кэширование.
  res.set('Cache-Control', 'private, no-store');
  // Снимаем админ-only поле usage перед отдачей наружу.
  const { usage, ...pub } = doc;
  res.json(pub);
});

// Админский эндпоинт расхода токенов/стоимости, сгруппированный по owner.
// Гейт строгий: нет ADMIN_KEY в окружении ИЛИ заголовок не совпадает → 401.
// Это скрывает данные о стоимости от публики и future-proof'ит per-user панель.
router.get('/admin/usage', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.get('x-admin-key') !== adminKey) {
    return res.status(401).json({ success: false, message: 'unauthorized' });
  }

  const rows = recentUsage(100);
  const byOwner = {};
  for (const { usage } of rows) {
    const owner = usage.owner || 'anon';
    const o = byOwner[owner] || (byOwner[owner] = { jobs: 0, calls: 0, in: 0, out: 0, total: 0, costUsd: 0 });
    o.jobs += 1;
    o.calls += usage.totals?.calls || 0;
    o.in += usage.totals?.in || 0;
    o.out += usage.totals?.out || 0;
    o.total += usage.totals?.total || 0;
    o.costUsd += usage.totals?.costUsd || 0;
  }

  res.set('Cache-Control', 'private, no-store');
  res.json({
    byOwner,
    jobs: rows.map(r => ({
      token: r.token,
      owner: r.usage.owner,
      jobId: r.usage.jobId,
      totals: r.usage.totals,
      byModel: r.usage.byModel
    }))
  });
});

module.exports = router;