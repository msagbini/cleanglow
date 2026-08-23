// server/routes/bookings.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import { getPublicConfig } from '../config.js';
import { 
  insertBooking, 
  getBooking, 
  getAvailability, 
  getBookingBySessionId,
  addPhotosToBooking,
  createLead
} from '../db.js';
import { createPhotoUpload } from '../photoUpload.js';
import { generateId } from '../utils.js';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();

// Rate limit para crear reservas
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 solicitudes por IP
  skipSuccessfulRequests: true,
});

// Función para normalizar números móviles australianos
function normalizeAustralianPhone(input) {
  let cleaned = String(input).replace(/[\s()\-]/g, '');
  if (cleaned.startsWith('+61')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('61')) {
    cleaned = '0' + cleaned.slice(2);
  } else if (!cleaned.startsWith('0') && !cleaned.startsWith('+')) {
    cleaned = '0' + cleaned;
  }
  if (!/^0\d{9}$/.test(cleaned)) return null;
  return cleaned;
}

// GET /api/bookings/availability
router.get('/availability', (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  }
  const slots = getAvailability(date);
  res.json({ date, slots });
});

// POST /api/bookings - Crear reserva
router.post('/', 
  createLimiter,
  body('fullName').notEmpty().trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('phone').notEmpty(),
  body('address').notEmpty().trim(),
  body('postcode').isPostalCode('AU'),
  body('bookingDate').isISO8601().toDate(),
  body('bookingTime').notEmpty(),
  body('propertyType').notEmpty(),
  body('bedrooms').isInt({ min: 0 }),
  body('bathrooms').isInt({ min: 0 }),
  body('urgency').optional().isIn(['standard', 'urgent']),
  body('extras').optional().isArray(),
  body('frequency').optional().isIn(['once', 'weekly', 'fortnightly', 'monthly']),
  body('promoCode').optional().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const config = getPublicConfig();
    const body = req.body;

    // Normalizar teléfono
    const phone = normalizeAustralianPhone(body.phone);
    if (!phone) {
      return res.status(400).json({ 
        error: 'Please enter a valid Australian mobile number (e.g. 0412345678 or +61412345678)' 
      });
    }

    // Calcular precio (siempre en servidor)
    // ... (aquí va tu lógica de cálculo de precio existente)
    // Como no tengo el código completo, asumo que ya tienes la función calculatePrice
    // Si no, mantén tu lógica actual.
    // Por ahora, uso un placeholder:
    const amountCents = 10000; // EJEMPLO - REEMPLAZA CON TU CÁLCULO REAL

    try {
      const booking = insertBooking({
        fullName: body.fullName,
        email: body.email,
        phone,
        address: body.address,
        postcode: body.postcode,
        bookingDate: body.bookingDate,
        bookingTime: body.bookingTime,
        propertyType: body.propertyType,
        bedrooms: parseInt(body.bedrooms),
        bathrooms: parseInt(body.bathrooms),
        urgency: body.urgency || 'standard',
        extras: body.extras || [],
        frequency: body.frequency || 'once',
        promoCode: body.promoCode || null,
        amountCents,
        currency: config.business.currency || 'aud',
        notesProperty: body.notesProperty || '',
        furnished: body.furnished || null,
        sqm: body.sqm || null,
        keyAccess: body.keyAccess || null,
      });

      // Guardar lead si no existe
      createLead(body.email, phone, booking.id);

      res.status(201).json({ bookingId: booking.id });
    } catch (err) {
      if (err.message.includes('fully booked')) {
        return res.status(409).json({ error: err.message });
      }
      console.error('[bookings] Error creating booking:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/bookings/:id
router.get('/:id', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json(booking);
});

// POST /api/bookings/:id/photos
const photoUpload = createPhotoUpload('server/data/uploads');
router.post('/:id/photos', photoUpload, (req, res) => {
  const bookingId = req.params.id;
  const booking = getBooking(bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (!req.files || !req.files.photos || req.files.photos.length === 0) {
    return res.status(400).json({ error: 'No photos uploaded' });
  }

  const fileNames = req.files.photos.map(f => f.filename);
  addPhotosToBooking(bookingId, fileNames);
  res.json({ uploaded: fileNames });
});

export default router;
