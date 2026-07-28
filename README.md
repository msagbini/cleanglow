# SpotlessExit — Reserva de limpieza de fin de contrato

Sitio de reservas con backend propio: guarda las reservas en base de datos y cobra el
servicio online con Stripe Checkout antes de confirmarlas.

## Arquitectura

- **Frontend estático** en `public/` (HTML/CSS/JS sin frameworks ni build step).
- **Backend** en `server/` — Node.js + Express.
- **Base de datos**: SQLite embebida (`server/data/bookings.sqlite`, se crea sola al arrancar).
- **Pagos**: Stripe Checkout (página de pago alojada por Stripe, no manejamos tarjetas nosotros).

El precio final **siempre se calcula en el servidor** (`server/pricing.js`) a partir de
las selecciones del cliente (habitaciones, extras, urgencia...) — nunca se confía en un
importe enviado desde el navegador, para evitar que alguien manipule el precio antes de pagar.

## Puesta en marcha

```bash
npm install
cp .env.example .env
```

Edita `.env`:

```
STRIPE_SECRET_KEY=sk_test_...   # https://dashboard.stripe.com/test/apikeys
STRIPE_WEBHOOK_SECRET=whsec_... # ver sección de webhooks más abajo
PUBLIC_BASE_URL=http://localhost:4242
```

Arranca el servidor:

```bash
npm start        # o: npm run dev  (reinicia solo al guardar cambios)
```

Abre `http://localhost:4242`. Sin `STRIPE_SECRET_KEY` la web funciona igual, pero al
confirmar una reserva el servidor devuelve un error claro en vez de iniciar el pago.

## Probar el pago completo (Stripe test mode)

1. Instala el [Stripe CLI](https://docs.stripe.com/stripe-cli) y ejecuta:
   ```bash
   stripe listen --forward-to localhost:4242/api/webhook
   ```
   Esto imprime un `whsec_...` — cópialo a `STRIPE_WEBHOOK_SECRET` en `.env` y reinicia el servidor.
2. Completa una reserva en la web. Al confirmar te redirige a Stripe Checkout.
3. Usa una [tarjeta de prueba](https://docs.stripe.com/testing#cards), por ejemplo
   `4242 4242 4242 4242`, cualquier fecha futura y CVC.
4. Tras pagar, Stripe te redirige a `/success.html`, que confirma el pago y muestra la
   referencia de la reserva. El webhook actualiza la reserva en la base de datos aunque
   el cliente cierre la pestaña antes de volver.

## Notificaciones por email (opcional)

Si defines `SMTP_HOST` (y opcionalmente `SMTP_USER`/`SMTP_PASS`) en `.env`, cada reserva
pagada envía un aviso a `NOTIFY_EMAIL_TO`. Sin `SMTP_HOST`, el aviso solo se imprime en
la consola del servidor — útil en desarrollo.

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/bookings` | Crea una reserva (`pending_payment`) y calcula el precio |
| `GET` | `/api/bookings/:id` | Consulta el estado de una reserva |
| `POST` | `/api/checkout-session` | Crea la sesión de pago de Stripe para una reserva |
| `GET` | `/api/checkout-session/:sessionId/confirm` | Verifica el pago al volver de Stripe |
| `POST` | `/api/webhook` | Webhook de Stripe (fuente de verdad del estado de pago) |
