const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Обработчик ошибок
const errorHandler = (err, req, res, next) => {
  try {
    // Логируем ошибку
    logger.error({
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      query: req.query,
      body: req.body,
      params: req.params,
      headers: req.headers
    });

    // Определяем тип ошибки и отправляем соответствующий ответ
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Ошибка валидации',
        details: err.message
      });
    }

    if (err.name === 'TranslationError') {
      return res.status(422).json({
        error: 'Ошибка перевода',
        details: err.message
      });
    }

    if (err.name === 'DocumentProcessingError') {
      return res.status(422).json({
        error: 'Ошибка обработки документа',
        details: err.message
      });
    }

    // Для необработанных ошибок передаем управление следующему обработчику
    if (next) {
      return next(err);
    }

    // Если next не определен, отправляем общий ответ об ошибке
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' 
      ? 'Внутренняя ошибка сервера' 
      : err.message;

    res.status(statusCode).json({
      error: message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
  } catch (error) {
    logger.error('Error in error handler:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Пользовательские классы ошибок
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class TranslationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TranslationError';
    this.statusCode = 422;
  }
}

class DocumentProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocumentProcessingError';
    this.statusCode = 422;
  }
}

module.exports = {
  errorHandler,
  ValidationError,
  TranslationError,
  DocumentProcessingError,
  logger
};