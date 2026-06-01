const path = require('path');
const mammoth = require('mammoth');
const ValidationService = require('./services/ValidationService');
const fs = require('fs').promises;
const fsSync = require('fs'); // createWriteStream lives on the sync fs, not fs.promises
const pdf = require('pdf-parse');
const PDFDocument = require('pdfkit');
const docx = require('docx');

class DocumentProcessor {
  constructor() {
    this.validationService = new ValidationService();
    this.supportedLanguages = ['he', 'en', 'ru'];
  }

  async processDocument(filePath, targetLang = 'en') {
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

    const writeStream = fsSync.createWriteStream(outputPath);
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
}

module.exports = DocumentProcessor;
