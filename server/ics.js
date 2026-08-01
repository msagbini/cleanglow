// Builds a plain .ics (iCalendar) file for a paid booking — works with
// Google Calendar, Apple Calendar, Outlook and anything else that reads the
// standard format, with no OAuth/API integration needed on either side.
// Each time slot in config/business.json is a fixed 3-hour block (e.g.
// "8:00am - 11:00am"), so the event duration is hardcoded to match.
const SLOT_DURATION_HOURS = 3;

function pad(n) {
  return String(n).padStart(2, '0');
}

function icsDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  const [hh, mm] = timeStr.split(':');
  return `${y}${m}${d}T${hh}${mm}00`;
}

function addHours(timeStr, hours) {
  const [hh, mm] = timeStr.split(':').map(Number);
  const total = ((hh * 60 + mm + hours * 60) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// Commas/semicolons/newlines are structurally significant in ICS text
// fields and must be backslash-escaped, or some calendar apps mis-parse
// the file (e.g. truncate DESCRIPTION at the first comma).
function icsEscape(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function buildBookingIcs(booking, business) {
  const startDT = icsDateTime(booking.booking_date, booking.booking_time);
  const endDT = icsDateTime(booking.booking_date, addHours(booking.booking_time, SLOT_DURATION_HOURS));
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const domain = (business.email || 'booking@example.com').split('@').pop();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `PRODID:-//${business.name}//Booking//EN`,
    'BEGIN:VEVENT',
    `UID:${booking.id}@${domain}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startDT}`,
    `DTEND:${endDT}`,
    `SUMMARY:${icsEscape(`${business.name} — end of lease clean`)}`,
    `DESCRIPTION:${icsEscape(`Booking reference ${booking.id}. Questions? Call ${business.phoneDisplay || business.phone}.`)}`,
    `LOCATION:${icsEscape(`${booking.address}, ${booking.postcode}`)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
