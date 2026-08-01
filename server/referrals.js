// Referral program: a customer's reusable FRIEND- code gives a friend a
// fixed $ discount on their own first booking; once that friend's job is
// actually completed (not merely paid), the referrer gets a single-use,
// owner-locked CREDIT- reward code worth the same amount.
import {
  getReferralCode, getReferralCodeByOwner, createReferralCode, hasBookingForContact,
  insertReferralRedemption, getReferralRedemptionByBooking, markReferralRewardIssued,
  getRewardCode, createRewardCode,
} from './db.js';
import { config } from './config.js';
import { sendSms } from './sms.js';

const FRIEND_DISCOUNT_CENTS = config.booking.referral?.friendDiscountCents ?? 2000;
const REFERRER_REWARD_CENTS = config.booking.referral?.referrerRewardCents ?? 2000;

// Resolves whatever the customer typed into the promo code box. Static
// config promo codes are handled unchanged by computeAmountCents; this only
// covers the two dynamic, DB-backed code types. Returns null for anything
// unrecognised or blocked by an anti-abuse rule — deliberately the same
// "silently no discount" outcome for every failure reason (self-referral,
// already-used, already a customer, doesn't exist), so nothing here leaks
// *why* a code didn't work to whoever is probing it.
export function resolveDiscountCode(rawCode, { email, phone }) {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (!code) return null;

  if (code in config.booking.promoCodes) return null; // handled by computeAmountCents itself

  if (code.startsWith('CREDIT-')) {
    const reward = getRewardCode(code);
    if (!reward || reward.used) return null;
    const sameOwner = reward.owner_email.toLowerCase() === String(email ?? '').toLowerCase()
      || (reward.owner_phone && reward.owner_phone === phone);
    if (!sameOwner) return null; // owner-locked — can't be gifted or resold
    return { type: 'reward', code, amountOffCents: reward.amount_cents };
  }

  if (code.startsWith('FRIEND-')) {
    const referral = getReferralCode(code);
    if (!referral) return null;
    const isSelf = referral.owner_email.toLowerCase() === String(email ?? '').toLowerCase()
      || (referral.owner_phone && referral.owner_phone === phone);
    if (isSelf) return null; // no self-referral
    if (hasBookingForContact(email, phone)) return null; // only genuinely new customers count as "a friend"
    return { type: 'referral', code, amountOffCents: FRIEND_DISCOUNT_CENTS };
  }

  return null;
}

// Records that a friend's new booking used this referral code, so the
// reward can be paid out later once that specific booking is completed.
// Only ever called from the fully-synchronous POST /api/bookings handler
// (no awaits before it), so there's no race with another request in between
// resolveDiscountCode's checks and this write.
export function recordReferralRedemption(referralCode, booking) {
  insertReferralRedemption({
    referralCode,
    referredBookingId: booking.id,
    referredEmail: booking.email,
    referredPhone: booking.phone,
  });
}

// Gives a paying customer a code to share, reusing their existing one if
// they already have one (e.g. a repeat or recurring booking) so they're
// never sent two different codes to hand out to friends.
export function getOrCreateReferralCodeForCustomer(booking) {
  return getReferralCodeByOwner(booking.email, booking.phone)
    ?? createReferralCode({ email: booking.email, phone: booking.phone, name: booking.full_name });
}

// The payout side — called from the same shared hook that already fires the
// review-request SMS, so a referral reward only ever unlocks once the
// friend's own job is marked completed, never merely paid.
export async function issueReferralRewardIfDue(booking) {
  // Belt-and-suspenders: the real guarantee is that this is only ever called
  // from handleBookingCompleted, but checking the status here too means a
  // future accidental call site (e.g. from the "paid" webhook) can never pay
  // out a reward before the friend's job is genuinely done.
  if (booking.status !== 'completed') return;
  const redemption = getReferralRedemptionByBooking(booking.id);
  if (!redemption || redemption.reward_issued) return;

  const referral = getReferralCode(redemption.referral_code);
  if (!referral) return;

  const reward = createRewardCode({
    email: referral.owner_email,
    phone: referral.owner_phone,
    amountCents: REFERRER_REWARD_CENTS,
  });
  markReferralRewardIssued(booking.id, reward.code);

  if (referral.owner_phone) {
    await sendSms(referral.owner_phone, referralRewardMessage(referral, reward));
  }
}

function referralRewardMessage(referral, reward) {
  const { business } = config;
  const amount = `${business.currencySymbol}${(reward.amount_cents / 100).toFixed(0)}`;
  const firstName = (referral.owner_name || '').split(' ')[0] || 'there';
  return `Hi ${firstName}, great news — your friend's clean with ${business.name} is complete! Here's your ${amount} thank-you credit: ${reward.code}. Enter it as a promo code on your next booking.`;
}

export function friendDiscountLabel() {
  return `${config.business.currencySymbol}${(FRIEND_DISCOUNT_CENTS / 100).toFixed(0)}`;
}
