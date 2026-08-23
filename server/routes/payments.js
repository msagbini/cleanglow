// server/routes/payments.js
import express from 'express';
import stripePackage from 'stripe';
import { getPublicConfig } from '../config.js';
import { 
  getBooking, 
  getBookingBySessionId, 
  markPaidOnce, 
  markExtraChargePaid,
  incrementSubscriptionCycle,
  markSubscriptionCancelled,
  processWebhookEvent  // <--- Nueva función importada
} from '../db.js';
import { sendOwnerPush, sendConfirmationEmail, sendExtraChargePaidConfirmation } from '../notifications.js';

const router = express.Router();
const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

// Crear sesión de checkout (tu código existente)
router.post('/create-checkout-session', async (req, res) => {
  // ... mantén tu implementación actual ...
});

// Webhook de Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`[webhook] Signature error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Procesar con transacción atómica
  try {
    const { alreadyProcessed, result } = processWebhookEvent(event.id, () => {
      // Este callback se ejecuta dentro de la transacción
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object;
          
          // Recargo extra
          if (session.metadata?.type === 'extra_charge') {
            if (session.payment_status === 'paid') {
              const charge = markExtraChargePaid(session.id);
              if (charge) {
                const booking = getBooking(charge.booking_id);
                if (booking) {
                  console.log(`[webhook] Extra charge ${charge.id} paid for booking ${booking.id}`);
                  // Enviar emails (si quieres)
                }
              }
            }
            break;
          }

          // Reserva normal
          const booking = getBookingBySessionId(session.id);
          if (booking && session.payment_status === 'paid') {
            // markPaidOnce es sincrónica, la llamamos directamente
            markPaidOnce(booking, session.subscription || null);
          }
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          if (invoice.billing_reason === 'subscription_cycle') {
            const subscriptionId = invoice.subscription;
            if (subscriptionId) {
              incrementSubscriptionCycle(subscriptionId);
            }
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          markSubscriptionCancelled(subscription.id);
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

// Confirmación de pago (tu código existente)
router.get('/confirm', async (req, res) => {
  // ... mantén tu implementación ...
});

export default router;
