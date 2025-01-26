const express = require('express');
const router = express.Router();
const Bull = require('bull');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

const { upload, cleanupFiles } = require('../middleware/fileValidation');
const { DocumentProcessingError } = require('../middleware/errorHandler');
const DocumentAnalyzer = require('../services/DocumentAnalyzer');
const TextExtractor = require('../services/TextExtractor');
const Translator = require('../services/Translator');
const DocumentGenerator = require('../services/DocumentGenerator');

// Создаем очередь для обработки документов
const documentQueue = new Bull('document-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  limiter: {
    max: 5, // Максимум 5 задач одновременно
    duration: 5000 // в течение 5 секунд
  }
});

// Middleware для обработки файлов
router.post('/translate', upload, cleanupFiles, async (req, res, next) => {
  try {
    if (!req.file) {
      throw new DocumentProcessingError('Файл не загружен');
    }

    const jobId = uuidv4();
    const targetLanguage = req.body.targetLanguage || 'ru';
    
    // Получаем инстанс ProgressTracker
    const progressTracker = req.app.get('progressTracker');
    await progressTracker.createProcess(jobId);

    // Создаем задачу в очереди
    const job = await documentQueue.add({
      jobId,
      filePath: req.file.path,
      fileName: req.file.originalname,
      fileType: path.extname(req.file.originalname).toLowerCase(),
      targetLanguage
    });

    // Отправляем идентификатор задачи клиенту
    res.json({
      jobId,
      status: 'processing',
      message: 'Документ принят в обработку'
    });

  } catch (error) {
    next(error);
  }
});

// Обработчик очереди
documentQueue.process(async (job) => {
  const { jobId, filePath, fileType, targetLanguage } = job.data;
  
  // Получаем инстанс ProgressTracker через app
  const progressTracker = global.app.get('progressTracker');

  try {
    // 1. Анализ документа
    await progressTracker.updateProgress(jobId, 10, 'analyzing', {
      message: 'Анализ структуры документа'
    });
    
    const analyzer = new DocumentAnalyzer();
    const documentStructure = await analyzer.analyzeDocument(
      await fs.readFile(filePath),
      fileType.slice(1)
    );

    // 2. Извлечение текста
    await progressTracker.updateProgress(jobId, 30, 'extracting', {
      message: 'Извлечение текста и изображений'
    });
    
    const textExtractor = new TextExtractor();
    const blocks = await textExtractor.extractContent(
      await fs.readFile(filePath),
      fileType.slice(1)
    );

    // 3. Перевод
    await progressTracker.updateProgress(jobId, 50, 'translating', {
      message: 'Перевод текста'
    });
    
    const translator = new Translator();
    const translatedBlocks = await translator.translateBlocks(blocks, targetLanguage);

    // 4. Генерация документа
    await progressTracker.updateProgress(jobId, 80, 'generating', {
      message: 'Создание переведенного документа'
    });
    
    const generator = new DocumentGenerator();
    const outputPath = path.join(
      path.dirname(filePath),
      `translated_${path.basename(filePath)}`
    );

    const resultBuffer = await generator.generateDocument(
      translatedBlocks,
      documentStructure,
      fileType.slice(1)
    );

    // Сохраняем результат
    await fs.writeFile(outputPath, resultBuffer);

    // Завершаем процесс успешно
    await progressTracker.completeProcess(jobId, {
      filePath: outputPath,
      fileName: `translated_${path.basename(filePath)}`
    });

    return { success: true };

  } catch (error) {
    // В случае ошибки
    await progressTracker.handleError(jobId, error);
    throw error;
  } finally {
    // Очистка временных файлов
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Error cleaning up temp file:', error);
    }
  }
});

// Обработка ошибок очереди
documentQueue.on('failed', async (job, error) => {
  const progressTracker = global.app.get('progressTracker');
  await progressTracker.handleError(job.data.jobId, error);
});

// Получение статуса обработки
router.get('/status/:jobId', async (req, res, next) => {
  try {
    const progressTracker = req.app.get('progressTracker');
    const status = await progressTracker.getProcessStatus(req.params.jobId);
    
    if (!status) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    res.json(status);
  } catch (error) {
    next(error);
  }
});

// Получение результата
router.get('/download/:jobId', async (req, res, next) => {
  try {
    const progressTracker = req.app.get('progressTracker');
    const status = await progressTracker.getProcessStatus(req.params.jobId);

    if (!status) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    if (status.status !== 'completed') {
      return res.status(400).json({ 
        error: 'Документ еще не готов',
        status: status.status,
        progress: status.progress 
      });
    }

    const result = JSON.parse(status.result);
    
    // Проверяем существование файла
    try {
      await fs.access(result.filePath);
    } catch {
      return res.status(404).json({ error: 'Файл результата не найден' });
    }

    // Отправляем файл
    res.download(result.filePath, result.fileName, (err) => {
      if (err) {
        next(err);
      }
      // Удаляем файл после отправки
      fs.unlink(result.filePath).catch(console.error);
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;