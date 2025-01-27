const Queue = require('bull');
const express = require('express');
const router = express.Router();

// Создаем очередь для обработки документов
const documentQueue = new Queue('document-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Обработчик POST запроса на перевод
router.post('/', async (req, res) => {
  try {
    const job = await documentQueue.add({
      documentId: req.body.documentId,
      sourceLang: req.body.sourceLang,
      targetLang: req.body.targetLang
    });
    
    res.json({ jobId: job.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;