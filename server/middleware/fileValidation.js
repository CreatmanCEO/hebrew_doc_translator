const multer = require('multer');
const FileType = require('file-type');
const path = require('path');
const fs = require('fs').promises;

// Конфигурация хранилища
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Фильтр файлов
const fileFilter = async (req, file, cb) => {
  // Проверка расширения
  const allowedExtensions = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (!allowedExtensions.includes(ext)) {
    return cb(new Error('Неподдерживаемый тип файла. Разрешены только PDF и DOC/DOCX'));
  }

  // Проверка MIME-типа
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new Error('Недопустимый тип файла'));
  }

  // Для дополнительной проверки можно использовать file-type
  if (file.buffer) {
    try {
      const fileTypeResult = await FileType.fromBuffer(file.buffer);
      if (!fileTypeResult || !allowedMimes.includes(fileTypeResult.mime)) {
        return cb(new Error('Недопустимый формат файла'));
      }
    } catch (error) {
      console.warn('Не удалось определить тип файла:', error);
    }
  }

  cb(null, true);
};

// Конфигурация multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  }
});

// Middleware для очистки временных файлов
const cleanupFiles = async (req, res, next) => {
  const cleanup = async () => {
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (error) {
        console.error('Ошибка при удалении временного файла:', error);
      }
    }
  };

  // Очистка после завершения запроса
  res.on('finish', cleanup);
  res.on('error', cleanup);
  next();
};

// Обработчик ошибок multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Файл слишком большой. Максимальный размер 10MB'
      });
    }
    return res.status(400).json({ error: error.message });
  }
  next(error);
};

module.exports = {
  upload: upload.single('document'),
  cleanupFiles,
  handleMulterError
};