import { Router } from 'express';
import { listBookings, countBookingsByStatus, markBookingStatus, getBooking, isValidStatus } from '../db.js';
import { getStripe } from './payments.js';

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

export default router;
