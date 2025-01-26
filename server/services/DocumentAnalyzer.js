const pdf2json = require('pdf2json');
const docx4js = require('docx4js');
const { DocumentBlock } = require('../models/DocumentBlock');
const { LayoutInfo } = require('../models/LayoutInfo');

class DocumentAnalyzer {
  constructor() {
    this.pdfParser = new pdf2json();
  }

  /**
   * Анализ документа и извлечение структуры
   * @param {Buffer} fileBuffer - Буфер файла
   * @param {string} fileType - Тип файла (pdf/docx)
   * @returns {Promise<LayoutInfo>}
   */
  async analyzeDocument(fileBuffer, fileType) {
    try {
      switch(fileType.toLowerCase()) {
        case 'pdf':
          return await this.analyzePDF(fileBuffer);
        case 'docx':
          return await this.analyzeDOCX(fileBuffer);
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      console.error('Document analysis failed:', error);
      throw error;
    }
  }

  /**
   * Анализ PDF документа
   * @private
   */
  async analyzePDF(buffer) {
    return new Promise((resolve, reject) => {
      this.pdfParser.on('pdfParser_dataReady', (pdfData) => {
        try {
          const blocks = [];
          const pageSize = {
            width: pdfData.formImage.Width * 10,
            height: pdfData.formImage.Height * 10
          };

          pdfData.formImage.Pages.forEach((page, pageIndex) => {
            page.Texts.forEach((textItem, index) => {
              const text = decodeURIComponent(textItem.R[0].T);
              const block = new DocumentBlock({
                id: `p${pageIndex}_b${index}`,
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
                type: this.determineBlockType(text, textItem),
                metadata: {
                  pageIndex,
                  originalFont: textItem.R[0].TS[3]
                }
              });
              blocks.push(block);
            });
          });

          const layoutInfo = new LayoutInfo({
            pageSize,
            margins: this.detectMargins(blocks, pageSize),
            orientation: pageSize.width > pageSize.height ? 'landscape' : 'portrait',
            columns: this.detectColumns(blocks),
            blocks
          });

          resolve(layoutInfo);
        } catch (error) {
          reject(error);
        }
      });

      this.pdfParser.on('pdfParser_dataError', reject);
      this.pdfParser.parseBuffer(buffer);
    });
  }

  /**
   * Анализ DOCX документа
   * @private
   */
  async analyzeDOCX(buffer) {
    const doc = await docx4js.load(buffer);
    const blocks = [];
    const docInfo = await doc.getDocInfo();

    await doc.parse((node) => {
      if (node.type === 'paragraph' || node.type === 'text') {
        const style = node.style || {};
        const block = new DocumentBlock({
          id: `w${blocks.length}`,
          text: node.text,
          position: {
            x: style.position?.x || 0,
            y: style.position?.y || 0,
            width: style.width || 0,
            height: style.height || 0
          },
          style: {
            font: style.font?.name,
            size: style.font?.size,
            color: style.color,
            alignment: style.alignment
          },
          type: this.determineBlockType(node.text, node),
          metadata: {
            style: style.name,
            level: style.level
          }
        });
        blocks.push(block);
      }
    });

    return new LayoutInfo({
      pageSize: {
        width: docInfo.pageSize?.width || 595,
        height: docInfo.pageSize?.height || 842
      },
      margins: docInfo.margins || { top: 72, right: 72, bottom: 72, left: 72 },
      orientation: docInfo.orientation || 'portrait',
      columns: [],
      blocks
    });
  }

  /**
   * Определение типа блока текста
   * @private
   */
  determineBlockType(text, item) {
    // Определяем тип блока на основе его характеристик
    if (item.R?.[0]?.TS?.[1] > 14) return 'heading';
    if (text.trim().startsWith('•')) return 'bullet';
    if (/^\d+\./.test(text.trim())) return 'numbered';
    if (text.length < 50 && text.includes(':')) return 'label';
    return 'paragraph';
  }

  /**
   * Определение отступов документа
   * @private
   */
  detectMargins(blocks, pageSize) {
    if (blocks.length === 0) {
      return { top: 72, right: 72, bottom: 72, left: 72 }; // Default margins
    }

    const left = Math.min(...blocks.map(b => b.position.x));
    const top = Math.min(...blocks.map(b => b.position.y));
    const right = pageSize.width - Math.max(...blocks.map(b => b.position.x + b.position.width));
    const bottom = pageSize.height - Math.max(...blocks.map(b => b.position.y + b.position.height));

    return { top, right, bottom, left };
  }

  /**
   * Определение колонок в документе
   * @private
   */
  detectColumns(blocks) {
    // Простой алгоритм определения колонок
    const xPositions = blocks.map(b => b.position.x);
    const uniqueX = [...new Set(xPositions)].sort((a, b) => a - b);
    
    // Если есть несколько четко выраженных x-координат с минимальной разницей
    const columns = [];
    let currentX = uniqueX[0];
    
    for (let i = 1; i < uniqueX.length; i++) {
      if (uniqueX[i] - currentX > 100) { // Минимальное расстояние между колонками
        columns.push({
          x: currentX,
          width: uniqueX[i] - currentX - 20 // Отступ между колонками
        });
        currentX = uniqueX[i];
      }
    }

    return columns;
  }
}

module.exports = DocumentAnalyzer;