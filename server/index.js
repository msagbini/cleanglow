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
import cleanersRouter from './routes/cleaners.js';
import accountRouter from './routes/account.js';
import seoRouter from './routes/seo.js';
import leadsRouter from './routes/leads.js';
import { adminAuth } from './middleware/adminAuth.js';
import { requireSameOrigin } from './middleware/requireSameOrigin.js';
import { requireCsrf, issueCsrfToken } from './middleware/csrf.js';
import { renderIndexHtml } from './renderIndex.js';
import { resolveBaseUrl, describeBaseUrlConfig } from './baseUrl.js';
import { getSuburbBySlug, renderSuburbHtml } from './suburbs.js';
import { startAbandonedLeadSweep } from './leadSweep.js';
import { startBookingReminderSweep } from './bookingReminders.js';
import { startBackupSweep } from './dbBackup.js';

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
      // Nothing on this site is ever meant to be framed, and no page frames
      // anything — 'none' (paired with X-Frame-Options: DENY below for older
      // agents) closes clickjacking of the booking form outright, where the
      // previous 'self' still permitted same-origin framing.
      frameAncestors: ["'none'"],
      frameSrc: ["'none'"],
      // The booking form only ever posts to this origin via fetch; pinning
      // form-action means an injected <form action="https://evil/"> can't
      // exfiltrate what a customer typed.
      formAction: ["'self'"],
      // Stripe Checkout is a full-page redirect, not an embedded frame, so
      // it needs no allowance here.
      upgradeInsecureRequests: [],
    },
  },
  // 1 year + preload is the threshold the hstspreload.org list requires.
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true, preload: true },
  // Helmet defaults to SAMEORIGIN; DENY matches frameAncestors 'none' above.
  frameguard: { action: 'deny' },
  // Helmet's default is `no-referrer`, which strips the Referer even on
  // same-site navigations. This keeps same-origin referrers (useful for
  // in-site analytics) while still sending nothing but the bare origin
  // cross-site, and nothing at all on an HTTPS->HTTP downgrade.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Helmet doesn't set this one. The site uses none of these APIs, so denying
// them means an injected script can't quietly reach for the camera, mic or
// location, and third-party ad/tracking APIs stay off.
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=(), browsing-topics=()'
  );
  next();
});

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
// skipSuccessfulRequests means only failed (wrong-password) attempts count
// against this budget — a real admin using the dashboard all day (each page
// load alone is ~7-8 requests: static assets + bookings/leads/cleaners) never
// gets rate-limited by their own legitimate use; only repeated wrong guesses do.
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });
// Sending a login-link email costs us nothing to abuse for a would-be
// spammer (no proof of ownership needed to request one) — a much tighter
// cap than general API traffic makes repeatedly email-bombing a real
// customer's inbox impractical, independent of the account itself being
// impossible to break into without the email.
const accountLinkLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);
app.use('/api/bookings', writeLimiter);
app.use('/api/checkout-session', writeLimiter);
app.use('/api/leads', writeLimiter);
app.use('/api/account/request-link', accountLinkLimiter);

// CSRF on the public booking funnel. requireCsrf is a no-op for safe
// methods, so GET /api/bookings/availability and the checkout-session
// confirm endpoint keep working unchanged.
app.use('/api/bookings', requireCsrf);
app.use('/api/checkout-session', requireCsrf);
app.use('/api/leads', requireCsrf);

// Gate /admin (static UI) and /api/admin (data) before the public static
// middleware below, which would otherwise serve public/admin/* unprotected.
app.use('/admin', adminLimiter, adminAuth, express.static(path.join(publicDir, 'admin'), {
  setHeaders(res) { res.setHeader('Cache-Control', 'no-store'); },
}));
app.use('/api/admin', adminLimiter, adminAuth, requireSameOrigin, adminRouter);

// No Basic Auth here — access is gated by the unguessable token in the URL
// itself (see routes/cleaners.js), the same trust model as a booking
// reference. requireSameOrigin still applies to the mutating routes.
app.use('/api/cleaner', requireSameOrigin, cleanersRouter);

// Cookie-based auth (see middleware/requireCustomerSession.js) — unlike
// Basic Auth, cookies get SameSite protection, but requireSameOrigin is
// still applied as a second layer on every mutating route here.
app.use('/api/account', requireSameOrigin, accountRouter);

// Serve index.html with its SEO meta tags (title, description, canonical
// URL) filled in from config/business.json, ahead of the static middleware
// below which would otherwise serve the raw template with {{TOKENS}} in it.
app.get(['/', '/index.html'], (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  const csrfToken = issueCsrfToken(req, res);
  // The page carries a per-visitor CSRF token, so it must be revalidated
  // rather than replayed from a shared/proxy cache. `no-cache` (not
  // `no-store`) still allows the back/forward cache, so returning to the
  // booking form keeps the form state the visitor already filled in.
  res.set('Cache-Control', 'private, no-cache, must-revalidate');
  res.type('html').send(renderIndexHtml(baseUrl, csrfToken));
});

// Lets the client recover from an expired token without losing the booking
// it has already filled in: on a 403 with code "csrf" it re-fetches here and
// retries the write once (see js/app.js).
app.get('/api/csrf', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ token: issueCsrfToken(req, res) });
});

// Suburb landing pages — one per configured service area, e.g.
// /end-of-lease-cleaning-st-kilda. The path prefix doesn't match any real
// static file, so this is safe to register ahead of express.static.
app.get('/end-of-lease-cleaning-:slug', (req, res, next) => {
  const suburb = getSuburbBySlug(req.params.slug);
  if (!suburb) return next();
  const baseUrl = resolveBaseUrl(req);
  res.type('html').send(renderSuburbHtml(suburb, baseUrl));
});

app.use(seoRouter);

// Static assets were previously served with `Cache-Control: max-age=0`, so a
// returning visitor revalidated the stylesheet, both scripts and every font
// on every single navigation. Two tiers replace that:
//
//   * A request carrying `?v=<hash>` is, by construction, for one exact
//     build of that file (see assetVersion.js) — safe to cache immutably.
//     A deploy that changes the file changes the hash in the HTML, so a
//     stale copy can never be served.
//   * Fonts and images are content-addressed by filename here (they change
//     by being replaced, not edited), so they get a long cache too.
//
// The HTML documents themselves are rendered above and never reach this
// middleware, so they keep their own no-cache policy and stay fresh.
const ONE_YEAR_SECONDS = 31536000;
const ONE_WEEK_SECONDS = 604800;
app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    const isVersioned = Boolean(res.req?.query?.v);
    const isLongLived = /[\\/](fonts|img)[\\/]/.test(filePath);
    if (isVersioned || isLongLived) {
      res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
    } else if (/\.html?$/.test(filePath)) {
      // The app shells (/account/, /proof/, /cleaner/, /success.html) are
      // the entry point to a deploy's JS — cache one for a week and a
      // redeploy wouldn't reach that visitor for a week. They must
      // revalidate; the assets they reference are what gets cached.
      res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    } else if (/\.(css|js)$/.test(filePath)) {
      // An unversioned CSS/JS request (a hand-typed URL, or an old cached
      // HTML document referencing the bare path) still has to revalidate.
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else {
      res.setHeader('Cache-Control', `public, max-age=${ONE_WEEK_SECONDS}`);
    }
  },
}));

// The token is a client-side route param, not a real file — registered
// AFTER express.static so real files under /cleaner/ (app.js, cleaner.css)
// are served as themselves first; this only catches paths that don't match
// an actual static file, i.e. a genuine cleaner token.
app.get('/cleaner/:token', (req, res) => {
  res.sendFile(path.join(publicDir, 'cleaner', 'index.html'));
});

// Same reasoning as /cleaner/:token above — registered after express.static
// so /proof/app.js and /proof/proof.css are served as themselves first.
app.get('/proof/:id', (req, res) => {
  res.sendFile(path.join(publicDir, 'proof', 'index.html'));
});

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
  // Surfaces a stale/misconfigured PUBLIC_BASE_URL in the deploy logs — the
  // exact failure that had every canonical and og:url on the live site
  // advertising a different Railway domain than the one serving it.
  const baseUrlNotice = describeBaseUrlConfig();
  if (baseUrlNotice) console.warn(baseUrlNotice);
  console.log(`Canonical base URL: ${resolveBaseUrl()}`);
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
  startBackupSweep();
});

// Railway sends SIGTERM before replacing a container on redeploy — without
// this, a customer mid-checkout or mid-photo-upload at that moment gets their
// connection dropped abruptly instead of the in-flight request completing.
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});
