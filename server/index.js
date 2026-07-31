import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bookingsRouter from './routes/bookings.js';
import paymentsRouter, { webhookHandler } from './routes/payments.js';
import configRouter from './routes/config.js';
import adminRouter from './routes/admin.js';
import seoRouter from './routes/seo.js';
import leadsRouter from './routes/leads.js';
import { adminAuth } from './middleware/adminAuth.js';
import { requireSameOrigin } from './middleware/requireSameOrigin.js';
import { renderIndexHtml } from './renderIndex.js';
import { startAbandonedLeadSweep } from './leadSweep.js';
import { startBookingReminderSweep } from './bookingReminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

// Railway (and any reverse proxy/CDN in front of this app) terminates TLS and
// forwards requests through its own edge — without this, express-rate-limit
// keys on the proxy's IP for every visitor instead of the real client, so one
// abusive visitor exhausts the shared bucket for everyone else. `1` trusts
// exactly one hop (the platform's own edge), not an arbitrary client-supplied chain.
app.set('trust proxy', 1);

app.use(compression());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));

// Stripe webhook needs the raw request body for signature verification,
// so it must be registered before the express.json() body parser below.
app.post('/api/webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json());

// Creating bookings/checkout sessions is the abuse surface (spam bookings,
// hammering the Stripe API) — keep it tighter than general API traffic.
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
// The admin panel guards every booking/customer record behind one password —
// a much tighter limit than general API traffic makes credential brute-forcing
// impractical, independent of whatever the password strength turns out to be.
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);
app.use('/api/bookings', writeLimiter);
app.use('/api/checkout-session', writeLimiter);
app.use('/api/leads', writeLimiter);

// Gate /admin (static UI) and /api/admin (data) before the public static
// middleware below, which would otherwise serve public/admin/* unprotected.
app.use('/admin', adminLimiter, adminAuth, express.static(path.join(publicDir, 'admin')));
app.use('/api/admin', adminLimiter, adminAuth, requireSameOrigin, adminRouter);

// Serve index.html with its SEO meta tags (title, description, canonical
// URL) filled in from config/business.json, ahead of the static middleware
// below which would otherwise serve the raw template with {{TOKENS}} in it.
app.get(['/', '/index.html'], (req, res) => {
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.type('html').send(renderIndexHtml(baseUrl));
});
app.use(seoRouter);

app.use(express.static(publicDir));

app.use('/api/bookings', bookingsRouter);
app.use('/api', paymentsRouter);
app.use('/api/config', configRouter);
app.use('/api/leads', leadsRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

// Final error handler — without NODE_ENV=production, Express's own default
// error handler includes the error's stack/message in the response body.
// This always logs the full error server-side but only ever sends a generic
// message to the client, regardless of NODE_ENV, so a stray thrown error
// (e.g. an unexpected DB error in bookings.js) never leaks internals to a
// live customer.
app.use((err, req, res, next) => {
  console.error('[unhandled route error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Last-resort safety net for anything unforeseen — never suppresses
// uncaughtException (a corrupted-state crash should still restart the
// process), but an unhandled rejection elsewhere shouldn't take the whole
// site down silently. The real fix for the known cause of this (the SMS
// sweep intervals) is the try/catch added directly in leadSweep.js and
// bookingReminders.js — this is just the net for anything else.
process.on('unhandledRejection', err => {
  console.error('[unhandledRejection]', err);
});

const port = process.env.PORT || 4242;
const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  STRIPE_SECRET_KEY is not set — payments won\'t work until you configure it in .env');
  }
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
    console.warn('⚠️  ADMIN_USER/ADMIN_PASS not set — the /admin panel is disabled until you configure them in .env');
  }
  if (!process.env.CLICKSEND_USERNAME || !process.env.CLICKSEND_API_KEY) {
    console.warn('⚠️  CLICKSEND_USERNAME/CLICKSEND_API_KEY not set — abandoned-booking SMS reminders are disabled (logged instead) until you configure them.');
  }
  startAbandonedLeadSweep();
  startBookingReminderSweep();
});

// Railway sends SIGTERM before replacing a container on redeploy — without
// this, a customer mid-checkout or mid-photo-upload at that moment gets their
// connection dropped abruptly instead of the in-flight request completing.
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});
