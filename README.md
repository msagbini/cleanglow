# Plataforma de reservas con pago online

Sitio de reservas de servicios a domicilio (por defecto configurado como limpieza de fin
de contrato): guarda las reservas en base de datos, cobra el servicio con Stripe Checkout
antes de confirmarlas, y trae panel de administración, emails de confirmación y modo oscuro.

**Todo el catálogo del negocio — marca, colores, tipos de servicio, precios y extras — vive
en un único archivo (`config/business.json`)**, así que reconfigurar el sitio para otro
rubro (jardinería, mudanzas, control de plagas, cualquier servicio "vamos a tu domicilio,
hacemos X, con extras opcionales") es editar ese archivo, no tocar código. Ver
[Adaptar el sitio a otro negocio](#adaptar-el-sitio-a-otro-negocio).

## Arquitectura

- **Frontend estático** en `public/` (HTML/CSS/JS sin frameworks ni build step). Todo el
  contenido (marca, servicios, precios, checklist, formulario de reserva) se renderiza en
  el cliente a partir de `GET /api/config`.
- **Backend** en `server/` — Node.js + Express.
- **Base de datos**: SQLite embebida (`server/data/bookings.sqlite`, se crea sola al arrancar).
- **Pagos**: Stripe Checkout (página de pago alojada por Stripe, no manejamos tarjetas nosotros).
- **Seguridad**: `helmet` con Content-Security-Policy estricta (sin scripts/estilos inline
  en ninguna página), rate limiting en los endpoints de creación de reservas/pago, panel
  admin protegido con HTTP Basic Auth.

El precio final **siempre se calcula en el servidor** (`server/config.js`) a partir de las
selecciones del cliente (tamaño, extras, urgencia...) usando el mismo `config/business.json`
que ve el frontend — nunca se confía en un importe enviado desde el navegador, para evitar
que alguien manipule el precio antes de pagar.

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
ADMIN_USER=admin                # panel en /admin — déjalo vacío para desactivarlo
ADMIN_PASS=elige-una-contraseña-fuerte
```

Arranca el servidor:

```bash
npm start        # o: npm run dev  (reinicia solo al guardar cambios)
```

Abre `http://localhost:4242`. Sin `STRIPE_SECRET_KEY` la web funciona igual, pero al
confirmar una reserva el servidor devuelve un error claro en vez de iniciar el pago.

## Adaptar el sitio a otro negocio

Edita `config/business.json` — no hace falta tocar HTML/CSS/JS/backend. Secciones principales:

- **`business`**: nombre, emoji/logo, textos del hero, colores de marca (`theme`), teléfono,
  email, horario, zonas de servicio, redes sociales, símbolo de moneda.
- **`booking.serviceTypes`**: los "tipos de propiedad" (ej. Piso/Casa/Estudio) — cámbialos
  por tus categorías de servicio.
- **`booking.sizeField` / `booking.secondaryField`**: los dos selectores que determinan el
  precio base (hoy "habitaciones" y "baños") — renómbralos y ajusta precios para tu modelo
  (ej. "tamaño del jardín" y "número de árboles").
- **`booking.extras`**: la grilla de add-ons opcionales con su precio.
- **`servicesShowcase`, `checklist`, `pricingTiers`**: las tarjetas de la página principal.

Los testimonios, FAQ y el texto del CTA final son contenido editorial real — se editan
directamente en `public/index.html`.

Tras editar el JSON, reinicia el servidor; no requiere build ni redeploy de assets.

## Panel de administración

En `/admin` (protegido con `ADMIN_USER`/`ADMIN_PASS` de `.env`, autenticación HTTP Basic).
Lista todas las reservas con filtro por estado, muestra totales y permite cambiar el estado
de cada una (pendiente de pago → pagada → completada / cancelada). Si no defines esas dos
variables de entorno, el panel devuelve 503 en vez de quedar abierto con credenciales por defecto.

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
pagada envía un aviso al negocio (`NOTIFY_EMAIL_TO`) **y** un email de confirmación al
cliente. Sin `SMTP_HOST`, ambos se imprimen en la consola del servidor — útil en desarrollo.

## Modo oscuro

El sitio sigue la preferencia del sistema operativo/navegador (`prefers-color-scheme`) sin
necesidad de un interruptor manual. Los colores de marca (`theme.primary`, etc.) se
mantienen; el resto de la paleta (fondos, texto, bordes) se adapta automáticamente.

## Despliegue con Docker

```bash
docker build -t mi-negocio .
docker run -p 4242:4242 --env-file .env -v $(pwd)/data:/app/server/data mi-negocio
```

El volumen en `/app/server/data` persiste la base de datos SQLite entre despliegues.

## Escalar más allá de SQLite

SQLite alcanza cómodamente para un negocio local con volumen bajo/medio de reservas. Si
necesitas múltiples instancias del servidor o un volumen alto de escritura, el punto de
cambio es `server/db.js`: reemplaza las llamadas a `node:sqlite` por un cliente de
Postgres/MySQL manteniendo las mismas funciones exportadas (`insertBooking`, `getBooking`,
`listBookings`, etc.) — el resto de la app no necesita cambios.

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/config` | Catálogo del negocio (marca, precios, extras) que consume el frontend |
| `POST` | `/api/bookings` | Crea una reserva (`pending_payment`) y calcula el precio |
| `GET` | `/api/bookings/:id` | Consulta el estado de una reserva |
| `POST` | `/api/checkout-session` | Crea la sesión de pago de Stripe para una reserva |
| `GET` | `/api/checkout-session/:sessionId/confirm` | Verifica el pago al volver de Stripe |
| `POST` | `/api/webhook` | Webhook de Stripe (fuente de verdad del estado de pago) |
| `GET` | `/api/admin/bookings` | *(Basic Auth)* Lista reservas, con filtro `?status=` |
| `PATCH` | `/api/admin/bookings/:id/status` | *(Basic Auth)* Cambia el estado de una reserva |
