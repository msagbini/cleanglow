import express from 'express';
import { getPublicConfig } from '../config.js';
import { 
  insertBooking, 
  getBooking, 
  getBookingBySessionId,
  isSlotAvailable,
  addBookingPhoto,
  saveLead,
  markLeadsConvertedFor
} from '../db.js';
import { createPhotoUpload } from '../photoUpload.js';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();

const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
});

// Función para normalizar teléfonos australianos
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
  // Usamos isSlotAvailable para cada slot (simplificado)
  const slots = ['morning', 'afternoon', 'evening']; // Define tus slots reales
  const availability = slots.map(slot => ({
    slot,
    available: isSlotAvailable(date, slot)
  }));
  res.json({ date, slots: availability });
});

// POST /api/bookings
router.post('/', createLimiter, (req, res) => {
  const body = req.body;
  const config = getPublicConfig();

  // Validaciones manuales básicas
  if (!body.fullName || body.fullName.trim().length < 2) {
    return res.status(400).json({ error: 'Full name is required' });
  }
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  const phone = normalizeAustralianPhone(body.phone);
  if (!phone) {
    return res.status(400).json({ 
      error: 'Please enter a valid Australian mobile number (e.g. 0412345678 or +61412345678)' 
    });
  }
  if (!body.address || body.address.trim().length < 5) {
    return res.status(400).json({ error: 'Address is required' });
  }
  if (!body.postcode || !/^\d{4}$/.test(body.postcode)) {
    return res.status(400).json({ error: 'Valid Australian postcode (4 digits) is required' });
  }
  if (!body.bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.bookingDate)) {
    return res.status(400).json({ error: 'Valid booking date (YYYY-MM-DD) is required' });
  }
  if (!body.bookingTime) {
    return res.status(400).json({ error: 'Booking time is required' });
  }

  // Verificar disponibilidad
  if (!isSlotAvailable(body.bookingDate, body.bookingTime)) {
    return res.status(409).json({ error: 'Slot already booked' });
  }

  // Calcular precio (usa tu lógica real aquí)
  // Por ahora placeholder
  const amountCents = 10000; // <--- REEMPLAZA CON TU CÁLCULO REAL

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
      bedrooms: parseInt(body.bedrooms) || 0,
      bathrooms: parseInt(body.bathrooms) || 0,
      urgency: body.urgency || 'standard',
      extras: Array.isArray(body.extras) ? body.extras : [],
      frequency: body.frequency || 'once',
      promoCode: body.promoCode || null,
      amountCents,
      currency: config.business.currency || 'aud',
      notesProperty: body.notesProperty || '',
      furnished: body.furnished || null,
      sqm: body.sqm || null,
      keyAccess: body.keyAccess || null,
    }, amountCents);

    // Guardar lead usando saveLead
    saveLead({ email: body.email, phone });
    markLeadsConvertedFor({ email: body.email, phone });

    res.status(201).json({ bookingId: booking.id });
  } catch (err) {
    if (err.message && err.message.includes('fully booked')) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[bookings] Error creating booking:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

  const uploaded = [];
  for (const file of req.files.photos) {
    try {
      addBookingPhoto(bookingId, {
        filename: file.filename,
        originalName: file.originalname,
        sizeBytes: file.size,
        phase: 'before'
      });
      uploaded.push(file.filename);
    } catch (err) {
      console.error('[bookings] Error adding photo:', err);
      // Continuar con las demás fotos
    }
  }

  res.json({ uploaded });
});

export default router;
