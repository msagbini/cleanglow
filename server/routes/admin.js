import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  listBookings, countBookingsByStatus, markBookingStatus, getBooking, isValidStatus, listBookingPhotos, addBookingPhoto, listLeads,
  createCleaner, listCleaners, getCleaner, setCleanerActive, assignBookingToCleaner,
} from '../db.js';
import { createPhotoUpload, isValidImageFile, cleanupFiles } from '../photoUpload.js';
import { handleBookingCompleted } from '../bookingCompletion.js';
import { getCancellationInfo, cancelSubscription } from '../subscriptions.js';
import { runBackupOnce } from '../dbBackup.js';
import { toCsv } from '../csv.js';
import { getStripe } from './payments.js';
import { sendExtraChargeLink } from '../email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
const backupsDir = path.join(__dirname, '..', 'data', 'backups');
const upload = createPhotoUpload(uploadsDir);

const router = Router();

router.get('/bookings', (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const bookings = listBookings({ status });
  res.json({ bookings, counts: countBookingsByStatus() });
});

router.patch('/bookings/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!isValidStatus(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const existing = getBooking(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  const updated = markBookingStatus(req.params.id, status);

  if (status === 'completed') {
    await handleBookingCompleted(updated, uploadsDir);
  }

  res.json(updated);
});

// A customer who picks weekly/fortnightly for the recurring discount and
// cancels right after the first clean gets the discount without ever giving
// the business the repeat business it was priced for. If they haven't yet
// completed the minimum number of cycles, the admin panel warns about this
// and offers to charge a one-cycle early-cancellation fee (off-session, on
// the card already on file for the subscription) before cancelling.
router.get('/bookings/:id/cancellation-info', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(getCancellationInfo(booking));
});

router.post('/bookings/:id/cancel-subscription', async (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const chargeFeeCents = Number(req.body?.chargeFeeCents) || 0;
  const result = await cancelSubscription(booking, chargeFeeCents);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result.booking);
});

// A one-off charge outside the normal booking flow — a late-arrival waiting
// fee, a lockout fee, or anything else that comes up on the day (see the
// Property Access & Lateness terms). Most bookings are one-time payments
// with no saved card to charge off-session, so this creates a plain Stripe
// Checkout link the customer pays voluntarily, rather than assuming a
// payment method exists. Deliberately not persisted anywhere — the Stripe
// dashboard is the record of whether it was actually paid; this only covers
// generating and (optionally) emailing the link.
const MAX_EXTRA_CHARGE_CENTS = 50000; // $500 — a sanity ceiling against a fat-fingered amount, not a real limit
router.post('/bookings/:id/extra-charge', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe is not configured on the server (STRIPE_SECRET_KEY is missing).' });

  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const amountCents = Math.round(Number(req.body?.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > MAX_EXTRA_CHARGE_CENTS) {
    return res.status(400).json({ error: `Amount must be between $1 and $${MAX_EXTRA_CHARGE_CENTS / 100}` });
  }
  const reason = String(req.body?.reason ?? '').trim().slice(0, 200);
  if (!reason) return res.status(400).json({ error: 'A reason is required' });

  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: booking.email,
      line_items: [{
        price_data: {
          currency: booking.currency,
          unit_amount: amountCents,
          product_data: {
            name: reason,
            description: `Booking ${booking.id} — ${booking.address}`,
          },
        },
        quantity: 1,
      }],
      metadata: { bookingId: booking.id, type: 'extra_charge', reason },
      success_url: `${baseUrl}/?fee-paid=1`,
      cancel_url: `${baseUrl}/`,
    });
  } catch (err) {
    console.error('[stripe] Error creating extra-charge session:', err.message);
    return res.status(502).json({ error: 'Could not create the payment link with Stripe. Please try again.' });
  }

  let emailSent = false;
  if (req.body?.sendEmail) {
    try {
      await sendExtraChargeLink(booking, session.url, reason, amountCents);
      emailSent = true;
    } catch (err) {
      console.error('[email] Failed to send extra-charge link:', err.message);
    }
  }
  res.json({ url: session.url, emailSent });
});

router.get('/bookings/:id/photos', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const photos = listBookingPhotos(req.params.id).map(p => ({
    id: p.id,
    originalName: p.original_name,
    sizeBytes: p.size_bytes,
    phase: p.phase,
    createdAt: p.created_at,
    url: `/api/admin/bookings/${req.params.id}/photos/${encodeURIComponent(p.filename)}`,
  }));
  res.json({ photos });
});

// Lets the cleaning team attach "after" photos once the job is done — these
// get emailed to the customer automatically when the booking is marked
// completed (see PATCH /bookings/:id/status above). Same magic-byte
// validation as the customer-facing upload; a trusted admin session doesn't
// exempt a file from being checked.
router.post('/bookings/:id/photos', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  upload.array('photos', 8)(req, res, err => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Could not upload photos' });
    }
    const files = req.files || [];

    for (const file of files) {
      const ext = path.extname(file.filename).toLowerCase();
      if (!isValidImageFile(file.path, ext)) {
        cleanupFiles(files.map(f => f.path));
        return res.status(400).json({ error: 'One of the uploaded files is not a valid image' });
      }
    }

    try {
      for (const file of files) {
        addBookingPhoto(booking.id, {
          filename: file.filename,
          originalName: file.originalname,
          sizeBytes: file.size,
          phase: 'after',
        });
      }
    } catch (dbErr) {
      return res.status(400).json({ error: dbErr.message });
    }
    res.status(201).json({ uploaded: files.length });
  });
});

// Filenames are server-generated UUIDs (see routes/bookings.js), but we still
// validate the shape here and resolve+contain the path before serving, since
// this reads straight off disk under an authenticated route.
const SAFE_FILENAME_RE = /^[a-f0-9-]+\.(jpg|png|webp)$/;

router.get('/bookings/:id/photos/:filename', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const { filename } = req.params;
  if (!SAFE_FILENAME_RE.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const photos = listBookingPhotos(req.params.id);
  if (!photos.some(p => p.filename === filename)) {
    return res.status(404).json({ error: 'Photo not found for this booking' });
  }
  const filePath = path.join(uploadsDir, filename);
  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  res.sendFile(filePath);
});

// Full exports for bookkeeping/tax time or a manual off-site backup — a
// higher limit than the dashboard's own listBookings() call (which is
// paginated for the UI), since this is meant to be the whole ledger.
router.get('/bookings.csv', (req, res) => {
  const bookings = listBookings({ limit: 100000 });
  const csv = toCsv(bookings, [
    { label: 'Reference', value: b => b.id },
    { label: 'Status', value: b => b.status },
    { label: 'Customer name', value: b => b.full_name },
    { label: 'Email', value: b => b.email },
    { label: 'Phone', value: b => b.phone },
    { label: 'Address', value: b => b.address },
    { label: 'Postcode', value: b => b.postcode },
    { label: 'Property type', value: b => b.property_type },
    { label: 'Bedrooms', value: b => b.bedrooms },
    { label: 'Bathrooms', value: b => b.bathrooms },
    { label: 'Extras', value: b => b.extras.join('; ') },
    { label: 'Key access', value: b => b.key_access === 'keybox' ? 'Lockbox / key code' : 'Present at property' },
    { label: 'Access instructions', value: b => b.access_instructions ?? '' },
    { label: 'Booking date', value: b => b.booking_date },
    { label: 'Booking time', value: b => b.booking_time },
    { label: 'Frequency', value: b => b.frequency },
    { label: 'Promo code', value: b => b.promo_code ?? '' },
    { label: 'Amount', value: b => (b.amount_cents / 100).toFixed(2) },
    { label: 'Currency', value: b => b.currency },
    { label: 'Agent email', value: b => b.agent_email ?? '' },
    { label: 'Created at', value: b => b.created_at },
  ]);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.get('/leads.csv', (req, res) => {
  const leads = listLeads({ limit: 100000 });
  const csv = toCsv(leads, [
    { label: 'Email', value: l => l.email ?? '' },
    { label: 'Phone', value: l => l.phone ?? '' },
    { label: 'Created at', value: l => l.created_at },
    { label: 'Status', value: l => l.converted_at ? 'converted' : (l.reminded_at ? 'reminded' : 'open') },
  ]);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.get('/leads', (req, res) => {
  const leads = listLeads().map(l => ({
    id: l.id,
    email: l.email,
    phone: l.phone,
    createdAt: l.created_at,
    status: l.converted_at ? 'converted' : (l.reminded_at ? 'reminded' : 'open'),
  }));
  res.json({ leads });
});

router.get('/cleaners', (req, res) => {
  res.json({ cleaners: listCleaners() });
});

router.post('/cleaners', (req, res) => {
  const { name, phone, email } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const cleaner = createCleaner({
    name: String(name).trim().slice(0, 100),
    phone: phone ? String(phone).trim().slice(0, 20) : null,
    email: email ? String(email).trim().slice(0, 200) : null,
  });
  res.status(201).json(cleaner);
});

router.patch('/cleaners/:id/active', (req, res) => {
  const cleaner = getCleaner(req.params.id);
  if (!cleaner) return res.status(404).json({ error: 'Cleaner not found' });
  setCleanerActive(cleaner.id, !!req.body?.active);
  res.json(getCleaner(cleaner.id));
});

router.patch('/bookings/:id/assign-cleaner', (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const { cleanerId } = req.body || {};
  if (cleanerId) {
    const cleaner = getCleaner(cleanerId);
    if (!cleaner) return res.status(400).json({ error: 'Cleaner not found' });
  }
  assignBookingToCleaner(booking.id, cleanerId || null);
  res.json(getBooking(booking.id));
});

// Lets the business owner pull a copy of the database off Railway's volume
// themselves (e.g. onto their own laptop) without needing Railway CLI/SSH
// access — the daily automatic backups (see server/dbBackup.js) otherwise
// only ever live on the same volume as the live database.
router.get('/backup/latest', (req, res) => {
  fs.mkdirSync(backupsDir, { recursive: true });
  let files = fs.readdirSync(backupsDir).filter(f => f.startsWith('bookings-') && f.endsWith('.sqlite')).sort();
  if (!files.length) {
    // No backup taken yet (e.g. moments after a fresh deploy) — take one now
    // rather than telling the admin to come back tomorrow.
    runBackupOnce();
    files = fs.readdirSync(backupsDir).filter(f => f.startsWith('bookings-') && f.endsWith('.sqlite')).sort();
  }
  const latest = files[files.length - 1];
  const filePath = path.join(backupsDir, latest);
  if (!filePath.startsWith(backupsDir) || !fs.existsSync(filePath)) {
    return res.status(500).json({ error: 'Could not create a backup right now.' });
  }
  res.download(filePath, latest);
});

export default router;
