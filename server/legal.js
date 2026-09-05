// The legal copy — terms, privacy, cookies — in one place, rendered by the
// server. It is served two ways from this single source:
//   * inside /api/config (`legal`), for the modals on the home page;
//   * as real pages at /terms, /privacy and /cookies, so the policies have
//     public URLs (a payment processor and an OAuth consent screen both
//     require one) and can be linked from anywhere, not only opened by JS.
// It used to live in public/js/app.js, where it could only ever be a modal.
//
// `headingTag` is the level of the section headings: h4 inside a modal
// whose own title is an h3, h2 on a page whose title is the h1.
import { config } from './config.js';
import { recleanWindowText } from './structuredData.js';

function recleanWindowTextEs(business) {
  const hours = Number(business.recleanWindowHours ?? 168);
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} día${days === 1 ? '' : 's'}`;
  }
  return `${hours} horas`;
}

export function buildLegalContent({ lang = 'en', analyticsEnabled = false, headingTag = 'h4' } = {}) {
  const { business, booking } = config;
  const accessPolicy = booking.accessPolicy ?? {};
  const accessLateFee = `${business.currencySymbol}${((accessPolicy.lateFeePerBlockCents ?? 0) / 100).toFixed(0)}`;
  const accessLockoutFee = `${business.currencySymbol}${((accessPolicy.lockoutFeeCents ?? 0) / 100).toFixed(0)}`;
  const minCycles = booking.earlyCancellationMinCycles ?? 3;
  const es = lang === 'es';
  const formatWindow = () => (es ? recleanWindowTextEs(business) : recleanWindowText(business));

  const analyticsSection = es
    ? (analyticsEnabled
      ? `<h4>Cookies de analítica (opcionales)</h4>
         <p>Si — y solo si — pulsas «Aceptar» en el aviso de cookies, cargamos Google Analytics, que establece cookies para medir cuántas personas visitan el sitio, qué páginas leen y en qué punto abandonan el formulario de reserva. Lo usamos únicamente para mejorar el sitio. Las señales de publicidad y personalización están desactivadas.</p>
         <p>No se carga nada ni se establece ninguna cookie de analítica antes de que aceptes: si rechazas, o simplemente ignoras el aviso, el script de Google Analytics nunca se descarga. Puedes cambiar de opinión en cualquier momento desde <a href="/#contact" id="manageCookiesInlineLink">ajustes de cookies</a> al pie de la página.</p>`
      : `<h4>Analítica</h4><p>Este sitio no usa cookies de seguimiento, publicidad ni analítica.</p>`)
    : (analyticsEnabled
      ? `<h4>Analytics cookies (optional)</h4>
         <p>If — and only if — you press "Accept" on the cookie banner, we load Google Analytics, which sets cookies to measure how many people visit, which pages they read and where they drop out of the booking form. We use that solely to improve the site. Advertising and personalisation signals are switched off, so this data is not used to target ads at you.</p>
         <p>Nothing is loaded and no analytics cookie is set before you accept: if you decline, or simply ignore the banner, the Google Analytics script is never fetched at all. You can change your mind at any time from <a href="/#contact" id="manageCookiesInlineLink">cookie settings</a> at the bottom of the page.</p>`
      : `<h4>Analytics</h4><p>This site uses no tracking, advertising or analytics cookies.</p>`);

  const content = es ? {
    terms: { title: 'Términos y Condiciones', body: `<p>Al reservar un servicio con ${business.name} aceptas los siguientes términos:</p>
      <h4>1. Reservas y pago</h4><p>El precio mostrado es una estimación basada en los datos que proporcionas. El monto final se confirma tras la inspección inicial del equipo.</p>
      <h4>2. Cancelaciones</h4><p>Puedes cancelar o reprogramar gratis hasta 24 horas antes de tu cita. Cancelaciones posteriores pueden generar una tarifa del 20%.</p>
      <h4>3. Garantía de Devolución del Depósito y Re-limpieza</h4>
      <p><strong>Lo que garantizamos:</strong> si tu administrador de propiedad o arrendador señala un ítem de tu <em>checklist acordado</em> que no se completó a un estándar profesional, volveremos a limpiar ese ítem sin costo — las veces que sea necesario para cumplir el estándar — siempre que:</p>
      <ul>
        <li>se nos reporte por escrito (email, o una nota en tu informe de condición/salida de la propiedad) dentro de ${formatWindow(business.recleanWindowHours)} desde la limpieza; y</li>
        <li>tú o tu administrador de propiedad den a nuestro equipo acceso razonable para realizar la re-limpieza.</li>
      </ul>
      <p><strong>Qué significa — y qué no significa — "garantía 100% de devolución del depósito":</strong> describe nuestro compromiso de volver a limpiar los ítems del checklist hasta que cumplan un estándar profesional. <strong>No</strong> es una garantía del monto del depósito en sí. Que tu depósito se devuelva en su totalidad es una decisión de tu arrendador, administrador de propiedad o (en caso de disputa) la autoridad de arrendamiento correspondiente, según factores fuera de nuestro control — por ejemplo daños a la propiedad, renta impaga, estado del jardín/césped, o artículos faltantes.</p>
      <p><strong>Qué no cubre:</strong> daños preexistentes, desgaste normal, moho, olores o manchas causados por condiciones previas a nuestro servicio, ítems fuera del checklist acordado al reservar, y solicitudes de re-limpieza hechas después de la ventana de ${formatWindow(business.recleanWindowHours)} o donde no se dio acceso.</p>
      <h4>4. Acceso a la Propiedad y Tardanza</h4>
      <p>El método de acceso elegido al reservar — que estés presente, o una caja de seguridad/código — determina cómo entra nuestro equipo. Si eliges caja de seguridad, la ubicación y el código deben indicarse en el formulario de reserva; si cambian antes de la cita, avísanos de inmediato.</p>
      <p>Si vas a estar presente: damos <strong>${accessPolicy.gracePeriodMinutes} minutos de gracia</strong> sin costo desde el inicio de tu horario reservado. Después de eso, se aplica una tarifa de <strong>${accessLateFee}</strong> por cada ${accessPolicy.lateFeeBlockMinutes} minutos adicionales que nuestro equipo espera, ya que ese tiempo se le resta directamente a otras reservas de ese día. Si sigue sin haber acceso después de <strong>${accessPolicy.lockoutThresholdMinutes} minutos</strong> en total, trataremos la cita como un caso de bloqueo: se aplica una tarifa de bloqueo de <strong>${accessLockoutFee}</strong>, la visita se cancela, y deberá reservarse de nuevo como una cita nueva (sujeta a disponibilidad) en vez de completarse ese mismo día.</p>
      <h4>5. Servicios Básicos y Condiciones de Trabajo Seguras</h4>
      <p>Debe haber agua y electricidad conectadas y accesibles en la propiedad para la cita reservada — si no las hay, puede aplicar la misma política de tardanza/bloqueo anterior, ya que nuestro equipo podría no poder completar la limpieza. Nuestro equipo puede negarse a limpiar o pausar el trabajo, sin que cuente como una cita incumplida de su parte, si la propiedad presenta un riesgo real de seguridad (ej. un animal agresivo sin control, materiales peligrosos expuestos, peligro estructural) — por favor indica cualquier situación relevante en las notas de la propiedad al reservar.</p>
      <h4>6. Cancelaciones o Retrasos por Parte de ${business.name}</h4>
      <p>En raras ocasiones podríamos necesitar cancelar o reprogramar una cita nosotros mismos — por ejemplo, clima severo, enfermedad de un miembro del equipo, o un problema con el vehículo. En estos casos te avisaremos lo antes posible y te ofreceremos una reprogramación gratuita para el próximo horario disponible, o un reembolso completo si prefieres no reservar de nuevo. Nunca se aplica ninguna tarifa por una cancelación o retraso de nuestra parte.</p>
      <h4>7. Planes recurrentes y cancelación anticipada</h4><p>Los planes semanales, quincenales y mensuales se facturan automáticamente a una tarifa con descuento que refleja la naturaleza continua y repetida del servicio. Si un plan recurrente se cancela antes de completar el mínimo de ${minCycles} limpiezas, aplica una tarifa única de cancelación anticipada equivalente a una visita a la tarifa con descuento, cobrada a la tarjeta registrada, para recuperar el descuento otorgado bajo el supuesto de negocio continuo. Esta tarifa no aplica una vez completado el número mínimo de limpiezas — el plan puede cancelarse en cualquier momento sin costo a partir de entonces.</p>` },
    privacy: { title: 'Política de Privacidad', body: `<p>Tus datos personales se usan únicamente para gestionar tu reserva y comunicarnos contigo sobre el servicio.</p>
      <h4>Datos que recopilamos</h4><p>Nombre, email, número de teléfono, la dirección de la propiedad a limpiar, y cualquier foto antes/después enviada para el trabajo. Si eliges notificar a un administrador de propiedad, también recopilamos su dirección de email para ese único propósito.</p>
      <h4>Cómo los usamos</h4><p>No compartimos tus datos con terceros salvo el equipo de limpieza asignado a tu servicio y, solo si eliges proporcionarlo, el email del administrador de propiedad/agente que nos indiques — usado únicamente para enviarle la prueba de que la limpieza acordada se completó.</p>
      ${analyticsEnabled ? '<h4>Analítica</h4><p>Si aceptas las cookies de analítica, Google Analytics recibe datos de uso anonimizados de tu visita (páginas vistas, pasos de reserva alcanzados) como encargado del tratamiento por nuestra cuenta. Nunca recibe tu nombre, dirección, email ni teléfono, y no se carga en absoluto a menos que aceptes.</p>' : ''}
      <h4>Tus derechos</h4><p>Puedes solicitar acceso, corrección o eliminación de tus datos escribiendo a ${business.email}.</p>` },
    cookies: { title: 'Cookies', body: `<h4>Estrictamente necesarias</h4>
      <p>Dos cookies mantienen el sitio en funcionamiento y se establecen sin consentimiento porque no rastrean nada: un token de seguridad que protege el formulario de reserva contra falsificación de peticiones (CSRF) y — solo si inicias sesión en tu cuenta en /account — una cookie de sesión que te mantiene identificado hasta 30 días.</p>
      ${analyticsSection}
      <h4>Stripe</h4><p>Cuando llegas a la pantalla de pago, nuestro procesador de pagos Stripe puede establecer sus propias cookies allí para prevención de fraude. Eso ocurre en el sitio de Stripe, bajo su <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">política de privacidad</a>, no la nuestra.</p>` },
  } : {
    terms: { title: 'Terms & Conditions', body: `<p>By booking a service with ${business.name} you agree to the following terms:</p>
      <h4>1. Bookings and payment</h4><p>The price shown is an estimate based on the details you provide. The final amount is confirmed after the team's initial inspection.</p>
      <h4>2. Cancellations</h4><p>You can cancel or reschedule for free up to 24 hours before your appointment. Later cancellations may incur a 20% fee.</p>
      <h4>3. Bond-Back & Re-clean Guarantee</h4>
      <p><strong>What we guarantee:</strong> if your property manager or landlord flags an item from your <em>agreed checklist</em> that wasn't completed to a professional standard, we will re-clean that item at no charge — as many times as it takes to meet the standard — provided:</p>
      <ul>
        <li>it is reported to us in writing (email, or a note on your property condition/exit report) within ${formatWindow(business.recleanWindowHours)} of the clean; and</li>
        <li>you or your property manager give our team reasonable access to carry out the re-clean.</li>
      </ul>
      <p><strong>What "100% bond-back guarantee" means — and doesn't mean:</strong> it describes our commitment to re-clean checklist items until they meet a professional standard. It is <strong>not</strong> a guarantee of the bond amount itself. Whether your bond is returned in full is a decision made by your landlord, property manager, or (if disputed) the relevant tenancy authority, based on factors outside our control — for example property damage, unpaid rent, garden/lawn condition, or missing items.</p>
      <p><strong>What isn't covered:</strong> pre-existing damage, fair wear and tear, mould, odours or staining caused by conditions that existed before our service, items outside the checklist agreed at booking, and re-clean requests made after the ${formatWindow(business.recleanWindowHours)} reporting window or where access wasn't provided.</p>
      <h4>4. Property Access & Lateness</h4>
      <p>The access method chosen at booking — you being present, or a lockbox/key code — determines how our team gets in. If you choose a lockbox, its location and code must be given in the booking form; if either changes before the appointment, let us know immediately.</p>
      <p>If you'll be present: we allow a <strong>${accessPolicy.gracePeriodMinutes}-minute grace period</strong> from the start of your booked time slot at no charge. After that, a <strong>${accessLateFee}</strong> fee applies for each additional ${accessPolicy.lateFeeBlockMinutes} minutes our team waits, since that time is taken directly from other customers' bookings that day. If access still hasn't been provided after <strong>${accessPolicy.lockoutThresholdMinutes} minutes</strong> total, we'll treat the appointment as a lockout: a <strong>${accessLockoutFee}</strong> lockout fee applies, the visit is cancelled, and it will need to be rebooked as a new appointment (subject to availability) rather than completed the same day.</p>
      <h4>5. Utilities & Safe Working Conditions</h4>
      <p>Working water and electricity must be connected and accessible at the property for the booked appointment — if they aren't, the lateness/lockout policy above may apply, as our team may be unable to complete the clean. Our team may decline or pause a clean, without it counting as a missed appointment on their part, if the property presents a genuine safety risk (e.g. an uncontrolled aggressive animal, exposed hazardous materials, structural danger) — please disclose anything relevant in the property notes at booking.</p>
      <h4>6. Cancellations or Delays by ${business.name}</h4>
      <p>On rare occasions we may need to cancel or reschedule an appointment ourselves — for example severe weather, a team member's illness, or a vehicle issue. In these cases you'll be notified as early as possible and offered a free reschedule to the next available slot, or a full refund if you'd prefer not to rebook. No fee ever applies for a cancellation or delay on our side.</p>
      <h4>7. Recurring plans and early cancellation</h4><p>Weekly, fortnightly and monthly plans are billed automatically at a discounted rate that reflects the ongoing, repeat nature of the service. If a recurring plan is cancelled before the minimum of ${minCycles} cleans has been completed, a one-off early-cancellation fee equal to one visit at the discounted rate applies, charged to the card on file, to recover the discount given on the assumption of ongoing business. This fee does not apply once the minimum number of cleans has been completed — the plan can then be cancelled at any time with no fee.</p>` },
    privacy: { title: 'Privacy Policy', body: `<p>Your personal data is used only to manage your booking and communicate with you about the service.</p>
      <h4>Data we collect</h4><p>Name, email, phone number, the address of the property to be cleaned, and any before/after photos submitted for the job. If you choose to notify a property manager, we also collect their email address for that one purpose.</p>
      <h4>How we use it</h4><p>We don't share your data with third parties other than the cleaning team assigned to your service and, only if you choose to provide one, the property manager/agent email you give us — used solely to send them proof that the agreed clean was completed.</p>
      ${analyticsEnabled ? '<h4>Analytics</h4><p>If you accept analytics cookies, Google Analytics receives anonymised usage data about your visit (pages viewed, booking steps reached) as a processor on our behalf. It never receives your name, address, email or phone number, and it is not loaded at all unless you accept.</p>' : ''}
      <h4>Your rights</h4><p>You can request access to, correction of, or deletion of your data by emailing ${business.email}.</p>` },
    cookies: { title: 'Cookies', body: `<h4>Strictly necessary</h4>
      <p>Two cookies keep the site working and are set without consent, as they carry no tracking: a security token that protects the booking form against cross-site request forgery, and — only if you log into your account at /account — a session cookie that keeps you signed in for up to 30 days.</p>
      ${analyticsSection}
      <h4>Stripe</h4><p>When you reach the payment screen, our payment processor Stripe may set its own cookies there for fraud prevention. That happens on Stripe's own site, under their <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>, not ours.</p>` },
  };

  if (headingTag !== 'h4') {
    for (const entry of Object.values(content)) {
      entry.body = entry.body.replaceAll('<h4>', `<${headingTag}>`).replaceAll('</h4>', `</${headingTag}>`);
    }
  }
  return content;
}

export const LEGAL_PAGES = {
  terms: { path: '/terms', description: 'Booking, cancellation, refund and bond-back guarantee terms for CleanGlow end of lease cleaning.' },
  privacy: { path: '/privacy', description: 'What personal data CleanGlow collects when you book a clean, how it is used, and your rights.' },
  cookies: { path: '/cookies', description: 'Which cookies this site sets, which are optional, and how to change your choice.' },
};
