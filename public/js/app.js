(() => {
  'use strict';

  const state = {
    config: null,
    propertyType: null,
    urgency: null,
    urgencySurcharge: 0,
    currentStep: 1,
    promoDiscount: 0,
  };

  const form = document.getElementById('bookingForm');
  const steps = Array.from(document.querySelectorAll('.form-step'));
  const dots = Array.from(document.querySelectorAll('.step-dot'));
  const btnBack = document.getElementById('btnBack');
  const btnNext = document.getElementById('btnNext');
  const btnSubmit = document.getElementById('btnSubmit');

  const els = {
    bedrooms: document.getElementById('bedrooms'),
    bathrooms: document.getElementById('bathrooms'),
    sumPropertyLabel: document.getElementById('sumPropertyLabel'),
    sumBase: document.getElementById('sumBase'),
    sumExtrasList: document.getElementById('sumExtrasList'),
    sumUrgencyLine: document.getElementById('sumUrgencyLine'),
    sumUrgency: document.getElementById('sumUrgency'),
    sumTotal: document.getElementById('sumTotal'),
    promoCode: document.getElementById('promoCode'),
  };

  /* ============ Rendering from /api/config ============ */
  function applyTheme(theme) {
    const root = document.documentElement.style;
    root.setProperty('--color-primary', theme.primary);
    root.setProperty('--color-primary-dark', theme.primaryDark);
    root.setProperty('--color-accent', theme.accent);
  }

  function renderBranding(cfg) {
    const { business } = cfg;
    document.title = `${business.name} | Reserva tu servicio online`;

    document.getElementById('logoMark').textContent = business.logoEmoji;
    document.getElementById('logoText').textContent = business.name;
    document.getElementById('footerLogoMark').textContent = business.logoEmoji;
    document.getElementById('footerLogoText').textContent = business.name;

    const telHref = `tel:${business.phone}`;
    const headerPhone = document.getElementById('headerPhoneLink');
    headerPhone.href = telHref;
    headerPhone.textContent = `📞 ${business.phoneDisplay}`;
    const footerPhone = document.getElementById('footerPhoneLink');
    footerPhone.href = telHref;
    footerPhone.textContent = `📞 ${business.phoneDisplay}`;

    const mailHref = `mailto:${business.email}`;
    const footerEmail = document.getElementById('footerEmailLink');
    footerEmail.href = mailHref;
    footerEmail.textContent = `✉️ ${business.email}`;

    document.getElementById('footerHours').textContent = `🕐 ${business.hours}`;
    document.getElementById('footerDescription').textContent = business.footerDescription;
    document.getElementById('footerCopyright').textContent = `© ${new Date().getFullYear()} ${business.name}. Todos los derechos reservados.`;
    document.getElementById('recleanWindowHours').textContent = business.recleanWindowHours;

    const areasCol = document.getElementById('footerServiceAreas');
    business.serviceAreas.forEach(area => {
      const a = document.createElement('a');
      a.href = '#booking';
      a.textContent = area;
      areasCol.appendChild(a);
    });

    const socialWrap = document.getElementById('footerSocial');
    const socialLabels = { instagram: 'IG', facebook: 'FB', linkedin: 'IN' };
    Object.entries(business.social).forEach(([key, url]) => {
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('aria-label', key);
      a.textContent = socialLabels[key] || key.slice(0, 2).toUpperCase();
      socialWrap.appendChild(a);
    });
  }

  function renderHero(cfg) {
    const { business, booking } = cfg;
    document.getElementById('heroBadge').textContent = business.badgeText;
    document.getElementById('heroTitle').innerHTML = business.heroTitleHtml;
    document.getElementById('heroDescription').textContent = business.heroDescription;

    document.getElementById('heroTrust').innerHTML = `
      <li>⭐ ${business.rating}/5 (${business.reviewCount} reseñas)</li>
      <li>🛡️ Asegurados hasta ${business.insuranceAmount}</li>
      <li>♻️ Re-limpieza gratuita en ${business.recleanWindowHours}h</li>
    `;

    const sampleSize = booking.sizeField.options[Math.min(2, booking.sizeField.options.length - 1)];
    const sampleExtras = booking.extras.slice(0, 2);
    const sampleType = booking.serviceTypes[0];
    const total = sampleSize.price + sampleType.surcharge + sampleExtras.reduce((s, e) => s + e.price, 0);
    document.getElementById('heroCardRows').innerHTML = `
      <div class="hero-card-row"><span>${sampleType.icon} ${sampleType.label} ${sampleSize.label}</span><span>desde ${sampleSize.price}${business.currencySymbol}</span></div>
      ${sampleExtras.map(e => `<div class="hero-card-row"><span>${e.icon} ${e.label}</span><span>+ ${e.price}${business.currencySymbol}</span></div>`).join('')}
      <div class="hero-card-row hero-card-total"><span>Total estimado</span><span>${total}${business.currencySymbol}</span></div>
    `;
  }

  function renderTrustStrip(cfg) {
    document.getElementById('trustStrip').innerHTML = cfg.business.stats
      .map(s => `<div><strong>${s.value}</strong><span>${s.label}</span></div>`).join('');
  }

  function renderServices(cfg) {
    document.getElementById('servicesGrid').innerHTML = cfg.servicesShowcase.map(s => `
      <article class="service-card">
        <div class="service-icon">${s.icon}</div>
        <h3>${s.title}</h3>
        <p>${s.description}</p>
      </article>
    `).join('');
  }

  function renderChecklist(cfg) {
    const { checklist } = cfg;
    document.getElementById('checklistIntro').textContent = checklist.intro;
    document.getElementById('checklistColumns').innerHTML = checklist.columns.map(col => `
      <ul class="checklist">${col.map(item => `<li>✔ ${item}</li>`).join('')}</ul>
    `).join('');
    document.getElementById('guaranteeCard').innerHTML = `
      <h3>${checklist.guarantee.title}</h3>
      <p>${checklist.guarantee.description}</p>
      <ul>${checklist.guarantee.points.map(p => `<li>✅ ${p}</li>`).join('')}</ul>
    `;
  }

  function renderPricingTiers(cfg) {
    document.getElementById('pricingGrid').innerHTML = cfg.pricingTiers.map(tier => `
      <div class="price-card ${tier.featured ? 'featured' : ''}">
        ${tier.featured ? '<span class="price-tag">Más reservado</span>' : ''}
        <h3>${tier.label}</h3>
        <p class="price">desde ${tier.priceFrom}${cfg.business.currencySymbol}</p>
        <ul>${tier.features.map(f => `<li>${f}</li>`).join('')}</ul>
      </div>
    `).join('');
  }

  function renderBookingWizard(cfg) {
    const { booking } = cfg;

    document.getElementById('propertyTypePills').innerHTML = booking.serviceTypes.map((t, i) => `
      <button type="button" class="pill${i === 0 ? ' active' : ''}" data-value="${t.value}">${t.icon} ${t.label}</button>
    `).join('');
    state.propertyType = booking.serviceTypes[0].value;

    document.getElementById('sizeFieldLabel').textContent = booking.sizeField.label;
    els.bedrooms.innerHTML = booking.sizeField.options.map(o =>
      `<option value="${o.value}" ${o.value === booking.sizeField.defaultValue ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    document.getElementById('secondaryFieldLabel').textContent = booking.secondaryField.label;
    els.bathrooms.innerHTML = booking.secondaryField.options.map(o =>
      `<option value="${o.value}" ${o.value === booking.secondaryField.defaultValue ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    document.getElementById('extrasGrid').innerHTML = booking.extras.map(e => `
      <label class="extra-card">
        <input type="checkbox" name="extras" value="${e.key}" data-price="${e.price}" data-label="${e.label}">
        <span class="extra-icon">${e.icon}</span>
        <span class="extra-name">${e.label}</span>
        <span class="extra-price">+${e.price}${cfg.business.currencySymbol}</span>
      </label>
    `).join('');

    document.getElementById('keyAccess').innerHTML = booking.keyAccessOptions
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    document.getElementById('bookingTime').innerHTML = booking.timeSlots
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    document.getElementById('urgencyPills').innerHTML = booking.urgencyOptions.map((u, i) => `
      <button type="button" class="pill${i === 0 ? ' active' : ''}" data-value="${u.value}" data-surcharge="${u.surcharge}">${u.label}${u.surcharge ? ` (+${u.surcharge}${cfg.business.currencySymbol})` : ''}</button>
    `).join('');
    state.urgency = booking.urgencyOptions[0].value;
    state.urgencySurcharge = booking.urgencyOptions[0].surcharge;
  }

  function bindPillGroups() {
    document.querySelectorAll('.pill-group').forEach(group => {
      const name = group.dataset.name;
      group.addEventListener('click', e => {
        const btn = e.target.closest('.pill');
        if (!btn) return;
        group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        if (name === 'propertyType') {
          state.propertyType = btn.dataset.value;
        } else if (name === 'urgency') {
          state.urgency = btn.dataset.value;
          state.urgencySurcharge = Number(btn.dataset.surcharge || 0);
        }
        updatePriceSummary();
      });
    });
  }

  function renderLegalContent(cfg) {
    const { business } = cfg;
    legalContent.terms.body = `<p>Al reservar un servicio con ${business.name} aceptas las siguientes condiciones:</p>
      <h4>1. Reservas y pagos</h4><p>El precio mostrado es una estimación basada en los datos proporcionados. El importe final se confirma tras la inspección inicial del equipo.</p>
      <h4>2. Cancelaciones</h4><p>Puedes cancelar o reprogramar gratuitamente hasta 24 horas antes de la cita. Cancelaciones posteriores pueden conllevar un cargo del 20%.</p>
      <h4>3. Garantía de re-limpieza</h4><p>Ofrecemos una re-limpieza gratuita dentro de las ${business.recleanWindowHours} horas si algún punto del checklist acordado no queda satisfactorio.</p>
      <h4>4. Acceso a la vivienda</h4><p>El cliente es responsable de proporcionar un método de acceso válido en la franja horaria reservada.</p>`;
    legalContent.privacy.body = `<p>Tus datos personales se utilizan únicamente para gestionar tu reserva y comunicarnos contigo sobre el servicio.</p>
      <h4>Datos que recopilamos</h4><p>Nombre, email, teléfono y dirección de la vivienda a limpiar.</p>
      <h4>Uso de los datos</h4><p>No compartimos tus datos con terceros salvo con el equipo asignado a tu servicio.</p>
      <h4>Tus derechos</h4><p>Puedes solicitar acceso, rectificación o eliminación de tus datos escribiendo a ${business.email}.</p>`;
  }

  /* ============ Live price calculation ============ */
  function calcPrice() {
    const { booking, business } = state.config;
    const sizeOption = booking.sizeField.options.find(o => o.value === els.bedrooms.value) || booking.sizeField.options[0];
    const secondaryValue = Number(els.bathrooms.value);
    const serviceType = booking.serviceTypes.find(t => t.value === state.propertyType) || booking.serviceTypes[0];

    let base = sizeOption.price + serviceType.surcharge;
    base += Math.max(0, secondaryValue - 1) * booking.secondaryField.pricePerUnitBeyondFirst;

    const extrasChecked = Array.from(document.querySelectorAll('input[name="extras"]:checked'));
    const extrasTotal = extrasChecked.reduce((sum, el) => sum + Number(el.dataset.price), 0);

    const subtotal = base + extrasTotal + state.urgencySurcharge;
    const discount = subtotal * state.promoDiscount;
    const total = Math.max(0, subtotal - discount);

    return { base, sizeOption, secondaryValue, serviceType, extrasChecked, extrasTotal, discount, total, currencySymbol: business.currencySymbol };
  }

  function updatePriceSummary() {
    const { base, sizeOption, secondaryValue, serviceType, extrasChecked, total, currencySymbol } = calcPrice();
    const secondaryOption = state.config.booking.secondaryField.options.find(o => Number(o.value) === secondaryValue);
    els.sumPropertyLabel.textContent = `${serviceType.label} · ${sizeOption.label} · ${secondaryOption ? secondaryOption.label : secondaryValue}`;
    els.sumBase.textContent = `${base}${currencySymbol}`;

    els.sumExtrasList.innerHTML = '';
    extrasChecked.forEach(el => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${el.dataset.label}</span><span>+${el.dataset.price}${currencySymbol}</span>`;
      els.sumExtrasList.appendChild(li);
    });

    if (state.urgencySurcharge > 0) {
      els.sumUrgencyLine.hidden = false;
      els.sumUrgency.textContent = `+${state.urgencySurcharge}${currencySymbol}`;
    } else {
      els.sumUrgencyLine.hidden = true;
    }

    els.sumTotal.textContent = `${total.toFixed(0)}${currencySymbol}`;
  }

  /* ============ Wizard navigation ============ */
  function showStep(n, scroll = true) {
    steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === n));
    dots.forEach(d => {
      const step = Number(d.dataset.step);
      d.classList.toggle('active', step === n);
      d.classList.toggle('completed', step < n);
    });
    btnBack.disabled = n === 1;
    if (n === steps.length) {
      btnNext.hidden = true;
      btnSubmit.hidden = false;
      buildReview();
    } else {
      btnNext.hidden = false;
      btnSubmit.hidden = true;
    }
    state.currentStep = n;
    if (scroll) document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validateStep(n) {
    const stepEl = steps.find(s => Number(s.dataset.step) === n);
    const requiredFields = Array.from(stepEl.querySelectorAll('[required]'));
    for (const field of requiredFields) {
      if (!field.value || (field.type === 'checkbox' && !field.checked)) {
        field.focus();
        showToast('Por favor completa los campos obligatorios (*)');
        return false;
      }
    }
    if (n === 4) {
      const email = document.getElementById('email').value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        document.getElementById('email').focus();
        showToast('Introduce un email válido');
        return false;
      }
      const phone = document.getElementById('phone').value;
      if (!/^[\d\s+()-]{6,}$/.test(phone)) {
        document.getElementById('phone').focus();
        showToast('Introduce un teléfono válido');
        return false;
      }
    }
    if (n === 3) {
      const dateVal = document.getElementById('bookingDate').value;
      if (!dateVal) {
        document.getElementById('bookingDate').focus();
        showToast('Selecciona una fecha para tu servicio');
        return false;
      }
      const chosen = new Date(dateVal + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (chosen < today) {
        showToast('La fecha no puede ser anterior a hoy');
        return false;
      }
    }
    return true;
  }

  /* ============ Review step ============ */
  function buildReview() {
    const { sizeOption, secondaryValue, serviceType, extrasChecked, total, discount, currencySymbol } = calcPrice();
    const secondaryOption = state.config.booking.secondaryField.options.find(o => Number(o.value) === secondaryValue);
    const extrasLabel = extrasChecked.length ? extrasChecked.map(el => el.dataset.label).join(', ') : 'Ninguno';
    const urgencyOption = state.config.booking.urgencyOptions.find(u => u.value === state.urgency);

    const dateVal = document.getElementById('bookingDate').value;
    const timeVal = document.getElementById('bookingTime').value;
    const dateFormatted = dateVal ? new Date(dateVal + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';

    const name = document.getElementById('fullName').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;
    const postcode = document.getElementById('postcode').value;

    document.getElementById('reviewBox').innerHTML = `
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="1">Editar</button>
        <h4>Vivienda</h4>
        <p>${serviceType.label} · ${sizeOption.label} · ${secondaryOption ? secondaryOption.label : ''}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="2">Editar</button>
        <h4>Extras</h4>
        <p>${extrasLabel}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="3">Editar</button>
        <h4>Fecha y hora</h4>
        <p>${dateFormatted} · franja ${timeVal} · urgencia: ${urgencyOption ? urgencyOption.label : state.urgency}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="4">Editar</button>
        <h4>Contacto</h4>
        <p>${name}<br>${email} · ${phone}<br>${address}, ${postcode}</p>
      </div>
      <div class="review-section">
        <h4>Total a pagar</h4>
        <p class="review-total-price">${total.toFixed(0)}${currencySymbol} ${discount > 0 ? `<span class="review-discount-tag">(descuento aplicado)</span>` : ''}</p>
      </div>
    `;

    document.querySelectorAll('.review-edit').forEach(btn => {
      btn.addEventListener('click', () => showStep(Number(btn.dataset.goto)));
    });
  }

  /* ============ Form submission — create booking, then redirect to Stripe ============ */
  function setSubmitting(isSubmitting) {
    btnSubmit.disabled = isSubmitting;
    btnSubmit.textContent = isSubmitting ? 'Redirigiendo a pago seguro…' : 'Confirmar y pagar →';
    btnBack.disabled = isSubmitting || state.currentStep === 1;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateStep(4)) return;

    const extras = Array.from(document.querySelectorAll('input[name="extras"]:checked')).map(el => el.value);
    const payload = {
      propertyType: state.propertyType,
      bedrooms: els.bedrooms.value,
      bathrooms: els.bathrooms.value,
      sqm: document.getElementById('sqm').value || null,
      furnished: document.getElementById('furnished').value,
      notesProperty: document.getElementById('notesProperty').value,
      extras,
      keyAccess: document.getElementById('keyAccess').value,
      bookingDate: document.getElementById('bookingDate').value,
      bookingTime: document.getElementById('bookingTime').value,
      urgency: state.urgency,
      fullName: document.getElementById('fullName').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      address: document.getElementById('address').value,
      postcode: document.getElementById('postcode').value,
      promoCode: els.promoCode.value || null,
    };

    setSubmitting(true);
    try {
      const bookingRes = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const bookingData = await bookingRes.json();
      if (!bookingRes.ok) throw new Error(bookingData.error || 'No se pudo crear la reserva');

      const sessionRes = await fetch('/api/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingData.bookingId }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error || 'No se pudo iniciar el pago');

      window.location.href = sessionData.url;
    } catch (err) {
      showToast(err.message || 'Ocurrió un error. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  });

  /* ============ Accordion (FAQ) ============ */
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      const panel = trigger.nextElementSibling;
      document.querySelectorAll('.accordion-trigger').forEach(t => {
        t.setAttribute('aria-expanded', 'false');
        t.nextElementSibling.style.maxHeight = null;
      });
      if (!expanded) {
        trigger.setAttribute('aria-expanded', 'true');
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });

  /* ============ Modals ============ */
  function openModal(id) {
    const modal = document.getElementById(id);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    document.getElementById(id).hidden = true;
    document.body.style.overflow = '';
  }
  document.getElementById('legalModalClose').addEventListener('click', () => closeModal('legalModal'));
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
  });

  const legalContent = {
    terms: { title: 'Términos y condiciones', body: '' },
    privacy: { title: 'Política de privacidad', body: '' },
  };
  document.querySelectorAll('[data-modal]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const key = link.dataset.modal;
      const content = legalContent[key];
      document.getElementById('legalTitle').textContent = content.title;
      document.getElementById('legalBody').innerHTML = content.body;
      openModal('legalModal');
    });
  });

  /* ============ Toast ============ */
  let toastTimeout;
  function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    clearTimeout(toastTimeout);
    requestAnimationFrame(() => toast.classList.add('show'));
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  /* ============ Mobile nav ============ */
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    mainNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }));

  /* ============ Back to top ============ */
  const backToTop = document.getElementById('backToTop');
  window.addEventListener('scroll', () => {
    backToTop.hidden = window.scrollY < 500;
  });
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ============ Init ============ */
  async function init() {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    state.config = cfg;

    applyTheme(cfg.theme);
    renderBranding(cfg);
    renderHero(cfg);
    renderTrustStrip(cfg);
    renderServices(cfg);
    renderChecklist(cfg);
    renderPricingTiers(cfg);
    renderBookingWizard(cfg);
    renderLegalContent(cfg);
    bindPillGroups();

    els.bedrooms.addEventListener('change', updatePriceSummary);
    els.bathrooms.addEventListener('change', updatePriceSummary);
    document.getElementById('extrasGrid').addEventListener('change', updatePriceSummary);
    els.promoCode.addEventListener('input', () => {
      const code = els.promoCode.value.trim().toUpperCase();
      state.promoDiscount = cfg.booking.promoCodes[code] || 0;
      updatePriceSummary();
    });

    const dateInput = document.getElementById('bookingDate');
    dateInput.min = new Date().toISOString().split('T')[0];

    btnNext.addEventListener('click', () => {
      if (!validateStep(state.currentStep)) return;
      if (state.currentStep < steps.length) showStep(state.currentStep + 1);
    });
    btnBack.addEventListener('click', () => {
      if (state.currentStep > 1) showStep(state.currentStep - 1);
    });

    updatePriceSummary();
    showStep(1, false);
  }

  init().catch(err => {
    console.error('No se pudo cargar la configuración del sitio:', err);
    showToast('No se pudo cargar el sitio. Recarga la página.');
  });
})();
