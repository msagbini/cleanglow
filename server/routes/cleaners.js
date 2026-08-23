import express from 'express';
import { createPhotoUpload } from '../photoUpload.js';
import {
  createCleaner,
  getCleaner,
  listCleaners,
  setCleanerActive,
  assignBookingToCleaner,
  listBookingsForCleaner,
  getBooking
} from '../db.js';

const router = express.Router();

// Middleware de autenticación para el panel de admin (si lo usas)
function adminAuth(req, res, next) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) {
    return res.status(503).send('Admin panel is disabled (ADMIN_USER/ADMIN_PASS not set)');
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).set('WWW-Authenticate', 'Basic realm="Admin"').send('Authentication required');
  }
  const base64 = auth.slice(6);
  const credentials = Buffer.from(base64, 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');
  if (username === user && password === pass) {
    return next();
  }
  res.status(401).set('WWW-Authenticate', 'Basic realm="Admin"').send('Invalid credentials');
}

// Crear un nuevo cleaner (limpiador)
router.post('/', adminAuth, (req, res) => {
  const { name, phone, email } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }
  try {
    const cleaner = createCleaner({ name, phone, email });
    res.status(201).json(cleaner);
  } catch (err) {
    console.error('[cleaners] Error creating cleaner:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Listar cleaners
router.get('/', adminAuth, (req, res) => {
  try {
    const cleaners = listCleaners();
    res.json(cleaners);
  } catch (err) {
    console.error('[cleaners] Error listing cleaners:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Obtener un cleaner por ID
router.get('/:id', adminAuth, (req, res) => {
  try {
    const cleaner = getCleaner(req.params.id);
    if (!cleaner) return res.status(404).json({ error: 'Not found' });
    res.json(cleaner);
  } catch (err) {
    console.error('[cleaners] Error getting cleaner:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Activar/desactivar cleaner
router.patch('/:id/active', adminAuth, (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Active must be boolean' });
  }
  try {
    const cleaner = setCleanerActive(req.params.id, active);
    res.json(cleaner);
  } catch (err) {
    console.error('[cleaners] Error updating cleaner:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Asignar un booking a un cleaner
router.post('/:id/assign', adminAuth, (req, res) => {
  const { bookingId } = req.body;
  if (!bookingId) {
    return res.status(400).json({ error: 'Booking ID is required' });
  }
  try {
    const booking = getBooking(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const result = assignBookingToCleaner(bookingId, req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[cleaners] Error assigning booking:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Listar bookings asignados a un cleaner
router.get('/:id/bookings', adminAuth, (req, res) => {
  try {
    const bookings = listBookingsForCleaner(req.params.id);
    res.json(bookings);
  } catch (err) {
    console.error('[cleaners] Error listing bookings:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manejo de fotos para cleaner (si quieres, pero sin cleanupFiles)
// Si necesitas subir fotos, usa createPhotoUpload directamente aquí
// Ejemplo:
// const photoUpload = createPhotoUpload('server/data/uploads');
// router.post('/:id/photo', adminAuth, photoUpload, (req, res) => { ... });

export default router;
