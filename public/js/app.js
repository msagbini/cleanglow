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

  // Small, consistent line-icon set (brand-colored, in a soft circular chip
  // via CSS) used in place of raw emoji in a few high-visibility spots —
  // emoji render inconsistently across OS/browser and read as less
  // professional than a matched icon set. Keyed by name, referenced from
  // config/business.json instead of an emoji character; falls back to
  // whatever raw value config provides if the key isn't recognized, so an
  // unmapped icon never breaks rendering.
  const ICONS = {
    sparkle: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 15l.6 1.7L21.3 17l-1.7.6L19 19.3l-.6-1.7L16.7 17l1.7-.6L19 15Z"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c4 0 6-2.5 6-6 0-3-2-4.5-3-6.5-.5 1.5-1 2-1.8 1-1-1.3-.7-3.3.3-5-3 1-6 4.5-6 8.5 0 4.5 2 8 4.5 8Z"/></svg>',
    rug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" rx="2"/><rect x="7" y="8" width="10" height="8" rx="1"/></svg>',
    window: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
    roller: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="11" height="6" rx="1.5"/><line x1="10" y1="10" x2="10" y2="16"/><line x1="10" y1="16" x2="15" y2="16"/><line x1="15" y1="16" x2="15" y2="21"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3Z"/></svg>',
    badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a8 8 0 0 1 14-5l2-2"/><path d="M20 2v5h-5"/><path d="M20 15a8 8 0 0 1-14 5l-2 2"/><path d="M4 22v-5h5"/></svg>',
  };

  // "168 hours" reads oddly next to marketing copy that says "7 days" —
  // shows whole-day windows as days, anything smaller as hours.
  function formatWindow(hours) {
    if (hours >= 24 && hours % 24 === 0) {
      const days = hours / 24;
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    return `${hours} hours`;
  }

  function getOrdinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

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
    const headerCallIcon = document.getElementById('headerCallIcon');
    if (headerCallIcon) headerCallIcon.href = telHref;
    const footerPhone = document.getElementById('footerPhoneLink');
    footerPhone.href = telHref;
    footerPhone.textContent = `📞 ${business.phoneDisplay}`;

    const whatsappNumber = business.phone.replace(/\D/g, '');
    const whatsappFloat = document.getElementById('whatsappFloat');
    if (whatsappFloat) {
      whatsappFloat.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi ${business.name}, I'd like to ask about a booking.`)}`;
    }

    const mailHref = `mailto:${business.email}`;
    const footerEmail = document.getElementById('footerEmailLink');
    footerEmail.href = mailHref;
    footerEmail.textContent = `✉️ ${business.email}`;

    document.getElementById('footerHours').textContent = `🕐 ${business.hours}`;
    document.getElementById('footerDescription').textContent = business.footerDescription;
    const abnSuffix = business.abn ? ` · ABN ${business.abn}` : '';
    document.getElementById('footerCopyright').textContent = `© ${new Date().getFullYear()} ${business.name}. All rights reserved.${abnSuffix}`;
    document.getElementById('recleanWindowHours').textContent = formatWindow(business.recleanWindowHours);
    document.getElementById('faqRecleanWindowHours').textContent = formatWindow(business.recleanWindowHours);

    const areasCol = document.getElementById('footerServiceAreas');
    business.serviceAreas.forEach(area => {
      const a = document.createElement('a');
      a.href = '#booking';
      a.textContent = area;
      areasCol.appendChild(a);
    });

    const socialWrap = document.getElementById('footerSocial');
    const socialIcons = {
      instagram: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>',
      facebook: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M14.5 9H17V6h-2.5C12.6 6 11 7.6 11 9.9V12H9v3h2v6h3v-6h2.4l.6-3H14v-1.7c0-.7.3-1.3 1.5-1.3Z"/></svg>',
      linkedin: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5.3" cy="5.3" r="2" /><path d="M3.7 9.5h3.2V20H3.7Zm6.2 0h3v1.5h.1c.4-.8 1.5-1.7 3.1-1.7 3.3 0 4 2.2 4 5V20h-3.2v-4.9c0-1.2 0-2.7-1.7-2.7-1.6 0-1.9 1.3-1.9 2.6V20H9.9Z"/></svg>',
    };
    Object.entries(business.social).forEach(([key, url]) => {
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('aria-label', key);
      a.innerHTML = socialIcons[key] || key.slice(0, 2).toUpperCase();
      socialWrap.appendChild(a);
    });
  }

  function renderHero(cfg) {
    const { business, booking } = cfg;
    document.getElementById('heroBadge').textContent = business.badgeText;
    document.getElementById('heroTitle').innerHTML = business.heroTitleHtml;
    document.getElementById('heroDescription').textContent = business.heroDescription;

    document.getElementById('heroTrust').innerHTML = business.heroTrust
      .map(item => `<li>${ICONS[item.icon] || ''}<span>${item.text}</span></li>`).join('');

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
        <div class="service-icon">${ICONS[s.icon] || s.icon}</div>
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
      <h3>${ICONS.shield}<span>${checklist.guarantee.title}</span></h3>
      <p>${checklist.guarantee.description}</p>
      <ul>${checklist.guarantee.points.map(p => `<li>${ICONS.badge}<span>${p}</span></li>`).join('')}</ul>
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
        ${tier.presetBedrooms ? `<button type="button" class="btn btn-primary btn-sm price-card-select" data-preset-bedrooms="${tier.presetBedrooms}">Book this size</button>` : ''}
      </div>
    `).join('');
  }

  // Jumping in from a pricing card should land the customer on a wizard
  // that's already set up for the size they picked, not an empty form they
  // have to fill in again from scratch.
  document.getElementById('pricingGrid').addEventListener('click', e => {
    const btn = e.target.closest('.price-card-select');
    if (!btn) return;
    els.bedrooms.value = btn.dataset.presetBedrooms;
    updatePriceSummary();
    const wrap = document.querySelector('.booking-wrap');
    document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (wrap) {
      setTimeout(() => {
        wrap.classList.remove('booking-arrival-highlight');
        void wrap.offsetWidth;
        wrap.classList.add('booking-arrival-highlight');
      }, 650);
    }
  });

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

    renderSizeField(booking.serviceTypes[0]);

    document.getElementById('secondaryFieldLabel').textContent = booking.secondaryField.label;
    els.bathrooms.innerHTML = booking.secondaryField.options.map(o =>
      `<option value="${o.value}" ${o.value === booking.secondaryField.defaultValue ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    document.getElementById('extrasGrid').innerHTML = booking.extras.map(e => e.perUnit ? `
      <div class="extra-card extra-card-unit">
        <span class="extra-icon">${e.icon}</span>
        <span class="extra-name">${e.label}</span>
        <span class="extra-price">${cfg.business.currencySymbol}${e.price} per ${e.unitLabel || 'unit'}</span>
        <div class="extra-qty">
          <button type="button" class="extra-qty-btn" data-qty-delta="-1" data-qty-for="${e.key}" aria-label="Fewer ${e.label}">−</button>
          <input type="number" name="extras" min="0" max="${e.maxQuantity ?? 12}" step="1" value="0"
                 data-key="${e.key}" data-price="${e.price}" data-label="${e.label}" id="extraQty_${e.key}">
          <button type="button" class="extra-qty-btn" data-qty-delta="1" data-qty-for="${e.key}" aria-label="More ${e.label}">+</button>
        </div>
      </div>
    ` : `
      <label class="extra-card">
        <input type="checkbox" name="extras" value="${e.key}" data-price="${e.price}" data-label="${e.label}">
        <span class="extra-icon">${e.icon}</span>
        <span class="extra-name">${e.label}</span>
        <span class="extra-price">+${cfg.business.currencySymbol}${e.price}</span>
      </label>
    `).join('');

    document.getElementById('keyAccess').innerHTML = booking.keyAccessOptions
      .map(o => `<option value="${o.value}">${o.label}${o.surcharge ? ` (+${cfg.business.currencySymbol}${o.surcharge})` : ''}</option>`).join('');

    document.getElementById('bookingTime').innerHTML = booking.timeSlots
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    state.urgency = booking.urgencyOptions[0].value;
    state.urgencySurcharge = booking.urgencyOptions[0].surcharge;
  }

  // "Bedrooms" doesn't make sense for an office — swap the field label and
  // option wording (e.g. "2 Bedrooms" -> "2 rooms") based on the selected
  // property type, keeping the same underlying price tiers.
  function renderSizeField(serviceType) {
    const { booking } = state.config;
    document.getElementById('sizeFieldLabel').textContent = serviceType.sizeFieldLabel || booking.sizeField.label;
    const overrides = serviceType.sizeFieldOptionLabels;
    const previousValue = els.bedrooms.value;
    els.bedrooms.innerHTML = booking.sizeField.options.map((o, i) =>
      `<option value="${o.value}">${overrides?.[i] ?? o.label}</option>`
    ).join('');
    els.bedrooms.value = previousValue || booking.sizeField.defaultValue;
  }

  // Mirrors server/config.js's deriveUrgencyForDate — urgency is never a free
  // choice, it's determined by how much notice the chosen date actually
  // gives us, so "Standard (48h+)" can't be paired with a same-day date to
  // dodge the surcharge (the server enforces this independently either way).
  function deriveUrgencyForDate(dateStr) {
    const options = state.config.booking.urgencyOptions;
    if (!dateStr) return options[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const chosen = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(chosen.getTime())) return options[0];
    const daysAhead = Math.round((chosen - today) / 86400000);
    const sorted = [...options].sort((a, b) => (b.minDaysAhead ?? 0) - (a.minDaysAhead ?? 0));
    return sorted.find(u => daysAhead >= (u.minDaysAhead ?? 0)) ?? sorted[sorted.length - 1];
  }

  function updateUrgencyBadge() {
    const dateVal = document.getElementById('bookingDate').value;
    const option = deriveUrgencyForDate(dateVal);
    state.urgency = option.value;
    state.urgencySurcharge = option.surcharge;
    const badge = document.getElementById('urgencyBadge');
    if (badge) {
      const symbol = state.config.business.currencySymbol;
      badge.textContent = dateVal
        ? (option.surcharge > 0
            ? `${option.label} — +${symbol}${option.surcharge} surcharge applies for this date`
            : `${option.label} — no extra charge`)
        : 'Pick a date to see if a speed surcharge applies';
    }
    updatePriceSummary();
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
          const serviceType = state.config.booking.serviceTypes.find(t => t.value === btn.dataset.value);
          if (serviceType) renderSizeField(serviceType);
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
        <li>it is reported to us in writing (email, or a note on your property condition/exit report) within ${formatWindow(business.recleanWindowHours)} of the clean; and</li>
        <li>you or your property manager give our team reasonable access to carry out the re-clean.</li>
      </ul>
      <p><strong>What "100% bond-back guarantee" means — and doesn't mean:</strong> it describes our commitment to re-clean checklist items until they meet a professional standard. It is <strong>not</strong> a guarantee of the bond amount itself. Whether your bond is returned in full is a decision made by your landlord, property manager, or (if disputed) the relevant tenancy authority, based on factors outside our control — for example property damage, unpaid rent, garden/lawn condition, or missing items.</p>
      <p><strong>What isn't covered:</strong> pre-existing damage, fair wear and tear, mould, odours or staining caused by conditions that existed before our service, items outside the checklist agreed at booking, and re-clean requests made after the ${formatWindow(business.recleanWindowHours)} reporting window or where access wasn't provided.</p>
      <h4>4. Property access</h4><p>The customer is responsible for providing a valid access method for the booked time slot, and for the re-clean visit described above if one is requested.</p>
      <h4>5. Recurring plans and early cancellation</h4><p>Weekly, fortnightly and monthly plans are billed automatically at a discounted rate that reflects the ongoing, repeat nature of the service. If a recurring plan is cancelled before the minimum of ${state.config.booking.earlyCancellationMinCycles ?? 3} cleans has been completed, a one-off early-cancellation fee equal to one visit at the discounted rate applies, charged to the card on file, to recover the discount given on the assumption of ongoing business. This fee does not apply once the minimum number of cleans has been completed — the plan can then be cancelled at any time with no fee.</p>`;
    legalContent.privacy.body = `<p>Your personal data is used only to manage your booking and communicate with you about the service.</p>
      <h4>Data we collect</h4><p>Name, email, phone number and the address of the property to be cleaned.</p>
      <h4>How we use it</h4><p>We don't share your data with third parties other than the team assigned to your service.</p>
      <h4>Your rights</h4><p>You can request access to, correction of, or deletion of your data by emailing ${business.email}.</p>`;
    legalContent.cookies.body = `<p>This site doesn't use tracking, advertising or analytics cookies.</p>
      <h4>What we do use</h4><p>Only what's strictly needed to run the booking form itself while you have it open — no data is stored in your browser between visits.</p>
      <h4>Stripe</h4><p>When you reach the payment screen, our payment processor Stripe may set its own cookies there for fraud prevention. That happens on Stripe's own site, under their <a href="https://stripe.com/privacy" target="_blank" rel="noopener">privacy policy</a>, not ours.</p>`;
  }

  /* ============ GST (mirrors server/config.js's computeGstComponentCents) ============ */
  function computeGstComponent(totalDollars) {
    const { business } = state.config;
    if (!business.gstRegistered) return 0;
    const rate = business.gstRate ?? 0.1;
    return totalDollars - totalDollars / (1 + rate);
  }

  // Mirrors server/config.js's sizeField.options -> sizeFieldOptionLabels
  // override, so "Bedrooms" doesn't show up for an office anywhere on screen.
  function sizeOptionDisplayLabel(serviceType, sizeOption) {
    const { booking } = state.config;
    const idx = booking.sizeField.options.findIndex(o => o.value === sizeOption.value);
    return serviceType.sizeFieldOptionLabels?.[idx] ?? sizeOption.label;
  }

  function getExtraLines() {
    const checkboxLines = Array.from(document.querySelectorAll('input[name="extras"][type="checkbox"]:checked'))
      .map(el => ({ key: el.value, label: el.dataset.label, price: Number(el.dataset.price), quantity: 1, lineTotal: Number(el.dataset.price) }));
    const quantityLines = Array.from(document.querySelectorAll('input[name="extras"][type="number"]'))
      .filter(el => Number(el.value) > 0)
      .map(el => ({
        key: el.dataset.key, label: el.dataset.label, price: Number(el.dataset.price), quantity: Number(el.value),
        lineTotal: Number(el.dataset.price) * Number(el.value),
      }));
    return [...checkboxLines, ...quantityLines];
  }

  /* ============ Live price calculation (mirrors server/config.js's computeAmountCents) ============ */
  function calcPrice() {
    const { booking, business } = state.config;
    const sizeOption = booking.sizeField.options.find(o => o.value === els.bedrooms.value) || booking.sizeField.options[0];
    const secondaryValue = Number(els.bathrooms.value);
    const serviceType = booking.serviceTypes.find(t => t.value === state.propertyType) || booking.serviceTypes[0];

    let base = sizeOption.price + serviceType.surcharge;
    base += Math.max(0, secondaryValue - 1) * booking.secondaryField.pricePerUnitBeyondFirst;

    const sqm = Number(document.getElementById('sqm').value) || 0;
    const oversizeSqm = Math.max(0, sqm - (sizeOption.typicalSqm ?? 0));
    const oversizeSurcharge = oversizeSqm * (booking.oversizeSurchargePerSqm ?? 0);

    const keyAccessValue = document.getElementById('keyAccess').value;
    const keyAccessOption = booking.keyAccessOptions.find(k => k.value === keyAccessValue);
    const keyAccessSurcharge = keyAccessOption?.surcharge ?? 0;

    const extraLines = getExtraLines();
    const extrasTotal = extraLines.reduce((sum, line) => sum + line.lineTotal, 0);

    const subtotal = base + extrasTotal + state.urgencySurcharge + oversizeSurcharge + keyAccessSurcharge;
    const discount = subtotal * state.promoDiscount;
    const afterPromo = Math.max(0, subtotal - discount);

    const frequencyOption = booking.frequencyOptions?.find(f => f.value === state.frequency) || { value: 'once', discount: 0 };
    const total = afterPromo * (1 - (frequencyOption.discount || 0));

    return {
      base, sizeOption, secondaryValue, serviceType, extraLines, extrasTotal, discount, total, frequencyOption,
      oversizeSurcharge, keyAccessSurcharge, keyAccessOption, currencySymbol: business.currencySymbol,
    };
  }

  function updatePriceSummary() {
    const { base, sizeOption, secondaryValue, serviceType, extraLines, total, frequencyOption, currencySymbol, oversizeSurcharge, keyAccessSurcharge } = calcPrice();
    const secondaryOption = state.config.booking.secondaryField.options.find(o => Number(o.value) === secondaryValue);
    els.sumPropertyLabel.textContent = `${serviceType.label} · ${sizeOptionDisplayLabel(serviceType, sizeOption)} · ${secondaryOption ? secondaryOption.label : secondaryValue}`;
    els.sumBase.textContent = `${currencySymbol}${base}`;

    els.sumExtrasList.innerHTML = '';
    extraLines.forEach(line => {
      const li = document.createElement('li');
      const qtyText = line.quantity > 1 ? ` ×${line.quantity}` : '';
      li.innerHTML = `<span>${line.label}${qtyText}</span><span>+${currencySymbol}${line.lineTotal}</span>`;
      els.sumExtrasList.appendChild(li);
    });

    const sumOversizeLine = document.getElementById('sumOversizeLine');
    if (oversizeSurcharge > 0) {
      sumOversizeLine.hidden = false;
      document.getElementById('sumOversize').textContent = `+${currencySymbol}${oversizeSurcharge.toFixed(0)}`;
    } else {
      sumOversizeLine.hidden = true;
    }

    const sumKeyAccessLine = document.getElementById('sumKeyAccessLine');
    if (keyAccessSurcharge > 0) {
      sumKeyAccessLine.hidden = false;
      document.getElementById('sumKeyAccess').textContent = `+${currencySymbol}${keyAccessSurcharge}`;
    } else {
      sumKeyAccessLine.hidden = true;
    }

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
      if (!/^0\d{9}$/.test(phone)) {
        document.getElementById('phone').focus();
        showToast('Enter a 10-digit phone number starting with 0 (e.g. 0400000000)');
        return false;
      }
      const postcode = document.getElementById('postcode').value;
      if (!/^\d{4}$/.test(postcode)) {
        document.getElementById('postcode').focus();
        showToast('Enter a 4-digit postcode (e.g. 3000)');
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
    const { sizeOption, secondaryValue, serviceType, extraLines, total, discount, frequencyOption, currencySymbol } = calcPrice();
    const secondaryOption = state.config.booking.secondaryField.options.find(o => Number(o.value) === secondaryValue);
    const extrasLabel = extraLines.length
      ? extraLines.map(line => `${escapeHtml(line.label)}${line.quantity > 1 ? ` ×${line.quantity}` : ''}`).join(', ')
      : 'None';
    const urgencyOption = state.config.booking.urgencyOptions.find(u => u.value === state.urgency);
    const isRecurring = frequencyOption.value !== 'once';

    const dateVal = document.getElementById('bookingDate').value;
    const timeVal = document.getElementById('bookingTime').value;
    const dateFormatted = dateVal ? new Date(dateVal + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';

    // User-supplied — escaped before going into innerHTML further down.
    const name = escapeHtml(document.getElementById('fullName').value);
    const email = escapeHtml(document.getElementById('email').value);
    const phone = escapeHtml(document.getElementById('phone').value);
    const address = escapeHtml(document.getElementById('address').value);
    const postcode = escapeHtml(document.getElementById('postcode').value);

    document.getElementById('reviewBox').innerHTML = `
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="1">Edit</button>
        <h4>Property</h4>
        <p>${serviceType.label} · ${sizeOptionDisplayLabel(serviceType, sizeOption)} · ${secondaryOption ? secondaryOption.label : ''}</p>
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
        <p>${frequencyOption.label}${isRecurring ? ' — billed automatically each cycle' : ''}</p>
        ${isRecurring ? `<p class="review-cancellation-note">Cancelling before your ${state.config.booking.earlyCancellationMinCycles ?? 3}${getOrdinalSuffix(state.config.booking.earlyCancellationMinCycles ?? 3)} clean incurs a one-off early-cancellation fee equal to one visit at your discounted rate — see <a href="#" data-modal="terms">terms</a>.</p>` : ''}
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

    // Flat array with one entry per unit (e.g. 3 curtains -> "curtains" repeated
    // 3 times) — this is what server/config.js expects and how it prices them.
    const extras = getExtraLines().flatMap(line => Array(line.quantity).fill(line.key));
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

  // If the customer clicks their browser's back button from the Stripe
  // checkout page, the browser can restore this page from cache (bfcache)
  // exactly as it was left — mid-redirect, with the submit button stuck
  // disabled on "Redirecting to secure payment…". `pageshow` with
  // `event.persisted` fires specifically for that restore, so this resets
  // the button instead of leaving the page looking broken.
  window.addEventListener('pageshow', event => {
    if (event.persisted) setSubmitting(false);
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
    cookies: { title: 'Cookies', body: '' },
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

  /* ============ Back to top / WhatsApp float ============ */
  // Both float over page content, so they only appear once the visitor has
  // scrolled past the hero — otherwise they can sit on top of the primary
  // "Book now" / "See pricing" buttons on small mobile viewports.
  const backToTop = document.getElementById('backToTop');
  const whatsappFloatBtn = document.getElementById('whatsappFloat');
  window.addEventListener('scroll', () => {
    const pastHero = window.scrollY < 500;
    backToTop.hidden = pastHero;
    whatsappFloatBtn.classList.toggle('whatsapp-float-hidden', pastHero);
  });
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // "Book now" jumps within the same page rather than loading a separate
  // page — a deliberate, common pattern for this kind of site (no reload,
  // keeps the in-progress quote) — but that can feel like nothing happened.
  // This pulse makes the arrival unmistakable without turning it into an
  // actual page navigation.
  document.querySelectorAll('a[href="#booking"]').forEach(link => {
    link.addEventListener('click', () => {
      const wrap = document.querySelector('.booking-wrap');
      if (!wrap) return;
      setTimeout(() => {
        wrap.classList.remove('booking-arrival-highlight');
        void wrap.offsetWidth; // restart the animation even if it's still running from a rapid re-click
        wrap.classList.add('booking-arrival-highlight');
      }, 650);
    });
  });

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
    document.getElementById('sqm').addEventListener('input', updatePriceSummary);

    // Strip and cap in one step — relying on the maxlength attribute alone
    // would count stripped-out letters against the limit (e.g. pasting
    // "abc0400111222xyz" would truncate to 10 raw characters *before* the
    // letters are removed, losing real digits).
    const digitsOnly = (el, maxLen) => el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '').slice(0, maxLen);
    });
    digitsOnly(document.getElementById('phone'), 10);
    digitsOnly(document.getElementById('postcode'), 4);

    // Best-effort capture — if someone types their email/phone but never
    // finishes the booking, this lets the business follow up. Fire on blur
    // (not on every keystroke) and never blocks or reports failure.
    function captureLead() {
      const email = document.getElementById('email').value;
      const phone = document.getElementById('phone').value;
      if (!email && !phone) return;
      fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone }),
      }).catch(() => {});
    }
    document.getElementById('email').addEventListener('blur', captureLead);
    document.getElementById('phone').addEventListener('blur', captureLead);
    document.getElementById('keyAccess').addEventListener('change', updatePriceSummary);
    const extrasGrid = document.getElementById('extrasGrid');
    extrasGrid.addEventListener('change', updatePriceSummary);
    extrasGrid.addEventListener('input', updatePriceSummary);
    extrasGrid.addEventListener('click', e => {
      const btn = e.target.closest('.extra-qty-btn');
      if (!btn) return;
      const input = document.getElementById(`extraQty_${btn.dataset.qtyFor}`);
      if (!input) return;
      const next = Number(input.value || 0) + Number(btn.dataset.qtyDelta);
      input.value = Math.max(0, Math.min(Number(input.max), next));
      updatePriceSummary();
    });
    const promoFeedback = document.getElementById('promoFeedback');
    els.promoCode.addEventListener('input', () => {
      const raw = els.promoCode.value.trim();
      const code = raw.toUpperCase();
      state.promoDiscount = cfg.booking.promoCodes[code] || 0;
      // FRIEND-/CREDIT- codes are referral/reward codes — dynamic and
      // customer-specific, so they can't be checked from this static config.
      // The server resolves them (and applies the real discount) at
      // checkout, so we only give neutral feedback here, never a false
      // "invalid" for what might be a perfectly good code.
      const looksLikeReferralCode = /^(FRIEND|CREDIT)-/.test(code);
      if (!raw) {
        promoFeedback.hidden = true;
      } else if (state.promoDiscount > 0) {
        promoFeedback.hidden = false;
        promoFeedback.textContent = `✓ Code applied: ${Math.round(state.promoDiscount * 100)}% off`;
        promoFeedback.className = 'promo-feedback promo-feedback-valid';
      } else if (looksLikeReferralCode) {
        promoFeedback.hidden = false;
        promoFeedback.textContent = 'We\'ll verify this code and apply your discount at checkout.';
        promoFeedback.className = 'promo-feedback promo-feedback-valid';
      } else {
        promoFeedback.hidden = false;
        promoFeedback.textContent = '✗ This code isn\'t valid';
        promoFeedback.className = 'promo-feedback promo-feedback-invalid';
      }
      updatePriceSummary();
    });

    const dateInput = document.getElementById('bookingDate');
    dateInput.min = new Date().toISOString().split('T')[0];
    dateInput.addEventListener('change', () => {
      refreshTimeSlotAvailability();
      updateUrgencyBadge();
    });
    updateUrgencyBadge();

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
