const mammoth = require('mammoth');
const { createWorker } = require('tesseract.js');
const axios = require('axios');
const { Translator } = require('@azure/ai-translator');
const PDFExtract = require('pdf.js-extract').PDFExtract;
const pdfExtract = new PDFExtract();
const fs = require('fs').promises;

// Создаем OCR worker для иврита
let worker = null;

async function initWorker() {
  if (!worker) {
    worker = await createWorker('heb');
    await worker.loadLanguage('heb');
    await worker.initialize('heb');
  }
  return worker;
}

async function extractTextFromPDF(filePath) {
  try {
    const data = await pdfExtract.extract(filePath, {});
    const pages = data.pages;
    
    // Сохраняем информацию о форматировании
    const textWithFormatting = pages.map(page => {
      return page.content.map(item => ({
        text: item.str,
        x: item.x,
        y: item.y,
        fontSize: item.fontName ? parseInt(item.fontName.match(/\d+/)?.[0] || 12) : 12,
        font: item.fontName,
        width: item.width,
        height: item.height
      }));
    });

    return textWithFormatting;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
}

async function extractTextFromDOC(filePath) {
  try {
    const result = await mammoth.extractRawText({path: filePath});
    return result.value;
  } catch (error) {
    console.error('Error extracting text from DOC:', error);
    throw error;
  }
}

async function translateText(text, targetLanguage) {
  const endpoint = process.env.TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com";
  const key = process.env.TRANSLATOR_KEY;

  try {
    const translator = new Translator(key, endpoint);
    const result = await translator.translate(text, 'he', targetLanguage);
    return result[0].translations[0].text;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

async function processDocument(filePath, targetLanguage) {
  const fileExtension = filePath.split('.').pop().toLowerCase();
  let extractedText;
  let formatting;

  try {
    if (fileExtension === 'pdf') {
      const textData = await extractTextFromPDF(filePath);
      formatting = textData;
      extractedText = textData.map(page => 
        page.map(item => item.text).join(' ')
      ).join('\n');
    } else {
      extractedText = await extractTextFromDOC(filePath);
    }

    // Проверяем, нужен ли OCR
    if (!extractedText.trim()) {
      const worker = await initWorker();
      const { data: { text } } = await worker.recognize(filePath);
      extractedText = text;
    }

    // Переводим текст
    const translatedText = await translateText(extractedText, targetLanguage);

    return {
      translatedText,
      formatting,
      originalText: extractedText
    };
  } catch (error) {
    console.error('Error processing document:', error);
    throw error;
  }
}

module.exports = {
  processDocument,
  initWorker
};