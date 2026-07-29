import { Router } from 'express';
import Stripe from 'stripe';
import {
  getBooking, getBookingBySessionId, attachStripeSession, attachStripeSubscription,
  markBookingStatus, markNotified,
} from '../db.js';
import { getFrequencyOption } from '../config.js';
import { notifyPaidBooking, sendCustomerConfirmation } from '../email.js';
import { publicView } from './bookings.js';

const router = Router();

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function markPaidOnce(booking, subscriptionId) {
  if (subscriptionId && !booking.stripe_subscription_id) {
    attachStripeSubscription(booking.id, subscriptionId);
    booking = { ...booking, stripe_subscription_id: subscriptionId };
  }
  if (booking.status === 'paid') return booking;
  const paid = markBookingStatus(booking.id, 'paid');
  if (!paid.notified_at) {
    await Promise.all([notifyPaidBooking(paid), sendCustomerConfirmation(paid)]);
    markNotified(paid.id);
  }
  return paid;
}

router.post('/checkout-session', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not configured on the server (STRIPE_SECRET_KEY is missing).' });
  }

  const booking = getBooking(req.body?.bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status === 'paid') return res.status(409).json({ error: 'This booking has already been paid' });

  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const frequency = getFrequencyOption(booking.frequency);
  const isRecurring = booking.frequency !== 'once' && !!frequency.stripeInterval;

  const priceData = {
    currency: booking.currency,
    unit_amount: booking.amount_cents,
    product_data: {
      name: `End of Lease Clean — Booking ${booking.id}`,
      description: `${booking.booking_date} · ${booking.booking_time} slot${isRecurring ? ` · billed ${frequency.label.toLowerCase()}` : ''}`,
    },
  };
  if (isRecurring) {
    priceData.recurring = { interval: frequency.stripeInterval.unit, interval_count: frequency.stripeInterval.count };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: isRecurring ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      customer_email: booking.email,
      line_items: [{ price_data: priceData, quantity: 1 }],
      metadata: { bookingId: booking.id, frequency: booking.frequency },
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/index.html#booking`,
    });

    attachStripeSession(booking.id, session.id);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] Error creating checkout session:', err.message);
    res.status(502).json({ error: 'Could not start the payment with Stripe. Please try again.' });
  }
});

// Best-effort confirmation used by success.html right after Stripe redirects back.
// The webhook below is the authoritative source of truth if this doesn't fire
// (e.g. the customer closes the tab before the redirect completes).
router.get('/checkout-session/:sessionId/confirm', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe is not configured on the server.' });

  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const booking = getBookingBySessionId(session.id);
    if (!booking) return res.status(404).json({ error: 'No booking found for this session' });

    if (session.payment_status === 'paid') {
      const paid = await markPaidOnce(booking, session.subscription || null);
      return res.json({ ...publicView(paid), paymentStatus: session.payment_status });
    }
    res.json({ ...publicView(booking), paymentStatus: session.payment_status });
  } catch (err) {
    console.error('[stripe] Error confirming session:', err.message);
    res.status(502).json({ error: 'Could not verify the payment.' });
  }
});

// Stripe webhook — the reliable path, independent of the customer's browser.
// Mounted separately (not on `router`) because it needs express.raw() body
// parsing wired in server/index.js *before* the express.json() middleware.
export async function webhookHandler(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(500).end();

  // Signature verification is never optional here: without it, anyone who
  // knows a booking's Stripe session ID (visible in their own browser URL
  // the moment checkout starts, before they've actually paid) could POST a
  // forged "checkout.session.completed" body and get their own unpaid
  // booking marked paid. Fail closed if the secret isn't configured.
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe] STRIPE_WEBHOOK_SECRET is not set — refusing to process an unverifiable webhook.');
    return res.status(500).send('Webhook not configured');
  }

  let event;
  try {
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe] Invalid webhook signature:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        const booking = getBookingBySessionId(session.id);
        if (booking && session.payment_status === 'paid') await markPaidOnce(booking, session.subscription || null);
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        const booking = getBookingBySessionId(session.id);
        if (booking && booking.status === 'pending_payment') markBookingStatus(booking.id, 'expired');
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe] Error processing webhook:', err.message);
    res.status(500).end();
  }
}

export default router;
