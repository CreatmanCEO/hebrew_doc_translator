class DocumentGenerator {
  constructor() {
    this.formats = new Set(['pdf', 'docx']);
  }

  async generate(content, format, outputPath) {
    if (!this.formats.has(format)) {
      throw new Error(`Unsupported format: ${format}`);
    }

    switch (format) {
      case 'pdf':
        return await this.generatePdf(content, outputPath);
      case 'docx':
        return await this.generateDocx(content, outputPath);
      default:
        throw new Error('Unsupported format');
    }
  }

  async generatePdf(content, outputPath) {
    // Реализация генерации PDF
    throw new Error('PDF generation not implemented');
  }

  async generateDocx(content, outputPath) {
    // Реализация генерации DOCX
    throw new Error('DOCX generation not implemented');
  }
}

module.exports = DocumentGenerator;