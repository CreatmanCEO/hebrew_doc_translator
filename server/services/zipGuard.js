const yauzl = require('yauzl');

/**
 * Sum the uncompressed size (in bytes) of every entry inside a ZIP/DOCX file.
 *
 * DOCX is a ZIP container; a "zip bomb" packs a tiny compressed archive that
 * expands to gigabytes. We inspect the central-directory entry metadata
 * (uncompressedSize) WITHOUT decompressing, so this is cheap and safe.
 *
 * @param {string} filePath path to the .docx/.zip file
 * @returns {Promise<number>} total uncompressed size in bytes
 */
function uncompressedSize(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      let total = 0;
      let settled = false;
      const fail = (e) => {
        if (settled) return;
        settled = true;
        try { zipfile.close(); } catch (_) { /* noop */ }
        reject(e);
      };

      zipfile.on('entry', (entry) => {
        total += Number(entry.uncompressedSize) || 0;
        zipfile.readEntry();
      });
      zipfile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(total);
      });
      zipfile.on('error', fail);

      zipfile.readEntry();
    });
  });
}

/**
 * Throw DOC_TOO_LARGE if the total uncompressed size of a DOCX exceeds maxBytes.
 *
 * @param {string} filePath
 * @param {number} maxBytes inclusive ceiling on total uncompressed bytes
 * @returns {Promise<void>} resolves (undefined) when within the cap
 * @throws {Error} 'DOC_TOO_LARGE' when over the cap
 */
async function assertDocxSafe(filePath, maxBytes) {
  const total = await uncompressedSize(filePath);
  if (total > maxBytes) {
    throw new Error('DOC_TOO_LARGE');
  }
}

module.exports = { uncompressedSize, assertDocxSafe };
