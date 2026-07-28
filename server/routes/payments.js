import { Router } from 'express';
import Stripe from 'stripe';
import {
  getBooking, getBookingBySessionId, attachStripeSession, markBookingStatus, markNotified,
} from '../db.js';
import { notifyPaidBooking, sendCustomerConfirmation } from '../email.js';
import { publicView } from './bookings.js';

const router = Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function markPaidOnce(booking) {
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
    return res.status(500).json({ error: 'Stripe no está configurado en el servidor (falta STRIPE_SECRET_KEY).' });
  }

  const booking = getBooking(req.body?.bookingId);
  if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
  if (booking.status === 'paid') return res.status(409).json({ error: 'Esta reserva ya fue pagada' });

  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: booking.email,
      line_items: [{
        price_data: {
          currency: booking.currency,
          unit_amount: booking.amount_cents,
          product_data: {
            name: `Limpieza de fin de contrato — Reserva ${booking.id}`,
            description: `${booking.booking_date} · franja ${booking.booking_time}`,
          },
        },
        quantity: 1,
      }],
      metadata: { bookingId: booking.id },
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/index.html#booking`,
    });

    attachStripeSession(booking.id, session.id);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] Error creando checkout session:', err.message);
    res.status(502).json({ error: 'No se pudo iniciar el pago con Stripe. Inténtalo de nuevo.' });
  }
});

// Best-effort confirmation used by success.html right after Stripe redirects back.
// The webhook below is the authoritative source of truth if this doesn't fire
// (e.g. the customer closes the tab before the redirect completes).
router.get('/checkout-session/:sessionId/confirm', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe no está configurado en el servidor.' });

  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const booking = getBookingBySessionId(session.id);
    if (!booking) return res.status(404).json({ error: 'Reserva no encontrada para esta sesión' });

    if (session.payment_status === 'paid') {
      const paid = await markPaidOnce(booking);
      return res.json({ ...publicView(paid), paymentStatus: session.payment_status });
    }
    res.json({ ...publicView(booking), paymentStatus: session.payment_status });
  } catch (err) {
    console.error('[stripe] Error confirmando sesión:', err.message);
    res.status(502).json({ error: 'No se pudo verificar el pago.' });
  }
});

// Stripe webhook — the reliable path, independent of the customer's browser.
// Mounted separately (not on `router`) because it needs express.raw() body
// parsing wired in server/index.js *before* the express.json() middleware.
export async function webhookHandler(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(500).end();

  let event;
  try {
    const signature = req.headers['stripe-signature'];
    event = process.env.STRIPE_WEBHOOK_SECRET
      ? stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET)
      : JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    console.error('[stripe] Firma de webhook inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        const booking = getBookingBySessionId(session.id);
        if (booking && session.payment_status === 'paid') await markPaidOnce(booking);
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
    console.error('[stripe] Error procesando webhook:', err.message);
    res.status(500).end();
  }
}

export default router;
