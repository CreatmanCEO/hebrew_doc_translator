const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

/**
 * Open a .docx buffer, parse word/document.xml, and return the non-empty body
 * paragraphs with their positional index (within ALL <w:p>, including those
 * nested in table cells), plus the loaded zip and the raw XML for write-back.
 *
 * Security: untrusted XML must reject DOCTYPE (XXE / billion-laughs guard).
 *
 * @param {Buffer} buffer - raw .docx file contents (a zip)
 * @returns {Promise<{paragraphs: {pIndex:number, content:string}[], zip: import('jszip'), documentXml: string}>}
 */
async function extractParagraphs(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('not a docx: word/document.xml missing');

  const documentXml = await entry.async('string');
  // XXE / billion-laughs guard: refuse any DOCTYPE declaration.
  if (/<!DOCTYPE/i.test(documentXml)) {
    throw new Error('DOCTYPE not allowed (XXE guard)');
  }

  const dom = new DOMParser().parseFromString(documentXml, 'text/xml');

  // getElementsByTagName finds all <w:p>, nested (table cells) included.
  const ps = Array.from(dom.getElementsByTagName('w:p'));
  const paragraphs = [];
  ps.forEach((p, pIndex) => {
    const text = Array.from(p.getElementsByTagName('w:t'))
      .map((t) => t.textContent || '')
      .join('');
    if (text.trim().length > 0) {
      paragraphs.push({ pIndex, content: text });
    }
  });

  return { paragraphs, zip, documentXml };
}

module.exports = { extractParagraphs };
