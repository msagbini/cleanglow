(() => {
  'use strict';

  /* ============ Pricing config ============ */
  const BASE_PRICE_BY_BEDROOMS = { '0': 89, '1': 99, '2': 129, '3': 169, '4': 199, '5': 249 };
  const BATHROOM_EXTRA = 15; // per bathroom beyond the first
  const PROPERTY_TYPE_LABEL = { apartment: 'Piso', house: 'Casa', studio: 'Estudio', office: 'Oficina' };
  const PROPERTY_TYPE_SURCHARGE = { apartment: 0, house: 20, studio: -10, office: 15 };
  const PROMO_CODES = { BIENVENIDO10: 0.10, LIMPIEZA5: 0.05 };

  const state = {
    propertyType: 'apartment',
    urgency: 'standard',
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

  /* ============ Pill groups (property type & urgency) ============ */
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
  // set default active pill
  document.querySelector('.pill-group[data-name="propertyType"] .pill[data-value="apartment"]').classList.add('active');

  /* ============ Live price calculation ============ */
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

  function calcPrice() {
    const bedrooms = els.bedrooms.value;
    const bathrooms = Number(els.bathrooms.value);
    let base = BASE_PRICE_BY_BEDROOMS[bedrooms] ?? 129;
    base += PROPERTY_TYPE_SURCHARGE[state.propertyType] ?? 0;
    base += Math.max(0, bathrooms - 1) * BATHROOM_EXTRA;

    const extrasChecked = Array.from(document.querySelectorAll('input[name="extras"]:checked'));
    const extrasTotal = extrasChecked.reduce((sum, el) => sum + Number(el.dataset.price), 0);

    let subtotal = base + extrasTotal + state.urgencySurcharge;
    const discount = subtotal * state.promoDiscount;
    const total = Math.max(0, subtotal - discount);

    return { base, bathrooms, bedrooms, extrasChecked, extrasTotal, discount, total };
  }

  function updatePriceSummary() {
    const { base, bedrooms, bathrooms, extrasChecked, total } = calcPrice();
    const bedroomLabel = bedrooms === '0' ? 'Estudio' : `${bedrooms} hab.`;
    els.sumPropertyLabel.textContent = `${PROPERTY_TYPE_LABEL[state.propertyType]} · ${bedroomLabel} · ${bathrooms} baño${bathrooms > 1 ? 's' : ''}`;
    els.sumBase.textContent = `${base}€`;

    els.sumExtrasList.innerHTML = '';
    extrasChecked.forEach(el => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${el.dataset.label}</span><span>+${el.dataset.price}€</span>`;
      els.sumExtrasList.appendChild(li);
    });

    if (state.urgencySurcharge > 0) {
      els.sumUrgencyLine.hidden = false;
      els.sumUrgency.textContent = `+${state.urgencySurcharge}€`;
    } else {
      els.sumUrgencyLine.hidden = true;
    }

    els.sumTotal.textContent = `${total.toFixed(0)}€`;
  }

  [els.bedrooms, els.bathrooms].forEach(el => el.addEventListener('change', updatePriceSummary));
  document.getElementById('extrasGrid').addEventListener('change', updatePriceSummary);

  els.promoCode.addEventListener('input', () => {
    const code = els.promoCode.value.trim().toUpperCase();
    state.promoDiscount = PROMO_CODES[code] || 0;
    updatePriceSummary();
  });

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
        showToast('Selecciona una fecha para tu limpieza');
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

  btnNext.addEventListener('click', () => {
    if (!validateStep(state.currentStep)) return;
    if (state.currentStep < steps.length) showStep(state.currentStep + 1);
  });

  btnBack.addEventListener('click', () => {
    if (state.currentStep > 1) showStep(state.currentStep - 1);
  });

  // set min date to today
  const dateInput = document.getElementById('bookingDate');
  const todayISO = new Date().toISOString().split('T')[0];
  dateInput.min = todayISO;

  /* ============ Review step ============ */
  function buildReview() {
    const { base, bedrooms, bathrooms, extrasChecked, total, discount } = calcPrice();
    const bedroomLabel = bedrooms === '0' ? 'Estudio' : `${bedrooms} habitaciones`;
    const extrasLabel = extrasChecked.length
      ? extrasChecked.map(el => el.dataset.label).join(', ')
      : 'Ninguno';
    const urgencyLabelMap = { standard: 'Estándar (48h+)', 'next-day': 'Mañana', 'same-day': 'Mismo día' };

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
        <p>${PROPERTY_TYPE_LABEL[state.propertyType]} · ${bedroomLabel} · ${bathrooms} baño${bathrooms > 1 ? 's' : ''}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="2">Editar</button>
        <h4>Extras</h4>
        <p>${extrasLabel}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="3">Editar</button>
        <h4>Fecha y hora</h4>
        <p>${dateFormatted} · franja ${timeVal} · urgencia: ${urgencyLabelMap[state.urgency]}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="4">Editar</button>
        <h4>Contacto</h4>
        <p>${name}<br>${email} · ${phone}<br>${address}, ${postcode}</p>
      </div>
      <div class="review-section">
        <h4>Total a pagar</h4>
        <p style="font-size:1.3rem;font-weight:800;color:var(--color-primary-dark)">${total.toFixed(0)}€ ${discount > 0 ? `<span style="font-size:.8rem;color:var(--color-success);font-weight:600">(descuento aplicado)</span>` : ''}</p>
      </div>
    `;

    document.querySelectorAll('.review-edit').forEach(btn => {
      btn.addEventListener('click', () => showStep(Number(btn.dataset.goto)));
    });
  }

  /* ============ Form submission ============ */
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateStep(4)) return;

    const { total } = calcPrice();
    const email = document.getElementById('email').value;
    const ref = 'SE-' + Math.random().toString(36).slice(2, 8).toUpperCase();

    document.getElementById('confirmEmail').textContent = email;
    document.getElementById('confirmRef').textContent = ref;
    document.getElementById('modalSummary').innerHTML = `
      <strong>${PROPERTY_TYPE_LABEL[state.propertyType]}</strong> · ${document.getElementById('bookingDate').value} · Total: <strong>${total.toFixed(0)}€</strong>
    `;
    openModal('confirmModal');

    // In a real app this would POST to a backend endpoint here.
    form.reset();
    showStep(1);
    updatePriceSummary();
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
  document.getElementById('modalClose').addEventListener('click', () => closeModal('confirmModal'));
  document.getElementById('modalDoneBtn').addEventListener('click', () => closeModal('confirmModal'));
  document.getElementById('legalModalClose').addEventListener('click', () => closeModal('legalModal'));
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
  });

  const legalContent = {
    terms: {
      title: 'Términos y condiciones',
      body: `<p>Al reservar un servicio con SpotlessExit aceptas las siguientes condiciones:</p>
        <h4>1. Reservas y pagos</h4><p>El precio mostrado es una estimación basada en los datos proporcionados. El importe final se confirma tras la inspección inicial del equipo.</p>
        <h4>2. Cancelaciones</h4><p>Puedes cancelar o reprogramar gratuitamente hasta 24 horas antes de la cita. Cancelaciones posteriores pueden conllevar un cargo del 20%.</p>
        <h4>3. Garantía de re-limpieza</h4><p>Ofrecemos una re-limpieza gratuita dentro de las 72 horas si algún punto del checklist acordado no queda satisfactorio.</p>
        <h4>4. Acceso a la vivienda</h4><p>El cliente es responsable de proporcionar un método de acceso válido en la franja horaria reservada.</p>`
    },
    privacy: {
      title: 'Política de privacidad',
      body: `<p>Tus datos personales se utilizan únicamente para gestionar tu reserva y comunicarnos contigo sobre el servicio.</p>
        <h4>Datos que recopilamos</h4><p>Nombre, email, teléfono y dirección de la vivienda a limpiar.</p>
        <h4>Uso de los datos</h4><p>No compartimos tus datos con terceros salvo con el equipo de limpieza asignado a tu servicio.</p>
        <h4>Tus derechos</h4><p>Puedes solicitar acceso, rectificación o eliminación de tus datos escribiendo a hola@spotlessexit.com.</p>`
    }
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
  updatePriceSummary();
  showStep(1, false);
})();
