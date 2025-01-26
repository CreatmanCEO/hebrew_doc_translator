const { Document, Paragraph, TextRun, HeadingLevel } = require('docx');
const PDFDocument = require('pdfkit');
const fs = require('fs').promises;

async function generatePDF(translatedData, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(outputPath);

    doc.pipe(stream);

    if (translatedData.formatting) {
      // Воссоздаем форматирование из оригинального PDF
      translatedData.formatting.forEach(page => {
        page.forEach(item => {
          doc
            .font('Helvetica')
            .fontSize(item.fontSize || 12)
            .text(item.text, item.x, item.y, {
              width: item.width,
              height: item.height,
              align: 'left'
            });
        });
        doc.addPage();
      });
    } else {
      // Простой вывод текста без форматирования
      doc
        .font('Helvetica')
        .fontSize(12)
        .text(translatedData.translatedText);
    }

    doc.end();

    stream.on('finish', () => {
      resolve(outputPath);
    });

    stream.on('error', reject);
  });
}

async function generateDOCX(translatedData, outputPath) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: translatedData.translatedText,
              size: 24 // 12pt
            })
          ]
        })
      ]
    }]
  });

  const buffer = await doc.save();
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

async function generateDocument(translatedData, outputPath, outputFormat) {
  try {
    if (outputFormat === 'pdf') {
      return await generatePDF(translatedData, outputPath);
    } else {
      return await generateDOCX(translatedData, outputPath);
    }
  } catch (error) {
    console.error('Error generating document:', error);
    throw error;
  }
}

module.exports = {
  generateDocument
};