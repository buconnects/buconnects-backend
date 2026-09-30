// src/middleware/upload.middleware.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const resolveUploadDir = () => {
  const configuredDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(configuredDir)) {
    fs.mkdirSync(configuredDir, { recursive: true });
  }
  return configuredDir;
};

export const buildUploadUrl = (req, filename) => {
  const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol || 'http'}://${req.get('host')}`)
    .replace(/\/$/, '');

  return `${baseUrl}/uploads/${filename}`;
};

const uploadDir = resolveUploadDir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
