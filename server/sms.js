// ClickSend SMS integration. Mirrors email.js's pattern: if the credentials
// aren't configured, sending becomes a no-op that just logs what would have
// been sent, instead of throwing — SMS is a nice-to-have follow-up, never a
// dependency of the booking/payment flow itself.
import { config } from './config.js';

function getCredentials() {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return null;
  return { username, apiKey };
}

export async function sendSms(to, message) {
  const creds = getCredentials();
  if (!creds) {
    console.log(`[sms:noop] ClickSend not configured. To: ${to} — ${message}`);
    return;
  }

  const auth = Buffer.from(`${creds.username}:${creds.apiKey}`).toString('base64');
  try {
    const res = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ source: 'nodejs', to, body: message, from: config.business.name.slice(0, 11) }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[sms] ClickSend responded ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error('[sms] Failed to send:', err.message);
  }
}

export function abandonedBookingMessage(baseUrl) {
  const { business } = config;
  return `Hi! You started a booking with ${business.name} but didn't finish. Complete it here: ${baseUrl}/#booking or call us on ${business.phoneDisplay}.`;
}

export function reminderMessage(booking) {
  const { business } = config;
  const dateFormatted = new Date(`${booking.booking_date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Hi ${booking.full_name.split(' ')[0]}, reminder: your ${business.name} clean is coming up on ${dateFormatted} (${booking.booking_time} slot) at ${booking.address}. Reply or call ${business.phoneDisplay} if you need to reschedule.`;
}

export function reviewRequestMessage(booking) {
  const { business } = config;
  const reviewUrl = business.googleReviewUrl;
  return `Hi ${booking.full_name.split(' ')[0]}, thanks for booking with ${business.name}! If you were happy with the clean, a quick Google review really helps us out: ${reviewUrl}`;
}
