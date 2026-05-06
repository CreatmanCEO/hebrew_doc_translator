const { Document, Packer, Paragraph } = require('docx');
const PdfDocument = require('pdfkit');
const fs = require('fs').promises;

class DocumentGenerator {
  constructor() {
    this.formats = new Set(['pdf', 'docx']);
  }

  async generate(format, content, outputPath) {
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
    return new Promise((resolve, reject) => {
      const doc = new PdfDocument();
      const writeStream = fs.createWriteStream(outputPath);
      
      doc.pipe(writeStream);
      
      content.forEach(block => {
        if (block.type === 'text') {
          doc.text(block.content, block.style);
        }
      });
      
      doc.end();
      
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }

  async generateDocx(content, outputPath) {
    const doc = new Document();
    
    content.forEach(block => {
      if (block.type === 'text') {
        doc.addParagraph(new Paragraph(block.content));
      }
    });
    
    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(outputPath, buffer);
  }
}

module.exports = DocumentGenerator;