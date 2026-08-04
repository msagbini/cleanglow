// Instant push notification to the business owner's phone via ntfy.sh — a
// free, no-signup push service. Unlike email/SMS, this needs no OAuth,
// no API key, and no verified sender identity, so it works the moment
// NTFY_TOPIC is set — even before SMTP/ClickSend are configured. This is
// deliberately a *second* channel alongside notifyPaidBooking's email, not
// a replacement: email keeps a permanent record, this just guarantees the
// owner finds out immediately regardless of whether email is set up yet.
//
// ntfy topics aren't authenticated on the free tier — anyone who knows the
// topic name can read notifications sent to it — so NTFY_TOPIC should be a
// long, hard-to-guess string (e.g. a UUID), not a short memorable word.
export async function sendOwnerPush(title, message) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.log(`[push:noop] NTFY_TOPIC not configured. ${title} — ${message}`);
    return;
  }
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      // Title stays ASCII-only by design (the callers below never put
      // customer-supplied text in it) — HTTP headers can't safely carry
      // arbitrary UTF-8. All variable details go in the body instead, which
      // has no such restriction.
      headers: { Title: title, Priority: 'high' },
      body: message,
    });
    if (!res.ok) {
      console.error(`[push] ntfy.sh responded ${res.status}`);
    }
  } catch (err) {
    console.error('[push] Failed to send:', err.message);
  }
}
