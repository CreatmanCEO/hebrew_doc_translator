const ValidationService = require('../../server/services/ValidationService');
const fs = require('fs').promises;
const path = require('path');

jest.mock('fs').promises;
jest.mock('mime-types');

describe('ValidationService', () => {
  let validationService;
  let mockFileContent;

  beforeEach(() => {
    validationService = new ValidationService();
    mockFileContent = Buffer.from('%PDF-1.7\nsome content\n%%EOF');

    // Мокаем fs.promises
    fs.stat.mockResolvedValue({ size: 1024 * 1024 }); // 1MB
    fs.readFile.mockResolvedValue(mockFileContent);
    fs.open.mockResolvedValue({
      read: jest.fn().mockResolvedValue({ bytesRead: mockFileContent.length }),
      close: jest.fn().mockResolvedValue(undefined)
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTranslationParams', () => {
    const supportedLanguages = ['he', 'en', 'ru'];

    it('should validate correct translation parameters', () => {
      const result = validationService.validateTranslationParams('he', 'ru', supportedLanguages);
      expect(result.isValid).toBe(true);
    });

    it('should reject missing languages', () => {
      const result = validationService.validateTranslationParams(null, 'ru', supportedLanguages);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Source and target languages are required');
    });

    it('should reject unsupported source language', () => {
      const result = validationService.validateTranslationParams('fr', 'ru', supportedLanguages);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Source language 'fr' is not supported");
    });

    it('should reject unsupported target language', () => {
      const result = validationService.validateTranslationParams('he', 'fr', supportedLanguages);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Target language 'fr' is not supported");
    });

    it('should reject same source and target languages', () => {
      const result = validationService.validateTranslationParams('he', 'he', supportedLanguages);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Source and target languages must be different');
    });
  });

  describe('validateFile', () => {
    beforeEach(() => {
      require('mime-types').lookup.mockReturnValue('application/pdf');
    });

    it('should validate correct PDF file', async () => {
      const result = await validationService.validateFile('test.pdf');
      expect(result.isValid).toBe(true);
    });

    it('should reject oversized files', async () => {
      fs.stat.mockResolvedValueOnce({ size: 100 * 1024 * 1024 }); // 100MB
      const result = await validationService.validateFile('test.pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    it('should reject unsupported file formats', async () => {
      const result = await validationService.validateFile('test.txt');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unsupported file format');
    });

    it('should handle missing files', async () => {
      fs.stat.mockRejectedValueOnce(new Error('File not found'));
      const result = await validationService.validateFile('missing.pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('File validation failed');
    });
  });

  describe('validateSecurity', () => {
    it('should detect malicious content', async () => {
      const maliciousContent = Buffer.from('<script>alert("xss")</script>');
      fs.open.mockResolvedValueOnce({
        read: jest.fn().mockResolvedValue({ bytesRead: maliciousContent.length }),
        close: jest.fn().mockResolvedValue(undefined)
      });

      const result = await validationService.validateSecurity('test.pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('File contains potentially malicious content');
    });

    it('should validate safe content', async () => {
      const result = await validationService.validateSecurity('test.pdf');
      expect(result.isValid).toBe(true);
    });

    it('should handle file read errors', async () => {
      fs.open.mockRejectedValueOnce(new Error('Read error'));
      const result = await validationService.validateSecurity('test.pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Security validation failed');
    });
  });

  describe('validateDocumentStructure', () => {
    describe('PDF Structure', () => {
      it('should validate correct PDF structure', async () => {
        const result = await validationService.validatePdfStructure('test.pdf');
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid PDF signature', async () => {
        fs.readFile.mockResolvedValueOnce(Buffer.from('INVALID'));
        const result = await validationService.validatePdfStructure('test.pdf');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid PDF file signature');
      });

      it('should reject incomplete PDF', async () => {
        fs.readFile.mockResolvedValueOnce(Buffer.from('%PDF-1.7\nsome content'));
        const result = await validationService.validatePdfStructure('test.pdf');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('PDF file is incomplete or corrupted');
      });
    });

    describe('DOCX Structure', () => {
      it('should validate correct DOCX structure', async () => {
        // Мокаем сигнатуру ZIP файла
        const zipSignature = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
        fs.readFile.mockResolvedValueOnce(zipSignature);

        const result = await validationService.validateDocxStructure('test.docx');
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid DOCX signature', async () => {
        fs.readFile.mockResolvedValueOnce(Buffer.from('INVALID'));
        const result = await validationService.validateDocxStructure('test.docx');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid DOCX file signature');
      });
    });
  });
}); 