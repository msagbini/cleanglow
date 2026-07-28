import nodemailer from 'nodemailer';
import { config } from './config.js';

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
    console.log(`[email:noop] SMTP no configurado. Para: ${mail.to} — ${mail.subject}\n${mail.text}`);
    return Promise.resolve();
  }
  return transporter.sendMail({
    from: process.env.EMAIL_FROM || `${config.business.name} <no-reply@example.com>`,
    ...mail,
  }).catch(err => console.error('[email] Fallo al enviar:', err.message));
}

function bookingSummaryLines(booking) {
  const amount = `${(booking.amount_cents / 100).toFixed(2)}${config.business.currencySymbol}`;
  return [
    `Referencia: ${booking.id}`,
    `Servicio: ${booking.property_type} · ${booking.bedrooms} hab. · ${booking.bathrooms} baño(s)`,
    `Extras: ${booking.extras.join(', ') || 'ninguno'}`,
    `Fecha: ${booking.booking_date} · franja ${booking.booking_time} · urgencia: ${booking.urgency}`,
    `Total: ${amount}`,
  ];
}

export async function notifyPaidBooking(booking) {
  const lines = [
    `Cliente: ${booking.full_name} (${booking.email}, ${booking.phone})`,
    `Dirección: ${booking.address}, ${booking.postcode}`,
    ...bookingSummaryLines(booking),
  ];
  await send({
    to: process.env.NOTIFY_EMAIL_TO || process.env.SMTP_USER,
    subject: `Nueva reserva pagada — ${booking.id}`,
    text: lines.join('\n'),
  });
}

export async function sendCustomerConfirmation(booking) {
  const lines = [
    `Hola ${booking.full_name},`,
    '',
    `Tu reserva con ${config.business.name} ha sido confirmada y el pago procesado correctamente.`,
    '',
    ...bookingSummaryLines(booking),
    '',
    `Nos pondremos en contacto contigo para coordinar el acceso a ${booking.address}.`,
    '',
    `— ${config.business.name}`,
  ];
  await send({
    to: booking.email,
    subject: `Reserva confirmada — ${booking.id}`,
    text: lines.join('\n'),
  });
}
