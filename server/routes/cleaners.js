// The cleaner-facing panel — mounted at /api/cleaner/:token/*. There's no
// login: the token in the URL (a crypto.randomUUID() generated when admin
// adds the cleaner, see db.js createCleaner) IS the credential, the same
// "unguessable id doubles as a bearer token" pattern already used for
// booking references. Every route below re-derives the cleaner from the
// token and only ever touches bookings assigned to that specific cleaner —
// there is no way to reach another cleaner's jobs through this router.
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getCleaner, listBookingsForCleaner, getBooking, markBookingStatus, listBookingPhotos, addBookingPhoto } from '../db.js';
import { createPhotoUpload, isValidImageFile, cleanupFiles } from '../photoUpload.js';
import { handleBookingCompleted } from '../bookingCompletion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
const upload = createPhotoUpload(uploadsDir);

const router = Router();

function requireActiveCleaner(req, res, next) {
  const cleaner = getCleaner(req.params.token);
  if (!cleaner || !cleaner.active) {
    return res.status(404).json({ error: 'This link is not valid. Ask your admin for a new one.' });
  }
  req.cleaner = cleaner;
  next();
}

// Only ever exposes what a cleaner needs to actually do the job — no Stripe
// internals, no other customers' data.
function cleanerBookingView(booking) {
  return {
    id: booking.id,
    status: booking.status,
    propertyType: booking.property_type,
    bedrooms: booking.bedrooms,
    bathrooms: booking.bathrooms,
    extras: booking.extras,
    sqm: booking.sqm,
    keyAccess: booking.key_access,
    notesProperty: booking.notes_property,
    bookingDate: booking.booking_date,
    bookingTime: booking.booking_time,
    fullName: booking.full_name,
    phone: booking.phone,
    address: booking.address,
    postcode: booking.postcode,
  };
}

router.get('/:token/me', requireActiveCleaner, (req, res) => {
  res.json({ id: req.cleaner.id, name: req.cleaner.name });
});

router.get('/:token/jobs', requireActiveCleaner, (req, res) => {
  const jobs = listBookingsForCleaner(req.cleaner.id)
    .filter(b => ['paid', 'completed'].includes(b.status))
    .map(cleanerBookingView);
  res.json({ jobs });
});

function getOwnJobOr404(req, res) {
  const booking = getBooking(req.params.id);
  if (!booking || booking.assigned_cleaner_id !== req.cleaner.id) {
    res.status(404).json({ error: 'Job not found' });
    return null;
  }
  return booking;
}

// Deliberately narrower than the admin equivalent — a cleaner can mark a job
// done, nothing else (can't cancel, can't fake a paid status, etc.).
router.patch('/:token/bookings/:id/status', requireActiveCleaner, async (req, res) => {
  const booking = getOwnJobOr404(req, res);
  if (!booking) return;
  if (req.body?.status !== 'completed') {
    return res.status(400).json({ error: 'Cleaners can only mark a job as completed' });
  }
  const updated = markBookingStatus(booking.id, 'completed');
  await handleBookingCompleted(updated, uploadsDir);
  res.json(cleanerBookingView(updated));
});

router.get('/:token/bookings/:id/photos', requireActiveCleaner, (req, res) => {
  const booking = getOwnJobOr404(req, res);
  if (!booking) return;
  const photos = listBookingPhotos(booking.id).map(p => ({
    id: p.id,
    phase: p.phase,
    createdAt: p.created_at,
    url: `/api/cleaner/${req.params.token}/bookings/${booking.id}/photos/${encodeURIComponent(p.filename)}`,
  }));
  res.json({ photos });
});

router.post('/:token/bookings/:id/photos', requireActiveCleaner, (req, res) => {
  const booking = getOwnJobOr404(req, res);
  if (!booking) return;
  const phase = req.query.phase === 'before' ? 'before' : 'after';

  upload.array('photos', 8)(req, res, err => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Could not upload photos' });
    }
    const files = req.files || [];

    for (const file of files) {
      const ext = path.extname(file.filename).toLowerCase();
      if (!isValidImageFile(file.path, ext)) {
        cleanupFiles(files.map(f => f.path));
        return res.status(400).json({ error: 'One of the uploaded files is not a valid image' });
      }
    }

    try {
      for (const file of files) {
        addBookingPhoto(booking.id, { filename: file.filename, originalName: file.originalname, sizeBytes: file.size, phase });
      }
    } catch (dbErr) {
      return res.status(400).json({ error: dbErr.message });
    }
    res.status(201).json({ uploaded: files.length });
  });
});

const SAFE_FILENAME_RE = /^[a-f0-9-]+\.(jpg|png|webp)$/;

router.get('/:token/bookings/:id/photos/:filename', requireActiveCleaner, (req, res) => {
  const booking = getOwnJobOr404(req, res);
  if (!booking) return;
  const { filename } = req.params;
  if (!SAFE_FILENAME_RE.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const photos = listBookingPhotos(booking.id);
  if (!photos.some(p => p.filename === filename)) {
    return res.status(404).json({ error: 'Photo not found for this booking' });
  }
  const filePath = path.join(uploadsDir, filename);
  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  res.sendFile(filePath);
});

export default router;
