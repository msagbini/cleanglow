import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listBookings, countBookingsByStatus, markBookingStatus, getBooking, isValidStatus, listBookingPhotos, listLeads } from '../db.js';
import { getStripe } from './payments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');

const router = Router();

router.get('/bookings', (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const bookings = listBookings({ status });
  res.json({ bookings, counts: countBookingsByStatus() });
});

router.patch('/bookings/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!isValidStatus(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const existing = getBooking(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  const updated = markBookingStatus(req.params.id, status);
  res.json(updated);
});

router.post('/bookings/:id/cancel-subscription', async (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!booking.stripe_subscription_id) {
    return res.status(400).json({ error: 'This booking has no active subscription' });
  }

  const stripe = getStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe is not configured on the server.' });

  try {
    await stripe.subscriptions.cancel(booking.stripe_subscription_id);
  } catch (err) {
    console.error('[stripe] Error cancelling subscription:', err.message);
    return res.status(502).json({ error: 'Could not cancel the subscription with Stripe.' });
  }

  const updated = markBookingStatus(req.params.id, 'cancelled');
  res.json(updated);
});

router.get('/bookings/:id/photos', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const photos = listBookingPhotos(req.params.id).map(p => ({
    id: p.id,
    originalName: p.original_name,
    sizeBytes: p.size_bytes,
    createdAt: p.created_at,
    url: `/api/admin/bookings/${req.params.id}/photos/${encodeURIComponent(p.filename)}`,
  }));
  res.json({ photos });
});

// Filenames are server-generated UUIDs (see routes/bookings.js), but we still
// validate the shape here and resolve+contain the path before serving, since
// this reads straight off disk under an authenticated route.
const SAFE_FILENAME_RE = /^[a-f0-9-]+\.(jpg|png|webp)$/;

router.get('/bookings/:id/photos/:filename', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const { filename } = req.params;
  if (!SAFE_FILENAME_RE.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const photos = listBookingPhotos(req.params.id);
  if (!photos.some(p => p.filename === filename)) {
    return res.status(404).json({ error: 'Photo not found for this booking' });
  }
  const filePath = path.join(uploadsDir, filename);
  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  res.sendFile(filePath);
});

router.get('/leads', (req, res) => {
  const leads = listLeads().map(l => ({
    id: l.id,
    email: l.email,
    phone: l.phone,
    createdAt: l.created_at,
    status: l.converted_at ? 'converted' : (l.reminded_at ? 'reminded' : 'open'),
  }));
  res.json({ leads });
});

export default router;
