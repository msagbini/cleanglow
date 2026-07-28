(() => {
  'use strict';

  const state = {
    config: null,
    propertyType: null,
    urgency: null,
    urgencySurcharge: 0,
    frequency: 'once',
    currentStep: 1,
    promoDiscount: 0,
    photos: [],
  };
  const MAX_PHOTOS = 8;

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

  function setLogoMark(el, business) {
    if (!el) return;
    if (business.logoUrl) {
      el.textContent = '';
      const img = document.createElement('img');
      img.src = business.logoUrl;
      img.alt = `${business.name} logo`;
      el.appendChild(img);
    } else {
      el.textContent = business.logoEmoji;
    }
  }

  function renderBranding(cfg) {
    const { business } = cfg;
    document.title = `${business.name} | Book your service online`;

    setLogoMark(document.getElementById('logoMark'), business);
    document.getElementById('logoText').textContent = business.name;
    setLogoMark(document.getElementById('footerLogoMark'), business);
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
    const abnSuffix = business.abn ? ` · ABN ${business.abn}` : '';
    document.getElementById('footerCopyright').textContent = `© ${new Date().getFullYear()} ${business.name}. All rights reserved.${abnSuffix}`;
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

    document.getElementById('heroTrust').innerHTML = business.heroTrust
      .map(item => `<li>${item}</li>`).join('');

    const heroFootnote = document.getElementById('heroGuaranteeFootnote');
    if (heroFootnote && business.guaranteeFootnote) {
      heroFootnote.innerHTML = `${business.guaranteeFootnote} <a href="#" data-modal="terms">Guarantee Terms</a>`;
    }

    const sampleSize = booking.sizeField.options[Math.min(2, booking.sizeField.options.length - 1)];
    const sampleExtras = booking.extras.slice(0, 2);
    const sampleType = booking.serviceTypes[0];
    const total = sampleSize.price + sampleType.surcharge + sampleExtras.reduce((s, e) => s + e.price, 0);
    document.getElementById('heroCardRows').innerHTML = `
      <div class="hero-card-row"><span>${sampleType.icon} ${sampleType.label} ${sampleSize.label}</span><span>from ${business.currencySymbol}${sampleSize.price}</span></div>
      ${sampleExtras.map(e => `<div class="hero-card-row"><span>${e.icon} ${e.label}</span><span>+ ${business.currencySymbol}${e.price}</span></div>`).join('')}
      <div class="hero-card-row hero-card-total"><span>Estimated total</span><span>${business.currencySymbol}${total}</span></div>
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
    const disclaimer = checklist.guarantee.disclaimer
      ? `<p class="guarantee-disclaimer">${checklist.guarantee.disclaimer} <a href="#" data-modal="terms">Guarantee Terms</a></p>`
      : '';
    document.getElementById('guaranteeCard').innerHTML = `
      <h3>${checklist.guarantee.title}</h3>
      <p>${checklist.guarantee.description}</p>
      <ul>${checklist.guarantee.points.map(p => `<li>✅ ${p}</li>`).join('')}</ul>
      ${disclaimer}
    `;
  }

  function renderPricingTiers(cfg) {
    document.getElementById('pricingGrid').innerHTML = cfg.pricingTiers.map(tier => `
      <div class="price-card ${tier.featured ? 'featured' : ''}">
        ${tier.featured ? '<span class="price-tag">Most booked</span>' : ''}
        <h3>${tier.label}</h3>
        <p class="price">from ${cfg.business.currencySymbol}${tier.priceFrom}</p>
        <ul>${tier.features.map(f => `<li>${f}</li>`).join('')}</ul>
      </div>
    `).join('');
  }

  function renderBookingWizard(cfg) {
    const { booking } = cfg;

    document.getElementById('frequencyPills').innerHTML = (booking.frequencyOptions || []).map((f, i) => `
      <button type="button" class="pill${i === 0 ? ' active' : ''}" data-value="${f.value}">${f.label}${f.discount ? ` (save ${Math.round(f.discount * 100)}%)` : ''}</button>
    `).join('');
    state.frequency = booking.frequencyOptions?.[0]?.value || 'once';

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
        <span class="extra-price">+${cfg.business.currencySymbol}${e.price}</span>
      </label>
    `).join('');

    document.getElementById('keyAccess').innerHTML = booking.keyAccessOptions
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    document.getElementById('bookingTime').innerHTML = booking.timeSlots
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    document.getElementById('urgencyPills').innerHTML = booking.urgencyOptions.map((u, i) => `
      <button type="button" class="pill${i === 0 ? ' active' : ''}" data-value="${u.value}" data-surcharge="${u.surcharge}">${u.label}${u.surcharge ? ` (+${cfg.business.currencySymbol}${u.surcharge})` : ''}</button>
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
        } else if (name === 'frequency') {
          state.frequency = btn.dataset.value;
        }
        updatePriceSummary();
      });
    });
  }

  function renderLegalContent(cfg) {
    const { business } = cfg;
    legalContent.terms.body = `<p>By booking a service with ${business.name} you agree to the following terms:</p>
      <h4>1. Bookings and payment</h4><p>The price shown is an estimate based on the details you provide. The final amount is confirmed after the team's initial inspection.</p>
      <h4>2. Cancellations</h4><p>You can cancel or reschedule for free up to 24 hours before your appointment. Later cancellations may incur a 20% fee.</p>
      <h4>3. Bond-Back & Re-clean Guarantee</h4>
      <p><strong>What we guarantee:</strong> if your property manager or landlord flags an item from your <em>agreed checklist</em> that wasn't completed to a professional standard, we will re-clean that item at no charge — as many times as it takes to meet the standard — provided:</p>
      <ul>
        <li>it is reported to us in writing (email, or a note on your property condition/exit report) within ${business.recleanWindowHours} hours of the clean; and</li>
        <li>you or your property manager give our team reasonable access to carry out the re-clean.</li>
      </ul>
      <p><strong>What "100% bond-back guarantee" means — and doesn't mean:</strong> it describes our commitment to re-clean checklist items until they meet a professional standard. It is <strong>not</strong> a guarantee of the bond amount itself. Whether your bond is returned in full is a decision made by your landlord, property manager, or (if disputed) the relevant tenancy authority, based on factors outside our control — for example property damage, unpaid rent, garden/lawn condition, or missing items.</p>
      <p><strong>What isn't covered:</strong> pre-existing damage, fair wear and tear, mould, odours or staining caused by conditions that existed before our service, items outside the checklist agreed at booking, and re-clean requests made after the ${business.recleanWindowHours}-hour reporting window or where access wasn't provided.</p>
      <h4>4. Property access</h4><p>The customer is responsible for providing a valid access method for the booked time slot, and for the re-clean visit described above if one is requested.</p>`;
    legalContent.privacy.body = `<p>Your personal data is used only to manage your booking and communicate with you about the service.</p>
      <h4>Data we collect</h4><p>Name, email, phone number and the address of the property to be cleaned.</p>
      <h4>How we use it</h4><p>We don't share your data with third parties other than the team assigned to your service.</p>
      <h4>Your rights</h4><p>You can request access to, correction of, or deletion of your data by emailing ${business.email}.</p>`;
  }

  /* ============ GST (mirrors server/config.js's computeGstComponentCents) ============ */
  function computeGstComponent(totalDollars) {
    const { business } = state.config;
    if (!business.gstRegistered) return 0;
    const rate = business.gstRate ?? 0.1;
    return totalDollars - totalDollars / (1 + rate);
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
    const afterPromo = Math.max(0, subtotal - discount);

    const frequencyOption = booking.frequencyOptions?.find(f => f.value === state.frequency) || { value: 'once', discount: 0 };
    const total = afterPromo * (1 - (frequencyOption.discount || 0));

    return { base, sizeOption, secondaryValue, serviceType, extrasChecked, extrasTotal, discount, total, frequencyOption, currencySymbol: business.currencySymbol };
  }

  function updatePriceSummary() {
    const { base, sizeOption, secondaryValue, serviceType, extrasChecked, total, frequencyOption, currencySymbol } = calcPrice();
    const secondaryOption = state.config.booking.secondaryField.options.find(o => Number(o.value) === secondaryValue);
    els.sumPropertyLabel.textContent = `${serviceType.label} · ${sizeOption.label} · ${secondaryOption ? secondaryOption.label : secondaryValue}`;
    els.sumBase.textContent = `${currencySymbol}${base}`;

    els.sumExtrasList.innerHTML = '';
    extrasChecked.forEach(el => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${el.dataset.label}</span><span>+${currencySymbol}${el.dataset.price}</span>`;
      els.sumExtrasList.appendChild(li);
    });

    if (state.urgencySurcharge > 0) {
      els.sumUrgencyLine.hidden = false;
      els.sumUrgency.textContent = `+${currencySymbol}${state.urgencySurcharge}`;
    } else {
      els.sumUrgencyLine.hidden = true;
    }

    const sumFrequencyLine = document.getElementById('sumFrequencyLine');
    const isRecurring = frequencyOption.value !== 'once' && frequencyOption.discount > 0;
    if (isRecurring) {
      sumFrequencyLine.hidden = false;
      document.getElementById('sumFrequencyDiscount').textContent = `−${Math.round(frequencyOption.discount * 100)}%`;
    } else {
      sumFrequencyLine.hidden = true;
    }
    document.getElementById('sumTotalLabel').textContent = isRecurring ? `Total per visit (${frequencyOption.label.toLowerCase()})` : 'Estimated total';

    els.sumTotal.textContent = `${currencySymbol}${total.toFixed(0)}`;

    const gst = computeGstComponent(total);
    const taxNote = document.getElementById('sumTaxNote');
    taxNote.textContent = gst > 0
      ? `Price includes ${currencySymbol}${gst.toFixed(2)} GST. Final price confirmed after reviewing your property notes.`
      : 'Final price confirmed after reviewing your property notes.';
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
        showToast('Please fill in the required fields (*)');
        return false;
      }
    }
    if (n === 4) {
      const email = document.getElementById('email').value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        document.getElementById('email').focus();
        showToast('Enter a valid email address');
        return false;
      }
      const phone = document.getElementById('phone').value;
      if (!/^[\d\s+()-]{6,}$/.test(phone)) {
        document.getElementById('phone').focus();
        showToast('Enter a valid phone number');
        return false;
      }
    }
    if (n === 3) {
      const dateVal = document.getElementById('bookingDate').value;
      if (!dateVal) {
        document.getElementById('bookingDate').focus();
        showToast('Select a date for your service');
        return false;
      }
      const chosen = new Date(dateVal + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (chosen < today) {
        showToast('The date can\'t be in the past');
        return false;
      }
      const timeSelect = document.getElementById('bookingTime');
      const selectedOption = timeSelect.options[timeSelect.selectedIndex];
      if (selectedOption && selectedOption.disabled) {
        showToast('That time slot is fully booked — please choose another one');
        return false;
      }
    }
    return true;
  }

  /* ============ Availability — disable fully-booked time slots ============ */
  async function refreshTimeSlotAvailability() {
    const dateVal = document.getElementById('bookingDate').value;
    const timeSelect = document.getElementById('bookingTime');
    if (!dateVal) return;

    try {
      const res = await fetch(`/api/bookings/availability?date=${encodeURIComponent(dateVal)}`);
      if (!res.ok) return;
      const data = await res.json();
      const previousValue = timeSelect.value;
      let previousStillAvailable = true;

      Array.from(timeSelect.options).forEach(option => {
        const slot = data.slots.find(s => s.value === option.value);
        if (!slot) return;
        option.disabled = !slot.available;
        option.textContent = slot.available ? slot.label : `${slot.label} — Fully booked`;
        if (option.value === previousValue && !slot.available) previousStillAvailable = false;
      });

      if (!previousStillAvailable) {
        const firstAvailable = Array.from(timeSelect.options).find(o => !o.disabled);
        timeSelect.value = firstAvailable ? firstAvailable.value : previousValue;
        showToast('Your selected time slot is now fully booked — we picked the next available one');
      }
    } catch {
      // Non-critical: the server still enforces this at submission time either way.
    }
  }

  /* ============ Review step ============ */
  function buildReview() {
    const { sizeOption, secondaryValue, serviceType, extrasChecked, total, discount, frequencyOption, currencySymbol } = calcPrice();
    const secondaryOption = state.config.booking.secondaryField.options.find(o => Number(o.value) === secondaryValue);
    const extrasLabel = extrasChecked.length ? extrasChecked.map(el => el.dataset.label).join(', ') : 'None';
    const urgencyOption = state.config.booking.urgencyOptions.find(u => u.value === state.urgency);
    const isRecurring = frequencyOption.value !== 'once';

    const dateVal = document.getElementById('bookingDate').value;
    const timeVal = document.getElementById('bookingTime').value;
    const dateFormatted = dateVal ? new Date(dateVal + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';

    const name = document.getElementById('fullName').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;
    const postcode = document.getElementById('postcode').value;

    document.getElementById('reviewBox').innerHTML = `
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="1">Edit</button>
        <h4>Property</h4>
        <p>${serviceType.label} · ${sizeOption.label} · ${secondaryOption ? secondaryOption.label : ''}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="2">Edit</button>
        <h4>Extras</h4>
        <p>${extrasLabel}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="3">Edit</button>
        <h4>Date & time</h4>
        <p>${dateFormatted} · ${timeVal} slot · urgency: ${urgencyOption ? urgencyOption.label : state.urgency}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="4">Edit</button>
        <h4>Contact details</h4>
        <p>${name}<br>${email} · ${phone}<br>${address}, ${postcode}</p>
      </div>
      <div class="review-section">
        <h4>Cleaning frequency</h4>
        <p>${frequencyOption.label}${isRecurring ? ' — billed automatically, cancel anytime' : ''}</p>
      </div>
      <div class="review-section">
        <h4>${isRecurring ? 'Total per visit' : 'Total to pay'}</h4>
        <p class="review-total-price">${currencySymbol}${total.toFixed(0)}${isRecurring ? ` <span class="review-discount-tag">/ ${frequencyOption.label.toLowerCase()}</span>` : ''} ${discount > 0 ? `<span class="review-discount-tag">(discount applied)</span>` : ''}</p>
        ${computeGstComponent(total) > 0 ? `<p class="review-gst-note">Includes ${currencySymbol}${computeGstComponent(total).toFixed(2)} GST</p>` : ''}
      </div>
    `;

    document.querySelectorAll('.review-edit').forEach(btn => {
      btn.addEventListener('click', () => showStep(Number(btn.dataset.goto)));
    });
  }

  /* ============ Form submission — create booking, then redirect to Stripe ============ */
  function setSubmitting(isSubmitting) {
    btnSubmit.disabled = isSubmitting;
    btnSubmit.textContent = isSubmitting ? 'Redirecting to secure payment…' : 'Confirm and pay →';
    btnBack.disabled = isSubmitting || state.currentStep === 1;
  }

  /* ============ Property condition photos ============ */
  const photoInput = document.getElementById('propertyPhotos');
  const photoPreviewGrid = document.getElementById('photoPreviewGrid');

  function renderPhotoPreviews() {
    photoPreviewGrid.innerHTML = '';
    state.photos.forEach((file, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'photo-thumb';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'photo-remove';
      removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        state.photos.splice(index, 1);
        renderPhotoPreviews();
      });
      thumb.append(img, removeBtn);
      photoPreviewGrid.appendChild(thumb);
    });
  }

  if (photoInput) {
    photoInput.addEventListener('change', () => {
      const incoming = Array.from(photoInput.files || []);
      const room = MAX_PHOTOS - state.photos.length;
      if (incoming.length > room) {
        showToast(`You can upload up to ${MAX_PHOTOS} photos. Only the first ${room} were added.`);
      }
      state.photos.push(...incoming.slice(0, Math.max(room, 0)));
      photoInput.value = '';
      renderPhotoPreviews();
    });
  }

  async function uploadPropertyPhotos(bookingId) {
    if (!state.photos.length) return;
    const formData = new FormData();
    state.photos.forEach(file => formData.append('photos', file));
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/photos`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        console.warn('Photo upload failed, continuing without photos');
      }
    } catch {
      console.warn('Photo upload failed, continuing without photos');
    }
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
      frequency: state.frequency,
    };

    setSubmitting(true);
    try {
      const bookingRes = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const bookingData = await bookingRes.json();
      if (!bookingRes.ok) throw new Error(bookingData.error || 'Could not create the booking');

      await uploadPropertyPhotos(bookingData.bookingId);

      const sessionRes = await fetch('/api/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingData.bookingId }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error || 'Could not start the payment');

      window.location.href = sessionData.url;
    } catch (err) {
      showToast(err.message || 'Something went wrong. Please try again.');
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
    terms: { title: 'Terms & Conditions', body: '' },
    privacy: { title: 'Privacy Policy', body: '' },
  };
  // Delegated on document (rather than bound per-element at load) because some
  // [data-modal] links — e.g. the guarantee footnotes — are injected later,
  // once /api/config has loaded.
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-modal]');
    if (!link) return;
    e.preventDefault();
    const key = link.dataset.modal;
    const content = legalContent[key];
    document.getElementById('legalTitle').textContent = content.title;
    document.getElementById('legalBody').innerHTML = content.body;
    openModal('legalModal');
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
    dateInput.addEventListener('change', refreshTimeSlotAvailability);

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
    console.error('Could not load the site configuration:', err);
    showToast('Could not load the site. Please refresh the page.');
  });
})();
