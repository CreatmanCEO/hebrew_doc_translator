const { createWorker } = require('tesseract.js');
const pdf2json = require('pdf2json');
const docx4js = require('docx4js');

class TextExtractor {
  constructor() {
    this.worker = null;
    this.pdfParser = new pdf2json();
  }

  async initWorker() {
    if (!this.worker) {
      this.worker = await createWorker();
      await this.worker.loadLanguage('heb+eng');
      await this.worker.initialize('heb+eng');
      await this.worker.setParameters({
        tessedit_pageseg_mode: '1',
        preserve_interword_spaces: '1'
      });
    }
    return this.worker;
  }

  detectLanguage(text) {
    try {
      if (text.length < 10) {
        return this.detectLanguageByScript(text);
      }
      
      const lang = this.detectLanguageByScript(text);
      if (lang === 'he') return 'he';
      if (lang === 'en') return 'en';
      return 'unknown';
    } catch (error) {
      console.error('Language detection failed:', error);
      return 'unknown';
    }
  }

  detectLanguageByScript(text) {
    const hebrewPattern = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
    const englishPattern = /^[A-Za-z\s.,!?-]+$/;
    
    if (hebrewPattern.test(text)) return 'he';
    if (englishPattern.test(text)) return 'en';
    return 'unknown';
  }

  async extractContent(fileBuffer, fileType) {
    try {
      switch(fileType.toLowerCase()) {
        case 'pdf':
          return await this.extractFromPDF(fileBuffer);
        case 'docx':
          return await this.extractFromDOCX(fileBuffer);
        default:
          throw new Error('Unsupported file type: ' + fileType);
      }
    } catch (error) {
      console.error('Content extraction failed:', error);
      throw error;
    }
  }

  async extractFromPDF(buffer) {
    const textBlocks = [];
    
    try {
      const pdfData = await this.parsePDF(buffer);
      const hasText = pdfData.formImage.Pages.some(page => 
        page.Texts && page.Texts.length > 0
      );

      if (hasText) {
        pdfData.formImage.Pages.forEach((page, pageIndex) => {
          page.Texts.forEach(textItem => {
            textBlocks.push({
              text: decodeURIComponent(textItem.R[0].T),
              confidence: 1,
              bounds: {
                x: textItem.x,
                y: textItem.y,
                width: textItem.w,
                height: textItem.h
              },
              page: pageIndex,
              isOCR: false
            });
          });
        });
      } else {
        const ocrBlocks = await this.performOCR(buffer);
        textBlocks.push(...ocrBlocks);
      }
    } catch (error) {
      console.error('PDF extraction failed, falling back to OCR:', error);
      const ocrBlocks = await this.performOCR(buffer);
      textBlocks.push(...ocrBlocks);
    }

    return this.postProcessBlocks(textBlocks);
  }

  async extractFromDOCX(buffer) {
    const textBlocks = [];
    const doc = await docx4js.load(buffer);

    await doc.parse((node) => {
      if (node.type === 'paragraph' || node.type === 'text') {
        textBlocks.push({
          text: node.text,
          confidence: 1,
          bounds: node.bounds || {},
          isOCR: false,
          style: node.style
        });
      }
    });

    return this.postProcessBlocks(textBlocks);
  }

  async performOCR(buffer) {
    const worker = await this.initWorker();
    const { data } = await worker.recognize(buffer);
    
    return data.words.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bounds: {
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0
      },
      isOCR: true
    }));
  }

  postProcessBlocks(blocks) {
    return blocks.map(block => {
      let text = block.text.trim();
      
      if (this.isHebrew(text)) {
        text = this.handleRTL(text);
      }

      if (block.isOCR) {
        text = this.fixHebrewOCRErrors(text);
      }

      return {
        ...block,
        text
      };
    });
  }

  isHebrew(text) {
    const hebrewPattern = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
    return hebrewPattern.test(text);
  }

  handleRTL(text) {
    return String.fromCharCode(0x202B) + text + String.fromCharCode(0x202C);
  }

  fixHebrewOCRErrors(text) {
    const corrections = {
      'ן': 'ו',
      'ר': 'ד',
      'ה': 'ח'
    };

    return text.split('').map(char => corrections[char] || char).join('');
  }

  async parsePDF(buffer) {
    return new Promise((resolve, reject) => {
      this.pdfParser.on('pdfParser_dataReady', resolve);
      this.pdfParser.on('pdfParser_dataError', reject);
      this.pdfParser.parseBuffer(buffer);
    });
  }

  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

module.exports = TextExtractor;