const path = require('path');
const pdfExtract = require('pdf.js-extract');
const mammoth = require('mammoth');
const Translator = require('./services/Translator');
const ValidationService = require('./services/ValidationService');
const fs = require('fs').promises;
const pdf = require('pdf-parse');
const PDFDocument = require('pdfkit');
const docx = require('docx');

let franc;
(async () => {
  const module = await import('franc');
  franc = module.default;
})();

class DocumentProcessor {
  constructor() {
    this.translator = new Translator();
    this.pdfExtractor = new pdfExtract.PDFExtract();
    this.validationService = new ValidationService();
    this.supportedLanguages = ['he', 'en', 'ru'];
  }

  /**
   * Определение языка текста
   * @private
   */
  async detectLanguage(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return null;
    }
    // Ждем инициализации franc
    while (!franc) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const langCode = franc(text, { minLength: 3 });
    return this.supportedLanguages.includes(langCode) ? langCode : null;
  }

  /**
   * Проверка необходимости перевода блока
   * @private
   */
  async needsTranslation(text, targetLang) {
    const detectedLang = await this.detectLanguage(text);
    return detectedLang && detectedLang !== targetLang;
  }

  async processDocument(filePath, targetLang = 'ru') {
    const fileExt = filePath.toLowerCase().split('.').pop();
    let content = '';

    try {
      if (fileExt === 'pdf') {
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdf(dataBuffer);
        content = pdfData.text;
      } else if (fileExt === 'docx') {
        const result = await mammoth.extractRawText({ path: filePath });
        content = result.value;
      } else {
        throw new Error('Неподдерживаемый формат файла');
      }

      return { content, format: fileExt };
    } catch (error) {
      throw new Error(`Ошибка обработки документа: ${error.message}`);
    }
  }

  async generateTranslatedDocument(translatedContent, outputPath) {
    try {
      const ext = path.extname(outputPath).toLowerCase();
      
      if (ext === '.pdf') {
        await this.generatePDF(translatedContent, outputPath);
      } else if (ext === '.docx') {
        await this.generateDOCX(translatedContent, outputPath);
      } else {
        // Если формат не поддерживается, сохраняем как текст
        await fs.writeFile(outputPath, 
          Array.isArray(translatedContent) 
            ? translatedContent.map(block => 
                block.type === 'table' 
                  ? block.rows.map(row => 
                      row.map(cell => cell.content).join('\t')
                    ).join('\n')
                  : block.content
              ).join('\n\n')
            : translatedContent, 
          'utf8'
        );
      }
      
      return outputPath;
    } catch (error) {
      throw new Error(`Ошибка создания переведенного документа: ${error.message}`);
    }
  }

  async generatePDF(content, outputPath) {
    const doc = new PDFDocument({
      autoFirstPage: true,
      size: 'A4',
      margin: 50
    });

    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'table') {
          // Отрисовка таблицы
          const table = {
            headers: block.rows[0].map(cell => cell.content),
            rows: block.rows.slice(1).map(row => row.map(cell => cell.content))
          };
          
          const cellPadding = 5;
          const cellWidth = (doc.page.width - 100) / table.headers.length;
          const cellHeight = 20;
          
          let startX = 50;
          let startY = doc.y;

          // Отрисовка заголовков
          table.headers.forEach((header, i) => {
            doc
              .rect(startX + (i * cellWidth), startY, cellWidth, cellHeight)
              .stroke()
              .text(header, 
                startX + (i * cellWidth) + cellPadding, 
                startY + cellPadding,
                { width: cellWidth - (cellPadding * 2) }
              );
          });

          startY += cellHeight;

          // Отрисовка строк
          table.rows.forEach(row => {
            const rowHeight = Math.max(...row.map(cell => 
              doc.heightOfString(cell, { width: cellWidth - (cellPadding * 2) })
            )) + (cellPadding * 2);

            // Проверяем, нужна ли новая страница
            if (startY + rowHeight > doc.page.height - 50) {
              doc.addPage();
              startY = 50;
            }

            row.forEach((cell, i) => {
              doc
                .rect(startX + (i * cellWidth), startY, cellWidth, rowHeight)
                .stroke()
                .text(cell, 
                  startX + (i * cellWidth) + cellPadding, 
                  startY + cellPadding,
                  { width: cellWidth - (cellPadding * 2) }
                );
            });

            startY += rowHeight;
          });

          doc.moveDown();
        } else {
          // Отрисовка текстового блока
          if (doc.y + 100 > doc.page.height) {
            doc.addPage();
          }

          doc
            .fontSize(block.style?.fontSize || 12)
            .text(block.content, {
              width: doc.page.width - 100,
              align: block.style?.alignment || 'left'
            })
            .moveDown();
        }
      }
    } else {
      // Если content - это просто текст
      doc.text(content, {
        width: doc.page.width - 100,
        align: 'left'
      });
    }

    doc.end();
    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    });
  }

  async generateDOCX(content, outputPath) {
    const doc = new docx.Document({
      sections: [{
        properties: {},
        children: Array.isArray(content) 
          ? content.map(block => {
              if (block.type === 'table') {
                // Создаем таблицу
                return new docx.Table({
                  rows: block.rows.map(row =>
                    new docx.TableRow({
                      children: row.map(cell =>
                        new docx.TableCell({
                          children: [new docx.Paragraph({
                            children: [new docx.TextRun(cell.content)]
                          })]
                        })
                      )
                    })
                  )
                });
              } else {
                // Создаем параграф
                return new docx.Paragraph({
                  children: [new docx.TextRun(block.content)],
                  style: block.style?.alignment ? {
                    alignment: block.style.alignment
                  } : undefined
                });
              }
            })
          : [new docx.Paragraph({
              children: [new docx.TextRun(content)]
            })]
      }]
    });

    const buffer = await docx.Packer.toBuffer(doc);
    await fs.writeFile(outputPath, buffer);
    return outputPath;
  }

  async processPdf(filePath, targetLang) {
    try {
      const data = await this.pdfExtractor.extract(filePath);
      const formattedContent = await this.formatPdfContent(data, targetLang);
      return formattedContent;
    } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  async processDocx(filePath, targetLang) {
    try {
      const result = await mammoth.extractRawText({
        path: filePath,
        styleMap: [
          "p[style-name='Table Contents'] => table-cell",
          "table => table",
          "tr => table-row",
          "td => table-cell"
        ]
      });
      const formattedContent = await this.formatDocxContent(result, targetLang);
      return formattedContent;
    } catch (error) {
      throw new Error(`DOCX processing failed: ${error.message}`);
    }
  }

  async formatPdfContent(data, targetLang) {
    const pages = [];
    
    for (const page of data.pages) {
      const blocks = [];
      let currentBlock = null;
      let currentTable = null;

      // Сортируем элементы по y-координате для правильного порядка чтения
      const sortedContent = page.content.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 5) { // Элементы на одной строке
          return a.x - b.x;
        }
        return a.y - b.y;
      });

      // Определяем таблицы на основе геометрии и выравнивания
      const tableGroups = this.detectTables(sortedContent);

      for (const item of sortedContent) {
        const tableGroup = tableGroups.find(g => g.items.includes(item));
        
        if (tableGroup) {
          // Если это часть таблицы
          if (!currentTable || currentTable.id !== tableGroup.id) {
            // Завершаем текущий текстовый блок, если есть
            if (currentBlock && currentBlock.content.trim()) {
              currentBlock.needsTranslation = await this.needsTranslation(currentBlock.content, targetLang);
              blocks.push({ ...currentBlock });
              currentBlock = null;
            }

            // Начинаем новую таблицу
            if (!currentTable || currentTable.id !== tableGroup.id) {
              if (currentTable) {
                blocks.push(currentTable);
              }
              currentTable = {
                type: 'table',
                id: tableGroup.id,
                rows: [],
                currentRow: [],
                style: {
                  x: tableGroup.x,
                  y: tableGroup.y,
                  width: tableGroup.width,
                  height: tableGroup.height
                }
              };
            }
          }

          // Добавляем ячейку в текущую строку таблицы
          const cell = {
            content: item.str.trim(),
            style: {
              fontSize: item.fontSize,
              fontFamily: item.fontFamily,
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
              color: item.color
            },
            needsTranslation: await this.needsTranslation(item.str.trim(), targetLang)
          };

          // Определяем, нужно ли начать новую строку
          if (currentTable.currentRow.length > 0 && 
              Math.abs(currentTable.currentRow[0].style.y - cell.style.y) > 5) {
            currentTable.rows.push([...currentTable.currentRow]);
            currentTable.currentRow = [];
          }

          currentTable.currentRow.push(cell);
        } else {
          // Если это обычный текст
          if (currentTable) {
            // Завершаем текущую таблицу
            if (currentTable.currentRow.length > 0) {
              currentTable.rows.push([...currentTable.currentRow]);
            }
            blocks.push(currentTable);
            currentTable = null;
          }

          if (!currentBlock) {
            currentBlock = {
              type: 'text',
              content: '',
              style: {},
              needsTranslation: false
            };
          }

          // Обрабатываем текстовый блок как раньше
          if (
            currentBlock.content &&
            (
              currentBlock.style.fontSize !== item.fontSize ||
              currentBlock.style.fontFamily !== item.fontFamily ||
              Math.abs(currentBlock.style.y - item.y) > 5
            )
          ) {
            if (currentBlock.content.trim()) {
              currentBlock.needsTranslation = await this.needsTranslation(currentBlock.content, targetLang);
              blocks.push({ ...currentBlock });
            }
            
            currentBlock = {
              type: 'text',
              content: '',
              style: {
                fontSize: item.fontSize,
                fontFamily: item.fontFamily,
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
                color: item.color
              },
              needsTranslation: false
            };
          }

          currentBlock.content += (currentBlock.content ? ' ' : '') + item.str;
          currentBlock.style = {
            fontSize: item.fontSize,
            fontFamily: item.fontFamily,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            color: item.color
          };
        }
      }

      // Добавляем последний блок
      if (currentBlock && currentBlock.content.trim()) {
        currentBlock.needsTranslation = await this.needsTranslation(currentBlock.content, targetLang);
        blocks.push(currentBlock);
      }
      if (currentTable && currentTable.currentRow.length > 0) {
        currentTable.rows.push([...currentTable.currentRow]);
        blocks.push(currentTable);
      }

      pages.push({
        pageNumber: page.pageInfo.num,
        width: page.pageInfo.width,
        height: page.pageInfo.height,
        blocks: blocks
      });
    }

    // Переводим все блоки
    for (const page of pages) {
      page.blocks = await this.translateBlocks(page.blocks, targetLang);
    }

    return {
      type: 'pdf',
      pages: pages,
      metadata: data.meta
    };
  }

  async formatDocxContent(result, targetLang) {
    const blocks = [];
    let currentTable = null;
    
    // Разбиваем контент на параграфы и таблицы
    const elements = result.value.split(/(\n\n|<table>|<\/table>|<table-row>|<\/table-row>|<table-cell>|<\/table-cell>)/);
    
    for (const element of elements) {
      const trimmedElement = element.trim();
      if (!trimmedElement) continue;

      if (trimmedElement.startsWith('<table>')) {
        currentTable = {
          type: 'table',
          rows: [],
          currentRow: [],
          style: {
            type: 'table',
            direction: 'ltr' // Будет обновлено после обработки содержимого
          }
        };
      } else if (trimmedElement.startsWith('</table>')) {
        if (currentTable && currentTable.currentRow.length > 0) {
          currentTable.rows.push([...currentTable.currentRow]);
        }
        if (currentTable) {
          // Определяем направление таблицы на основе содержимого
          currentTable.style.direction = this.detectTableDirection(currentTable);
          blocks.push(currentTable);
        }
        currentTable = null;
      } else if (trimmedElement.startsWith('<table-row>')) {
        if (currentTable && currentTable.currentRow.length > 0) {
          currentTable.rows.push([...currentTable.currentRow]);
          currentTable.currentRow = [];
        }
      } else if (trimmedElement.startsWith('<table-cell>')) {
        if (currentTable) {
          const cellContent = trimmedElement.replace(/<\/?table-cell>/g, '').trim();
          const cell = {
            content: cellContent,
            style: {
              type: 'cell',
              alignment: this.detectTextAlignment(cellContent),
              direction: this.detectTextDirection(cellContent)
            },
            needsTranslation: await this.needsTranslation(cellContent, targetLang)
          };
          currentTable.currentRow.push(cell);
        }
      } else if (!currentTable) {
        // Обычный параграф
        const block = {
          type: 'text',
          content: trimmedElement,
          style: {
            type: 'paragraph',
            alignment: this.detectTextAlignment(trimmedElement),
            direction: this.detectTextDirection(trimmedElement)
          },
          needsTranslation: await this.needsTranslation(trimmedElement, targetLang)
        };
        blocks.push(block);
      }
    }

    // Переводим все блоки
    const translatedBlocks = await this.translateBlocks(blocks, targetLang);

    return {
      type: 'docx',
      content: translatedBlocks,
      metadata: result.metadata
    };
  }

  /**
   * Определение выравнивания текста
   * @private
   */
  detectTextAlignment(text) {
    // Простая эвристика для определения выравнивания
    const rtlChars = (text.match(/[\u0590-\u05FF\u0600-\u06FF]/g) || []).length;
    const ltrChars = (text.match(/[a-zA-Z]/g) || []).length;
    
    if (rtlChars > ltrChars) {
      return 'right';
    } else if (ltrChars > rtlChars) {
      return 'left';
    }
    return 'left'; // По умолчанию
  }

  /**
   * Определение направления текста
   * @private
   */
  detectTextDirection(text) {
    const rtlChars = (text.match(/[\u0590-\u05FF\u0600-\u06FF]/g) || []).length;
    const ltrChars = (text.match(/[a-zA-Z]/g) || []).length;
    
    return rtlChars > ltrChars ? 'rtl' : 'ltr';
  }

  /**
   * Определение таблиц на основе геометрии элементов
   * @private
   */
  detectTables(content) {
    const tables = [];
    let currentGroup = null;
    let groupId = 0;

    // Сортируем элементы по строкам
    const rows = {};
    content.forEach(item => {
      const rowKey = Math.floor(item.y);
      if (!rows[rowKey]) {
        rows[rowKey] = [];
      }
      rows[rowKey].push(item);
    });

    // Анализируем выравнивание элементов
    Object.values(rows).forEach(row => {
      if (row.length >= 2) {
        // Проверяем равномерность расстояний между элементами
        const gaps = [];
        for (let i = 1; i < row.length; i++) {
          gaps.push(row[i].x - (row[i-1].x + row[i-1].width));
        }

        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const isUniform = gaps.every(gap => Math.abs(gap - avgGap) < 5);

        if (isUniform) {
          if (!currentGroup) {
            currentGroup = {
              id: `table_${groupId++}`,
              items: [],
              x: Math.min(...row.map(item => item.x)),
              y: Math.min(...row.map(item => item.y)),
              width: Math.max(...row.map(item => item.x + item.width)) - Math.min(...row.map(item => item.x)),
              height: 0
            };
          }
          row.forEach(item => currentGroup.items.push(item));
          currentGroup.height = Math.max(currentGroup.height, item.y + item.height - currentGroup.y);
        } else if (currentGroup) {
          tables.push(currentGroup);
          currentGroup = null;
        }
      }
    });

    if (currentGroup) {
      tables.push(currentGroup);
    }

    return tables;
  }

  /**
   * Определение направления таблицы на основе содержимого
   * @private
   */
  detectTableDirection(table) {
    let rtlCount = 0;
    let ltrCount = 0;

    table.rows.forEach(row => {
      row.forEach(cell => {
        if (cell.style.direction === 'rtl') rtlCount++;
        if (cell.style.direction === 'ltr') ltrCount++;
      });
    });

    return rtlCount > ltrCount ? 'rtl' : 'ltr';
  }

  /**
   * Перевод блоков с учетом их типа
   * @private
   */
  async translateBlocks(blocks, targetLang) {
    const translatedBlocks = [];

    for (const block of blocks) {
      if (block.type === 'table') {
        // Переводим содержимое таблицы
        const translatedRows = [];
        for (const row of block.rows) {
          const translatedRow = await this.translator.translateDocument(row, targetLang);
          translatedRows.push(translatedRow);
        }
        translatedBlocks.push({
          ...block,
          rows: translatedRows
        });
      } else {
        // Переводим обычный блок
        const translatedBlock = await this.translator.translateDocument([block], targetLang);
        translatedBlocks.push(...translatedBlock);
      }
    }

    return translatedBlocks;
  }
}

module.exports = DocumentProcessor;