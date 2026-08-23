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
  getExtraChargeBySessionId,
  listExtraChargesForBooking,
  createExtraCharge,
  markExtraChargePaid,
  markExtraChargeExpired,
  markLeadsConvertedFor,
  findStaleLeads,
  markLeadReminded,
  saveLead,
  normaliseEmail,
  normalisePhone,
  hasProcessedEvent,
  markEventProcessed,
  processWebhookEvent,
  incrementCyclesCompleted,
  attachStripeSession,
  attachStripeSubscription,
  getBookingBySessionId,
  isValidStatus,
  countActiveBookingsForSlot,
  isSlotAvailable,
  insertBooking,
  addBookingPhoto,
  countPhotosForBooking
} from '../db.js';
import { getPublicConfig } from '../config.js';
import { sendOwnerPush, sendConfirmationEmail, sendExtraChargePaidConfirmation } from '../notifications.js';

const router = express.Router();
const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

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

router.get('/bookings', adminAuth, (req, res) => {
  const { status, limit = 200 } = req.query;
  const bookings = listBookings({ status: status || undefined, limit: parseInt(limit) || 200 });
  const counts = countBookingsByStatus();
  res.json({ bookings, counts });
});

router.get('/bookings/:id', adminAuth, (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json(booking);
});

router.patch('/bookings/:id/status', adminAuth, (req, res) => {
  const { status } = req.body;
  if (!status || !isValidStatus(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  markBookingStatus(req.params.id, status);
  res.json({ success: true, status });
});

router.get('/bookings/:id/photos', adminAuth, (req, res) => {
  const photos = listBookingPhotos(req.params.id);
  res.json(photos);
});

router.get('/leads', adminAuth, (req, res) => {
  const leads = listLeads({ limit: parseInt(req.query.limit) || 100 });
  res.json(leads);
});

router.get('/bookings/:id/cancellation-info', adminAuth, (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const config = getPublicConfig();
  const minCycles = config.booking?.earlyCancellationMinCycles || 3;
  const cyclesCompleted = booking.cycles_completed || 0;
  const canCancelFree = cyclesCompleted >= minCycles;
  const feeCents = canCancelFree ? 0 : booking.amount_cents || 0;
  res.json({
    cyclesCompleted,
    minCycles,
    canCancelFree,
    feeCents,
    currency: booking.currency || 'aud'
  });
});

router.post('/bookings/:id/cancel-subscription', adminAuth, async (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  if (!booking.subscription_id) {
    return res.status(400).json({ error: 'No subscription to cancel' });
  }
  const { chargeFeeCents = 0 } = req.body;
  try {
    if (chargeFeeCents > 0) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: booking.currency || 'aud',
            product_data: { name: 'Early cancellation fee' },
            unit_amount: chargeFeeCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.PUBLIC_BASE_URL}/admin?cancelled=true`,
        cancel_url: `${process.env.PUBLIC_BASE_URL}/admin?cancelled=false`,
        metadata: { type: 'extra_charge', booking_id: booking.id },
      });
      createExtraCharge({
        bookingId: booking.id,
        stripeSessionId: session.id,
        amountCents: chargeFeeCents,
        currency: booking.currency || 'aud',
        reason: 'early_cancellation',
      });
      return res.json({ requiresPayment: true, sessionId: session.id, url: session.url });
    }
    await stripe.subscriptions.update(booking.subscription_id, {
      cancel_at_period_end: true,
    });
    markBookingStatus(booking.id, 'cancelled');
    res.json({ success: true });
  } catch (err) {
    console.error('[admin] Error canceling subscription:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
