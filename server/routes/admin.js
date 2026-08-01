import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  listBookings, countBookingsByStatus, markBookingStatus, getBooking, isValidStatus, listBookingPhotos, addBookingPhoto, listLeads,
  createCleaner, listCleaners, getCleaner, setCleanerActive, assignBookingToCleaner,
} from '../db.js';
import { getStripe } from './payments.js';
import { config } from '../config.js';
import { createPhotoUpload, isValidImageFile, cleanupFiles } from '../photoUpload.js';
import { handleBookingCompleted } from '../bookingCompletion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
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
  const minCycles = config.booking.earlyCancellationMinCycles ?? 0;
  const cyclesShort = Math.max(0, minCycles - booking.cycles_completed);
  res.json({
    cyclesCompleted: booking.cycles_completed,
    minCycles,
    feeApplies: cyclesShort > 0,
    feeCents: cyclesShort > 0 ? booking.amount_cents : 0,
  });
});

router.post('/bookings/:id/cancel-subscription', async (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!booking.stripe_subscription_id) {
    return res.status(400).json({ error: 'This booking has no active subscription' });
  }

  const stripe = getStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe is not configured on the server.' });

  const chargeFeeCents = Number(req.body?.chargeFeeCents) || 0;
  if (chargeFeeCents > 0) {
    try {
      const subscription = await stripe.subscriptions.retrieve(booking.stripe_subscription_id);
      const paymentMethod = subscription.default_payment_method;
      if (!paymentMethod) {
        return res.status(502).json({ error: 'No card on file for this subscription — cancel manually from the Stripe dashboard instead.' });
      }
      await stripe.paymentIntents.create({
        amount: chargeFeeCents,
        currency: booking.currency,
        customer: subscription.customer,
        payment_method: paymentMethod,
        off_session: true,
        confirm: true,
        description: `Early cancellation fee — Booking ${booking.id}`,
      });
    } catch (err) {
      console.error('[stripe] Error charging early-cancellation fee:', err.message);
      return res.status(502).json({ error: `Could not charge the cancellation fee (${err.message}) — subscription was NOT cancelled.` });
    }
  }

  try {
    await stripe.subscriptions.cancel(booking.stripe_subscription_id);
  } catch (err) {
    console.error('[stripe] Error cancelling subscription:', err.message);
    return res.status(502).json({ error: 'Could not cancel the subscription with Stripe.' });
  }

  const updated = markBookingStatus(req.params.id, 'cancelled');
  res.json(updated);
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

export default router;
