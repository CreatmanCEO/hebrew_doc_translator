const fs = require('fs').promises;
const path = require('path');
const mime = require('mime-types');
const { createHash } = require('crypto');

class ValidationService {
  constructor() {
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
    this.supportedFormats = ['.pdf', '.docx'];
    this.suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:.*base64/i,
      /<%.*%>/i,
      /\${.*}/i
    ];
  }

  /**
   * Валидация параметров перевода
   */
  validateTranslationParams(sourceLang, targetLang, supportedLanguages) {
    if (!sourceLang || !targetLang) {
      return {
        isValid: false,
        error: 'Source and target languages are required'
      };
    }

    if (!supportedLanguages.includes(sourceLang)) {
      return {
        isValid: false,
        error: `Source language '${sourceLang}' is not supported`
      };
    }

    if (!supportedLanguages.includes(targetLang)) {
      return {
        isValid: false,
        error: `Target language '${targetLang}' is not supported`
      };
    }

    if (sourceLang === targetLang) {
      return {
        isValid: false,
        error: 'Source and target languages must be different'
      };
    }

    return { isValid: true };
  }

  /**
   * Валидация файла
   */
  async validateFile(filePath) {
    try {
      // Проверка существования файла
      const stats = await fs.stat(filePath);
      
      // Проверка размера
      if (stats.size > this.maxFileSize) {
        return {
          isValid: false,
          error: `File size exceeds maximum allowed size of ${this.maxFileSize / 1024 / 1024}MB`
        };
      }

      // Проверка формата
      const ext = path.extname(filePath).toLowerCase();
      if (!this.supportedFormats.includes(ext)) {
        return {
          isValid: false,
          error: `Unsupported file format: ${ext}. Supported formats: ${this.supportedFormats.join(', ')}`
        };
      }

      // Проверка MIME-типа
      const mimeType = mime.lookup(filePath);
      const validMimeTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!validMimeTypes.includes(mimeType)) {
        return {
          isValid: false,
          error: `Invalid MIME type: ${mimeType}`
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `File validation failed: ${error.message}`
      };
    }
  }

  /**
   * Проверка безопасности файла
   */
  async validateSecurity(filePath) {
    try {
      // Чтение первых 1MB файла для проверки
      const fileHandle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(1024 * 1024);
      const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);
      await fileHandle.close();

      const content = buffer.toString('utf8', 0, bytesRead);

      // Проверка на подозрительные паттерны
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(content)) {
          return {
            isValid: false,
            error: 'File contains potentially malicious content'
          };
        }
      }

      // Проверка целостности файла
      const hash = await this.calculateFileHash(filePath);
      if (!hash) {
        return {
          isValid: false,
          error: 'File integrity check failed'
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `Security validation failed: ${error.message}`
      };
    }
  }

  /**
   * Проверка структуры документа
   */
  async validateDocumentStructure(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.pdf') {
        return await this.validatePdfStructure(filePath);
      } else if (ext === '.docx') {
        return await this.validateDocxStructure(filePath);
      }

      return {
        isValid: false,
        error: 'Unsupported document type'
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Structure validation failed: ${error.message}`
      };
    }
  }

  /**
   * Проверка структуры PDF
   * @private
   */
  async validatePdfStructure(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      
      // Проверка сигнатуры PDF
      if (!buffer.toString('ascii', 0, 5).startsWith('%PDF-')) {
        return {
          isValid: false,
          error: 'Invalid PDF file signature'
        };
      }

      // Проверка на наличие EOF маркера
      const lastBytes = buffer.slice(-6);
      if (!lastBytes.includes(Buffer.from('%%EOF'))) {
        return {
          isValid: false,
          error: 'PDF file is incomplete or corrupted'
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `PDF structure validation failed: ${error.message}`
      };
    }
  }

  /**
   * Проверка структуры DOCX
   * @private
   */
  async validateDocxStructure(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      
      // Проверка сигнатуры DOCX (ZIP архив)
      const signature = buffer.slice(0, 4);
      if (signature.toString('hex') !== '504b0304') {
        return {
          isValid: false,
          error: 'Invalid DOCX file signature'
        };
      }

      // Дополнительные проверки структуры DOCX можно добавить здесь

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `DOCX structure validation failed: ${error.message}`
      };
    }
  }

  /**
   * Вычисление хеша файла
   * @private
   */
  async calculateFileHash(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hashSum = createHash('sha256');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    } catch (error) {
      console.error('Hash calculation failed:', error);
      return null;
    }
  }
}

module.exports = ValidationService; 