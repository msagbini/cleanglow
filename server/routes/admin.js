import express from 'express';
import stripePackage from 'stripe';
import {
  listBookings,
  countBookingsByStatus,
  markBookingStatus,
  getBooking,
  getBookingBySubscriptionId,
  listBookingPhotos,
  listLeads,
  listCleaners,
  assignBookingToCleaner,
  listBookingsForCleaner,
  createExtraCharge,
  listExtraChargesForBooking,
  getExtraChargeBySessionId,
  markExtraChargePaid,
  processWebhookEvent,
  createReferralCode,
  getReferralCode,
  getReferralCodeByOwner,
  insertReferralRedemption,
  getReferralRedemptionByBooking,
  markReferralRewardIssued,
  createRewardCode,
  getRewardCode,
  markRewardCodeUsed,
  listRewardCodesForOwner,
  createMagicLink,
  consumeMagicLink,
  getCustomerSession,
} from '../db.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { createPhotoUpload } from '../photoUpload.js';
import { sendOwnerPush, sendConfirmationEmail } from '../notifications.js';

const router = express.Router();

// Crear instancia local de Stripe
const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

// Todas las rutas de admin protegidas con autenticación
router.use(adminAuth);

// GET /api/admin/stats - Estadísticas del panel
router.get('/stats', (req, res) => {
  const counts = countBookingsByStatus();
  res.json(counts);
});

// GET /api/admin/bookings - Lista de reservas (con filtros)
router.get('/bookings', (req, res) => {
  const { status, limit } = req.query;
  const bookings = listBookings({ status, limit: parseInt(limit) || 200 });
  res.json(bookings);
});

// GET /api/admin/bookings/:id - Detalle de una reserva
router.get('/bookings/:id', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(booking);
});

// PATCH /api/admin/bookings/:id/status - Actualizar estado de reserva
router.patch('/bookings/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  markBookingStatus(req.params.id, status);
  sendOwnerPush(`Booking ${booking.id} status changed to ${status}`, { booking });
  res.json({ success: true });
});

// GET /api/admin/bookings/:id/photos - Lista de fotos de una reserva
router.get('/bookings/:id/photos', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const photos = listBookingPhotos(req.params.id);
  res.json(photos);
});

// GET /api/admin/bookings/:id/photos/:filename - Servir una foto específica
router.get('/bookings/:id/photos/:filename', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  // Servir la foto desde server/data/uploads
  const photoPath = `server/data/uploads/${req.params.filename}`;
  res.sendFile(photoPath, { root: '.' });
});

// POST /api/admin/bookings/:id/cancel-subscription - Cancelar suscripción
router.post('/bookings/:id/cancel-subscription', async (req, res) => {
  const bookingId = req.params.id;
  const booking = getBooking(bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!booking.subscription_id) {
    return res.status(400).json({ error: 'No subscription found for this booking' });
  }
  
  try {
    // Cancela la suscripción al final del período actual
    const subscription = await stripe.subscriptions.update(booking.subscription_id, {
      cancel_at_period_end: true,
    });
    markBookingStatus(bookingId, 'cancelled');
    res.json({ message: 'Subscription scheduled for cancellation at period end', subscription });
  } catch (err) {
    console.error('[admin] Error canceling subscription:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/leads - Lista de leads
router.get('/leads', (req, res) => {
  const leads = listLeads({ limit: parseInt(req.query.limit) || 100 });
  res.json(leads);
});

// GET /api/admin/cleaners - Lista de limpiadores
router.get('/cleaners', (req, res) => {
  const cleaners = listCleaners();
  res.json(cleaners);
});

// POST /api/admin/cleaners/assign - Asignar limpiador a una reserva
router.post('/cleaners/assign', (req, res) => {
  const { bookingId, cleanerId } = req.body;
  if (!bookingId || !cleanerId) {
    return res.status(400).json({ error: 'Booking ID and cleaner ID are required' });
  }
  assignBookingToCleaner(bookingId, cleanerId);
  res.json({ success: true });
});

// GET /api/admin/cleaners/:id/bookings - Reservas de un limpiador
router.get('/cleaners/:id/bookings', (req, res) => {
  const bookings = listBookingsForCleaner(req.params.id);
  res.json(bookings);
});

// ... (aquí puedes añadir más rutas de admin si tu app las necesita)
// Por ejemplo: creación de códigos de descuento, gestión de referidos, etc.

export default router;
