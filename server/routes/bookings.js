// server/routes/bookings.js
import express from 'express';
import { getPublicConfig } from '../config.js';
import { 
  insertBooking, 
  getBooking, 
  getAvailability, 
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

// POST /api/bookings - Crear reserva (validación manual)
router.post('/', 
  createLimiter,
  (req, res) => {
    const body = req.body;
    
    // Validaciones manuales básicas
    if (!body.fullName || typeof body.fullName !== 'string' || body.fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Full name is required and must be at least 2 characters' });
    }
    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!body.address || typeof body.address !== 'string' || body.address.trim().length < 5) {
      return res.status(400).json({ error: 'Address is required' });
    }
    if (!body.postcode || !/^\d{4}$/.test(body.postcode)) {
      return res.status(400).json({ error: 'Valid Australian postcode (4 digits) is required' });
    }
    if (!body.bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.bookingDate)) {
      return res.status(400).json({ error: 'Valid booking date (YYYY-MM-DD) is required' });
    }
    if (!body.bookingTime || typeof body.bookingTime !== 'string') {
      return res.status(400).json({ error: 'Booking time is required' });
    }
    if (!body.propertyType || typeof body.propertyType !== 'string') {
      return res.status(400).json({ error: 'Property type is required' });
    }
    const bedrooms = parseInt(body.bedrooms);
    if (isNaN(bedrooms) || bedrooms < 0) {
      return res.status(400).json({ error: 'Valid bedrooms count is required' });
    }
    const bathrooms = parseInt(body.bathrooms);
    if (isNaN(bathrooms) || bathrooms < 0) {
      return res.status(400).json({ error: 'Valid bathrooms count is required' });
    }

    // Normalizar teléfono
    const phone = normalizeAustralianPhone(body.phone);
    if (!phone) {
      return res.status(400).json({ 
        error: 'Please enter a valid Australian mobile number (e.g. 0412345678 or +61412345678)' 
      });
    }

    const config = getPublicConfig();
    
    // ============================================================
    // 🔴 AQUÍ DEBES PONER TU LÓGICA DE CÁLCULO DE PRECIO REAL
    // ============================================================
    // Como no tengo tu función de cálculo, uso un placeholder.
    // Reemplaza '10000' con tu cálculo real (ej: calculatePrice(body))
    const amountCents = 10000; // <--- ¡CAMBIA ESTO!
    // ============================================================

    try {
      const booking = insertBooking({
        fullName: body.fullName.trim(),
        email: body.email.trim().toLowerCase(),
        phone,
        address: body.address.trim(),
        postcode: body.postcode.trim(),
        bookingDate: body.bookingDate,
        bookingTime: body.bookingTime,
        propertyType: body.propertyType,
        bedrooms,
        bathrooms,
        urgency: body.urgency || 'standard',
        extras: Array.isArray(body.extras) ? body.extras : [],
        frequency: body.frequency || 'once',
        promoCode: body.promoCode || null,
        amountCents,
        currency: config.business.currency || 'aud',
        notesProperty: body.notesProperty || '',
        furnished: body.furnished || null,
        sqm: body.sqm ? parseInt(body.sqm) : null,
        keyAccess: body.keyAccess || null,
      });

      // Guardar lead si no existe
      createLead(body.email, phone, booking.id);

      res.status(201).json({ bookingId: booking.id });
    } catch (err) {
      if (err.message && err.message.includes('fully booked')) {
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
