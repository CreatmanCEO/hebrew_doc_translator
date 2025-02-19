const LoggingService = require('../../server/services/LoggingService');
const winston = require('winston');

jest.mock('winston', () => {
  const mFormat = {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn()
  };
  
  const mTransports = {
    File: jest.fn(),
    Console: jest.fn()
  };

  return {
    format: mFormat,
    transports: mTransports,
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      add: jest.fn()
    })
  };
});

describe('LoggingService', () => {
  let loggingService;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    loggingService = new LoggingService();
    mockLogger = winston.createLogger();
  });

  describe('Initialization', () => {
    it('should create logger with correct configuration', () => {
      expect(winston.createLogger).toHaveBeenCalled();
      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.timestamp).toHaveBeenCalled();
      expect(winston.format.errors).toHaveBeenCalled();
      expect(winston.format.json).toHaveBeenCalled();
    });

    it('should add console transport in non-production environment', () => {
      process.env.NODE_ENV = 'development';
      new LoggingService();
      expect(winston.transports.Console).toHaveBeenCalled();
    });
  });

  describe('Logging Methods', () => {
    const testMessage = 'Test message';
    const testMeta = { key: 'value' };

    it('should log info messages with timestamp', () => {
      loggingService.info(testMessage, testMeta);
      expect(mockLogger.info).toHaveBeenCalledWith(testMessage, expect.objectContaining({
        timestamp: expect.any(Date),
        key: 'value'
      }));
    });

    it('should log warning messages with timestamp', () => {
      loggingService.warn(testMessage, testMeta);
      expect(mockLogger.warn).toHaveBeenCalledWith(testMessage, expect.objectContaining({
        timestamp: expect.any(Date),
        key: 'value'
      }));
    });

    it('should log error messages with error details', () => {
      const testError = new Error('Test error');
      loggingService.error(testMessage, testError, testMeta);
      expect(mockLogger.error).toHaveBeenCalledWith(testMessage, expect.objectContaining({
        timestamp: expect.any(Date),
        key: 'value',
        error: {
          message: testError.message,
          stack: testError.stack,
          code: undefined
        }
      }));
    });
  });

  describe('Translation Logging', () => {
    const documentId = 'test-doc-123';
    const fileInfo = {
      name: 'test.pdf',
      size: 1024,
      type: 'application/pdf'
    };

    it('should log translation start with file info', () => {
      loggingService.logTranslationStart(documentId, 'he', 'en', fileInfo);
      expect(mockLogger.info).toHaveBeenCalledWith('Translation started', expect.objectContaining({
        documentId,
        sourceLanguage: 'he',
        targetLanguage: 'en',
        fileInfo
      }));
      expect(loggingService.metrics.translationRequests).toBe(1);
    });

    it('should log translation success with metrics', () => {
      const processingTime = 1000;
      loggingService.logTranslationSuccess(documentId, processingTime);
      expect(mockLogger.info).toHaveBeenCalledWith('Translation completed', expect.objectContaining({
        documentId,
        processingTime,
        metrics: expect.any(Object)
      }));
      expect(loggingService.metrics.successfulTranslations).toBe(1);
    });

    it('should log translation error with details', () => {
      const testError = new Error('Translation failed');
      loggingService.logTranslationError(documentId, testError);
      expect(mockLogger.error).toHaveBeenCalledWith('Translation failed', expect.objectContaining({
        documentId,
        error: expect.objectContaining({
          message: testError.message
        })
      }));
      expect(loggingService.metrics.failedTranslations).toBe(1);
    });
  });

  describe('Metrics', () => {
    it('should calculate success rate correctly', () => {
      loggingService.metrics.successfulTranslations = 8;
      loggingService.metrics.failedTranslations = 2;
      expect(loggingService.calculateSuccessRate()).toBe(80);
    });

    it('should handle zero translations in success rate calculation', () => {
      expect(loggingService.calculateSuccessRate()).toBe(0);
    });

    it('should calculate average processing time correctly', () => {
      loggingService.logTranslationSuccess('doc1', 1000);
      loggingService.logTranslationSuccess('doc2', 2000);
      expect(loggingService.metrics.averageProcessingTime).toBe(1500);
    });

    it('should reset metrics correctly', () => {
      loggingService.logTranslationStart('doc1', 'he', 'en', {});
      loggingService.logTranslationSuccess('doc1', 1000);
      loggingService.resetMetrics();
      expect(loggingService.metrics).toEqual({
        translationRequests: 0,
        successfulTranslations: 0,
        failedTranslations: 0,
        averageProcessingTime: 0,
        totalProcessingTime: 0
      });
    });

    it('should return complete metrics with timestamp', () => {
      const metrics = loggingService.getMetrics();
      expect(metrics).toEqual(expect.objectContaining({
        translationRequests: expect.any(Number),
        successfulTranslations: expect.any(Number),
        failedTranslations: expect.any(Number),
        averageProcessingTime: expect.any(Number),
        totalProcessingTime: expect.any(Number),
        successRate: expect.any(Number),
        timestamp: expect.any(Date)
      }));
    });
  });
}); 