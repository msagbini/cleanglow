import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Shared between the customer-facing "before" photo upload (routes/bookings.js)
// and the admin-facing "after" photo upload (routes/admin.js) — same file-type
// rules and the same magic-byte check should apply to both, not just one.

import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

export const ALLOWED_PHOTO_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// fileFilter only checks the client-declared Content-Type of the multipart
// part, which is fully attacker-controlled — this checks the actual bytes on
// disk after upload, so a file can't get stored under a mismatched extension
// just because its declared mimetype lied about it.
const MAGIC_BYTE_CHECKS = {
  '.jpg': buf => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  '.png': buf => buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.webp': buf => buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP',
};

export function isValidImageFile(filePath, ext) {
  const check = MAGIC_BYTE_CHECKS[ext];
  if (!check) return false;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    return check(buf);
  } finally {
    fs.closeSync(fd);
  }
}

export function createPhotoUpload(uploadsDir) {
  // Asegurar que el directorio existe
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      // Nombre seguro: ID único + extensión
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: 8 * 1024 * 1024, // 8MB
      files: 8
    },
    fileFilter: (req, file, cb) => {
      // Filtro básico de extensión (pero luego haremos verificación mágica)
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG and WEBP are allowed'), false);
      }
    }
  });

  // Middleware principal
  return async (req, res, next) => {
    // Usamos upload.fields para obtener los archivos
    const uploadMiddleware = upload.fields([{ name: 'photos', maxCount: 8 }]);
    
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      // Si no hay fotos, sigue
      if (!req.files || !req.files.photos) {
        return next();
      }

      // Procesar cada foto subida
      for (const file of req.files.photos) {
        try {
          // 1. VERIFICACIÓN MÁGICA (evita que suban un .exe disfrazado de .jpg)
          const buffer = await fs.promises.readFile(file.path);
          const type = await fileTypeFromBuffer(buffer);
          
          if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) {
            await fs.promises.unlink(file.path);
            return res.status(400).json({ 
              error: `Invalid file type: ${file.originalname}. Only real JPEG, PNG, or WEBP images are allowed.` 
            });
          }

          // 2. REDIMENSIONAR Y COMPRIMIR (máximo 1200px de ancho/alto, calidad 80%)
          const optimizedPath = file.path + '.opt';
          await sharp(file.path)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80, progressive: true })
            .toFile(optimizedPath);

          // Reemplazar el archivo original por el optimizado
          await fs.promises.unlink(file.path);
          await fs.promises.rename(optimizedPath, file.path);
          
          // Actualizar el tamaño en el objeto file para que el resto de la app lo vea
          const stats = await fs.promises.stat(file.path);
          file.size = stats.size;

        } catch (processErr) {
          console.error('[photo] Error processing image:', processErr.message);
          // Limpiar el archivo dañado
          await fs.promises.unlink(file.path).catch(() => {});
          return res.status(400).json({ error: 'Failed to process uploaded image. Please try another.' });
        }
      }

      // Todo bien, sigue al controlador
      next();
    });
  };
}

// Deletes files that failed the post-upload magic-byte check, or that
// exceeded a per-phase quota — swallows errors since this is best-effort
// cleanup, not something that should itself fail the request.
export function cleanupFiles(filePaths) {
  for (const p of filePaths) fs.unlink(p, () => {});
}
