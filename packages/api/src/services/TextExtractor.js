const { createWorker } = require('tesseract.js');
const pdf2json = require('pdf2json');
const docx4js = require('docx4js');
const franc = require('franc');
const sharp = require('sharp');
const sizeOf = require('image-size');
const { DocumentBlock } = require('../models/DocumentBlock');

class TextExtractor {
  constructor() {
    this.worker = null;
    this.pdfParser = new pdf2json();
  }

  /**
   * Инициализация OCR worker для иврита
   * @private
   */
  async initWorker() {
    if (!this.worker) {
      this.worker = await createWorker();
      await this.worker.loadLanguage('heb+eng'); // Поддержка иврита и английского
      await this.worker.initialize('heb+eng');
      await this.worker.setParameters({
        tessedit_pageseg_mode: '1',
        preserve_interword_spaces: '1'
      });
    }
    return this.worker;
  }

  /**
   * Определение языка текста
   * @private
   */
  detectLanguage(text) {
    try {
      // Минимальная длина для определения языка
      if (text.length < 10) {
        return this.detectLanguageByScript(text);
      }
      
      const lang = franc(text, { minLength: 1 });
      if (lang === 'heb') return 'he';
      if (lang === 'eng') return 'en';
      return lang;
    } catch (error) {
      console.error('Language detection failed:', error);
      return 'unknown';
    }
  }

  /**
   * Определение языка по скрипту для коротких текстов
   * @private
   */
  detectLanguageByScript(text) {
    const hebrewPattern = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
    const englishPattern = /^[A-Za-z\s.,!?-]+$/;
    
    if (hebrewPattern.test(text)) return 'he';
    if (englishPattern.test(text)) return 'en';
    return 'unknown';
  }

  /**
   * Извлечение текста и изображений из документа
   * @param {Buffer} fileBuffer - Буфер файла
   * @param {string} fileType - Тип файла
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<Array>} Массив блоков (текст и изображения)
   */
  async extractContent(fileBuffer, fileType, options = {}) {
    try {
      switch(fileType.toLowerCase()) {
        case 'pdf':
          return await this.extractFromPDF(fileBuffer, options);
        case 'docx':
          return await this.extractFromDOCX(fileBuffer, options);
        default:
          throw new Error(\`Unsupported file type: \${fileType}\`);
      }
    } catch (error) {
      console.error('Content extraction failed:', error);
      throw error;
    }
  }

  /**
   * Извлечение содержимого из PDF
   * @private
   */
  async extractFromPDF(buffer, options) {
    const blocks = [];
    
    try {
      const pdfData = await this.parsePDF(buffer);
      
      // Извлечение текста
      pdfData.formImage.Pages.forEach((page, pageIndex) => {
        // Обработка текстовых элементов
        page.Texts.forEach((textItem, index) => {
          const text = decodeURIComponent(textItem.R[0].T);
          const language = this.detectLanguage(text);
          
          const block = new DocumentBlock({
            id: \`p\${pageIndex}_t\${index}\`,
            text,
            position: {
              x: textItem.x * 10,
              y: textItem.y * 10,
              width: textItem.w * 10,
              height: textItem.h * 10
            },
            style: {
              font: textItem.R[0].TS[0],
              size: textItem.R[0].TS[1],
              color: textItem.R[0].TS[2]
            },
            contentType: 'text',
            language,
            needsTranslation: language === 'he',
            type: this.determineBlockType(text, textItem)
          });
          blocks.push(block);
        });

        // Обработка изображений
        if (page.Images) {
          page.Images.forEach((image, index) => {
            blocks.push(new DocumentBlock({
              id: \`p\${pageIndex}_i\${index}\`,
              position: {
                x: image.x * 10,
                y: image.y * 10,
                width: image.w * 10,
                height: image.h * 10
              },
              contentType: 'image',
              imageData: image.data,
              needsTranslation: false
            }));
          });
        }
      });

      // Проверяем необходимость OCR
      if (blocks.filter(b => b.isText()).length === 0) {
        const ocrBlocks = await this.performOCR(buffer, options);
        blocks.push(...ocrBlocks);
      }

    } catch (error) {
      console.error('PDF extraction failed:', error);
      throw error;
    }

    return this.postProcessBlocks(blocks);
  }

  /**
   * Извлечение содержимого из DOCX
   * @private
   */
  async extractFromDOCX(buffer, options) {
    const blocks = [];
    const doc = await docx4js.load(buffer);

    await doc.parse(async (node) => {
      if (node.type === 'paragraph' || node.type === 'text') {
        const text = node.text;
        const language = this.detectLanguage(text);
        
        blocks.push(new DocumentBlock({
          id: \`w\${blocks.length}\`,
          text,
          position: node.position || {},
          style: node.style || {},
          contentType: 'text',
          language,
          needsTranslation: language === 'he',
          type: this.determineBlockType(text, node)
        }));
      } 
      else if (node.type === 'image') {
        try {
          const imageBuffer = await node.getData();
          const dimensions = sizeOf(imageBuffer);
          
          blocks.push(new DocumentBlock({
            id: \`w_i\${blocks.length}\`,
            position: {
              x: node.position?.x || 0,
              y: node.position?.y || 0,
              width: dimensions.width,
              height: dimensions.height
            },
            contentType: 'image',
            imageData: imageBuffer.toString('base64'),
            needsTranslation: false
          }));
        } catch (error) {
          console.error('Image extraction failed:', error);
        }
      }
    });

    return this.postProcessBlocks(blocks);
  }

  /**
   * Выполнение OCR
   * @private
   */
  async performOCR(buffer, options) {
    const worker = await this.initWorker();
    const { data } = await worker.recognize(buffer);
    
    return data.words.map((word, index) => {
      const text = word.text;
      const language = this.detectLanguage(text);
      
      return new DocumentBlock({
        id: \`ocr_\${index}\`,
        text,
        position: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0
        },
        contentType: 'text',
        language,
        needsTranslation: language === 'he',
        type: 'ocr',
        metadata: {
          confidence: word.confidence
        }
      });
    });
  }

  /**
   * Постобработка блоков
   * @private
   */
  postProcessBlocks(blocks) {
    return blocks.map(block => {
      if (block.isText()) {
        // Объединение соседних блоков одного языка
        const nearBlocks = this.findNearBlocks(block, blocks);
        if (nearBlocks.length > 0) {
          return this.mergeBlocks([block, ...nearBlocks]);
        }
      }
      return block;
    }).filter((block, index, self) => 
      // Удаление дубликатов после объединения
      self.findIndex(b => b.id === block.id) === index
    );
  }

  /**
   * Поиск близких блоков того же языка
   * @private
   */
  findNearBlocks(block, allBlocks) {
    const threshold = 5; // пикселей
    return allBlocks.filter(other => 
      other.id !== block.id &&
      other.isText() &&
      other.language === block.language &&
      Math.abs(other.position.y - block.position.y) < threshold &&
      Math.abs(other.position.x - (block.position.x + block.position.width)) < threshold
    );
  }

  /**
   * Объединение блоков
   * @private
   */
  mergeBlocks(blocks) {
    const first = blocks[0];
    const text = blocks.map(b => b.text).join(' ');
    const width = blocks.reduce((w, b) => w + b.position.width, 0);
    
    return new DocumentBlock({
      ...first,
      id: \`merged_\${first.id}\`,
      text,
      position: {
        ...first.position,
        width
      }
    });
  }

  /**
   * Определение типа блока
   * @private
   */
  determineBlockType(text, item) {
    if (item.R?.[0]?.TS?.[1] > 14) return 'heading';
    if (text.trim().startsWith('•')) return 'bullet';
    if (/^\\d+\\./.test(text.trim())) return 'numbered';
    if (text.length < 50 && text.includes(':')) return 'label';
    return 'paragraph';
  }

  /**
   * Очистка ресурсов
   */
  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

module.exports = TextExtractor;