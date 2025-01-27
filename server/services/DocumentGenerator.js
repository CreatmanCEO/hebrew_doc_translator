const { Document, Packer, Paragraph } = require('docx');
const PdfDocument = require('pdfkit');
const fs = require('fs').promises;

class DocumentGenerator {
  constructor() {
    this.supported = {
      'pdf': this.generatePdf.bind(this),
      'docx': this.generateDocx.bind(this)
    };
  }

  async generate(format, content, outputPath) {
    if (!this.supported[format]) {
      throw new Error(`Unsupported format: ${format}`);
    }
    
    return await this.supported[format](content, outputPath);
  }

  async generatePdf(content, outputPath) {
    return new Promise((resolve, reject) => {
      const doc = new PdfDocument();
      const stream = fs.createWriteStream(outputPath);
      
      doc.pipe(stream);
      
      content.forEach(block => {
        if (block.type === 'text') {
          doc.text(block.content, block.style);
        }
      });
      
      doc.end();
      
      stream.on('finish', resolve);
      stream.on('error', reject);
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