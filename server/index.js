import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bookingsRouter from './routes/bookings.js';
import paymentsRouter, { webhookHandler } from './routes/payments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

// Stripe webhook needs the raw request body for signature verification,
// so it must be registered before the express.json() body parser below.
app.post('/api/webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json());
app.use(express.static(publicDir));

app.use('/api/bookings', bookingsRouter);
app.use('/api', paymentsRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4242;
app.listen(port, () => {
  console.log(`SpotlessExit corriendo en http://localhost:${port}`);
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  STRIPE_SECRET_KEY no está definida — el pago no funcionará hasta que la configures en .env');
  }
});
