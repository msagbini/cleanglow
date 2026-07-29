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
