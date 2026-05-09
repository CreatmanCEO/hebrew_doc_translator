// packages/api/src/api/translate.js
// Тонкий роут: валидация загрузки + enqueue в Bull. Никаких Queue-инстансов
// на уровне импорта — используем фабрику getQueue().
// Тяжёлая обработка живёт в packages/api/src/worker.js.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const env = require('../config/env');
const { getQueue } = require('../queue');

const router = express.Router();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('UNSUPPORTED_FORMAT'));
    }
    cb(null, true);
  },
});

router.post('/translate', upload.single('document'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 'NO_FILE', message: 'document file required' });
    }
    const { sourceLang = 'he', targetLang = 'en' } = req.body || {};
    const queue = getQueue();
    const job = await queue.add('translate', {
      filePath: req.file.path,
      originalName: req.file.originalname,
      sourceLang,
      targetLang,
    });
    res.status(202).json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
});

router.get('/status/:jobId', async (req, res, next) => {
  try {
    const queue = getQueue();
    const job = await queue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ code: 'JOB_NOT_FOUND' });
    }
    const state = await job.getState();
    res.json({ jobId: job.id, state, progress: job.progress() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
