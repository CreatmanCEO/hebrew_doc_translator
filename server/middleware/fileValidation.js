const multer = require('multer');
const mime = require('mime-types');
const fsp = require('fs').promises;

const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Магические сигнатуры (первые 4 байта) для проверки реального содержимого файла.
// Защита от подмены типа через расширение/mimetype (которые легко подделать).
const MAGIC_SIGNATURES = {
  // %PDF
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]),
  // PK\x03\x04 — обычный ZIP-контейнер (docx является ZIP-архивом)
  docx: Buffer.from([0x50, 0x4B, 0x03, 0x04])
};

/**
 * Проверяет, что первые байты файла соответствуют заявленному расширению.
 * @param {string} filePath путь к файлу на диске
 * @param {string} ext расширение в нижнем регистре без точки ('pdf' | 'docx')
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
async function validateMagicBytes(filePath, ext) {
  const expected = MAGIC_SIGNATURES[ext];
  if (!expected) {
    return { valid: false, reason: 'unsupported' };
  }

  let handle;
  try {
    handle = await fsp.open(filePath, 'r');
    const buffer = Buffer.alloc(expected.length);
    const { bytesRead } = await handle.read(buffer, 0, expected.length, 0);
    if (bytesRead < expected.length) {
      return { valid: false, reason: 'too-short' };
    }
    if (!buffer.equals(expected)) {
      return { valid: false, reason: 'signature-mismatch' };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'read-error' };
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.' + mime.extension(file.mimetype));
  }
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    cb(new Error('Invalid file type. Only PDF and DOCX files are allowed.'), false);
    return;
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

module.exports = upload;
module.exports.validateMagicBytes = validateMagicBytes;