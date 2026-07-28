import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
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
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'eur',
    stripe_session_id TEXT,
    notified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings (stripe_session_id);
`);

function generateReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `SE-${code}`;
}

export function insertBooking(fields, amountCents) {
  let id = generateReference();
  const findStmt = db.prepare('SELECT id FROM bookings WHERE id = ?');
  while (findStmt.get(id)) id = generateReference();

  const stmt = db.prepare(`
    INSERT INTO bookings (
      id, property_type, bedrooms, bathrooms, sqm, furnished, notes_property,
      extras, key_access, booking_date, booking_time, urgency,
      full_name, email, phone, address, postcode, promo_code, amount_cents, currency
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id, fields.propertyType, fields.bedrooms, fields.bathrooms, fields.sqm ?? null,
    fields.furnished ?? null, fields.notesProperty ?? null, JSON.stringify(fields.extras ?? []),
    fields.keyAccess ?? null, fields.bookingDate, fields.bookingTime, fields.urgency,
    fields.fullName, fields.email, fields.phone, fields.address, fields.postcode,
    fields.promoCode ?? null, amountCents, config.business.currency
  );
  return getBooking(id);
}

export function getBooking(id) {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  return row ? deserialize(row) : null;
}

export function getBookingBySessionId(sessionId) {
  const row = db.prepare('SELECT * FROM bookings WHERE stripe_session_id = ?').get(sessionId);
  return row ? deserialize(row) : null;
}

export function attachStripeSession(id, sessionId) {
  db.prepare(`UPDATE bookings SET stripe_session_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(sessionId, id);
}

export function markBookingStatus(id, status) {
  db.prepare(`UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
  return getBooking(id);
}

export function markNotified(id) {
  db.prepare(`UPDATE bookings SET notified_at = datetime('now') WHERE id = ?`).run(id);
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

export default db;
