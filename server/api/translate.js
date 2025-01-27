const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const Bull = require('bull');

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
  }
});

// Обработчик очереди
documentQueue.process(async (data) => {
  const { jobId, filePath, fileType, targetLanguage } = data.jobId;
  const progressTracker = global.app.get('progressTracker');

  try {
    await progressTracker.createProcess(jobId);
    
    // 1. Анализ документа
    await progressTracker.updateProgress(jobId, 10, 'analyzing');
    const analyzer = new DocumentAnalyzer();
    const documentStructure = await analyzer.analyzeDocument(
      await fs.readFile(filePath),
      fileType.slice(1)
    );

    // 2. Извлечение текста
    await progressTracker.updateProgress(jobId, 30, 'extracting');
    const textExtractor = new TextExtractor();
    const blocks = await textExtractor.extractContent(
      await fs.readFile(filePath),
      fileType.slice(1)
    );

    // 3. Перевод
    await progressTracker.updateProgress(jobId, 50, 'translating');
    const translator = new Translator();
    const translatedBlocks = await translator.translateBlocks(blocks, targetLanguage);

    // 4. Генерация документа
    await progressTracker.updateProgress(jobId, 80, 'generating');
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

    await fs.writeFile(outputPath, resultBuffer);
    await progressTracker.completeProcess(jobId, {
      filePath: outputPath,
      fileName: `translated_${path.basename(filePath)}`
    });

    return { success: true };
  } catch (error) {
    await progressTracker.handleError(jobId, error);
    throw error;
  }
});

// Маршруты API
router.post('/translate', async (req, res, next) => {
  try {
    if (!req.file) {
      throw new DocumentProcessingError('Файл не загружен');
    }

    const jobId = uuidv4();
    const targetLanguage = req.body.targetLanguage || 'ru';

    await documentQueue.add({
      jobId,
      filePath: req.file.path,
      fileName: req.file.originalname,
      fileType: path.extname(req.file.originalname).toLowerCase(),
      targetLanguage
    });

    res.json({
      jobId,
      status: 'processing',
      message: 'Документ принят в обработку'
    });

  } catch (error) {
    next(error);
  }
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

// Скачивание результата
router.get('/download/:jobId', async (req, res, next) => {
  try {
    const progressTracker = req.app.get('progressTracker');
    const status = await progressTracker.getProcessStatus(req.params.jobId);

    if (!status || status.status !== 'completed') {
      return res.status(404).json({ error: 'Результат не найден' });
    }

    const result = JSON.parse(status.result);
    res.download(result.filePath, result.fileName);
  } catch (error) {
    next(error);
  }
});

module.exports = router;