import express from 'express';
import stripePackage from 'stripe';
import { getPublicConfig } from '../config.js';
import { 
  getBooking, 
  getBookingBySessionId, 
  getBookingBySubscriptionId,
  markBookingStatus,
  attachStripeSession,
  attachStripeSubscription,
  markEventProcessed,
  hasProcessedEvent,
  processWebhookEvent,
  markExtraChargePaid,
  createExtraCharge,
  getExtraChargeBySessionId,
  listExtraChargesForBooking,
  incrementCyclesCompleted
} from '../db.js';
import { sendOwnerPush, sendConfirmationEmail, sendExtraChargePaidConfirmation } from '../notifications.js';

const router = express.Router();
const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

// Ruta para crear sesión de checkout (placeholder - implementar después)
router.post('/create-checkout-session', async (req, res) => {
  res.status(501).json({ error: 'Checkout session creation not implemented yet' });
});

// Ruta de confirmación (placeholder - implementar después)
router.get('/confirm', async (req, res) => {
  res.status(501).json({ error: 'Confirmation not implemented yet' });
});

// Webhook de Stripe (adaptado a funciones reales de db.js)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`[webhook] Signature error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const { alreadyProcessed, result } = processWebhookEvent(event.id, () => {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object;
          if (session.metadata?.type === 'extra_charge') {
            if (session.payment_status === 'paid') {
              const charge = markExtraChargePaid(session.id);
              if (charge) {
                const booking = getBooking(charge.booking_id);
                if (booking) {
                  console.log(`[webhook] Extra charge ${charge.id} paid for booking ${booking.id}`);
                  sendExtraChargePaidConfirmation(booking, charge);
                }
              }
            }
            break;
          }

          const booking = getBookingBySessionId(session.id);
          if (booking && session.payment_status === 'paid') {
            markBookingStatus(booking.id, 'paid');
            if (session.subscription) {
              attachStripeSubscription(booking.id, session.subscription);
            }
            attachStripeSession(booking.id, session.id);
            sendConfirmationEmail(booking);
          }
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          if (invoice.billing_reason === 'subscription_cycle') {
            const subscriptionId = invoice.subscription;
            if (subscriptionId) {
              const booking = getBookingBySubscriptionId(subscriptionId);
              if (booking) {
                incrementCyclesCompleted(booking.id);
              }
            }
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const booking = getBookingBySubscriptionId(subscription.id);
          if (booking) {
            markBookingStatus(booking.id, 'cancelled');
          }
          break;
        }

        default:
          console.log(`[webhook] Unhandled event type: ${event.type}`);
      }
    });

    if (alreadyProcessed) {
      console.log(`[webhook] Duplicate event ${event.id}, ignored.`);
      return res.json({ received: true, duplicate: true });
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[webhook] Error processing:', err.message);
    res.status(500).end();
  }
});

export default router;
