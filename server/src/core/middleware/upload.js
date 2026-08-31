const multer = require('multer');
const path = require('path');
const os = require('os');

const isProd = process.env.NODE_ENV === 'production';
const MAX_MB = Number(process.env.MAX_UPLOAD_SIZE_MB) || (isProd ? 100 : 2048);
const MAX_BYTES = MAX_MB * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    // Sanitize the original filename — keep only safe characters
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `codelens_upload_${Date.now()}_${safe}`);
  },
});

function fileFilter(_req, file, cb) {
  if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
    cb(null, true);
  } else {
    cb(new Error('Only ZIP archives are accepted'), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
});

// Single-file upload field named "repository"
const uploadMiddleware = upload.single('repository');

module.exports = { uploadMiddleware };
