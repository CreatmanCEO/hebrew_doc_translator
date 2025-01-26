const PDFDocument = require('pdfkit');
const { Document, Paragraph, TextRun, ImageRun, HeadingLevel } = require('docx');
const fs = require('fs').promises;
const sharp = require('sharp');

class DocumentGenerator {
  constructor() {
    this.supportedFonts = {
      'Arial': { regular: 'fonts/arial.ttf', bold: 'fonts/arial-bold.ttf' },
      'Times': { regular: 'fonts/times.ttf', bold: 'fonts/times-bold.ttf' }
    };
  }

  /**
   * Генерация документа
   * @param {Array} blocks - Блоки документа
   * @param {Object} layoutInfo - Информация о layout
   * @param {string} outputFormat - Формат выходного документа
   * @returns {Promise<Buffer>} Буфер с готовым документом
   */
  async generateDocument(blocks, layoutInfo, outputFormat) {
    try {
      // Сортируем блоки по позиции
      const sortedBlocks = this.sortBlocksByPosition(blocks);
      
      switch(outputFormat.toLowerCase()) {
        case 'pdf':
          return await this.generatePDF(sortedBlocks, layoutInfo);
        case 'docx':
          return await this.generateDOCX(sortedBlocks, layoutInfo);
        default:
          throw new Error(\`Unsupported output format: \${outputFormat}\`);
      }
    } catch (error) {
      console.error('Document generation failed:', error);
      throw error;
    }
  }

  /**
   * Генерация PDF
   * @private
   */
  async generatePDF(blocks, layoutInfo) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: [layoutInfo.pageSize.width, layoutInfo.pageSize.height],
          margins: layoutInfo.margins,
          autoFirstPage: true,
          rtl: this.shouldUseRTL(blocks) // Определяем направление текста
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Регистрируем шрифты
        await this.registerPDFFonts(doc);

        // Добавляем контент
        for (const block of blocks) {
          await this.addPDFBlock(doc, block);
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Определение направления текста
   * @private
   */
  shouldUseRTL(blocks) {
    const rtlBlocks = blocks.filter(b => 
      b.isText() && ['he', 'ar'].includes(b.language)
    ).length;
    const ltrBlocks = blocks.filter(b => 
      b.isText() && !['he', 'ar'].includes(b.language)
    ).length;
    return rtlBlocks > ltrBlocks;
  }

  /**
   * Регистрация шрифтов в PDF
   * @private
   */
  async registerPDFFonts(doc) {
    for (const [fontName, fontPaths] of Object.entries(this.supportedFonts)) {
      try {
        doc.registerFont(fontName, fontPaths.regular);
        doc.registerFont(\`\${fontName}-Bold\`, fontPaths.bold);
      } catch (error) {
        console.error(\`Failed to register font \${fontName}:\`, error);
      }
    }
  }

  /**
   * Добавление блока в PDF
   * @private
   */
  async addPDFBlock(doc, block) {
    try {
      if (block.isImage()) {
        await this.addPDFImage(doc, block);
      } else {
        await this.addPDFText(doc, block);
      }
    } catch (error) {
      console.error(\`Failed to add block \${block.id}:\`, error);
    }
  }

  /**
   * Добавление изображения в PDF
   * @private
   */
  async addPDFImage(doc, block) {
    try {
      const imageBuffer = Buffer.from(block.imageData, 'base64');
      const image = await sharp(imageBuffer)
        .resize(block.position.width, block.position.height, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .toBuffer();

      doc.image(image, block.position.x, block.position.y, {
        width: block.position.width,
        height: block.position.height
      });
    } catch (error) {
      console.error('Failed to add image:', error);
    }
  }

  /**
   * Добавление текста в PDF
   * @private
   */
  async addPDFText(doc, block) {
    // Настройка стилей текста
    doc
      .font(block.style.font || 'Arial')
      .fontSize(block.style.size || 12)
      .fillColor(block.style.color || 'black');

    // Добавление текста с учетом направления
    const options = {
      width: block.position.width,
      height: block.position.height,
      align: block.style.alignment || 'left',
      features: ['rtla'], // Поддержка RTL
      indent: block.style.indent || 0,
      lineGap: block.style.lineHeight || 0
    };

    // Применяем маркеры направления текста если нужно
    const text = this.applyDirectionMarkers(block);

    doc.text(text, block.position.x, block.position.y, options);
  }

  /**
   * Применение маркеров направления текста
   * @private
   */
  applyDirectionMarkers(block) {
    if (['he', 'ar'].includes(block.language)) {
      return \`\\u202B\${block.text}\\u202C\`;
    }
    return block.text;
  }

  /**
   * Генерация DOCX
   * @private
   */
  async generateDOCX(blocks, layoutInfo) {
    const sections = this.groupBlocksIntoSections(blocks);
    
    const doc = new Document({
      sections: sections.map(section => ({
        properties: {
          page: {
            size: {
              width: layoutInfo.pageSize.width,
              height: layoutInfo.pageSize.height
            },
            margins: layoutInfo.margins
          },
          bidi: this.shouldUseRTL(section.blocks)
        },
        children: section.blocks.map(block => 
          this.createDOCXElement(block)
        )
      }))
    });

    return await doc.save();
  }

  /**
   * Группировка блоков по секциям
   * @private
   */
  groupBlocksIntoSections(blocks) {
    const sections = [];
    let currentSection = { blocks: [] };

    blocks.forEach(block => {
      // Новая секция при смене направления текста
      if (currentSection.blocks.length > 0 && 
          this.shouldUseRTL([block]) !== this.shouldUseRTL(currentSection.blocks)) {
        sections.push(currentSection);
        currentSection = { blocks: [] };
      }
      currentSection.blocks.push(block);
    });

    sections.push(currentSection);
    return sections;
  }

  /**
   * Создание элемента DOCX
   * @private
   */
  createDOCXElement(block) {
    if (block.isImage()) {
      return this.createDOCXImage(block);
    }
    return this.createDOCXParagraph(block);
  }

  /**
   * Создание изображения DOCX
   * @private
   */
  createDOCXImage(block) {
    return new Paragraph({
      children: [
        new ImageRun({
          data: Buffer.from(block.imageData, 'base64'),
          transformation: {
            width: block.position.width,
            height: block.position.height
          }
        })
      ],
      spacing: {
        before: block.position.y,
        after: 0
      }
    });
  }

  /**
   * Создание параграфа DOCX
   * @private
   */
  createDOCXParagraph(block) {
    const textRun = new TextRun({
      text: block.text,
      size: block.style.size * 2, // Конвертация в half-points
      font: block.style.font,
      color: block.style.color,
      bold: block.style.bold,
      italic: block.style.italic,
      underline: block.style.underline
    });

    return new Paragraph({
      children: [textRun],
      spacing: {
        before: block.position.y,
        after: 0
      },
      indent: {
        left: block.position.x,
        right: block.position.x
      },
      alignment: this.convertAlignment(block.style.alignment),
      bidirectional: ['he', 'ar'].includes(block.language)
    });
  }

  /**
   * Сортировка блоков по позиции
   * @private
   */
  sortBlocksByPosition(blocks) {
    return [...blocks].sort((a, b) => {
      if (Math.abs(a.position.y - b.position.y) < 5) {
        return a.position.x - b.position.x;
      }
      return a.position.y - b.position.y;
    });
  }

  /**
   * Конвертация значений выравнивания
   * @private
   */
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