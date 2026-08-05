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
  -- One reusable code per customer, shared with as many friends as they like.
  CREATE TABLE IF NOT EXISTS referral_codes (
    code TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    owner_phone TEXT,
    owner_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- One row per friend who redeemed a referral code — tracks whether the
  -- referrer's reward has already been paid out for this specific friend.
  CREATE TABLE IF NOT EXISTS referral_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referral_code TEXT NOT NULL REFERENCES referral_codes(code),
    referred_booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
    referred_email TEXT NOT NULL,
    referred_phone TEXT,
    reward_issued INTEGER NOT NULL DEFAULT 0,
    reward_code TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- Single-use, owner-locked $ credit issued to a referrer once their
  -- friend's job is actually completed (not merely paid).
  CREATE TABLE IF NOT EXISTS reward_codes (
    code TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    owner_phone TEXT,
    amount_cents INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    used_booking_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- One-time, short-lived tokens emailed to a customer to log into the
  -- account portal — the passwordless "magic link" pattern, so there's no
  -- password to store, reset, or leak.
  CREATE TABLE IF NOT EXISTS magic_links (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );
  -- Issued once a magic link is redeemed; the token itself (stored in an
  -- httpOnly cookie) is the credential, same "unguessable id as bearer
  -- token" pattern as booking references and cleaner links.
  CREATE TABLE IF NOT EXISTS customer_sessions (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  -- Best-effort SMS status pings a cleaner can send from their panel (e.g.
  -- "on my way") — logged so a job can't be pinged twice by accident.
  CREATE TABLE IF NOT EXISTS job_pings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    ping_type TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(booking_id, ping_type)
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
  // Optional — set by the customer at booking time so the property manager
  // handling their lease can automatically get the proof-of-clean link and,
  // if they book more properties through us, see them all via the same
  // magic-link portal (read-only, since they're not the paying customer).
  'ALTER TABLE bookings ADD COLUMN agent_email TEXT',
  // The language the customer had the site set to at booking time — used to
  // send their confirmation email, reminders and SMS in the same language,
  // instead of always defaulting to English.
  'ALTER TABLE bookings ADD COLUMN language TEXT NOT NULL DEFAULT \'en\'',
  // Only meaningful when key_access = 'keybox' — the lockbox location and
  // code, collected up front at booking time rather than coordinated later,
  // so the cleaning team always has what they need to get in.
  'ALTER TABLE bookings ADD COLUMN access_instructions TEXT',
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

// Shared by booking references, referral codes, and reward codes — excludes
// visually-ambiguous characters (0/O, 1/I) since these get read aloud or
// typed in by hand.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCodeSuffix(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function generateReference() {
  return `${REFERENCE_PREFIX}-${randomCodeSuffix()}`;
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
      full_name, email, phone, address, postcode, promo_code, frequency, amount_cents, currency, agent_email, language, access_instructions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id, fields.propertyType, fields.bedrooms, fields.bathrooms, fields.sqm ?? null,
    fields.furnished ?? null, fields.notesProperty ?? null, JSON.stringify(fields.extras ?? []),
    fields.keyAccess ?? null, fields.bookingDate, fields.bookingTime, fields.urgency,
    fields.fullName, fields.email, fields.phone, fields.address, fields.postcode,
    fields.promoCode ?? null, fields.frequency ?? 'once', amountCents, config.business.currency,
    fields.agentEmail ?? null, fields.language === 'es' ? 'es' : 'en', fields.accessInstructions ?? null
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
export function normaliseEmail(email) {
  return email ? String(email).trim().toLowerCase().slice(0, 200) : null;
}

export function normalisePhone(phone) {
  return phone ? String(phone).replace(/\D/g, '').slice(0, 10) : null;
}

export function saveLead({ email, phone }) {
  const normalisedEmail = normaliseEmail(email);
  const normalisedPhone = normalisePhone(phone);
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
  const normalisedEmail = normaliseEmail(email);
  const normalisedPhone = normalisePhone(phone);
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

// A brand-new customer has no bookings under their email/phone yet — used to
// stop an existing customer from posing as "a friend" to keep re-claiming
// the referral discount under a different code each time. Email is compared
// case-insensitively (booking.email is stored as typed, never lower-cased);
// phone is already normalised to a bare 10-digit string at booking time, so a
// direct match is enough.
export function hasBookingForContact(email, phone) {
  return !!db.prepare(
    'SELECT 1 FROM bookings WHERE LOWER(email) = LOWER(?) OR (? IS NOT NULL AND phone = ?) LIMIT 1'
  ).get(email, phone, phone);
}

export function createReferralCode({ email, phone, name }) {
  const findStmt = db.prepare('SELECT code FROM referral_codes WHERE code = ?');
  let code;
  do { code = `FRIEND-${randomCodeSuffix()}`; } while (findStmt.get(code));
  db.prepare('INSERT INTO referral_codes (code, owner_email, owner_phone, owner_name) VALUES (?, ?, ?, ?)')
    .run(code, email, phone ?? null, name ?? null);
  return getReferralCode(code);
}

export function getReferralCode(code) {
  return db.prepare('SELECT * FROM referral_codes WHERE code = ?').get(code) ?? null;
}

// One reusable code per customer — a second paid booking from the same
// person reuses their existing code instead of minting (and having to
// re-send) a new one.
export function getReferralCodeByOwner(email, phone) {
  return db.prepare(
    'SELECT * FROM referral_codes WHERE LOWER(owner_email) = LOWER(?) OR (? IS NOT NULL AND owner_phone = ?) ORDER BY created_at ASC LIMIT 1'
  ).get(email, phone, phone) ?? null;
}

export function insertReferralRedemption({ referralCode, referredBookingId, referredEmail, referredPhone }) {
  db.prepare(
    'INSERT INTO referral_redemptions (referral_code, referred_booking_id, referred_email, referred_phone) VALUES (?, ?, ?, ?)'
  ).run(referralCode, referredBookingId, referredEmail, referredPhone ?? null);
}

export function getReferralRedemptionByBooking(bookingId) {
  return db.prepare('SELECT * FROM referral_redemptions WHERE referred_booking_id = ?').get(bookingId) ?? null;
}

export function markReferralRewardIssued(bookingId, rewardCode) {
  db.prepare('UPDATE referral_redemptions SET reward_issued = 1, reward_code = ? WHERE referred_booking_id = ?')
    .run(rewardCode, bookingId);
}

export function createRewardCode({ email, phone, amountCents }) {
  const findStmt = db.prepare('SELECT code FROM reward_codes WHERE code = ?');
  let code;
  do { code = `CREDIT-${randomCodeSuffix()}`; } while (findStmt.get(code));
  db.prepare('INSERT INTO reward_codes (code, owner_email, owner_phone, amount_cents) VALUES (?, ?, ?, ?)')
    .run(code, email, phone ?? null, amountCents);
  return getRewardCode(code);
}

export function getRewardCode(code) {
  return db.prepare('SELECT * FROM reward_codes WHERE code = ?').get(code) ?? null;
}

export function markRewardCodeUsed(code, bookingId) {
  db.prepare('UPDATE reward_codes SET used = 1, used_booking_id = ? WHERE code = ?').run(bookingId, code);
}

export function listRewardCodesForOwner(email) {
  return db.prepare('SELECT * FROM reward_codes WHERE LOWER(owner_email) = LOWER(?) ORDER BY created_at DESC').all(email);
}

const MAGIC_LINK_TTL_MINUTES = 15;
const CUSTOMER_SESSION_TTL_DAYS = 30;

export function createMagicLink(email) {
  const token = crypto.randomUUID();
  db.prepare(
    `INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, datetime('now', '+${MAGIC_LINK_TTL_MINUTES} minutes'))`
  ).run(token, email);
  return token;
}

export function consumeMagicLink(token) {
  const row = db.prepare(
    `SELECT * FROM magic_links WHERE token = ? AND used = 0 AND expires_at > datetime('now')`
  ).get(token);
  if (!row) return null;
  db.prepare('UPDATE magic_links SET used = 1 WHERE token = ?').run(token);
  return row;
}

export function createCustomerSession(email) {
  const token = crypto.randomUUID();
  db.prepare(
    `INSERT INTO customer_sessions (token, email, expires_at) VALUES (?, ?, datetime('now', '+${CUSTOMER_SESSION_TTL_DAYS} days'))`
  ).run(token, email);
  return token;
}

export function getCustomerSession(token) {
  return db.prepare(
    `SELECT * FROM customer_sessions WHERE token = ? AND expires_at > datetime('now')`
  ).get(token) ?? null;
}

export function deleteCustomerSession(token) {
  db.prepare('DELETE FROM customer_sessions WHERE token = ?').run(token);
}

// Powers the account portal: a regular customer sees bookings under their
// own email; a property manager who was only ever set as agent_email on
// someone else's booking sees those too, tagged read-only, via the exact
// same login. LEFT JOIN-free UNION keeps the two roles from ever mixing up
// which one a given row is.
export function listBookingsForAccount(email) {
  const rows = db.prepare(`
    SELECT *, 'customer' as account_role FROM bookings WHERE LOWER(email) = LOWER(?)
    UNION ALL
    SELECT *, 'agent' as account_role FROM bookings WHERE agent_email IS NOT NULL AND LOWER(agent_email) = LOWER(?) AND LOWER(email) != LOWER(?)
    ORDER BY booking_date DESC, booking_time DESC
  `).all(email, email, email);
  return rows.map(row => ({ ...deserialize(row), accountRole: row.account_role }));
}

export function hasJobPing(bookingId, pingType) {
  return !!db.prepare('SELECT 1 FROM job_pings WHERE booking_id = ? AND ping_type = ?').get(bookingId, pingType);
}

export function insertJobPing(bookingId, pingType) {
  try {
    db.prepare('INSERT INTO job_pings (booking_id, ping_type) VALUES (?, ?)').run(bookingId, pingType);
    return true;
  } catch {
    return false; // UNIQUE constraint — already sent, don't send it twice
  }
}

export default db;
