const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

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

/**
 * Inject translations into word/document.xml at paragraph level, preserving
 * everything else (run/paragraph props, images, tables). For each pIndex in
 * `mapping`, the paragraph's FIRST <w:t> receives the translated string (NFC
 * normalized) and the remaining <w:t> of that paragraph are blanked. The zip
 * is repackaged and returned as a Buffer.
 *
 * Security/robustness (🔴): the serialized XML is re-parsed for validation;
 * any problem throws so the caller can fall back to the flat generator and
 * never emits a corrupt file.
 *
 * @param {import('jszip')} zip - JSZip instance from extractParagraphs
 * @param {string} documentXml - raw word/document.xml string
 * @param {Object<string|number, string>} mapping - pIndex -> translated text
 * @returns {Promise<Buffer>} repackaged .docx buffer
 */
async function writeBack(zip, documentXml, mapping) {
  const dom = new DOMParser().parseFromString(documentXml, 'text/xml');
  const ps = Array.from(dom.getElementsByTagName('w:p'));

  for (const key of Object.keys(mapping)) {
    const text = mapping[key];
    if (typeof text !== 'string') {
      throw new Error('mapping target must be a string');
    }
    const p = ps[Number(key)];
    if (!p) continue;
    const ts = Array.from(p.getElementsByTagName('w:t'));
    if (ts.length === 0) continue;
    ts[0].textContent = text.normalize('NFC');
    ts[0].setAttribute('xml:space', 'preserve');
    for (const t of ts.slice(1)) {
      t.textContent = '';
    }
  }

  const outXml = new XMLSerializer().serializeToString(dom);

  // Validate: re-parse and reject anything that didn't round-trip cleanly.
  const check = new DOMParser().parseFromString(outXml, 'text/xml');
  if (!check || check.getElementsByTagName('parsererror').length > 0) {
    throw new Error('writeBack produced invalid XML');
  }

  zip.file('word/document.xml', outXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = { extractParagraphs, writeBack };
