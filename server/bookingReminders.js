// Sends a one-time SMS reminder to paid bookings less than 24h from their
// appointment. Same simple setInterval approach as leadSweep.js — this is a
// single-instance app with a handful of bookings a day, not a job-queue problem.
import { findBookingsNeedingReminder, markReminderSent } from './db.js';
import { sendSms, reminderMessage } from './sms.js';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

export function startBookingReminderSweep() {
  setInterval(runReminderSweepOnce, SWEEP_INTERVAL_MS);
}

export async function runReminderSweepOnce() {
  // See leadSweep.js for why this try/catch matters: an unhandled rejection
  // from this setInterval callback would otherwise crash the whole process.
  try {
    const dueBookings = findBookingsNeedingReminder();
    for (const booking of dueBookings) {
      await sendSms(booking.phone, reminderMessage(booking));
      markReminderSent(booking.id);
    }
  } catch (err) {
    console.error('[bookingReminders] Sweep iteration failed, will retry next interval:', err.message);
  }
}
