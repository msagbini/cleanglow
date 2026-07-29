import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bookingsRouter from './routes/bookings.js';
import paymentsRouter, { webhookHandler } from './routes/payments.js';
import configRouter from './routes/config.js';
import adminRouter from './routes/admin.js';
import seoRouter from './routes/seo.js';
import { adminAuth } from './middleware/adminAuth.js';
import { renderIndexHtml } from './renderIndex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

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

// Gate /admin (static UI) and /api/admin (data) before the public static
// middleware below, which would otherwise serve public/admin/* unprotected.
app.use('/admin', adminLimiter, adminAuth, express.static(path.join(publicDir, 'admin')));
app.use('/api/admin', adminLimiter, adminAuth, adminRouter);

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

app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4242;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  STRIPE_SECRET_KEY is not set — payments won\'t work until you configure it in .env');
  }
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
    console.warn('⚠️  ADMIN_USER/ADMIN_PASS not set — the /admin panel is disabled until you configure them in .env');
  }
});
