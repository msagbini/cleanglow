import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import 'dotenv/config';
import { getPublicConfig } from './config.js';

// Importar SOLO las rutas que sabemos que funcionan (y que no dan error)
import configRoutes from './routes/config.js';
import bookingsRoutes from './routes/bookings.js';
import paymentsRoutes from './routes/payments.js';
// import adminRoutes from './routes/admin.js';  // DESACTIVADO temporalmente
// import cleanersRoutes from './routes/cleaners.js'; // DESACTIVADO
// import subscriptionsRoutes from './subscriptions.js'; // DESACTIVADO
// import leadsRoutes from './routes/leads.js'; // DESACTIVADO
// import suburbsRoutes from './suburbs.js'; // DESACTIVADO

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4242;

// Middlewares básicos
app.use(helmet({
  contentSecurityPolicy: false, // Desactivamos CSP estricto por ahora para evitar errores
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (frontend)
app.use(express.static(path.join(__dirname, '../public')));

// Rutas API (solo las que sabemos que funcionan)
app.use('/api/config', configRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api', paymentsRoutes); // Ajusta según tu estructura (payments tiene /webhook, /create-checkout-session, etc.)
// app.use('/api/admin', adminRoutes); // DESACTIVADO
// app.use('/api/cleaners', cleanersRoutes); // DESACTIVADO

// Ruta de health check (opcional)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ruta catch-all para SPA (si usas frontend en rutas como /admin)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API config: http://localhost:${PORT}/api/config`);
  console.log(`📡 API bookings: http://localhost:${PORT}/api/bookings`);
});
