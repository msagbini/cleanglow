import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { insertBooking, getBooking, isSlotAvailable, SlotUnavailableError, addBookingPhoto, markLeadsConvertedFor } from '../db.js';
import { computeAmountCents, isValidExtraKey, isValidExtraQuantity, isValidFrequency, deriveUrgencyForDate, config } from '../config.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_PHOTO_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
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

const REQUIRED_FIELDS = [
  'propertyType', 'bedrooms', 'bathrooms', 'bookingDate', 'bookingTime',
  'fullName', 'email', 'phone', 'address', 'postcode',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Australian mobile/landline numbers as entered by customers: 10 digits, no
// spaces, starting with 0 (e.g. 0420576710). Postcodes are exactly 4 digits.
const PHONE_RE = /^0\d{9}$/;
const POSTCODE_RE = /^\d{4}$/;

// Registered before /:id so "availability" isn't swallowed as an :id value.
router.get('/availability', (req, res) => {
  const date = String(req.query.date || '');
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'A valid date query parameter is required (YYYY-MM-DD)' });
  }
  const slots = config.booking.timeSlots.map(slot => ({
    value: slot.value,
    label: slot.label,
    available: isSlotAvailable(date, slot.value),
  }));
  res.json({ date, slots });
});

router.post('/', (req, res) => {
  const body = req.body || {};

  for (const field of REQUIRED_FIELDS) {
    if (!body[field] && body[field] !== 0) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }
  if (!EMAIL_RE.test(body.email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  const phone = String(body.phone).replace(/\s+/g, '');
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Phone must be 10 digits, starting with 0 (e.g. 0400000000)' });
  }
  const postcode = String(body.postcode).trim();
  if (!POSTCODE_RE.test(postcode)) {
    return res.status(400).json({ error: 'Postcode must be exactly 4 digits' });
  }
  const extras = Array.isArray(body.extras) ? body.extras.filter(isValidExtraKey) : [];
  const extraCounts = extras.reduce((counts, key) => ({ ...counts, [key]: (counts[key] ?? 0) + 1 }), {});
  for (const [key, count] of Object.entries(extraCounts)) {
    if (!isValidExtraQuantity(key, count)) {
      return res.status(400).json({ error: `Too many units selected for extra: ${key}` });
    }
  }
  const bookingDateOnly = new Date(`${body.bookingDate}T00:00:00`);
  if (Number.isNaN(bookingDateOnly.getTime())) {
    return res.status(400).json({ error: 'Invalid booking date' });
  }
  const frequency = body.frequency && isValidFrequency(body.frequency) ? String(body.frequency) : 'once';

  const fields = {
    propertyType: String(body.propertyType),
    bedrooms: String(body.bedrooms),
    bathrooms: Number(body.bathrooms) || 1,
    sqm: body.sqm ? Math.min(2000, Math.max(0, Number(body.sqm) || 0)) : null,
    furnished: body.furnished ?? null,
    notesProperty: body.notesProperty ? String(body.notesProperty).slice(0, 2000) : null,
    extras,
    keyAccess: body.keyAccess ?? null,
    bookingDate: body.bookingDate,
    bookingTime: body.bookingTime,
    // Derived server-side from the date — see computeAmountCents — so the
    // stored record always matches what was actually charged.
    urgency: deriveUrgencyForDate(body.bookingDate).value,
    fullName: String(body.fullName).slice(0, 200),
    email: String(body.email).slice(0, 200),
    phone,
    address: String(body.address).slice(0, 300),
    postcode,
    promoCode: body.promoCode ? String(body.promoCode).slice(0, 30) : null,
    frequency,
  };

  const amountCents = computeAmountCents(fields);
  let booking;
  try {
    booking = insertBooking(fields, amountCents);
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      return res.status(409).json({ error: 'That time slot just got booked out. Please pick another date or time.' });
    }
    throw err;
  }

  markLeadsConvertedFor({ email: fields.email, phone: fields.phone });

  res.status(201).json({
    bookingId: booking.id,
    amount: amountCents / 100,
    currency: booking.currency,
  });
});

// Uploading property-condition photos is a nice-to-have that must never block
// or delay a booking/payment — failures here are reported but non-fatal on the
// client side, and this endpoint only accepts photos for bookings that already
// exist (created via POST / above).
router.post('/:id/photos', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  upload.array('photos', 8)(req, res, err => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Could not upload photos' });
    }
    const files = req.files || [];
    try {
      for (const file of files) {
        addBookingPhoto(booking.id, {
          filename: file.filename,
          originalName: file.originalname,
          sizeBytes: file.size,
        });
      }
    } catch (dbErr) {
      return res.status(400).json({ error: dbErr.message });
    }
    res.status(201).json({ uploaded: files.length });
  });
});

router.get('/:id', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(publicView(booking));
});

export function publicView(booking) {
  return {
    id: booking.id,
    status: booking.status,
    propertyType: booking.property_type,
    bedrooms: booking.bedrooms,
    bathrooms: booking.bathrooms,
    extras: booking.extras,
    bookingDate: booking.booking_date,
    bookingTime: booking.booking_time,
    fullName: booking.full_name,
    email: booking.email,
    frequency: booking.frequency,
    amount: booking.amount_cents / 100,
    currency: booking.currency,
  };
}

export default router;
