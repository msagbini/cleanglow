// Shared subscription-cancellation logic — used by both the admin panel
// (which can waive or force the early-cancellation fee at its own
// discretion) and the customer account portal (which must always show and
// get explicit confirmation of the fee before charging it, since there's no
// human on the business side approving a self-service cancellation).
import { getStripe } from './routes/payments.js';
import { markBookingStatus } from './db.js';
import { config } from './config.js';

// A customer who picks weekly/fortnightly for the recurring discount and
// cancels right after the first clean gets the discount without ever giving
// the business the repeat business it was priced for — this is what the
// early-cancellation fee protects against.
export function getCancellationInfo(booking) {
  const minCycles = config.booking.earlyCancellationMinCycles ?? 0;
  const cyclesShort = Math.max(0, minCycles - booking.cycles_completed);
  return {
    cyclesCompleted: booking.cycles_completed,
    minCycles,
    feeApplies: cyclesShort > 0,
    feeCents: cyclesShort > 0 ? booking.amount_cents : 0,
  };
}

export async function cancelSubscription(booking, chargeFeeCents = 0) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, status: 500, error: 'Stripe is not configured on the server.' };
  if (!booking.stripe_subscription_id) {
    return { ok: false, status: 400, error: 'This booking has no active subscription' };
  }

  if (chargeFeeCents > 0) {
    try {
      const subscription = await stripe.subscriptions.retrieve(booking.stripe_subscription_id);
      const paymentMethod = subscription.default_payment_method;
      if (!paymentMethod) {
        return { ok: false, status: 502, error: 'No card on file for this subscription — cancel manually from the Stripe dashboard instead.' };
      }
      await stripe.paymentIntents.create({
        amount: chargeFeeCents,
        currency: booking.currency,
        customer: subscription.customer,
        payment_method: paymentMethod,
        off_session: true,
        confirm: true,
        description: `Early cancellation fee — Booking ${booking.id}`,
      });
    } catch (err) {
      console.error('[stripe] Error charging early-cancellation fee:', err.message);
      return { ok: false, status: 502, error: `Could not charge the cancellation fee (${err.message}) — subscription was NOT cancelled.` };
    }
  }

  try {
    await stripe.subscriptions.cancel(booking.stripe_subscription_id);
  } catch (err) {
    console.error('[stripe] Error cancelling subscription:', err.message);
    return { ok: false, status: 502, error: 'Could not cancel the subscription with Stripe.' };
  }

  const updated = markBookingStatus(booking.id, 'cancelled');
  return { ok: true, booking: updated };
}
