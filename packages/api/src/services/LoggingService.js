const winston = require('winston');
const path = require('path');

class LoggingService {
  constructor() {
    const logDir = path.join(process.cwd(), 'logs');

    // Форматирование логов
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    // Основной логгер
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { service: 'hebrew-doc-translator' },
      transports: [
        // Ошибки записываются в отдельный файл
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        // Все логи записываются в общий файл
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          maxsize: 10485760, // 10MB
          maxFiles: 5
        })
      ]
    });

    // В режиме разработки добавляем вывод в консоль
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }

    // Метрики
    this.metrics = {
      translationRequests: 0,
      successfulTranslations: 0,
      failedTranslations: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * Логирование информационного сообщения
   */
  info(message, meta = {}) {
    this.logger.info(message, { timestamp: new Date(), ...meta });
  }

  /**
   * Логирование предупреждения
   */
  warn(message, meta = {}) {
    this.logger.warn(message, { timestamp: new Date(), ...meta });
  }

  /**
   * Логирование ошибки
   */
  error(message, error = null, meta = {}) {
    const errorMeta = {
      timestamp: new Date(),
      ...meta,
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code
        }
      })
    };
    this.logger.error(message, errorMeta);
  }

  /**
   * Логирование начала обработки документа
   */
  logTranslationStart(documentId, sourceLanguage, targetLanguage, fileInfo) {
    this.metrics.translationRequests++;
    this.info('Translation started', {
      documentId,
      sourceLanguage,
      targetLanguage,
      fileInfo: {
        name: fileInfo.name,
        size: fileInfo.size,
        type: fileInfo.type
      }
    });
  }

  /**
   * Логирование успешного завершения перевода
   */
  logTranslationSuccess(documentId, processingTime) {
    this.metrics.successfulTranslations++;
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.averageProcessingTime = 
      this.metrics.totalProcessingTime / this.metrics.successfulTranslations;

    this.info('Translation completed', {
      documentId,
      processingTime,
      metrics: { ...this.metrics }
    });
  }

  /**
   * Логирование ошибки перевода
   */
  logTranslationError(documentId, error, meta = {}) {
    this.metrics.failedTranslations++;
    this.error('Translation failed', error, {
      documentId,
      ...meta,
      metrics: { ...this.metrics }
    });
  }

  /**
   * Получение текущих метрик
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.calculateSuccessRate(),
      timestamp: new Date()
    };
  }

  /**
   * Расчет процента успешных переводов
   * @private
   */
  calculateSuccessRate() {
    const total = this.metrics.successfulTranslations + this.metrics.failedTranslations;
    return total > 0 ? (this.metrics.successfulTranslations / total) * 100 : 0;
  }

  /**
   * Сброс метрик
   */
  resetMetrics() {
    this.metrics = {
      translationRequests: 0,
      successfulTranslations: 0,
      failedTranslations: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };
  }
}

module.exports = LoggingService; 