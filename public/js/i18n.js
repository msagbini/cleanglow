// Site-wide language toggle (English default, Spanish opt-in) — shared by
// the homepage, account portal and proof-of-clean page.
//
// English is already the text baked into every HTML file and JS literal, so
// there's nothing to look up when the current language is 'en' — this file
// only ever needs to carry the Spanish side. `t(key, fallbackEnglish)` and
// the `data-i18n*` attributes both fall back to the English already present
// whenever a key is missing, so a translation gap degrades to English
// instead of showing "undefined" or a blank string.
//
// Spanish is temporarily disabled site-wide (quality issues found in the
// translated copy) — getLang() is hardcoded to 'en' below, ignoring any
// previously-stored preference, so the whole translation layer goes inert
// without deleting it. The toggle buttons are removed from the HTML to
// match. Re-enable by restoring the localStorage-based getLang() once the
// `es` dictionary and config/business.es.json have been proofread.
window.CGI18N = (() => {
  const STORAGE_KEY = 'cg_lang';

  function getLang() {
    return 'en';
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang === 'es' ? 'es' : 'en');
    location.reload();
  }

  const es = {
    // Nav / header
    'nav.services': 'Servicios',
    'nav.checklist': 'Checklist',
    'nav.pricing': 'Precios',
    'nav.faq': 'Preguntas frecuentes',
    'nav.contact': 'Contacto',
    'nav.account': 'Mi cuenta',
    'a11y.skipToContent': 'Saltar al contenido',
    'header.callUs': 'Llámanos',
    'header.bookNow': 'Reservar ahora',

    // Hero
    'hero.bookNow': 'Reservar ahora',
    'hero.seePricing': 'Ver precios',
    'hero.instantQuote': 'Cotización instantánea',
    'hero.servicingPrefix': 'Servicio en',
    'hero.servicingSuffix': 'y suburbios cercanos.',
    'hero.guaranteeTermsLink': 'Términos de la garantía',
    'hero.whatsappPrefill': (name) => `Hola ${name}, quisiera preguntar sobre una reserva.`,
    'common.from': 'desde',
    'common.per': 'por',
    'common.unit': 'unidad',
    'hero.estimatedTotal': 'Total estimado',
    'pricing.mostBooked': 'Más reservado',
    'pricing.bookThisSize': 'Reservar este tamaño',

    // Section headings not driven by config
    'section.services.eyebrow': 'Servicios',
    'section.services.title': 'Todo lo que necesitas para entregar las llaves con confianza',
    'section.services.desc': 'Elige la limpieza estándar o combínala con extras. Cada servicio cumple el checklist estándar usado por las principales administradoras e inmobiliarias.',
    'section.checklist.eyebrow': 'Checklist de fin de contrato',
    'section.checklist.title': 'Lo que tu arrendador revisa, nosotros lo revisamos primero',
    'section.pricing.eyebrow': 'Precios',
    'section.pricing.title': 'Precios claros, sin sorpresas',
    'section.pricing.desc': 'El precio final depende del tamaño de la propiedad y los extras que elijas. Obtén tu cotización exacta en el formulario de reserva abajo.',
    'section.booking.eyebrow': 'Reserva en línea',
    'section.booking.title': 'Reserva tu limpieza en 5 pasos',
    'section.booking.desc': 'El precio se actualiza automáticamente a medida que haces tus selecciones.',
    'section.faq.eyebrow': 'Preguntas frecuentes',
    'section.faq.title': 'Todo lo que necesitas saber',
    'section.cta.title': '¿Listo para entregar las llaves con confianza?',
    'section.cta.desc': 'Reserva ahora para asegurar tu horario preferido.',
    'section.cta.button': 'Reservar mi limpieza de fin de contrato',

    // Resume-payment banner
    'resume.text': (ref) => `Ya comenzaste una reserva (${ref}) que aún no se ha pagado. Continúa donde la dejaste en vez de llenar el formulario de nuevo.`,
    'resume.button': 'Continuar pago',
    'resume.redirecting': 'Redirigiendo…',

    // Progress steps
    'step.1': 'Propiedad',
    'step.2': 'Extras',
    'step.3': 'Fecha',
    'step.4': 'Datos',
    'step.5': 'Confirmar',

    // Step 1 — property
    'form.step1.legend': 'Cuéntanos sobre la propiedad',
    'form.howOften': '¿Con qué frecuencia?',
    'form.propertyType': 'Tipo de propiedad',
    'form.sqm': 'Tamaño aproximado (m²)',
    'form.sqmPlaceholder': 'ej. 75',
    'form.condition': 'Estado de la propiedad',
    'form.condition.furnished': 'Amoblada',
    'form.condition.empty': 'Vacía',
    'form.condition.renovation': 'Post-renovación / construcción',
    'form.notes': 'Notas sobre la propiedad (opcional)',
    'form.notesPlaceholder': 'ej. mascotas en la propiedad, moho en el baño, acceso limitado por obras...',
    'form.photos': 'Fotos del estado actual de la propiedad (opcional)',
    'form.photosHint': 'Hasta 8 fotos (JPEG, PNG o WEBP, 8MB cada una). Esto ayuda a nuestro equipo a cotizar con precisión y deja un registro del estado inicial.',

    // Step 2 — extras
    'form.step2.legend': 'Agrega extras a tu limpieza',
    'form.extrasHint': 'Selecciona los que necesites. Recomendamos estos extras si quieres maximizar la devolución de tu depósito.',
    'form.keyAccess': '¿Cómo accederemos a la propiedad?',

    // Step 3 — date
    'form.step3.legend': 'Elige fecha y horario',
    'form.date': 'Fecha de la limpieza',
    'form.timeSlot': 'Horario',
    'form.speed': 'Velocidad de la limpieza',
    'form.urgencyDefault': 'Elige una fecha para ver si aplica un recargo por urgencia',
    'form.recleanReminder': (hours) => `Notifícame si mi arrendador/agente no queda conforme con algo (re-limpieza gratuita dentro de ${hours})`,

    // Step 4 — contact
    'form.step4.legend': 'Tus datos de contacto',
    'form.fullName': 'Nombre completo *',
    'form.fullNamePlaceholder': 'Nombre y apellido',
    'form.email': 'Correo electrónico *',
    'form.phone': 'Teléfono *',
    'form.postcode': 'Código postal *',
    'form.address': 'Dirección completa *',
    'form.addressPlaceholder': 'Calle, número, unidad, suburbio',
    'form.promoCode': 'Código promocional (opcional)',
    'form.agentNotify': 'Notificar automáticamente a mi administrador de propiedad cuando la limpieza esté lista (opcional)',
    'form.agentEmail': 'Email del administrador de propiedad / inmobiliaria',
    'form.agentEmailHint': 'Le enviaremos la prueba de la limpieza (checklist + fotos antes/después) una vez completada.',
    'form.accessInstructions': 'Ubicación y clave de la caja de seguridad *',
    'form.accessInstructionsPlaceholder': 'ej. Caja junto a la puerta principal, código 4471',
    'form.accessInstructionsHint': 'Sé específico — esto es lo que usará el equipo de limpieza para entrar.',
    'toast.accessInstructionsRequired': 'Por favor indica la ubicación y la clave de la caja de seguridad',
    'access.policyNotePresent': (grace, fee, block, lockoutMin, lockoutFee) =>
      `Si vas a estar presente, por favor sé puntual — damos ${grace} minutos de gracia. Después de eso, se aplica una tarifa de ${fee} por cada ${block} minutos adicionales, y si sigue sin haber acceso después de ${lockoutMin} minutos lo trataremos como un caso de bloqueo (tarifa de ${lockoutFee}) y habrá que reprogramar. Elegir una caja de seguridad evita esto por completo.`,
    'access.policyNoteKeybox': '✓ Sin riesgo de tardanza — el equipo entrará con el código que nos indiques abajo.',
    'form.termsAgree': 'Acepto los',
    'form.termsAnd': 'y la',
    'form.termsConditions': 'términos y condiciones',
    'form.privacyPolicy': 'política de privacidad',

    // Step 5 — review
    'form.step5.legend': 'Revisa y confirma tu reserva',

    // Nav buttons
    'form.back': '← Atrás',
    'form.next': 'Siguiente →',
    'form.next.1': 'Elegir extras →',
    'form.next.2': 'Elegir fecha →',
    'form.next.3': 'Añadir mis datos →',
    'form.next.4': 'Revisar reserva →',
    'form.confirmPay': 'Confirmar y pagar →',
    'form.redirectingPayment': 'Redirigiendo al pago seguro…',

    // Price summary
    'price.yourQuote': 'Tu cotización',
    'price.oversizeSurcharge': 'Recargo por propiedad grande',
    'price.keyAccess': 'Acceso con llave',
    'price.urgency': 'Urgencia',
    'price.frequencyDiscount': 'Descuento por frecuencia',
    'price.estimatedTotal': 'Total estimado',
    'price.totalPerVisit': (freq) => `Total por visita (${freq})`,
    'price.taxNote': 'El precio final se confirma tras revisar las notas de tu propiedad.',
    'price.taxNoteGst': (symbol, gst) => `El precio incluye ${symbol}${gst} de GST. El precio final se confirma tras revisar las notas de tu propiedad.`,

    // Toasts / validation
    'toast.requiredFields': 'Completa los campos obligatorios (*)',
    'toast.invalidEmail': 'Ingresa un correo electrónico válido',
    'toast.invalidPhone': 'Ingresa un número de teléfono de 10 dígitos que empiece con 0 (ej. 0400000000)',
    'toast.invalidPostcode': 'Ingresa un código postal de 4 dígitos (ej. 3000)',
    'toast.selectDate': 'Selecciona una fecha para tu servicio',
    'toast.pastDate': 'La fecha no puede ser en el pasado',
    'toast.dateTooFar': 'Elige una fecha dentro de los próximos meses',
    'toast.slotFull': 'Ese horario ya está completo — elige otro',
    'form.fullyBooked': 'Completo',
    'extras.fewer': (label) => `Menos ${label}`,
    'extras.more': (label) => `Más ${label}`,
    'extras.quantity': (label) => `Cantidad de ${label.toLowerCase()}`,
    'photo.remove': (name) => `Eliminar ${name}`,
    'toast.slotReassigned': 'Tu horario seleccionado ya está completo — elegimos el siguiente disponible',
    'toast.genericError': 'Algo salió mal. Por favor intenta de nuevo.',
    'toast.maxPhotos': (max, added) => `Puedes subir hasta ${max} fotos. Solo se agregaron las primeras ${added}.`,
    'toast.rebookApplied': 'Los datos de tu propiedad anterior están pre-llenados — elige una nueva fecha y horario.',
    'toast.siteLoadError': 'No se pudo cargar el sitio. Por favor recarga la página.',
    'promo.applied': (pct) => `✓ Código aplicado: ${pct}% de descuento`,
    'promo.referral': 'Verificaremos este código y aplicaremos tu descuento al pagar.',
    'promo.invalid': '✗ Este código no es válido',

    // Review box
    'review.edit': 'Editar',
    'review.property': 'Propiedad',
    'review.extras': 'Extras',
    'review.extrasNone': 'Ninguno',
    'review.dateTime': 'Fecha y hora',
    'review.slot': 'horario',
    'review.urgency': 'urgencia',
    'review.contact': 'Datos de contacto',
    'review.frequency': 'Frecuencia de limpieza',
    'review.billedAuto': ' — se factura automáticamente en cada ciclo',
    'review.cancellationNote': (n, terms) => `Cancelar antes de tu ${n}ª limpieza genera una tarifa única de cancelación anticipada equivalente a una visita a tu tarifa con descuento — ver ${terms}.`,
    'review.terms': 'términos',
    'review.totalPerVisit': 'Total por visita',
    'review.totalToPay': 'Total a pagar',
    'review.discountApplied': '(descuento aplicado)',
    'review.includesGst': (amount) => `Incluye ${amount} de GST`,

    // FAQ
    'faq.q1': '¿Qué pasa si mi arrendador no queda conforme?',
    'faq.a1': (hours) => `Ofrecemos una garantía de re-limpieza gratuita dentro de ${hours} desde el servicio si algún ítem del checklist no cumple con el estándar de tu arrendador o agente.`,
    'faq.q2': '¿Necesito estar presente durante la limpieza?',
    'faq.a2': 'No es obligatorio. Puedes indicar una caja de seguridad o código de llave al reservar.',
    'faq.q3': '¿Traen sus propios productos y equipos?',
    'faq.a3': 'Sí, nuestros equipos llegan con todos los productos, maquinaria y elementos de protección necesarios. Solo necesitamos acceso a agua y electricidad.',
    'faq.q4': '¿Cuánto dura la limpieza?',
    'faq.a4': 'Depende del tamaño de la propiedad y los extras contratados. Como referencia, un apartamento de 2 dormitorios suele tomar entre 3 y 5 horas.',
    'faq.q5': '¿Puedo cancelar o cambiar la fecha?',
    'faq.a5': 'Sí, puedes reprogramar o cancelar tu reserva gratis hasta 24 horas antes de tu cita.',
    'faq.q6': '¿El precio incluye GST?',
    'faq.a6': 'Sí — todos los precios mostrados en tu cotización incluyen GST cuando corresponde. Sin cargos ocultos.',
    'faq.q7': '¿Qué pasa si llego tarde o no puedo estar presente?',
    'faq.a7': 'Damos un breve período de gracia si vas a llegar tarde. Retrasos más largos o falta total de acceso pueden generar una tarifa de espera o, pasado cierto punto, una tarifa de bloqueo — consulta nuestros términos y condiciones para los montos exactos. Elegir una caja de seguridad/código en vez de estar presente evita este riesgo por completo.',

    // Footer
    'footer.businessHours': 'Horario',
    'footer.company': 'Empresa',
    'footer.serviceAreas': 'Áreas de servicio',
    'footer.contact': 'Contacto',
    'footer.rightsReserved': (year, name, abn) => `© ${year} ${name}. Todos los derechos reservados.${abn}`,
    'footer.privacy': 'Privacidad',
    'footer.terms': 'Términos',
    'footer.cookies': 'Cookies',
    'footer.close': 'Cerrar',

    // Misc small labels
    'common.days': (n) => `${n} día${n === 1 ? '' : 's'}`,
    'common.hours': (n) => `${n} horas`,
    'common.loading': 'Cargando…',

    // ===== Account portal =====
    'account.title': 'Mi cuenta',
    'account.loginIntro': 'Ingresa el correo con el que reservaste y te enviaremos un enlace seguro — sin necesidad de contraseña.',
    'account.emailPlaceholder': 'tu@ejemplo.com',
    'account.sendLink': 'Enviar enlace de acceso',
    'account.invalidLink': 'Ese enlace no es válido o expiró. Solicita uno nuevo abajo.',
    'account.linkSentMessage': 'Si ese email tiene reservas con nosotros, te enviamos un enlace de acceso — revisa tu bandeja de entrada.',
    'account.invalidEmailError': 'Ingresa un correo electrónico válido',
    'account.logout': 'Cerrar sesión',
    'account.hi': (email) => `Hola, ${email}`,
    'account.referTitle': 'Refiere a un amigo',
    'account.referDesc': (amount) => `Comparte tu código — tu amigo obtiene ${amount} de descuento en su primera limpieza, y una vez completada, tú recibes ${amount} de crédito para tu próxima limpieza.`,
    'account.copy': 'Copiar',
    'account.copied': '¡Copiado!',
    'account.share': 'Compartir',
    'account.shareMessage': (code, discount, url) => `He usado CleanGlow para mi limpieza de fin de contrato y me ayudó mucho a recuperar mi depósito. Usa mi código ${code} para obtener ${discount} de descuento en tu primera limpieza: ${url}`,
    'account.noCodeYet': 'Tu código aparecerá aquí una vez que tu primera reserva esté pagada.',
    'account.creditLabel': 'de crédito',
    'account.used': 'Usado',
    'account.available': 'Disponible',
    'account.yourBookings': 'Tus reservas',
    'account.noBookings': 'Aún no tienes reservas.',
    'account.viewProof': 'Ver prueba de limpieza',
    'account.manageSubscription': 'Gestionar suscripción',
    'account.bookAgain': 'Reservar de nuevo',
    'account.agentBadge': 'Vista de administrador de propiedad',
    'account.status.pending_payment': 'Pago pendiente',
    'account.status.paid': 'Confirmada',
    'account.status.completed': 'Completada',
    'account.status.cancelled': 'Cancelada',
    'account.status.expired': 'Expirada',
    'account.cancelTitle': 'Cancelar suscripción',
    'account.cancelClose': 'Cerrar',
    'account.cancelIntro': (done, min) => `Has completado <strong>${done}</strong> de las <strong>${min}</strong> limpiezas requeridas para el descuento recurrente.`,
    'account.cancelFeeApplies': (fee) => `Cancelar ahora aplica una tarifa única de cancelación anticipada de <strong>${fee}</strong>, cobrada a la tarjeta registrada.`,
    'account.cancelNoFee': 'Ya cumpliste el mínimo — cancelar ahora no tiene costo.',
    'account.cancelAcceptFee': 'Aceptar tarifa y cancelar',
    'account.cancelSubscription': 'Cancelar suscripción',
    'account.cancelNevermind': 'No, gracias',
    'account.cancelDone': 'Suscripción cancelada.',
    'account.cancelError': 'No se pudo cancelar — intenta de nuevo.',
    'account.cancelLoadError': 'No se pudo cargar esta reserva.',

    // ===== Proof of clean =====
    'proof.title': 'Prueba de limpieza',
    'proof.print': 'Imprimir / Guardar como PDF',
    'proof.verifiedBadge': 'Reserva verificada — CleanGlow',
    'proof.photos': 'Fotos',
    'proof.noPhotos': 'No se subieron fotos para esta limpieza.',
    'proof.included': 'Incluido en cada limpieza',
    'proof.notAvailable': 'No disponible',
    'proof.notAvailableText': 'Este enlace de prueba de limpieza no está disponible.',
    'proof.before': 'Antes',
    'proof.after': 'Después',
    'proof.pageTitle': (id) => `Prueba de limpieza — ${id}`,
    'proof.metaLine': (addr, date, ref) => `${addr} · ${date} · Referencia ${ref}`,
  };

  function t(key, fallbackEn) {
    if (getLang() !== 'es') return fallbackEn;
    const entry = es[key];
    if (entry == null || typeof entry === 'function') return fallbackEn;
    return entry;
  }

  // For entries that need interpolation (stored as functions in `es`) — falls
  // back to calling `fallbackFn` with the same arguments when lang is 'en' or
  // the key is missing/not a function.
  function tf(key, fallbackFn, ...args) {
    if (getLang() === 'es' && typeof es[key] === 'function') return es[key](...args);
    return fallbackFn(...args);
  }

  function applyStatic(root) {
    if (getLang() !== 'es') return;
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const val = es[el.dataset.i18n];
      if (val != null && typeof val === 'string') el.textContent = val;
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      const val = es[el.dataset.i18nHtml];
      if (val != null && typeof val === 'string') el.innerHTML = val;
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const val = es[el.dataset.i18nPlaceholder];
      if (val != null && typeof val === 'string') el.placeholder = val;
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const val = es[el.dataset.i18nAriaLabel];
      if (val != null && typeof val === 'string') el.setAttribute('aria-label', val);
    });
    if (!root) document.documentElement.lang = 'es';
  }

  function initToggleButtons() {
    const lang = getLang();
    document.querySelectorAll('.lang-toggle').forEach(btn => {
      btn.textContent = lang === 'es' ? 'EN' : 'ES';
      btn.setAttribute('aria-label', lang === 'es' ? 'Switch to English' : 'Cambiar a español');
      btn.addEventListener('click', () => setLang(lang === 'es' ? 'en' : 'es'));
    });
  }

  return { getLang, setLang, t, tf, applyStatic, initToggleButtons };
})();
