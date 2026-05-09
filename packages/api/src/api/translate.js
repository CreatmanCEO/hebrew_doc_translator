const Queue = require('bull');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const DocumentProcessor = require('../documentProcessor');
const Translator = require('../services/Translator');

// Инициализируем сервисы
const documentProcessor = new DocumentProcessor();
const translator = new Translator();

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
  if (io) {
    io.emit('translation:progress', {
      jobId: job.id,
      progress,
      status: 'processing'
    });
  }
});

documentQueue.on('completed', (job, result) => {
  const io = global.app.get('io');
  if (io) {
    io.emit('translation:complete', {
      jobId: job.id,
      message: 'Перевод завершен',
      downloadUrl: `/api/download/${result.filename}`
    });
  }
});

documentQueue.on('failed', (job, error) => {
  const io = global.app.get('io');
  if (io) {
    io.emit('translation:error', {
      jobId: job.id,
      message: error.message
    });
  }
});

// Обработчик процесса перевода
documentQueue.process('translate', async (job) => {
  try {
    const { filePath, sourceLang, targetLang, originalName } = job.data;
    
    // Обновляем прогресс: Начало обработки
    await job.progress(10);
    
    // Обрабатываем документ
    const processedDocument = await documentProcessor.processDocument(filePath, targetLang);
    await job.progress(50);
    
    // Переводим документ
    const translatedDocument = await translator.translateDocument(processedDocument.content, targetLang);
    await job.progress(80);
    
    // Генерируем переведенный файл
    const outputPath = path.join(path.dirname(filePath), `translated_${path.basename(filePath)}`);
    await documentProcessor.generateTranslatedDocument(translatedDocument, outputPath);
    await job.progress(100);
    
    return {
      filename: path.basename(outputPath),
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
    fileSize: 50 * 1024 * 1024 // 50MB
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

      const sourceLang = req.body.sourceLang || 'he';
      const targetLang = req.body.targetLang || 'ru';

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
        originalName: req.file.originalname
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

// Маршрут для скачивания переведенного документа
router.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads', filename);
    
    // Проверяем существование файла
    await fs.access(filePath);
    
    res.download(filePath);
  } catch (error) {
    console.error('Download error:', error);
    res.status(404).json({
      success: false,
      message: 'Файл не найден'
    });
  }
});

module.exports = router;