const PDFDocument = require('pdfkit');
const { Document, Paragraph, TextRun } = require('docx');
const path = require('path');

class DocumentGenerator {
  constructor() {
    this.supportedFonts = {
      'Arial': { regular: 'fonts/arial.ttf', bold: 'fonts/arial-bold.ttf' },
      'Times': { regular: 'fonts/times.ttf', bold: 'times-bold.ttf' }
    };
  }

  async generateDocument(blocks, layoutInfo, outputFormat) {
    try {
      const sortedBlocks = this.sortBlocksByPosition(blocks);
      
      switch(outputFormat.toLowerCase()) {
        case 'pdf':
          return await this.generatePDF(sortedBlocks, layoutInfo);
        case 'docx':
          return await this.generateDOCX(sortedBlocks, layoutInfo);
        default:
          throw new Error('Unsupported output format: ' + outputFormat);
      }
    } catch (error) {
      console.error('Document generation failed:', error);
      throw error;
    }
  }

  sortBlocksByPosition(blocks) {
    return [...blocks].sort((a, b) => {
      if (Math.abs(a.position.y - b.position.y) < 5) {
        return a.position.x - b.position.x;
      }
      return a.position.y - b.position.y;
    });
  }

  async generatePDF(blocks, layoutInfo) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: [layoutInfo.pageSize.width, layoutInfo.pageSize.height],
          margins: layoutInfo.margins,
          autoFirstPage: true,
          rtl: this.shouldUseRTL(blocks)
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        blocks.forEach(block => {
          if (block.isImage()) {
            this.addPDFImage(doc, block);
          } else {
            this.addPDFText(doc, block);
          }
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  shouldUseRTL(blocks) {
    const rtlBlocks = blocks.filter(b => 
      b.isText() && ['he', 'ar'].includes(b.language)
    ).length;
    const ltrBlocks = blocks.filter(b => 
      b.isText() && !['he', 'ar'].includes(b.language)
    ).length;
    return rtlBlocks > ltrBlocks;
  }

  addPDFImage(doc, block) {
    if (block.imageData) {
      doc.image(
        Buffer.from(block.imageData, 'base64'),
        block.position.x,
        block.position.y,
        {
          width: block.position.width,
          height: block.position.height
        }
      );
    }
  }

  addPDFText(doc, block) {
    doc
      .font(block.style.font || 'Arial')
      .fontSize(block.style.size || 12)
      .fillColor(block.style.color || 'black');

    const options = {
      width: block.position.width,
      height: block.position.height,
      align: block.style.alignment || 'left',
      indent: block.style.indent || 0,
      lineGap: block.style.lineHeight || 0
    };

    doc.text(block.text, block.position.x, block.position.y, options);
  }

  async generateDOCX(blocks, layoutInfo) {
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: {
              width: layoutInfo.pageSize.width,
              height: layoutInfo.pageSize.height
            },
            margins: layoutInfo.margins
          },
          bidi: this.shouldUseRTL(blocks)
        },
        children: blocks.map(block => this.createDOCXElement(block))
      }]
    });

    return await doc.save();
  }

  createDOCXElement(block) {
    return new Paragraph({
      children: [
        new TextRun({
          text: block.text || '',
          size: (block.style.size || 12) * 2,
          font: block.style.font || 'Arial',
          color: block.style.color || '000000',
          bold: block.style.bold,
          italic: block.style.italic
        })
      ],
      spacing: {
        before: block.position.y,
        after: 0
      },
      indent: {
        left: block.position.x,
        right: block.position.x
      },
      alignment: this.convertAlignment(block.style.alignment)
    });
  }

  convertAlignment(alignment) {
    const alignmentMap = {
      'left': 'START',
      'center': 'CENTER',
      'right': 'END',
      'justify': 'BOTH'
    };
    return alignmentMap[alignment] || 'START';
  }
}

module.exports = DocumentGenerator;