// Shared "a job just got marked completed" side effects — used by both the
// admin panel's status change and the cleaner panel's own "mark done"
// action, so the customer gets the same review request + after-photos email
// regardless of which of the two actually flipped the status.
import path from 'node:path';
import { listBookingPhotos, markReviewRequestSent } from './db.js';
import { config } from './config.js';
import { sendSms, reviewRequestMessage } from './sms.js';
import { sendCompletionPhotos, sendAgentProofLink } from './email.js';
import { issueReferralRewardIfDue } from './referrals.js';

export async function handleBookingCompleted(booking, uploadsDir) {
  // One-time review request, only once, and only if a real review link has
  // been set — otherwise this would silently send customers a broken link.
  if (!booking.review_request_sent_at && config.business.googleReviewUrl) {
    await sendSms(booking.phone, reviewRequestMessage(booking));
    markReviewRequestSent(booking.id);
  }

  // If this booking was the result of a friend's referral code, this is the
  // moment the referrer's reward unlocks — completed, not merely paid.
  await issueReferralRewardIfDue(booking);

  // Automatic evidence delivery to the property manager, if one was named
  // at booking time — the differentiator over a business that only sends
  // photos if the tenant remembers to forward them.
  if (booking.agent_email) {
    await sendAgentProofLink(booking);
  }

  // Delivers on the "before/after photos included" guarantee point — if the
  // cleaning team uploaded after-photos before marking the job completed,
  // the customer gets them by email right away instead of having to ask.
  const afterPhotos = listBookingPhotos(booking.id).filter(p => p.phase === 'after');
  if (afterPhotos.length) {
    await sendCompletionPhotos(booking, afterPhotos.map(p => path.join(uploadsDir, p.filename)));
  }
}
