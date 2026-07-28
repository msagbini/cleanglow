import { Router } from 'express';
import { insertBooking, getBooking, isSlotAvailable, SlotUnavailableError } from '../db.js';
import { computeAmountCents, isValidExtraKey, isValidFrequency, config } from '../config.js';

const router = Router();

const REQUIRED_FIELDS = [
  'propertyType', 'bedrooms', 'bathrooms', 'bookingDate', 'bookingTime', 'urgency',
  'fullName', 'email', 'phone', 'address', 'postcode',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const extras = Array.isArray(body.extras) ? body.extras.filter(isValidExtraKey) : [];
  const bookingDateOnly = new Date(`${body.bookingDate}T00:00:00`);
  if (Number.isNaN(bookingDateOnly.getTime())) {
    return res.status(400).json({ error: 'Invalid booking date' });
  }
  const frequency = body.frequency && isValidFrequency(body.frequency) ? String(body.frequency) : 'once';

  const fields = {
    propertyType: String(body.propertyType),
    bedrooms: String(body.bedrooms),
    bathrooms: Number(body.bathrooms) || 1,
    sqm: body.sqm ? Number(body.sqm) : null,
    furnished: body.furnished ?? null,
    notesProperty: body.notesProperty ?? null,
    extras,
    keyAccess: body.keyAccess ?? null,
    bookingDate: body.bookingDate,
    bookingTime: body.bookingTime,
    urgency: String(body.urgency),
    fullName: String(body.fullName).slice(0, 200),
    email: String(body.email).slice(0, 200),
    phone: String(body.phone).slice(0, 50),
    address: String(body.address).slice(0, 300),
    postcode: String(body.postcode).slice(0, 20),
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

  res.status(201).json({
    bookingId: booking.id,
    amount: amountCents / 100,
    currency: booking.currency,
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
