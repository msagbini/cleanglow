import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { insertBooking, getBooking, isSlotAvailable, SlotUnavailableError, addBookingPhoto, listBookingPhotos, markLeadsConvertedFor, markRewardCodeUsed } from '../db.js';
import { computeAmountCents, isValidExtraKey, isValidExtraQuantity, isValidFrequency, isValidSizeValue, deriveUrgencyForDate, config, getPublicConfig } from '../config.js';
import { buildBookingIcs } from '../ics.js';
import { createPhotoUpload, isValidImageFile, cleanupFiles } from '../photoUpload.js';
import { resolveDiscountCode, recordReferralRedemption } from '../referrals.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
const upload = createPhotoUpload(uploadsDir);

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
  if (!isValidSizeValue(body.bedrooms)) {
    return res.status(400).json({ error: 'Invalid property size selected' });
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

  let agentEmail = null;
  if (body.agentEmail) {
    if (!EMAIL_RE.test(body.agentEmail)) {
      return res.status(400).json({ error: 'Invalid property manager email address' });
    }
    agentEmail = String(body.agentEmail).trim().slice(0, 200);
  }

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
    agentEmail,
    language: body.language === 'es' ? 'es' : 'en',
  };

  // Static promo codes are still handled by computeAmountCents itself; a
  // FRIEND-/CREDIT- code resolves here (self-referral, one-per-new-customer,
  // and single-use/owner-locked rules all enforced inside) as a flat $ amount
  // taken off the total after the usual percentage-based pricing.
  const discount = resolveDiscountCode(fields.promoCode, { email: fields.email, phone: fields.phone });
  let amountCents = computeAmountCents(fields);
  if (discount?.amountOffCents > 0) {
    amountCents = Math.max(0, amountCents - discount.amountOffCents);
  }

  let booking;
  try {
    booking = insertBooking(fields, amountCents);
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      return res.status(409).json({ error: 'That time slot just got booked out. Please pick another date or time.' });
    }
    throw err;
  }

  // No awaits between resolveDiscountCode's checks above and these writes —
  // the whole handler runs to completion before any other request can be
  // processed, so a reward code can't be redeemed twice by two requests
  // racing each other.
  if (discount?.type === 'referral') recordReferralRedemption(discount.code, booking);
  if (discount?.type === 'reward') markRewardCodeUsed(discount.code, booking.id);

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

    for (const file of files) {
      const ext = path.extname(file.filename).toLowerCase();
      if (!isValidImageFile(file.path, ext)) {
        cleanupFiles(files.map(f => f.path));
        return res.status(400).json({ error: 'One of the uploaded files is not a valid image' });
      }
    }

    try {
      for (const file of files) {
        addBookingPhoto(booking.id, {
          filename: file.filename,
          originalName: file.originalname,
          sizeBytes: file.size,
          phase: 'before',
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

// Only offered once a booking is actually paid — an unpaid/pending slot
// isn't confirmed yet, so it shouldn't end up on anyone's calendar.
router.get('/:id/calendar.ics', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!['paid', 'completed'].includes(booking.status)) {
    return res.status(409).json({ error: 'This booking is not confirmed yet' });
  }
  const ics = buildBookingIcs(booking, config.business);
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${booking.id}.ics"`);
  res.send(ics);
});

// "Proof of clean" — a shareable, unauthenticated page a customer can send
// straight to their property manager/agent for the bond return. The booking
// reference is the only credential (same unguessable-id trust model as
// GET /:id above); deliberately narrower than publicView — no email/phone,
// since this link is meant to be forwarded to a third party.
const SAFE_FILENAME_RE = /^[a-f0-9-]+\.(jpg|png|webp)$/;

export function proofView(booking) {
  return {
    id: booking.id,
    status: booking.status,
    propertyType: booking.property_type,
    bedrooms: booking.bedrooms,
    bathrooms: booking.bathrooms,
    address: booking.address,
    bookingDate: booking.booking_date,
    bookingTime: booking.booking_time,
  };
}

function requireProofEligible(req, res) {
  const booking = getBooking(req.params.id);
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return null;
  }
  if (!['paid', 'completed'].includes(booking.status)) {
    res.status(409).json({ error: 'This booking is not confirmed yet' });
    return null;
  }
  return booking;
}

router.get('/:id/proof', (req, res) => {
  const booking = requireProofEligible(req, res);
  if (!booking) return;
  const photos = listBookingPhotos(booking.id).map(p => ({
    phase: p.phase,
    url: `/api/bookings/${booking.id}/proof/photos/${encodeURIComponent(p.filename)}`,
  }));
  const publicConfig = getPublicConfig(req.query.lang === 'es' ? 'es' : 'en');
  res.json({ booking: proofView(booking), photos, checklist: publicConfig.checklist, business: { name: config.business.name, logoUrl: config.business.logoUrl } });
});

router.get('/:id/proof/photos/:filename', (req, res) => {
  const booking = requireProofEligible(req, res);
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
