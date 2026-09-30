// src/middleware/upload.middleware.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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

export const uploadToCloudinary = async (file, folder = 'buconnects') => {
  if (!file) {
    throw new Error('No file provided for upload.');
  }

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error('Cloudinary credentials are missing. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }

  const result = await cloudinary.uploader.upload(
    `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
    {
      folder,
      resource_type: 'auto',
      overwrite: false
    }
  );

  return result.secure_url;
};

const uploadDir = resolveUploadDir();

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are supported.'));
    }
  }
});
