import nodemailer from 'nodemailer';

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export async function notifyPaidBooking(booking) {
  const subject = `Nueva reserva pagada — ${booking.id}`;
  const text = [
    `Referencia: ${booking.id}`,
    `Cliente: ${booking.full_name} (${booking.email}, ${booking.phone})`,
    `Dirección: ${booking.address}, ${booking.postcode}`,
    `Vivienda: ${booking.property_type} · ${booking.bedrooms} hab. · ${booking.bathrooms} baño(s)`,
    `Extras: ${booking.extras.join(', ') || 'ninguno'}`,
    `Fecha: ${booking.booking_date} · franja ${booking.booking_time} · urgencia: ${booking.urgency}`,
    `Total cobrado: ${(booking.amount_cents / 100).toFixed(2)}€`,
  ].join('\n');

  if (!transporter) {
    console.log(`[email:noop] SMTP no configurado. ${subject}\n${text}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'SpotlessExit <no-reply@spotlessexit.com>',
      to: process.env.NOTIFY_EMAIL_TO || process.env.SMTP_USER,
      subject,
      text,
    });
  } catch (err) {
    console.error('[email] Fallo al enviar notificación de reserva:', err.message);
  }
}
