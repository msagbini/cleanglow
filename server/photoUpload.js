// server/photoUpload.js
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

export function createPhotoUpload(uploadsDir) {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024, files: 8 },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG and WEBP are allowed'), false);
      }
    }
  });

  return async (req, res, next) => {
    const uploadMiddleware = upload.fields([{ name: 'photos', maxCount: 8 }]);
    
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.files || !req.files.photos) {
        return next();
      }

      for (const file of req.files.photos) {
        try {
          // Verificar contenido real (magic bytes)
          const buffer = await fs.promises.readFile(file.path);
          const type = await fileTypeFromBuffer(buffer);
          if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) {
            await fs.promises.unlink(file.path);
            return res.status(400).json({ 
              error: `Invalid file type: ${file.originalname}. Only real JPEG, PNG, or WEBP images are allowed.` 
            });
          }

          // Redimensionar y comprimir
          const optimizedPath = file.path + '.opt';
          await sharp(file.path)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80, progressive: true })
            .toFile(optimizedPath);

          await fs.promises.unlink(file.path);
          await fs.promises.rename(optimizedPath, file.path);
          
          const stats = await fs.promises.stat(file.path);
          file.size = stats.size;
        } catch (processErr) {
          console.error('[photo] Error processing image:', processErr.message);
          await fs.promises.unlink(file.path).catch(() => {});
          return res.status(400).json({ error: 'Failed to process uploaded image. Please try another.' });
        }
      }

      next();
    });
  };
}
