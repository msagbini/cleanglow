import nodemailer from 'nodemailer';
import { config, computeGstComponentCents } from './config.js';
import { buildBookingIcs } from './ics.js';
import { resolveBaseUrl } from './baseUrl.js';

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

function bookingSummaryLinesEs(booking) {
  const symbol = config.business.currencySymbol;
  const amount = `${symbol}${(booking.amount_cents / 100).toFixed(2)}`;
  const lines = [
    `Referencia: ${booking.id}`,
    `Servicio: ${booking.property_type} · ${booking.bedrooms} dorm · ${booking.bathrooms} baño(s)`,
    `Extras: ${booking.extras.join(', ') || 'ninguno'}`,
    `Fecha: ${booking.booking_date} · horario ${booking.booking_time} · urgencia: ${booking.urgency}`,
    `Total: ${amount}`,
  ];
  const gstCents = computeGstComponentCents(booking.amount_cents);
  if (gstCents > 0) {
    lines.push(`(incluye ${symbol}${(gstCents / 100).toFixed(2)} de GST)`);
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

export async function sendCustomerConfirmation(booking, referralCode) {
  const isEs = booking.language === 'es';
  const lines = isEs ? [
    `Hola ${booking.full_name},`,
    '',
    `Tu reserva con ${config.business.name} fue confirmada y el pago se procesó correctamente.`,
    '',
    ...bookingSummaryLinesEs(booking),
    '',
    `Nos pondremos en contacto para coordinar el acceso a ${booking.address}.`,
    '',
    `Gestiona esta reserva cuando quieras (ver detalles, o cancelar una limpieza recurrente) en ${resolveBaseUrl()}/account/ — solo ingresa este email, sin necesidad de contraseña.`,
  ] : [
    `Hi ${booking.full_name},`,
    '',
    `Your booking with ${config.business.name} has been confirmed and payment processed successfully.`,
    '',
    ...bookingSummaryLines(booking),
    '',
    `We'll be in touch to coordinate access to ${booking.address}.`,
    '',
    `Manage this booking anytime (view details, or cancel a recurring clean) at ${resolveBaseUrl()}/account/ — just enter this email, no password needed.`,
  ];
  if (referralCode) {
    const symbol = config.business.currencySymbol;
    const amount = `${symbol}${((config.booking.referral?.friendDiscountCents ?? 2000) / 100).toFixed(0)}`;
    lines.push(
      '',
      isEs
        ? `¿Conoces a alguien más que necesite una limpieza de fin de contrato? Comparte tu código — obtienen ${amount} de descuento en su primera reserva, y una vez que su limpieza esté completa, tú recibes ${amount} de crédito para tu próxima limpieza.`
        : `Know someone else who needs an end of lease clean? Share your code below — they get ${amount} off their first booking, and once their clean is complete, you get ${amount} credit towards your next one.`,
      isEs ? `Tu código: ${referralCode.code}` : `Your code: ${referralCode.code}`,
    );
  }
  lines.push('', `— ${config.business.name}`);
  await send({
    to: booking.email,
    subject: isEs ? `Reserva confirmada — ${booking.id}` : `Booking confirmed — ${booking.id}`,
    text: lines.join('\n'),
    attachments: [{
      filename: `${booking.id}.ics`,
      content: buildBookingIcs(booking, config.business),
      contentType: 'text/calendar',
    }],
  });
}

// Passwordless login — the email itself is the only "credential" a customer
// needs to remember. The link is single-use and expires in 15 minutes
// (enforced server-side in db.js's consumeMagicLink), so this being
// forwarded or sitting in an old inbox isn't a standing access risk.
// `lang` comes from the account portal's current toggle state at the moment
// the link was requested (see server/routes/account.js) — there's no
// booking to read a stored language from at this point, since a magic link
// covers every booking tied to that email, possibly in different languages.
export async function sendMagicLink(email, verifyUrl, lang) {
  const isEs = lang === 'es';
  await send({
    to: email,
    subject: isEs ? `Tu enlace de acceso a ${config.business.name}` : `Your ${config.business.name} account link`,
    text: (isEs ? [
      `Hola,`,
      '',
      `Haz clic abajo para acceder a tu cuenta de ${config.business.name} (tus reservas, código de referido y créditos):`,
      '',
      verifyUrl,
      '',
      `Este enlace funciona una sola vez y expira en 15 minutos. Si no lo solicitaste, puedes ignorar este email.`,
      '',
      `— ${config.business.name}`,
    ] : [
      `Hi,`,
      '',
      `Click below to access your ${config.business.name} account (your bookings, referral code and credits):`,
      '',
      verifyUrl,
      '',
      `This link works once and expires in 15 minutes. If you didn't request it, you can ignore this email.`,
      '',
      `— ${config.business.name}`,
    ]).join('\n'),
  });
}

// Sent automatically to the property manager/agency email the customer
// optionally provided at booking time, once the job is marked completed —
// they get the evidence for the bond return without the tenant having to
// remember to forward anything themselves.
export async function sendAgentProofLink(booking) {
  const isEs = booking.language === 'es';
  const proofUrl = `${resolveBaseUrl()}/proof/${booking.id}${isEs ? '?lang=es' : ''}`;
  await send({
    to: booking.agent_email,
    subject: isEs ? `Prueba de limpieza — ${booking.address} (${booking.id})` : `Proof of clean — ${booking.address} (${booking.id})`,
    text: (isEs ? [
      `Hola,`,
      '',
      `${config.business.name} completó una limpieza de fin de contrato en ${booking.address}, reservada por ${booking.full_name}.`,
      '',
      `Consulta el checklist y las fotos antes/después aquí: ${proofUrl}`,
      '',
      `Referencia: ${booking.id}`,
      '',
      `— ${config.business.name}`,
    ] : [
      `Hi,`,
      '',
      `${config.business.name} has completed an end of lease clean at ${booking.address}, booked by ${booking.full_name}.`,
      '',
      `View the checklist and before/after photos here: ${proofUrl}`,
      '',
      `Reference: ${booking.id}`,
      '',
      `— ${config.business.name}`,
    ]).join('\n'),
  });
}

// A one-off charge outside the normal booking flow (late-arrival waiting
// fee, lockout fee — see the admin panel's "Charge fee" action and the
// Property Access & Lateness terms). Sent only when the admin explicitly
// asks to email the link, and always in English since the Spanish toggle
// is currently disabled site-wide.
export async function sendExtraChargeLink(booking, checkoutUrl, reason, amountCents) {
  const symbol = config.business.currencySymbol;
  const amount = `${symbol}${(amountCents / 100).toFixed(2)}`;
  await send({
    to: booking.email,
    subject: `${reason} — ${booking.id}`,
    text: [
      `Hi ${booking.full_name},`,
      '',
      `This is regarding your ${config.business.name} booking ${booking.id} at ${booking.address}: ${reason} (${amount}), as outlined in our terms & conditions.`,
      '',
      `You can pay securely here: ${checkoutUrl}`,
      '',
      `If you have any questions about this charge, just reply to this email or call ${config.business.phoneDisplay}.`,
      '',
      `— ${config.business.name}`,
    ].join('\n'),
  });
}

// Sent by the Stripe webhook once it confirms an extra-charge session was
// actually paid (see routes/payments.js's markExtraChargePaidAndNotify) —
// closes the loop so the customer has written confirmation, not just a
// browser redirect after paying.
export async function sendExtraChargePaidConfirmation(booking, charge) {
  const symbol = config.business.currencySymbol;
  const amount = `${symbol}${(charge.amount_cents / 100).toFixed(2)}`;
  await send({
    to: booking.email,
    subject: `Payment received — ${charge.reason} (${booking.id})`,
    text: [
      `Hi ${booking.full_name},`,
      '',
      `We've received your payment of ${amount} for: ${charge.reason} (booking ${booking.id}).`,
      '',
      `If you have any questions, just reply to this email or call ${config.business.phoneDisplay}.`,
      '',
      `— ${config.business.name}`,
    ].join('\n'),
  });
}

// Fulfils the "before/after photos included" guarantee point — sent once a
// booking is marked completed, only if the cleaning team actually uploaded
// after-photos for it (see routes/admin.js).
export async function sendCompletionPhotos(booking, afterPhotoPaths) {
  const isEs = booking.language === 'es';
  await send({
    to: booking.email,
    subject: isEs ? `Tu limpieza está lista — fotos antes/después (${booking.id})` : `Your clean is done — before/after photos (${booking.id})`,
    text: (isEs ? [
      `Hola ${booking.full_name},`,
      '',
      `Tu limpieza de fin de contrato en ${booking.address} está completa — adjuntamos las fotos de después, tal como prometimos en nuestra garantía de devolución del depósito.`,
      '',
      `Referencia: ${booking.id}`,
      '',
      `Si algo no se ve bien, contáctanos dentro de 7 días y lo volveremos a limpiar sin costo.`,
      '',
      `— ${config.business.name}`,
    ] : [
      `Hi ${booking.full_name},`,
      '',
      `Your end of lease clean at ${booking.address} is complete — attached are the after photos, as promised in our bond-back guarantee.`,
      '',
      `Reference: ${booking.id}`,
      '',
      `If anything doesn't look right, get in touch within 7 days and we'll re-clean it for free.`,
      '',
      `— ${config.business.name}`,
    ]).join('\n'),
    attachments: afterPhotoPaths.map((filePath, i) => ({
      filename: `after-${i + 1}${filePath.slice(filePath.lastIndexOf('.'))}`,
      path: filePath,
    })),
  });
}
