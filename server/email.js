import nodemailer from 'nodemailer';
import { config, computeGstComponentCents } from './config.js';
import { buildBookingIcs } from './ics.js';

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

function send(mail) {
  if (!transporter) {
    console.log(`[email:noop] SMTP not configured. To: ${mail.to} — ${mail.subject}\n${mail.text}`);
    return Promise.resolve();
  }
  return transporter.sendMail({
    from: process.env.EMAIL_FROM || `${config.business.name} <no-reply@example.com>`,
    ...mail,
  }).catch(err => console.error('[email] Failed to send:', err.message));
}

function bookingSummaryLines(booking) {
  const symbol = config.business.currencySymbol;
  const amount = `${symbol}${(booking.amount_cents / 100).toFixed(2)}`;
  const lines = [
    `Reference: ${booking.id}`,
    `Service: ${booking.property_type} · ${booking.bedrooms} bed · ${booking.bathrooms} bath(s)`,
    `Extras: ${booking.extras.join(', ') || 'none'}`,
    `Date: ${booking.booking_date} · ${booking.booking_time} slot · urgency: ${booking.urgency}`,
    `Total: ${amount}`,
  ];
  const gstCents = computeGstComponentCents(booking.amount_cents);
  if (gstCents > 0) {
    lines.push(`(includes ${symbol}${(gstCents / 100).toFixed(2)} GST)`);
  }
  if (config.business.abn) {
    lines.push(`ABN: ${config.business.abn}`);
  }
  return lines;
}

export async function notifyPaidBooking(booking) {
  const lines = [
    `Customer: ${booking.full_name} (${booking.email}, ${booking.phone})`,
    `Address: ${booking.address}, ${booking.postcode}`,
    ...bookingSummaryLines(booking),
  ];
  await send({
    to: process.env.NOTIFY_EMAIL_TO || process.env.SMTP_USER,
    subject: `New paid booking — ${booking.id}`,
    text: lines.join('\n'),
  });
}

export async function sendCustomerConfirmation(booking) {
  const lines = [
    `Hi ${booking.full_name},`,
    '',
    `Your booking with ${config.business.name} has been confirmed and payment processed successfully.`,
    '',
    ...bookingSummaryLines(booking),
    '',
    `We'll be in touch to coordinate access to ${booking.address}.`,
    '',
    `— ${config.business.name}`,
  ];
  await send({
    to: booking.email,
    subject: `Booking confirmed — ${booking.id}`,
    text: lines.join('\n'),
    attachments: [{
      filename: `${booking.id}.ics`,
      content: buildBookingIcs(booking, config.business),
      contentType: 'text/calendar',
    }],
  });
}

// Fulfils the "before/after photos included" guarantee point — sent once a
// booking is marked completed, only if the cleaning team actually uploaded
// after-photos for it (see routes/admin.js).
export async function sendCompletionPhotos(booking, afterPhotoPaths) {
  await send({
    to: booking.email,
    subject: `Your clean is done — before/after photos (${booking.id})`,
    text: [
      `Hi ${booking.full_name},`,
      '',
      `Your end of lease clean at ${booking.address} is complete — attached are the after photos, as promised in our bond-back guarantee.`,
      '',
      `Reference: ${booking.id}`,
      '',
      `If anything doesn't look right, get in touch within 7 days and we'll re-clean it for free.`,
      '',
      `— ${config.business.name}`,
    ].join('\n'),
    attachments: afterPhotoPaths.map((filePath, i) => ({
      filename: `after-${i + 1}${filePath.slice(filePath.lastIndexOf('.'))}`,
      path: filePath,
    })),
  });
}
