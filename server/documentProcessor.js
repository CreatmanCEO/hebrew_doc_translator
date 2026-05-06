const mammoth = require('mammoth');
const PDFExtract = require('pdf.js-extract').PDFExtract;
const path = require('path');
const pdfExtract = new PDFExtract();

class DocumentProcessor {
  async processDocument(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.pdf':
        return await this.processPdf(filePath);
      case '.docx':
        return await this.processDocx(filePath);
      default:
        throw new Error('Unsupported file format');
    }
  }

  async processPdf(filePath) {
    try {
      const data = await pdfExtract.extract(filePath);
      return this.formatPdfContent(data);
    } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  async processDocx(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return this.formatDocxContent(result.value);
    } catch (error) {
      throw new Error(`DOCX processing failed: ${error.message}`);
    }
  }

  formatPdfContent(data) {
    // Реализация форматирования PDF
    return {
      type: 'pdf',
      content: data.pages.map(page => ({
        pageNumber: page.pageInfo.num,
        text: page.content.map(item => item.str).join(' ')
      }))
    };
  }

  formatDocxContent(content) {
    // Реализация форматирования DOCX
    return {
      type: 'docx',
      content: content.split('\n').filter(line => line.trim())
    };
  }
}

module.exports = DocumentProcessor;