# Plataforma de reservas con pago online

Sitio de reservas de servicios a domicilio (configurado por defecto como limpieza de fin
de contrato para el mercado australiano — AUD, GST, ABN): guarda las reservas en base de
datos, evita dobles reservas en el mismo horario, cobra con Stripe (pagos únicos o
suscripciones recurrentes), y trae panel de administración, emails de confirmación y modo
oscuro.

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
- **Pagos**: Stripe Checkout — modo pago único para servicios puntuales, modo suscripción
  para limpiezas recurrentes (semanal/quincenal/mensual).
- **Seguridad**: `helmet` con Content-Security-Policy estricta (sin scripts/estilos inline
  en ninguna página), rate limiting en los endpoints de creación de reservas/pago, panel
  admin protegido con HTTP Basic Auth.

El precio final **siempre se calcula en el servidor** (`server/config.js`) a partir de las
selecciones del cliente (tamaño, extras, urgencia, frecuencia...) usando el mismo
`config/business.json` que ve el frontend — nunca se confía en un importe enviado desde el
navegador, para evitar que alguien manipule el precio antes de pagar.

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
  email, horario, zonas de servicio, redes sociales, moneda (`currency`/`currencySymbol`),
  ABN y registro de GST (ver [GST, ABN y moneda](#gst-abn-y-moneda)).
- **`booking.serviceTypes`**: los "tipos de propiedad" (ej. Apartment/House/Studio) — cámbialos
  por tus categorías de servicio.
- **`booking.sizeField` / `booking.secondaryField`**: los dos selectores que determinan el
  precio base (hoy "habitaciones" y "baños") — renómbralos y ajusta precios para tu modelo
  (ej. "tamaño del jardín" y "número de árboles").
- **`booking.extras`**: la grilla de add-ons opcionales con su precio.
- **`booking.frequencyOptions`**: las opciones de recurrencia (única vez, semanal, etc.) con
  su descuento — ver [Limpiezas recurrentes](#limpiezas-recurrentes-suscripciones).
- **`servicesShowcase`, `checklist`, `pricingTiers`**: las tarjetas de la página principal.

Los testimonios, FAQ y el texto del CTA final son contenido editorial real — se editan
directamente en `public/index.html`.

Tras editar el JSON, reinicia el servidor; no requiere build ni redeploy de assets.

⚠️ **Los testimonios y las estadísticas de la franja de confianza son contenido de ejemplo.**
Reemplázalos por datos reales antes de publicar el sitio — mostrar reseñas o cifras de
actividad inventadas puede constituir publicidad engañosa bajo la Australian Consumer Law.

## GST, ABN y moneda

El sitio está configurado en AUD por defecto. En `config/business.json`:

- **`abn`**: tu ABN. Se muestra en el footer, los emails y la página de confirmación solo si
  no está vacío.
- **`gstRegistered`**: `false` por defecto. Solo ponlo en `true` una vez que estés
  efectivamente registrado para GST (no es obligatorio por debajo de $75,000 AUD de
  facturación anual). En `true`, el sitio muestra el desglose del GST incluido en el precio
  (los precios ya son GST-inclusive, como exige la ley australiana para precios al
  consumidor — nunca se suma GST encima).
- **`gstRate`**: 0.10 (10%), el estándar actual.

Esto no reemplaza asesoría contable/legal real — son cálculos mecánicos, no una
determinación de si debes registrarte para GST o qué estructura de negocio te conviene.

## Evitar dobles reservas

El sitio valida disponibilidad por fecha + franja horaria antes de cada reserva:

- `GET /api/bookings/availability?date=YYYY-MM-DD` devuelve qué franjas de ese día ya están
  completas. El frontend deshabilita esas opciones en el selector con la etiqueta
  "Fully booked" y elige automáticamente la siguiente franja libre si la seleccionada deja
  de estar disponible.
- El servidor vuelve a validar al crear la reserva (nunca confía solo en el frontend) y
  responde `409` si la franja se ocupó justo antes. La verificación y la escritura ocurren
  en la misma llamada síncrona a SQLite, sin `await` en el medio, así que no hay ventana de
  condición de carrera entre dos reservas simultáneas.
- `config.booking.maxConcurrentBookingsPerSlot` (por defecto `1`) controla cuántas reservas
  activas caben en la misma franja — súbelo si tienes más de un equipo trabajando en
  simultáneo.

## Limpiezas recurrentes (suscripciones)

Además de "única vez", `config.booking.frequencyOptions` define frecuencias recurrentes
(semanal, quincenal, mensual) con un descuento por visita. Al reservar con una frecuencia
recurrente, el sitio crea una **suscripción de Stripe** en vez de un pago único: Stripe cobra
automáticamente el precio con descuento en cada ciclo (semana/quincena/mes), sin que el
cliente tenga que volver a pagar manualmente.

Lo que Stripe automatiza es **el cobro recurrente**, no la agenda de cada visita futura —
coordinar la fecha/hora exacta de cada limpieza sigue siendo una conversación con el
cliente (igual que hacen la mayoría de los servicios de limpieza recurrente en la práctica).

Desde el panel de administración podés cancelar la suscripción de un cliente en cualquier
momento (botón "Cancel subscription" en las filas con una suscripción activa) — esto cancela
la suscripción en Stripe y marca la reserva como cancelada.

## Panel de administración

En `/admin` (protegido con `ADMIN_USER`/`ADMIN_PASS` de `.env`, autenticación HTTP Basic).
Lista todas las reservas con filtro por estado, muestra totales, la frecuencia de cada una,
y permite cambiar el estado (pendiente de pago → pagada → completada / cancelada) o cancelar
una suscripción activa. Si no defines esas dos variables de entorno, el panel devuelve 503
en vez de quedar abierto con credenciales por defecto.

## Probar el pago completo (Stripe test mode)

1. Instala el [Stripe CLI](https://docs.stripe.com/stripe-cli) y ejecuta:
   ```bash
   stripe listen --forward-to localhost:4242/api/webhook
   ```
   Esto imprime un `whsec_...` — cópialo a `STRIPE_WEBHOOK_SECRET` en `.env` y reinicia el servidor.
2. Completa una reserva en la web. Al confirmar te redirige a Stripe Checkout (modo pago
   único o modo suscripción según la frecuencia elegida).
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
`listBookings`, etc.) — el resto de la app no necesita cambios. Nota: la protección
anti-doble-reserva depende de que las operaciones sean síncronas dentro de un mismo proceso;
si migras a un cliente async o a múltiples instancias, envolvé el chequeo + inserción en una
transacción de base de datos con bloqueo (`SELECT ... FOR UPDATE` en Postgres) para mantener
la misma garantía.

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/config` | Catálogo del negocio (marca, precios, extras) que consume el frontend |
| `GET` | `/api/bookings/availability` | Disponibilidad por franja para una fecha (`?date=YYYY-MM-DD`) |
| `POST` | `/api/bookings` | Crea una reserva (`pending_payment`) y calcula el precio |
| `GET` | `/api/bookings/:id` | Consulta el estado de una reserva |
| `POST` | `/api/bookings/:id/photos` | Sube fotos del estado de la propiedad (multipart, hasta 8 fotos, 8MB c/u) |
| `POST` | `/api/checkout-session` | Crea la sesión de pago de Stripe (pago único o suscripción) |
| `GET` | `/api/checkout-session/:sessionId/confirm` | Verifica el pago al volver de Stripe |
| `POST` | `/api/webhook` | Webhook de Stripe (fuente de verdad del estado de pago) |
| `GET` | `/api/admin/bookings` | *(Basic Auth)* Lista reservas, con filtro `?status=` |
| `PATCH` | `/api/admin/bookings/:id/status` | *(Basic Auth)* Cambia el estado de una reserva |
| `GET` | `/api/admin/bookings/:id/cancellation-info` | *(Basic Auth)* Ciclos cobrados y si aplica recargo por cancelación temprana |
| `POST` | `/api/admin/bookings/:id/cancel-subscription` | *(Basic Auth)* Cancela la suscripción de Stripe de una reserva (opcionalmente cobra un recargo antes, con `{ "chargeFeeCents": N }`) |
| `GET` | `/api/admin/bookings/:id/photos` | *(Basic Auth)* Lista las fotos subidas para una reserva |
| `GET` | `/api/admin/bookings/:id/photos/:filename` | *(Basic Auth)* Sirve una foto subida |
| `POST` | `/api/leads` | Captura email/teléfono apenas se escriben, antes de terminar la reserva |
| `GET` | `/api/admin/leads` | *(Basic Auth)* Lista los leads abandonados y su estado |

### Recargo por cancelación temprana de planes recurrentes

Un cliente podría elegir el plan semanal solo para aprovechar el 15% de descuento y
cancelar apenas después de la primera limpieza — eso le da el precio de "cliente
recurrente" sin serlo. Para evitarlo: `earlyCancellationMinCycles` en
`config/business.json` (por defecto 3) define cuántos ciclos hay que completar antes
de poder cancelar sin costo. El sistema cuenta los ciclos reales vía el webhook de
Stripe (`invoice.payment_succeeded` con `billing_reason: subscription_cycle`), no
confía en nada que mande el cliente.

Si cancelás una suscripción desde el panel de admin antes de cumplir el mínimo, te
avisa cuántos ciclos van y te ofrece cobrar un recargo (el valor de una limpieza más,
a la tarjeta ya guardada) antes de cancelar. Si el cobro falla, la suscripción **no**
se cancela — así nunca se pierde el recargo por un error de red. Esto está documentado
también en los Términos y Condiciones del sitio, y el cliente lo ve al confirmar un
plan recurrente en el paso de revisión.

### Leads abandonados y recordatorio por SMS

Apenas el cliente escribe su email o teléfono en el paso de contacto (al salir del campo,
no en cada tecla), el sitio guarda esos datos como un "lead" — aunque nunca termine de
reservar. Si el cliente sí completa una reserva real con ese mismo email o teléfono, el
lead se marca automáticamente como convertido. Si pasan 30 minutos sin que eso pase, un
proceso interno (revisa cada 5 minutos, sin necesidad de un servicio externo de colas)
manda un SMS recordatorio una sola vez por lead.

El envío usa [ClickSend](https://clicksend.com) — configurá `CLICKSEND_USERNAME` y
`CLICKSEND_API_KEY` en tu `.env` (o en las variables de Railway) para activarlo. Sin esas
variables, el sistema sigue guardando los leads igual, solo que en vez de mandar el SMS
imprime en la consola lo que hubiera enviado — nunca falla ni bloquea nada. Los leads
(convertidos o no) se ven en el panel de administración, en la sección "📞 Abandoned leads".

La misma conexión de ClickSend se reutiliza para dos recordatorios más, ambos con la
misma lógica de "una sola vez, nunca bloquea nada si falla":

- **Recordatorio 24h antes de la limpieza** — a toda reserva pagada cuya fecha/hora
  quede a menos de 24 horas, sin repetir el envío.
- **Pedido de reseña de Google** — apenas marcás una reserva como "Completed" en el
  panel de admin, siempre que hayas configurado `googleReviewUrl` en
  `config/business.json` (queda vacío por defecto — sin eso, no manda nada, para no
  compartir un link de reseña que no existe).

### Fotos del estado de la propiedad

En el paso 1 del formulario, el cliente puede adjuntar hasta 8 fotos (JPEG, PNG o WEBP,
8MB cada una) del estado de la propiedad antes de la limpieza. Las fotos se suben **después**
de crear la reserva y de forma no bloqueante: si la subida falla (red lenta, archivo raro,
etc.) la reserva y el pago siguen su curso igual — nunca se pierde una venta por un problema
con las fotos. Se guardan en `server/data/uploads/` (fuera del control de versiones) y solo
son visibles desde el panel de administración (`/admin` → botón "📷 Photos" en cada fila),
protegidas por el mismo Basic Auth que el resto del panel.

### Garantía "100% Bond Back" con condiciones

El texto de la garantía en el sitio ahora incluye un asterisco y un enlace a "Guarantee
Terms" (los mismos Términos y Condiciones del checkout) que explican, en lenguaje simple:
qué cubre el re-clean gratuito, que la devolución del bond la decide el arrendador/agente
(no nosotros), y qué queda excluido (daños preexistentes, desgaste normal, etc.). Esto es
texto de sentido común pensado para no dejar promesas absolutas sin condiciones — no
reemplaza una revisión legal profesional si más adelante querés confirmarlo con un abogado.
