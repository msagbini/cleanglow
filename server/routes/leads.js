import { Router } from 'express';
import { saveLead } from '../db.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{9}$/;

// Best-effort capture of an in-progress booking's contact details, so the
// business can follow up (SMS reminder, or by hand) with anyone who starts
// a booking and doesn't come back to pay. Never blocks or errors loudly —
// this is a nice-to-have, not part of the booking flow itself.
router.post('/', (req, res) => {
  const body = req.body || {};
  const email = body.email && EMAIL_RE.test(body.email) ? String(body.email).slice(0, 200) : null;
  const phone = body.phone && PHONE_RE.test(String(body.phone).replace(/\D/g, '')) ? String(body.phone) : null;

  if (!email && !phone) {
    return res.status(204).end();
  }
  saveLead({ email, phone });
  res.status(204).end();
});

export default router;
