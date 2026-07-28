import { Router } from 'express';
import { insertBooking, getBooking } from '../db.js';
import { computeAmountCents, EXTRA_PRICES } from '../pricing.js';

const router = Router();

const REQUIRED_FIELDS = [
  'propertyType', 'bedrooms', 'bathrooms', 'bookingDate', 'bookingTime', 'urgency',
  'fullName', 'email', 'phone', 'address', 'postcode',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', (req, res) => {
  const body = req.body || {};

  for (const field of REQUIRED_FIELDS) {
    if (!body[field] && body[field] !== 0) {
      return res.status(400).json({ error: `Falta el campo obligatorio: ${field}` });
    }
  }
  if (!EMAIL_RE.test(body.email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  const extras = Array.isArray(body.extras) ? body.extras.filter(key => key in EXTRA_PRICES) : [];
  const bookingDateOnly = new Date(`${body.bookingDate}T00:00:00`);
  if (Number.isNaN(bookingDateOnly.getTime())) {
    return res.status(400).json({ error: 'Fecha de reserva inválida' });
  }

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
  };

  const amountCents = computeAmountCents(fields);
  const booking = insertBooking(fields, amountCents);

  res.status(201).json({
    bookingId: booking.id,
    amount: amountCents / 100,
    currency: booking.currency,
  });
});

router.get('/:id', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
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
    amount: booking.amount_cents / 100,
    currency: booking.currency,
  };
}

export default router;
