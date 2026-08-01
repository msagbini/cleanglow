import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Shared between the customer-facing "before" photo upload (routes/bookings.js)
// and the admin-facing "after" photo upload (routes/admin.js) — same file-type
// rules and the same magic-byte check should apply to both, not just one.
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
  fs.mkdirSync(uploadsDir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED_PHOTO_TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 8 },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_PHOTO_TYPES[file.mimetype]) {
        return cb(new Error('Only JPEG, PNG or WEBP images are allowed'));
      }
      cb(null, true);
    },
  });
}

// Deletes files that failed the post-upload magic-byte check, or that
// exceeded a per-phase quota — swallows errors since this is best-effort
// cleanup, not something that should itself fail the request.
export function cleanupFiles(filePaths) {
  for (const p of filePaths) fs.unlink(p, () => {});
}
