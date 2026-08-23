import express from 'express';
import { 
  createCleaner, 
  getCleaner, 
  listCleaners, 
  setCleanerActive,
  assignBookingToCleaner,
  listBookingsForCleaner
} from '../db.js';
import { createPhotoUpload } from '../photoUpload.js';
// import { isValidImageFile, cleanupFiles } from '../photoUpload.js'; // <-- Comentado porque no existen

const router = express.Router();

// Middleware de autenticación básica (reutilizado)
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

// GET /api/admin/cleaners - Listar cleaners
router.get('/', adminAuth, (req, res) => {
  const cleaners = listCleaners();
  res.json(cleaners);
});

// POST /api/admin/cleaners - Crear cleaner
router.post('/', adminAuth, (req, res) => {
  const { name, phone, email } = req.body;
  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required' });
  }
  try {
    const cleaner = createCleaner({ name, phone, email });
    res.status(201).json(cleaner);
  } catch (err) {
    console.error('[cleaners] Error creating cleaner:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/cleaners/:id - Obtener un cleaner
router.get('/:id', adminAuth, (req, res) => {
  const cleaner = getCleaner(req.params.id);
  if (!cleaner) return res.status(404).json({ error: 'Cleaner not found' });
  res.json(cleaner);
});

// PATCH /api/admin/cleaners/:id/active - Activar/desactivar cleaner
router.patch('/:id/active', adminAuth, (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Active must be boolean' });
  }
  const cleaner = getCleaner(req.params.id);
  if (!cleaner) return res.status(404).json({ error: 'Cleaner not found' });
  setCleanerActive(req.params.id, active);
  res.json({ success: true, active });
});

// GET /api/admin/cleaners/:id/bookings - Reservas de un cleaner
router.get('/:id/bookings', adminAuth, (req, res) => {
  const bookings = listBookingsForCleaner(req.params.id);
  res.json(bookings);
});

// POST /api/admin/bookings/:id/assign-cleaner - Asignar cleaner a una reserva
router.post('/bookings/:id/assign-cleaner', adminAuth, (req, res) => {
  const { cleanerId } = req.body;
  if (!cleanerId) {
    return res.status(400).json({ error: 'cleanerId is required' });
  }
  try {
    assignBookingToCleaner(req.params.id, cleanerId);
    res.json({ success: true });
  } catch (err) {
    console.error('[cleaners] Error assigning cleaner:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Subida de foto para cleaner (placeholder, sin cleanupFiles)
const photoUpload = createPhotoUpload('server/data/uploads/cleaners');
router.post('/:id/photo', adminAuth, photoUpload, (req, res) => {
  if (!req.files || !req.files.photo || req.files.photo.length === 0) {
    return res.status(400).json({ error: 'No photo uploaded' });
  }
  // Aquí podrías guardar la foto en la BD si tuvieras la función,
  // pero por ahora solo devolvemos el nombre del archivo.
  const file = req.files.photo[0];
  res.json({ uploaded: file.filename });
});

export default router;
