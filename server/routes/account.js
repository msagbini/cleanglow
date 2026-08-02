// The customer/agent account portal — passwordless. A customer requests a
// login link by email; clicking it sets an httpOnly session cookie. The
// same login also serves property managers who were only ever set as
// agent_email on someone else's booking (see db.js's listBookingsForAccount)
// — one identity system, two audiences, read-only for the agent side.
import { Router } from 'express';
import { parse } from 'cookie';
import {
  getBooking, createMagicLink, consumeMagicLink, createCustomerSession, getCustomerSession,
  deleteCustomerSession, listBookingsForAccount, getReferralCodeByOwner, listRewardCodesForOwner,
} from '../db.js';
import { friendDiscountLabel } from '../referrals.js';
import { sendMagicLink } from '../email.js';
import { getCancellationInfo, cancelSubscription } from '../subscriptions.js';
import { requireCustomerSession, SESSION_COOKIE_NAME } from '../middleware/requireCustomerSession.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isProd = process.env.NODE_ENV === 'production';

function baseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// Deliberately the exact same response whether or not this email has any
// bookings — otherwise this endpoint becomes a free "is this person a
// CleanGlow customer" oracle for anyone who types an email in.
router.post('/request-link', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  if (listBookingsForAccount(email).length > 0) {
    const token = createMagicLink(email);
    const verifyUrl = `${baseUrl(req)}/api/account/verify?token=${token}`;
    await sendMagicLink(email, verifyUrl);
  }

  res.json({ message: 'If that email has any bookings with us, we\'ve sent a login link — check your inbox.' });
});

router.get('/verify', (req, res) => {
  const token = String(req.query.token ?? '');
  const link = consumeMagicLink(token);
  if (!link) {
    return res.redirect('/account/?login=invalid');
  }

  const sessionToken = createCustomerSession(link.email);
  res.cookie(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.redirect('/account/');
});

router.post('/logout', requireCustomerSession, (req, res) => {
  const token = parse(req.headers.cookie || '')[SESSION_COOKIE_NAME];
  if (token) deleteCustomerSession(token);
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireCustomerSession, (req, res) => {
  res.json({ email: req.customerEmail });
});

function accountBookingView(booking) {
  return {
    id: booking.id,
    accountRole: booking.accountRole,
    status: booking.status,
    propertyType: booking.property_type,
    bedrooms: booking.bedrooms,
    bathrooms: booking.bathrooms,
    address: booking.address,
    bookingDate: booking.booking_date,
    bookingTime: booking.booking_time,
    frequency: booking.frequency,
    amount: booking.amount_cents / 100,
    currency: booking.currency,
    hasActiveSubscription: booking.accountRole === 'customer' && !!booking.stripe_subscription_id && booking.status === 'paid',
    cyclesCompleted: booking.cycles_completed,
  };
}

router.get('/bookings', requireCustomerSession, (req, res) => {
  res.json({ bookings: listBookingsForAccount(req.customerEmail).map(accountBookingView) });
});

router.get('/referral', requireCustomerSession, (req, res) => {
  const referral = getReferralCodeByOwner(req.customerEmail, null);
  const rewards = listRewardCodesForOwner(req.customerEmail).map(r => ({
    code: r.code,
    amount: r.amount_cents / 100,
    used: !!r.used,
    createdAt: r.created_at,
  }));
  res.json({ code: referral?.code ?? null, friendDiscount: friendDiscountLabel(), rewards });
});

// Only the paying customer can cancel their own subscription — never an
// agent who happens to share this login system via agent_email.
function ownCustomerBookingOr404(req, res) {
  const booking = getBooking(req.params.id);
  if (!booking || booking.email.toLowerCase() !== req.customerEmail.toLowerCase()) {
    res.status(404).json({ error: 'Booking not found' });
    return null;
  }
  return booking;
}

router.get('/bookings/:id/cancellation-info', requireCustomerSession, (req, res) => {
  const booking = ownCustomerBookingOr404(req, res);
  if (!booking) return;
  res.json(getCancellationInfo(booking));
});

// Self-service cancellation always shows the fee first and requires explicit
// confirmation to charge it — unlike the admin panel, there's no staff
// member reviewing this before it happens.
router.post('/bookings/:id/cancel-subscription', requireCustomerSession, async (req, res) => {
  const booking = ownCustomerBookingOr404(req, res);
  if (!booking) return;

  const info = getCancellationInfo(booking);
  if (info.feeApplies && !req.body?.acceptFee) {
    return res.status(409).json({
      error: 'Cancelling before your minimum commitment applies an early-cancellation fee. Confirm to proceed.',
      ...info,
    });
  }

  const result = await cancelSubscription(booking, info.feeApplies ? info.feeCents : 0);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result.booking);
});

export default router;
