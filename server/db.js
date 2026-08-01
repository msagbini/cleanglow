import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'bookings.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    property_type TEXT NOT NULL,
    bedrooms TEXT NOT NULL,
    bathrooms INTEGER NOT NULL,
    sqm INTEGER,
    furnished TEXT,
    notes_property TEXT,
    extras TEXT NOT NULL DEFAULT '[]',
    key_access TEXT,
    booking_date TEXT NOT NULL,
    booking_time TEXT NOT NULL,
    urgency TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    postcode TEXT NOT NULL,
    promo_code TEXT,
    frequency TEXT NOT NULL DEFAULT 'once',
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'eur',
    stripe_session_id TEXT,
    stripe_subscription_id TEXT,
    notified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings (stripe_session_id);
  CREATE TABLE IF NOT EXISTS booking_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    filename TEXT NOT NULL,
    original_name TEXT,
    size_bytes INTEGER,
    phase TEXT NOT NULL DEFAULT 'before',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_booking_photos_booking ON booking_photos (booking_id);
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    phone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reminded_at TEXT,
    converted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS processed_webhook_events (
    event_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- id doubles as the cleaner's access token (e.g. /cleaner/<id>) — same
  -- "unguessable id as the credential" pattern already used for booking
  -- references, appropriate for a small trusted team rather than a full
  -- per-employee login system.
  CREATE TABLE IF NOT EXISTS cleaners (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// CREATE TABLE IF NOT EXISTS only applies the schema to a brand-new file — an
// existing bookings.sqlite from before these columns existed needs them added
// explicitly. SQLite has no "ADD COLUMN IF NOT EXISTS", so probe and ignore
// the "duplicate column" error when it's already there.
for (const ddl of [
  'ALTER TABLE bookings ADD COLUMN frequency TEXT NOT NULL DEFAULT \'once\'',
  'ALTER TABLE bookings ADD COLUMN stripe_subscription_id TEXT',
  // Starts at 1 — the very first Checkout payment is cycle 1, before any
  // recurring `invoice.payment_succeeded` webhook has fired.
  'ALTER TABLE bookings ADD COLUMN cycles_completed INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE bookings ADD COLUMN reminder_sent_at TEXT',
  'ALTER TABLE bookings ADD COLUMN review_request_sent_at TEXT',
  // 'before' for every existing row — they were all customer-submitted
  // pre-clean photos, since "after" photos didn't exist before this column.
  'ALTER TABLE booking_photos ADD COLUMN phase TEXT NOT NULL DEFAULT \'before\'',
  'ALTER TABLE bookings ADD COLUMN assigned_cleaner_id TEXT REFERENCES cleaners(id)',
]) {
  try { db.exec(ddl); } catch { /* column already exists */ }
}

// Derives a short reference prefix from the business name (e.g. "CleanGlow" -> "CG")
// so booking references stay branded without needing a separate config field.
function deriveReferencePrefix(name) {
  const words = name.match(/[A-Z][a-z]*|[a-z]+/g) || [];
  const initials = words.slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return initials || 'BK';
}
const REFERENCE_PREFIX = deriveReferencePrefix(config.business.name);

function generateReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${REFERENCE_PREFIX}-${code}`;
}

// Bookings in these statuses occupy a time slot; cancelled/expired ones free it up.
const ACTIVE_SLOT_STATUSES = ['pending_payment', 'paid', 'completed'];

export function countActiveBookingsForSlot(date, time) {
  const placeholders = ACTIVE_SLOT_STATUSES.map(() => '?').join(',');
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM bookings WHERE booking_date = ? AND booking_time = ? AND status IN (${placeholders})`
  ).get(date, time, ...ACTIVE_SLOT_STATUSES);
  return row.count;
}

export function isSlotAvailable(date, time) {
  return countActiveBookingsForSlot(date, time) < (config.booking.maxConcurrentBookingsPerSlot ?? 1);
}

export class SlotUnavailableError extends Error {}

// The availability check and the insert run in the same synchronous call, with
// no `await` in between — node:sqlite is synchronous and Node is single-threaded,
// so nothing else can interleave and double-book the slot between the two.
export function insertBooking(fields, amountCents) {
  if (!isSlotAvailable(fields.bookingDate, fields.bookingTime)) {
    throw new SlotUnavailableError('This time slot is no longer available');
  }

  let id = generateReference();
  const findStmt = db.prepare('SELECT id FROM bookings WHERE id = ?');
  while (findStmt.get(id)) id = generateReference();

  const stmt = db.prepare(`
    INSERT INTO bookings (
      id, property_type, bedrooms, bathrooms, sqm, furnished, notes_property,
      extras, key_access, booking_date, booking_time, urgency,
      full_name, email, phone, address, postcode, promo_code, frequency, amount_cents, currency
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id, fields.propertyType, fields.bedrooms, fields.bathrooms, fields.sqm ?? null,
    fields.furnished ?? null, fields.notesProperty ?? null, JSON.stringify(fields.extras ?? []),
    fields.keyAccess ?? null, fields.bookingDate, fields.bookingTime, fields.urgency,
    fields.fullName, fields.email, fields.phone, fields.address, fields.postcode,
    fields.promoCode ?? null, fields.frequency ?? 'once', amountCents, config.business.currency
  );
  return getBooking(id);
}

const MAX_PHOTOS_PER_BOOKING = 8;

// 'before' (customer, at booking time) and 'after' (admin, once the clean is
// done) are budgeted separately — a customer submitting 8 pre-clean photos
// shouldn't leave no room for the cleaning team's after photos, or vice versa.
export function countPhotosForBooking(bookingId, phase = 'before') {
  const row = db.prepare('SELECT COUNT(*) as count FROM booking_photos WHERE booking_id = ? AND phase = ?').get(bookingId, phase);
  return row.count;
}

export function addBookingPhoto(bookingId, { filename, originalName, sizeBytes, phase = 'before' }) {
  if (countPhotosForBooking(bookingId, phase) >= MAX_PHOTOS_PER_BOOKING) {
    throw new Error('Maximum number of photos reached for this booking');
  }
  db.prepare(
    'INSERT INTO booking_photos (booking_id, filename, original_name, size_bytes, phase) VALUES (?, ?, ?, ?, ?)'
  ).run(bookingId, filename, originalName ?? null, sizeBytes ?? null, phase);
}

export function listBookingPhotos(bookingId) {
  return db.prepare(
    'SELECT id, filename, original_name, size_bytes, phase, created_at FROM booking_photos WHERE booking_id = ? ORDER BY id ASC'
  ).all(bookingId);
}

// Captured as soon as the customer types an email/phone in the booking
// form, before they've necessarily finished or paid — lets the business
// follow up (by SMS, or by hand) with anyone who starts a booking and
// doesn't come back to complete it.
export function saveLead({ email, phone }) {
  const normalisedEmail = email ? String(email).trim().toLowerCase().slice(0, 200) : null;
  const normalisedPhone = phone ? String(phone).replace(/\D/g, '').slice(0, 10) : null;
  if (!normalisedEmail && !normalisedPhone) return;

  // One open (not yet reminded/converted) lead per email+phone pair, updated
  // in place, so re-typing the same details doesn't create duplicate rows.
  const existing = db.prepare(`
    SELECT id FROM leads
    WHERE reminded_at IS NULL AND converted_at IS NULL
      AND ((email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?))
    ORDER BY id DESC LIMIT 1
  `).get(normalisedEmail, normalisedPhone);

  if (existing) {
    db.prepare('UPDATE leads SET email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE id = ?')
      .run(normalisedEmail, normalisedPhone, existing.id);
  } else {
    db.prepare('INSERT INTO leads (email, phone) VALUES (?, ?)').run(normalisedEmail, normalisedPhone);
  }
}

// Called once a real booking is created, so a lead that converts doesn't
// later get a "did you forget something?" reminder.
export function markLeadsConvertedFor({ email, phone }) {
  const normalisedEmail = email ? String(email).trim().toLowerCase() : null;
  const normalisedPhone = phone ? String(phone).replace(/\D/g, '') : null;
  db.prepare(`
    UPDATE leads SET converted_at = datetime('now')
    WHERE converted_at IS NULL
      AND ((email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?))
  `).run(normalisedEmail, normalisedPhone);
}

export function findStaleLeads(minutesOld) {
  return db.prepare(`
    SELECT * FROM leads
    WHERE reminded_at IS NULL AND converted_at IS NULL
      AND phone IS NOT NULL
      AND created_at <= datetime('now', ?)
  `).all(`-${Number(minutesOld)} minutes`);
}

export function markLeadReminded(id) {
  db.prepare(`UPDATE leads SET reminded_at = datetime('now') WHERE id = ?`).run(id);
}

export function listLeads({ limit = 100 } = {}) {
  return db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function getBooking(id) {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  return row ? deserialize(row) : null;
}

export function getBookingBySessionId(sessionId) {
  const row = db.prepare('SELECT * FROM bookings WHERE stripe_session_id = ?').get(sessionId);
  return row ? deserialize(row) : null;
}

export function getBookingBySubscriptionId(subscriptionId) {
  const row = db.prepare('SELECT * FROM bookings WHERE stripe_subscription_id = ?').get(subscriptionId);
  return row ? deserialize(row) : null;
}

// Counts a completed recurring billing cycle — used to enforce the minimum
// commitment before a subscription can be cancelled without an early-
// cancellation fee (see earlyCancellationMinCycles in business.json).
export function incrementCyclesCompleted(id) {
  db.prepare(`UPDATE bookings SET cycles_completed = cycles_completed + 1, updated_at = datetime('now') WHERE id = ?`).run(id);
}

export function attachStripeSession(id, sessionId) {
  db.prepare(`UPDATE bookings SET stripe_session_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(sessionId, id);
}

export function attachStripeSubscription(id, subscriptionId) {
  db.prepare(`UPDATE bookings SET stripe_subscription_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(subscriptionId, id);
}

export function markBookingStatus(id, status) {
  db.prepare(`UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
  return getBooking(id);
}

export function markNotified(id) {
  db.prepare(`UPDATE bookings SET notified_at = datetime('now') WHERE id = ?`).run(id);
}

// Paid bookings whose appointment is now less than 24h away and haven't had
// a reminder yet. `booking_date || ' ' || booking_time` turns ("2026-08-01",
// "14:00") into a string SQLite's datetime() can parse directly.
export function findBookingsNeedingReminder() {
  return db.prepare(`
    SELECT * FROM bookings
    WHERE status = 'paid' AND reminder_sent_at IS NULL
      AND datetime(booking_date || ' ' || booking_time) > datetime('now')
      AND datetime(booking_date || ' ' || booking_time) <= datetime('now', '+24 hours')
  `).all().map(deserialize);
}

export function markReminderSent(id) {
  db.prepare(`UPDATE bookings SET reminder_sent_at = datetime('now') WHERE id = ?`).run(id);
}

export function markReviewRequestSent(id) {
  db.prepare(`UPDATE bookings SET review_request_sent_at = datetime('now') WHERE id = ?`).run(id);
}

// Stripe documents at-least-once (occasionally duplicate) webhook delivery.
// Without this, a duplicate `invoice.payment_succeeded` delivery would
// double-increment cycles_completed, letting a subscriber's minimum-
// commitment counter (used to waive the early-cancellation fee) advance
// faster than their real billing history.
export function hasProcessedEvent(eventId) {
  return !!db.prepare('SELECT 1 FROM processed_webhook_events WHERE event_id = ?').get(eventId);
}

export function markEventProcessed(eventId) {
  db.prepare('INSERT OR IGNORE INTO processed_webhook_events (event_id) VALUES (?)').run(eventId);
}

const VALID_STATUSES = ['pending_payment', 'paid', 'completed', 'cancelled', 'expired'];

export function listBookings({ status, limit = 200 } = {}) {
  let query = 'SELECT * FROM bookings';
  const params = [];
  if (status && VALID_STATUSES.includes(status)) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(query).all(...params).map(deserialize);
}

export function countBookingsByStatus() {
  const rows = db.prepare('SELECT status, COUNT(*) as count FROM bookings GROUP BY status').all();
  return Object.fromEntries(rows.map(r => [r.status, r.count]));
}

export function isValidStatus(status) {
  return VALID_STATUSES.includes(status);
}

function deserialize(row) {
  return { ...row, extras: JSON.parse(row.extras || '[]') };
}

// The cleaner's id IS their access token (crypto.randomUUID(), 122 bits of
// randomness — not brute-forceable) — there's no separate password to set,
// lose, or reset. Admin creates a cleaner, copies their link, sends it once.
export function createCleaner({ name, phone, email }) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO cleaners (id, name, phone, email) VALUES (?, ?, ?, ?)')
    .run(id, name, phone ?? null, email ?? null);
  return getCleaner(id);
}

export function getCleaner(id) {
  return db.prepare('SELECT * FROM cleaners WHERE id = ?').get(id) ?? null;
}

export function listCleaners() {
  return db.prepare('SELECT * FROM cleaners ORDER BY created_at DESC').all();
}

export function setCleanerActive(id, active) {
  db.prepare('UPDATE cleaners SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function assignBookingToCleaner(bookingId, cleanerId) {
  db.prepare('UPDATE bookings SET assigned_cleaner_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(cleanerId, bookingId);
}

// Only ever called with an id that came from the cleaner's own access
// token — never exposes another cleaner's jobs.
export function listBookingsForCleaner(cleanerId) {
  return db.prepare('SELECT * FROM bookings WHERE assigned_cleaner_id = ? ORDER BY booking_date ASC, booking_time ASC')
    .all(cleanerId).map(deserialize);
}

export default db;
