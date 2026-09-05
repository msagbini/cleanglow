# CleanGlow — auditoría AuditQ y remediación, 2026-09-05

Servidor local auditado a través de un terminador TLS (`https://localhost:4443`, cert autofirmado, `X-Forwarded-Proto: https`), que reproduce el borde de Railway. AuditQ = `msagbini/audit` @ 57efba2, perfil detectado `negocio_local` (confianza 1.0). Lighthouse dentro de AuditQ con `AUDIT_BROWSER_NO_SANDBOX=1`.

## Puntuación antes / después (crit/high/med/low/info)

| Página | Antes (AuditQ, HTTP local) | Después (AuditQ) | Después + criterio 3-de-5 | Con GA4 configurado (fixture) + 3-de-5 |
|---|---|---|---|---|
| `/` | 36/100 (1/5/3/4/11) | 69/100 (0/1/2/3/10) | 81/100 (0/1/0/1/14) | 97/100 (0/0/0/1/15) |
| `/end-of-lease-cleaning-st-kilda` | 42/100 (1/3/4/2/11) | 79/100 (0/1/0/2/10) | 81/100 (0/1/0/1/11) | 97/100 (0/0/0/1/12) |
| `/success.html` | 25/100 (2/6/9/8/10) | 57/100 (1/1/1/2/11) | 81/100 (0/1/0/1/14) | — |
| `/terms` | — (no existía) | 79/100 (0/1/0/2/10) | 81/100 (0/1/0/1/11) | — |
| `/privacy?lang=es` | — (no existía) | 70/100 (0/1/2/2/10) | 81/100 (0/1/0/1/13) | — |

Lo que queda con peso después del post-proceso, en todas las páginas, son exactamente dos hallazgos que dependen del propietario: `analytics.tracking.none` (high, desaparece al definir `GA_MEASUREMENT_ID`: columna 5) y `analytics.search_console.unverified` (low, desaparece al definir `SEARCH_CONSOLE_VERIFICATION`).

## Lighthouse (final)

| Página / preset | Perf | A11y | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| / móvil (AuditQ) | 98 | 100 | 100 | 100 | 2.04 s | 0.000 | 118 ms |
| /end-of-lease-cleaning-st-kilda móvil (AuditQ) | 100 | 100 | 100 | 100 | 1.52 s | 0.000 | 0 ms |
| / escritorio | 100 | 100 | 100 | 100 | 0.5 s | 0.001 | 0 ms |
| / móvil con banner de cookies (GA fixture) | 99 | 100 | 100 | 100 | 2.2 s | 0 | 0 ms |
| / móvil ANTES | 96 | 100 | 100 | 100 | 2.1 s | 0 | 210 ms |

INP no lo mide Lighthouse en laboratorio; el TBT (su proxy de laboratorio) es 0-118 ms, muy por debajo del umbral.

## Capa visual y responsive

10 viewports (360, 390, 412, 768, 1024, 1280, 1440, 1920, 2560, 3840) × 2 páginas, medidos con Playwright (`medidas-viewports-*.json`; capturas en `antes.png` / `despues.png` entregadas aparte).

| Métrica | Antes | Después |
|---|---|---|
| Elementos interactivos < 48×48 px (suma de las 20 mediciones) | 533 | 0 |
| Overflow horizontal (scrollWidth > innerWidth) | 0 | 0 |
| Ancho del contenedor a 1920 / 2560 / 3840 | 1180 / 1180 / 1180 | 1320 / 1600 / 1600 |
| Modal abierto al cargar | 0 | 0 |

## Reserva y pago

Flujo completo con Playwright contra un stand-in local de Stripe (`STRIPE_API_HOST`): /api/bookings 201 → /api/checkout-session 200 → http://localhost:4599/pay/cs_test_k8gjfpcipt/confirm 303 → Checkout (tarjeta 4242 4242 4242 4242) → webhook `checkout.session.completed` **firmado** → `/success.html` muestra «Booking confirmed and paid!» con referencia `CG-4LJDW2`. Sesión creada con `mode=payment`, `line_items[0]` = importe de la reserva en AUD, `success_url`/`cancel_url` en este dominio, `metadata.bookingId`. Webhook: {"received":true}; segunda entrega del mismo evento: {"received":true,"duplicate":true}; webhook sin firma: HTTP 400. Detalle en `checkout-evidence.json`.

**No verificado en este entorno:** el pago real en modo test de Stripe (el sandbox no llega a `api.stripe.com`). Procedimiento para el propietario: con `STRIPE_SECRET_KEY=sk_test_…` y `STRIPE_WEBHOOK_SECRET` del endpoint de test, reservar desde la web, pagar con 4242 4242 4242 4242 (cualquier fecha futura, cualquier CVC) y comprobar (a) la página de confirmación, (b) el evento `checkout.session.completed` como entregado (200) en el dashboard de Stripe → Developers → Webhooks, (c) la reserva en `/admin` como pagada.

## Otras verificaciones

- Regresión existente: 32/32 (`regression.mjs`), consentimiento 20/20 (`consent.mjs`, con GA fixture), páginas legales y modal 12/12, recarga/deep-link 2/2, checkout 17/17.
- Contraste WCAG AA: 0 elementos por debajo en claro y en oscuro (medido sobre estilos computados, gradientes incluidos).
- `npm audit`: 0 vulnerabilidades.
- Cookie `cg_csrf` con `Secure` y HSTS presentes cuando la petición es HTTPS (verificado a través del terminador TLS); `http://` → 301 a `https://` tanto en el stand-in del borde como en la app (`X-Forwarded-Proto: http` con base https).

## Criterio 3-de-5

**Actualización (mismo día):** el voto vive ahora dentro de AuditQ (`agent/perspectivas.py`, rama `claude/auditq-perspectivas-reflexivo` de `msagbini/audit`, documentado en `docs/reflexivo.md`). Corre en `build_report` para toda auditoría, con reglas deterministas por hallazgo, y escribe `perspectivas` y `severity_original` en el JSON sin post-proceso. Ejecutado contra estas mismas cinco páginas, el motor rebaja exactamente los hallazgos de juicio que aquí se rebajaron a mano (`auditq-nativo/*.json`); `backend.protocol.no_h3` y `seo.robots.noindex` no se votan porque son mediciones, no juicios. El script `perspectivas.py` de este directorio queda como registro de cómo se hizo ese día y ya no hace falta.

En el momento de la auditoría AuditQ no implementaba el voto por perspectivas; `perspectivas.py` (incluido aquí) lo aplicó sobre el JSON de salida: cada hallazgo de su tabla lleva las 5 perspectivas (Negocio, Usuario/UX, SEO, Técnica/Seguridad, Legal) con voto y motivo; con < 3 votos baja a `info`, conservando `severity_original`. La puntuación se recalcula con `agent.core.score_from_findings` de AuditQ. Ficheros `*.perspectivas.json`. Hallazgos rebajados: `conversion.cta.too_many`, `conversion.form.too_many_fields`, `conversion.popup.suspected_interstitial`, `backend.protocol.no_h3`, `seo.robots.noindex` (solo success), `conversion.trust.no_social_proof` y `conversion.value.price_promised_not_shown` (solo recibo/políticas). Ninguno alcanzó 1 voto.

## Pendiente del propietario

1. `GA_MEASUREMENT_ID=G-…` en Railway (cierra `analytics.tracking.none`; la evidencia con fixture muestra el resultado: `final-home-ga.perspectivas.json`).
2. `SEARCH_CONSOLE_VERIFICATION=<token>` en Railway y verificar en Search Console; enviar `https://cleanglow.up.railway.app/sitemap.xml`.
3. Pago real 4242 en modo test (procedimiento arriba).
4. En producción, tras el merge: `curl -sI https://cleanglow.up.railway.app/ | grep -iE "strict-transport|content-security|permissions-policy|x-frame|x-content-type|referrer-policy|content-encoding"` y `curl -sI http://cleanglow.up.railway.app/` (esperado 301). HTTP/3 (`Alt-Svc`) depende del borde de Railway.
5. `business.googleReviewUrl` para activar el SMS de solicitud de reseña; `business.social` con URLs reales (mientras sean `#` no se muestran).
6. Si el perfil de Google Business muestra una dirección con calle, copiarla en `business.address` (`streetAddress`, `postalCode`).
7. Stripe Dashboard → Settings → Public details: URL de términos `https://cleanglow.up.railway.app/terms` y de privacidad `/privacy`.
