const multer = require('multer');
const mime = require('mime-types');

const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = mime.extension(file.mimetype) || 'bin';
    cb(null, `${file.fieldname}-${uniqueSuffix}.${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    cb(new Error('Unsupported file type. Only PDF and DOCX files are allowed.'), false);
    return;
  }

  const extension = mime.extension(file.mimetype);
  if (!extension) {
    cb(new Error('Could not determine file extension.'), false);
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