import stripePackage from 'stripe';
import { getBookingBySubscriptionId, markBookingStatus, incrementCyclesCompleted } from './db.js';

const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

// Cancelar una suscripción en Stripe
export async function cancelSubscription(subscriptionId, chargeFeeCents = 0) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    console.log(`[subscriptions] Subscription ${subscriptionId} scheduled for cancellation at period end`);
    return subscription;
  } catch (err) {
    console.error('[subscriptions] Error canceling subscription:', err.message);
    throw err;
  }
}

// Obtener detalles de una suscripción
export async function getSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (err) {
    console.error('[subscriptions] Error retrieving subscription:', err.message);
    return null;
  }
}

// Cancelar inmediatamente (o al final del período) según configuración
export async function cancelSubscriptionImmediate(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    // Stripe cancela inmediatamente (o al final del período actual si ya se pagó)
    await stripe.subscriptions.cancel(subscriptionId);
    console.log(`[subscriptions] Subscription ${subscriptionId} canceled immediately`);
    return subscription;
  } catch (err) {
    console.error('[subscriptions] Error canceling subscription immediately:', err.message);
    throw err;
  }
}

// Función para cobrar un recargo por cancelación anticipada
export async function chargeEarlyCancellationFee(subscriptionId, amountCents, currency = 'aud') {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = subscription.customer;
    
    // Crear un PaymentIntent para cobrar el recargo
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: currency,
      customer: customerId,
      payment_method_types: ['card'],
      description: 'Early cancellation fee',
    });
    console.log(`[subscriptions] Early cancellation fee of ${amountCents/100} ${currency} created for subscription ${subscriptionId}`);
    return paymentIntent;
  } catch (err) {
    console.error('[subscriptions] Error charging early cancellation fee:', err.message);
    throw err;
  }
}
