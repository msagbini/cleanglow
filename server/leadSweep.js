// Periodically checks for abandoned bookings (a customer typed their email
// or phone but never completed/paid) and sends a one-time SMS reminder.
// A simple setInterval is deliberately enough here — this is a single-
// instance app with a handful of leads a day, not a job-queue problem.
import { findStaleLeads, markLeadReminded } from './db.js';
import { sendSms, abandonedBookingMessage } from './sms.js';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes
const ABANDONED_AFTER_MINUTES = 30; // remind once a lead has gone quiet this long

export function startAbandonedLeadSweep() {
  setInterval(runSweepOnce, SWEEP_INTERVAL_MS);
}

export async function runSweepOnce() {
  // A single transient error here (e.g. a locked SQLite file) must never take
  // down the whole live site — without this, Node's default behavior on an
  // unhandled rejection from this setInterval callback is to crash the process.
  try {
    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4242}`;
    const staleLeads = findStaleLeads(ABANDONED_AFTER_MINUTES);
    for (const lead of staleLeads) {
      await sendSms(lead.phone, abandonedBookingMessage(baseUrl));
      markLeadReminded(lead.id);
    }
  } catch (err) {
    console.error('[leadSweep] Sweep iteration failed, will retry next interval:', err.message);
  }
}
