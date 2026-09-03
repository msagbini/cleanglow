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

  /* ============ CSRF ============
   * Every write to the booking funnel echoes the server-issued token from
   * the page's <meta name="csrf-token">. If the token has expired (the page
   * sat open longer than the cookie's lifetime, or was restored from the
   * back/forward cache), the server answers 403 with code "csrf" — we then
   * fetch a fresh token and replay the request once, so a customer never
   * loses a booking they have already filled in to an expired token. */
  let csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

  async function refreshCsrfToken() {
    try {
      const res = await fetch('/api/csrf', { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.token) return false;
      csrfToken = data.token;
      return true;
    } catch {
      return false;
    }
  }

  // Drop-in replacement for fetch() on state-changing requests.
  async function csrfFetch(url, options = {}) {
    const send = () => fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), 'X-CSRF-Token': csrfToken },
    });
    let res = await send();
    if (res.status === 403) {
      // Read the body from a clone so the caller can still consume res.json().
      const reason = await res.clone().json().catch(() => ({}));
      if (reason.code === 'csrf' && (await refreshCsrfToken())) res = await send();
    }
    return res;
  }

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
    // Property types (booking form pills + hero quote preview)
    apartment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><rect x="7.5" y="7" width="2.5" height="2.5"/><rect x="14" y="7" width="2.5" height="2.5"/><rect x="7.5" y="13" width="2.5" height="2.5"/><rect x="14" y="13" width="2.5" height="2.5"/><line x1="12" y1="21" x2="12" y2="18"/></svg>',
    house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><rect x="10" y="14" width="4" height="6"/></svg>',
    studio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5"/><path d="M2 18h20"/><path d="M4 11V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4"/></svg>',
    office: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/></svg>',
    // Extras
    oven: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="7" x2="8.01" y2="7"/><line x1="12" y1="7" x2="12.01" y2="7"/><line x1="16" y1="7" x2="16.01" y2="7"/><rect x="6" y="11" width="12" height="8" rx="1"/><circle cx="12" cy="15" r="2"/></svg>',
    fridge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="1.5"/><line x1="6" y1="9" x2="18" y2="9"/><line x1="9" y1="4" x2="9" y2="7"/><line x1="9" y1="11" x2="9" y2="14"/></svg>',
    balcony: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3 3-3 6 0 9 3-3 3-6 0-9Z"/><line x1="12" y1="12" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>',
    garage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5"/><rect x="2" y="11" width="20" height="7" rx="1.5"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg>',
    curtains: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="20" y2="4"/><path d="M6 4c0 6 2 8 2 16"/><path d="M18 4c0 6-2 8-2 16"/></svg>',
    blinds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="1"/><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/></svg>',
  };

  // "168 hours" reads oddly next to marketing copy that says "7 days" —
  // shows whole-day windows as days, anything smaller as hours.
  function formatWindow(hours) {
    if (hours >= 24 && hours % 24 === 0) {
      const days = hours / 24;
      return CGI18N.tf('common.days', d => `${d} day${d === 1 ? '' : 's'}`, days);
    }
    return CGI18N.tf('common.hours', h => `${h} hours`, hours);
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
    agentEmail: document.getElementById('agentEmail'),
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
      // Explicit intrinsic size so the browser reserves the box before the
      // SVG loads — without it the header logo pushed the wordmark sideways
      // on first paint. CSS still controls the rendered size.
      img.width = 32;
      img.height = 32;
      img.decoding = 'async';
      el.appendChild(img);
    } else {
      el.textContent = business.logoEmoji;
    }
  }

  function renderBranding(cfg) {
    const { business } = cfg;
    document.title = business.seoTitle || `${business.name} | Book your service online`;

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
      const whatsappMsg = CGI18N.tf('hero.whatsappPrefill', n => `Hi ${n}, I'd like to ask about a booking.`, business.name);
      whatsappFloat.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMsg)}`;
    }

    const mailHref = `mailto:${business.email}`;
    const footerEmail = document.getElementById('footerEmailLink');
    footerEmail.href = mailHref;
    footerEmail.textContent = `✉️ ${business.email}`;

    document.getElementById('footerHours').textContent = `🕐 ${business.hours}`;
    document.getElementById('footerDescription').textContent = business.footerDescription;
    const abnSuffix = business.abn ? ` · ABN ${business.abn}` : '';
    document.getElementById('footerCopyright').textContent = CGI18N.tf(
      'footer.rightsReserved',
      (year, name, abn) => `© ${year} ${name}. All rights reserved.${abn}`,
      new Date().getFullYear(), business.name, abnSuffix
    );
    document.getElementById('recleanWindowHours').textContent = formatWindow(business.recleanWindowHours);
    document.getElementById('faqRecleanWindowHours').textContent = formatWindow(business.recleanWindowHours);

    // Links to the server-rendered suburb landing pages (see server/suburbs.js)
    // — matches its slugify() exactly, so these always resolve to a real page.
    const slugify = name => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
    const areasCol = document.getElementById('footerServiceAreas');
    business.serviceAreas.forEach(area => {
      const a = document.createElement('a');
      a.href = `/end-of-lease-cleaning-${slugify(area)}`;
      a.textContent = area;
      areasCol.appendChild(a);
    });

    const heroAreas = document.getElementById('heroAreasText');
    if (heroAreas) {
      const areasStr = business.serviceAreas.join(', ');
      heroAreas.textContent = CGI18N.getLang() === 'es'
        ? `${CGI18N.t('hero.servicingPrefix', 'Servicing')} ${areasStr} ${CGI18N.t('hero.servicingSuffix', 'and nearby suburbs.')}`
        : `Servicing ${areasStr} and nearby suburbs.`;
    }

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

    // Must mirror the server-rendered structure in renderIndex.js exactly —
    // same <li>, same icon wrapper at the same size — so replacing it here
    // changes no geometry and causes no layout shift.
    document.getElementById('heroTrust').innerHTML = business.heroTrust
      .map(item => `<li><span class="hero-trust-icon">${ICONS[item.icon] || ''}</span><span>${item.text}</span></li>`).join('');

    const heroFootnote = document.getElementById('heroGuaranteeFootnote');
    if (heroFootnote && business.guaranteeFootnote) {
      heroFootnote.innerHTML = `${business.guaranteeFootnote} <a href="#" data-modal="terms">${CGI18N.t('hero.guaranteeTermsLink', 'Guarantee Terms')}</a>`;
    }

    const sampleSize = booking.sizeField.options[Math.min(2, booking.sizeField.options.length - 1)];
    const sampleExtras = booking.extras.slice(0, 2);
    const sampleType = booking.serviceTypes[0];
    const total = sampleSize.price + sampleType.surcharge + sampleExtras.reduce((s, e) => s + e.price, 0);
    const fromWord = CGI18N.t('common.from', 'from');
    document.getElementById('heroCardRows').innerHTML = `
      <div class="hero-card-row"><span><span class="inline-icon">${ICONS[sampleType.icon] || ''}</span>${sampleType.label} ${sampleSize.label}</span><span>${fromWord} ${business.currencySymbol}${sampleSize.price}</span></div>
      ${sampleExtras.map(e => `<div class="hero-card-row"><span><span class="inline-icon">${ICONS[e.icon] || ''}</span>${e.label}</span><span>+ ${business.currencySymbol}${e.price}</span></div>`).join('')}
      <div class="hero-card-row hero-card-total"><span>${CGI18N.t('hero.estimatedTotal', 'Estimated total')}</span><span>${business.currencySymbol}${total}</span></div>
    `;
  }

  function renderTrustStrip(cfg) {
    document.getElementById('trustStrip').innerHTML = cfg.business.stats
      .map(s => `<div><strong>${s.value}</strong><span>${s.label}</span></div>`).join('');
  }

  function renderServices(cfg) {
    document.getElementById('servicesGrid').innerHTML = cfg.servicesShowcase.map((s, i) => `
      <article class="service-card reveal reveal-delay-${(i % 4) + 1}">
        <div class="service-icon">${ICONS[s.icon] || s.icon}</div>
        <h3>${s.title}</h3>
        <p>${s.description}</p>
      </article>
    `).join('');
  }

  function renderChecklist(cfg) {
    const { checklist } = cfg;
    document.getElementById('checklistIntro').textContent = checklist.intro;
    document.getElementById('checklistColumns').innerHTML = checklist.columns.map((col, i) => `
      <ul class="checklist reveal reveal-delay-${i + 1}">${col.map(item => `<li>✔ ${item}</li>`).join('')}</ul>
    `).join('');
    const disclaimer = checklist.guarantee.disclaimer
      ? `<p class="guarantee-disclaimer">${checklist.guarantee.disclaimer} <a href="#" data-modal="terms">${CGI18N.t('hero.guaranteeTermsLink', 'Guarantee Terms')}</a></p>`
      : '';
    document.getElementById('guaranteeCard').innerHTML = `
      <h3>${ICONS.shield}<span>${checklist.guarantee.title}</span></h3>
      <p>${checklist.guarantee.description}</p>
      <ul>${checklist.guarantee.points.map(p => `<li>${ICONS.badge}<span>${p}</span></li>`).join('')}</ul>
      ${disclaimer}
    `;
  }

  function renderPricingTiers(cfg) {
    const fromWord = CGI18N.t('common.from', 'from');
    document.getElementById('pricingGrid').innerHTML = cfg.pricingTiers.map((tier, i) => `
      <div class="price-card reveal reveal-delay-${i + 1} ${tier.featured ? 'featured' : ''}" ${tier.presetBedrooms ? `data-preset-bedrooms="${tier.presetBedrooms}"` : ''}>
        ${tier.featured ? `<span class="price-tag">${CGI18N.t('pricing.mostBooked', 'Most booked')}</span>` : ''}
        <h3>${tier.label}</h3>
        <p class="price">${fromWord} ${cfg.business.currencySymbol}${tier.priceFrom}</p>
        <ul>${tier.features.map(f => `<li>${f}</li>`).join('')}</ul>
        ${tier.presetBedrooms ? `<button type="button" class="btn btn-primary btn-sm price-card-select">${CGI18N.t('pricing.bookThisSize', 'Book this size')}</button>` : ''}
      </div>
    `).join('');
  }

  // The whole card is the tap target, not just the button at the bottom —
  // a click anywhere in a price-card (including on the button itself, whose
  // own click bubbles up here) pre-fills the wizard. The button stays a
  // real <button> so keyboard/screen-reader users still get one clearly
  // labelled, natively focusable control rather than an entire div acting
  // as an unlabelled button.
  document.getElementById('pricingGrid').addEventListener('click', e => {
    const card = e.target.closest('.price-card[data-preset-bedrooms]');
    if (!card) return;
    els.bedrooms.value = card.dataset.presetBedrooms;
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
      <button type="button" class="pill${i === 0 ? ' active' : ''}" data-value="${t.value}"><span class="inline-icon">${ICONS[t.icon] || ''}</span>${t.label}</button>
    `).join('');
    state.propertyType = booking.serviceTypes[0].value;

    renderSizeField(booking.serviceTypes[0]);

    document.getElementById('secondaryFieldLabel').textContent = booking.secondaryField.label;
    els.bathrooms.innerHTML = booking.secondaryField.options.map(o =>
      `<option value="${o.value}" ${o.value === booking.secondaryField.defaultValue ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    document.getElementById('extrasGrid').innerHTML = booking.extras.map(e => e.perUnit ? `
      <div class="extra-card extra-card-unit">
        <span class="extra-icon">${ICONS[e.icon] || e.icon}</span>
        <span class="extra-name">${e.label}</span>
        <span class="extra-price">${cfg.business.currencySymbol}${e.price} ${CGI18N.t('common.per', 'per')} ${e.unitLabel || CGI18N.t('common.unit', 'unit')}</span>
        <div class="extra-qty">
          <button type="button" class="extra-qty-btn" data-qty-delta="-1" data-qty-for="${e.key}" aria-label="${CGI18N.tf('extras.fewer', l => `Fewer ${l}`, e.label)}">−</button>
          <input type="number" name="extras" min="0" max="${e.maxQuantity ?? 12}" step="1" value="0"
                 data-key="${e.key}" data-price="${e.price}" data-label="${e.label}" id="extraQty_${e.key}">
          <button type="button" class="extra-qty-btn" data-qty-delta="1" data-qty-for="${e.key}" aria-label="${CGI18N.tf('extras.more', l => `More ${l}`, e.label)}">+</button>
        </div>
      </div>
    ` : `
      <label class="extra-card">
        <input type="checkbox" name="extras" value="${e.key}" data-price="${e.price}" data-label="${e.label}">
        <span class="extra-icon">${ICONS[e.icon] || e.icon}</span>
        <span class="extra-name">${e.label}</span>
        <span class="extra-price">+${cfg.business.currencySymbol}${e.price}</span>
      </label>
    `).join('');

    document.getElementById('keyAccess').innerHTML = booking.keyAccessOptions
      .map(o => `<option value="${o.value}">${o.label}${o.surcharge ? ` (+${cfg.business.currencySymbol}${o.surcharge})` : ''}</option>`).join('');
    updateAccessPolicyUI(cfg);

    document.getElementById('bookingTime').innerHTML = booking.timeSlots
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    state.urgency = booking.urgencyOptions[0].value;
    state.urgencySurcharge = booking.urgencyOptions[0].surcharge;
  }

  // Removing the "we'll coordinate access" style options left exactly two
  // paths: the customer is there in person (which carries a real lateness
  // risk that can cascade into the next job — see the terms & conditions'
  // Property Access & Lateness section) or a lockbox (which sidesteps that
  // risk entirely, provided the code they give us actually works). This note
  // makes that trade-off visible at the moment they're choosing, instead of
  // only in the terms modal nobody reads before booking.
  function updateAccessPolicyUI(cfg) {
    const value = document.getElementById('keyAccess').value;
    const wrap = document.getElementById('accessInstructionsWrap');
    const note = document.getElementById('accessPolicyNote');
    const isKeybox = value === 'keybox';
    wrap.hidden = !isKeybox;
    document.getElementById('accessInstructions').required = isKeybox;

    const policy = cfg.booking.accessPolicy;
    const symbol = cfg.business.currencySymbol;
    if (isKeybox) {
      note.textContent = CGI18N.t('access.policyNoteKeybox', '✓ No lateness risk — the team lets themselves in with the code you provide below.');
    } else if (policy) {
      note.textContent = CGI18N.tf(
        'access.policyNotePresent',
        (grace, fee, block, lockoutMin, lockoutFee) =>
          `If you'll be there in person, please be on time — we allow a ${grace}-minute grace period. After that, a ${fee} fee applies per extra ${block} minutes, and if there's still no access after ${lockoutMin} minutes we'll need to treat it as a lockout (${lockoutFee} fee) and reschedule. Choosing a lockbox avoids this entirely.`,
        policy.gracePeriodMinutes, `${symbol}${(policy.lateFeePerBlockCents / 100).toFixed(0)}`,
        policy.lateFeeBlockMinutes, policy.lockoutThresholdMinutes, `${symbol}${(policy.lockoutFeeCents / 100).toFixed(0)}`
      );
    } else {
      note.textContent = '';
    }
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

  function renderLegalContentEs(cfg) {
    const { business } = cfg;
    const accessPolicy = cfg.booking.accessPolicy ?? {};
    const accessLateFee = `${business.currencySymbol}${((accessPolicy.lateFeePerBlockCents ?? 0) / 100).toFixed(0)}`;
    const accessLockoutFee = `${business.currencySymbol}${((accessPolicy.lockoutFeeCents ?? 0) / 100).toFixed(0)}`;
    legalContent.terms.title = 'Términos y Condiciones';
    legalContent.privacy.title = 'Política de Privacidad';
    legalContent.cookies.title = 'Cookies';
    legalContent.terms.body = `<p>Al reservar un servicio con ${business.name} aceptas los siguientes términos:</p>
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
      <h4>7. Planes recurrentes y cancelación anticipada</h4><p>Los planes semanales, quincenales y mensuales se facturan automáticamente a una tarifa con descuento que refleja la naturaleza continua y repetida del servicio. Si un plan recurrente se cancela antes de completar el mínimo de ${state.config.booking.earlyCancellationMinCycles ?? 3} limpiezas, aplica una tarifa única de cancelación anticipada equivalente a una visita a la tarifa con descuento, cobrada a la tarjeta registrada, para recuperar el descuento otorgado bajo el supuesto de negocio continuo. Esta tarifa no aplica una vez completado el número mínimo de limpiezas — el plan puede cancelarse en cualquier momento sin costo a partir de entonces.</p>`;
    legalContent.privacy.body = `<p>Tus datos personales se usan únicamente para gestionar tu reserva y comunicarnos contigo sobre el servicio.</p>
      <h4>Datos que recopilamos</h4><p>Nombre, email, número de teléfono, la dirección de la propiedad a limpiar, y cualquier foto antes/después enviada para el trabajo. Si eliges notificar a un administrador de propiedad, también recopilamos su dirección de email para ese único propósito.</p>
      <h4>Cómo los usamos</h4><p>No compartimos tus datos con terceros salvo el equipo de limpieza asignado a tu servicio y, solo si eliges proporcionarlo, el email del administrador de propiedad/agente que nos indiques — usado únicamente para enviarle la prueba de que la limpieza acordada se completó.</p>
      <h4>Tus derechos</h4><p>Puedes solicitar acceso, corrección o eliminación de tus datos escribiendo a ${business.email}.</p>`;
    legalContent.cookies.body = `<p>Este sitio no usa cookies de seguimiento, publicidad o analítica.</p>
      <h4>Lo que sí usamos</h4><p>Se establece una única cookie solo si inicias sesión en tu cuenta en /account — te mantiene con la sesión iniciada hasta por 30 días para que no tengas que solicitar un nuevo enlace de acceso en cada visita. Si nunca inicias sesión, no se guarda ninguna cookie en tu navegador entre visitas.</p>
      <h4>Stripe</h4><p>Cuando llegas a la pantalla de pago, nuestro procesador de pagos Stripe puede establecer sus propias cookies allí para prevención de fraude. Eso ocurre en el sitio de Stripe, bajo su <a href="https://stripe.com/privacy" target="_blank" rel="noopener">política de privacidad</a>, no la nuestra.</p>`;
  }

  function renderLegalContent(cfg) {
    if (CGI18N.getLang() === 'es') return renderLegalContentEs(cfg);
    const { business } = cfg;
    const accessPolicy = cfg.booking.accessPolicy ?? {};
    const accessLateFee = `${business.currencySymbol}${((accessPolicy.lateFeePerBlockCents ?? 0) / 100).toFixed(0)}`;
    const accessLockoutFee = `${business.currencySymbol}${((accessPolicy.lockoutFeeCents ?? 0) / 100).toFixed(0)}`;
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
      <h4>4. Property Access & Lateness</h4>
      <p>The access method chosen at booking — you being present, or a lockbox/key code — determines how our team gets in. If you choose a lockbox, its location and code must be given in the booking form; if either changes before the appointment, let us know immediately.</p>
      <p>If you'll be present: we allow a <strong>${accessPolicy.gracePeriodMinutes}-minute grace period</strong> from the start of your booked time slot at no charge. After that, a <strong>${accessLateFee}</strong> fee applies for each additional ${accessPolicy.lateFeeBlockMinutes} minutes our team waits, since that time is taken directly from other customers' bookings that day. If access still hasn't been provided after <strong>${accessPolicy.lockoutThresholdMinutes} minutes</strong> total, we'll treat the appointment as a lockout: a <strong>${accessLockoutFee}</strong> lockout fee applies, the visit is cancelled, and it will need to be rebooked as a new appointment (subject to availability) rather than completed the same day.</p>
      <h4>5. Utilities & Safe Working Conditions</h4>
      <p>Working water and electricity must be connected and accessible at the property for the booked appointment — if they aren't, the lateness/lockout policy above may apply, as our team may be unable to complete the clean. Our team may decline or pause a clean, without it counting as a missed appointment on their part, if the property presents a genuine safety risk (e.g. an uncontrolled aggressive animal, exposed hazardous materials, structural danger) — please disclose anything relevant in the property notes at booking.</p>
      <h4>6. Cancellations or Delays by ${business.name}</h4>
      <p>On rare occasions we may need to cancel or reschedule an appointment ourselves — for example severe weather, a team member's illness, or a vehicle issue. In these cases you'll be notified as early as possible and offered a free reschedule to the next available slot, or a full refund if you'd prefer not to rebook. No fee ever applies for a cancellation or delay on our side.</p>
      <h4>7. Recurring plans and early cancellation</h4><p>Weekly, fortnightly and monthly plans are billed automatically at a discounted rate that reflects the ongoing, repeat nature of the service. If a recurring plan is cancelled before the minimum of ${state.config.booking.earlyCancellationMinCycles ?? 3} cleans has been completed, a one-off early-cancellation fee equal to one visit at the discounted rate applies, charged to the card on file, to recover the discount given on the assumption of ongoing business. This fee does not apply once the minimum number of cleans has been completed — the plan can then be cancelled at any time with no fee.</p>`;
    legalContent.privacy.body = `<p>Your personal data is used only to manage your booking and communicate with you about the service.</p>
      <h4>Data we collect</h4><p>Name, email, phone number, the address of the property to be cleaned, and any before/after photos submitted for the job. If you choose to notify a property manager, we also collect their email address for that one purpose.</p>
      <h4>How we use it</h4><p>We don't share your data with third parties other than the cleaning team assigned to your service and, only if you choose to provide one, the property manager/agent email you give us — used solely to send them proof that the agreed clean was completed.</p>
      <h4>Your rights</h4><p>You can request access to, correction of, or deletion of your data by emailing ${business.email}.</p>`;
    legalContent.cookies.body = `<p>This site doesn't use tracking, advertising or analytics cookies.</p>
      <h4>What we do use</h4><p>A single cookie is set only if you log into your account at /account — it keeps you signed in for up to 30 days so you don't have to request a new login link every visit. If you never log in, no cookie is stored in your browser between visits.</p>
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
    document.getElementById('sumTotalLabel').textContent = isRecurring
      ? CGI18N.tf('price.totalPerVisit', f => `Total per visit (${f})`, frequencyOption.label.toLowerCase())
      : CGI18N.t('price.estimatedTotal', 'Estimated total');

    const formattedTotal = `${currencySymbol}${total.toFixed(0)}`;
    if (els.sumTotal.textContent !== formattedTotal && els.sumTotal.textContent !== '—') {
      els.sumTotal.classList.remove('price-pulse');
      // Force a reflow so re-adding the class restarts the animation even
      // when the price changes twice in quick succession (e.g. two clicks).
      void els.sumTotal.offsetWidth;
      els.sumTotal.classList.add('price-pulse');
    }
    els.sumTotal.textContent = formattedTotal;

    const gst = computeGstComponent(total);
    const taxNote = document.getElementById('sumTaxNote');
    taxNote.textContent = gst > 0
      ? CGI18N.tf('price.taxNoteGst', (s, g) => `Price includes ${s}${g} GST. Final price confirmed after reviewing your property notes.`, currencySymbol, gst.toFixed(2))
      : CGI18N.t('price.taxNote', 'Final price confirmed after reviewing your property notes.');
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

  /* ============ Inline field validation ============
   * Feedback used to be a single transient toast: it named only the first
   * problem, vanished after ~3s, wasn't attached to the field it was about,
   * and was invisible to a screen reader. On a five-step form that is a real
   * source of abandonment. Each rule below now renders a persistent message
   * beside its own field, marks the field aria-invalid and points at the
   * message with aria-describedby, and re-checks as the visitor types once
   * they've seen an error — while never interrupting a field they are still
   * filling in for the first time. */

  const FIELD_RULES = {
    fullName: value => (value.trim().length >= 2
      ? null
      : CGI18N.t('field.fullName', 'Enter your first and last name')),
    email: value => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
      ? null
      : CGI18N.t('toast.invalidEmail', 'Enter a valid email address')),
    phone: value => (/^0\d{9}$/.test(value.replace(/\s/g, ''))
      ? null
      : CGI18N.t('toast.invalidPhone', 'Enter a 10-digit phone number starting with 0 (e.g. 0400000000)')),
    postcode: value => (/^\d{4}$/.test(value.trim())
      ? null
      : CGI18N.t('toast.invalidPostcode', 'Enter a 4-digit postcode (e.g. 3000)')),
    address: value => (value.trim().length >= 6
      ? null
      : CGI18N.t('field.address', 'Enter the full street address, including the suburb')),
    // Optional — only validated once something has actually been typed.
    agentEmail: value => (!value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
      ? null
      : CGI18N.t('toast.invalidEmail', 'Enter a valid email address')),
    bookingDate: value => {
      if (!value) return CGI18N.t('toast.selectDate', 'Select a date for your service');
      const chosen = new Date(`${value}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (chosen < today) return CGI18N.t('toast.pastDate', 'The date can\'t be in the past');
      const maxDateVal = document.getElementById('bookingDate').max;
      if (maxDateVal && value > maxDateVal) {
        return CGI18N.t('toast.dateTooFar', 'Please pick a date within the next few months');
      }
      return null;
    },
  };

  function errorElementFor(field) {
    const id = `${field.id}-error`;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('p');
      el.className = 'field-error';
      el.id = id;
      // role="alert" so the message is announced the moment it appears,
      // without moving focus away from the field being corrected.
      el.setAttribute('role', 'alert');
      // A checkbox lives inside its <label>, so the message goes after the
      // whole row rather than between the box and its text.
      const anchor = field.type === 'checkbox' ? field.closest('.checkbox-row') || field : field;
      anchor.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function showFieldError(field, message) {
    const el = errorElementFor(field);
    el.textContent = message;
    el.hidden = false;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', el.id);
    field.classList.add('field-invalid');
  }

  function clearFieldError(field) {
    const el = document.getElementById(`${field.id}-error`);
    if (el) { el.textContent = ''; el.hidden = true; }
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    field.classList.remove('field-invalid');
  }

  // Returns an error message for the field, or null when it's acceptable.
  function checkField(field) {
    const isCheckbox = field.type === 'checkbox';
    const value = isCheckbox ? '' : field.value;
    if (field.required && (isCheckbox ? !field.checked : !value.trim())) {
      return isCheckbox
        ? CGI18N.t('field.requiredCheckbox', 'Please tick this box to continue')
        : CGI18N.t('field.required', 'This field is required');
    }
    // A blank optional field is fine; only run the format rule on real input.
    if (!field.required && !isCheckbox && !value.trim()) return null;
    const rule = FIELD_RULES[field.id];
    return rule ? rule(value) : null;
  }

  function validateField(field) {
    const error = checkField(field);
    if (error) showFieldError(field, error);
    else clearFieldError(field);
    return !error;
  }

  // Wire live feedback: check on blur, then keep re-checking on every
  // keystroke *only* for a field already showing an error, so the message
  // clears the instant it's fixed but never appears mid-typing.
  function initLiveValidation() {
    const watched = new Set([...Object.keys(FIELD_RULES), ...Array.from(form.querySelectorAll('[required]')).map(f => f.id)]);
    watched.forEach(id => {
      const field = document.getElementById(id);
      if (!field) return;
      field.addEventListener('blur', () => validateField(field));
      const liveEvent = field.type === 'checkbox' || field.tagName === 'SELECT' ? 'change' : 'input';
      field.addEventListener(liveEvent, () => {
        if (field.classList.contains('field-invalid')) validateField(field);
      });
    });
  }

  function validateStep(n) {
    const stepEl = steps.find(s => Number(s.dataset.step) === n);
    // Every field in the step is checked, not just the first failure, so the
    // visitor sees everything they need to fix in one pass.
    const fields = Array.from(stepEl.querySelectorAll('input, select, textarea'))
      .filter(f => f.id && !f.disabled && (f.required || f.id in FIELD_RULES));
    const invalid = fields.filter(field => !validateField(field));

    if (invalid.length) {
      invalid[0].focus();
      showToast(invalid.length === 1
        ? checkField(invalid[0])
        : CGI18N.tf('toast.fixFields', n => `Please fix ${n} fields to continue`, invalid.length));
      return false;
    }

    if (n === 3) {
      const timeSelect = document.getElementById('bookingTime');
      const selectedOption = timeSelect.options[timeSelect.selectedIndex];
      if (selectedOption && selectedOption.disabled) {
        showToast(CGI18N.t('toast.slotFull', 'That time slot is fully booked — please choose another one'));
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
        option.textContent = slot.available ? slot.label : `${slot.label} — ${CGI18N.t('form.fullyBooked', 'Fully booked')}`;
        if (option.value === previousValue && !slot.available) previousStillAvailable = false;
      });

      if (!previousStillAvailable) {
        const firstAvailable = Array.from(timeSelect.options).find(o => !o.disabled);
        timeSelect.value = firstAvailable ? firstAvailable.value : previousValue;
        showToast(CGI18N.t('toast.slotReassigned', 'Your selected time slot is now fully booked — we picked the next available one'));
      }
    } catch {
      // Non-critical: the server still enforces this at submission time either way.
    }
  }

  /* ============ Review step ============ */
  function buildReview() {
    const { sizeOption, secondaryValue, serviceType, extraLines, total, discount, frequencyOption, currencySymbol } = calcPrice();
    const secondaryOption = state.config.booking.secondaryField.options.find(o => Number(o.value) === secondaryValue);
    const isEs = CGI18N.getLang() === 'es';
    const extrasLabel = extraLines.length
      ? extraLines.map(line => `${escapeHtml(line.label)}${line.quantity > 1 ? ` ×${line.quantity}` : ''}`).join(', ')
      : CGI18N.t('review.extrasNone', 'None');
    const urgencyOption = state.config.booking.urgencyOptions.find(u => u.value === state.urgency);
    const isRecurring = frequencyOption.value !== 'once';

    const dateVal = document.getElementById('bookingDate').value;
    const timeVal = document.getElementById('bookingTime').value;
    const dateFormatted = dateVal
      ? new Date(dateVal + 'T00:00:00').toLocaleDateString(isEs ? 'es-AU' : 'en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '—';

    // User-supplied — escaped before going into innerHTML further down.
    const name = escapeHtml(document.getElementById('fullName').value);
    const email = escapeHtml(document.getElementById('email').value);
    const phone = escapeHtml(document.getElementById('phone').value);
    const address = escapeHtml(document.getElementById('address').value);
    const postcode = escapeHtml(document.getElementById('postcode').value);

    const editLabel = CGI18N.t('review.edit', 'Edit');
    const termsLink = `<a href="#" data-modal="terms">${CGI18N.t('review.terms', 'terms')}</a>`;
    document.getElementById('reviewBox').innerHTML = `
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="1">${editLabel}</button>
        <h4>${CGI18N.t('review.property', 'Property')}</h4>
        <p>${serviceType.label} · ${sizeOptionDisplayLabel(serviceType, sizeOption)} · ${secondaryOption ? secondaryOption.label : ''}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="2">${editLabel}</button>
        <h4>${CGI18N.t('review.extras', 'Extras')}</h4>
        <p>${extrasLabel}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="3">${editLabel}</button>
        <h4>${CGI18N.t('review.dateTime', 'Date & time')}</h4>
        <p>${dateFormatted} · ${timeVal} ${CGI18N.t('review.slot', 'slot')} · ${CGI18N.t('review.urgency', 'urgency')}: ${urgencyOption ? urgencyOption.label : state.urgency}</p>
      </div>
      <div class="review-section">
        <button type="button" class="review-edit" data-goto="4">${editLabel}</button>
        <h4>${CGI18N.t('review.contact', 'Contact details')}</h4>
        <p>${name}<br>${email} · ${phone}<br>${address}, ${postcode}</p>
      </div>
      <div class="review-section">
        <h4>${CGI18N.t('review.frequency', 'Cleaning frequency')}</h4>
        <p>${frequencyOption.label}${isRecurring ? CGI18N.t('review.billedAuto', ' — billed automatically each cycle') : ''}</p>
        ${isRecurring ? `<p class="review-cancellation-note">${
          CGI18N.tf(
            'review.cancellationNote',
            (n, terms) => `Cancelling before your ${n}${getOrdinalSuffix(n)} clean incurs a one-off early-cancellation fee equal to one visit at your discounted rate — see ${terms}.`,
            state.config.booking.earlyCancellationMinCycles ?? 3, termsLink
          )
        }</p>` : ''}
      </div>
      <div class="review-section">
        <h4>${isRecurring ? CGI18N.t('review.totalPerVisit', 'Total per visit') : CGI18N.t('review.totalToPay', 'Total to pay')}</h4>
        <p class="review-total-price">${currencySymbol}${total.toFixed(0)}${isRecurring ? ` <span class="review-discount-tag">/ ${frequencyOption.label.toLowerCase()}</span>` : ''} ${discount > 0 ? `<span class="review-discount-tag">${CGI18N.t('review.discountApplied', '(discount applied)')}</span>` : ''}</p>
        ${computeGstComponent(total) > 0 ? `<p class="review-gst-note">${CGI18N.tf('review.includesGst', a => `Includes ${a} GST`, `${currencySymbol}${computeGstComponent(total).toFixed(2)}`)}</p>` : ''}
      </div>
    `;

    document.querySelectorAll('.review-edit').forEach(btn => {
      btn.addEventListener('click', () => showStep(Number(btn.dataset.goto)));
    });
  }

  /* ============ Form submission — create booking, then redirect to Stripe ============ */
  function setSubmitting(isSubmitting) {
    btnSubmit.disabled = isSubmitting;
    btnSubmit.textContent = isSubmitting
      ? CGI18N.t('form.redirectingPayment', 'Redirecting to secure payment…')
      : CGI18N.t('form.confirmPay', 'Confirm and pay →');
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
      removeBtn.setAttribute('aria-label', CGI18N.tf('photo.remove', n => `Remove ${n}`, file.name));
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
        showToast(CGI18N.tf('toast.maxPhotos', (m, a) => `You can upload up to ${m} photos. Only the first ${a} were added.`, MAX_PHOTOS, room));
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
      const res = await csrfFetch(`/api/bookings/${encodeURIComponent(bookingId)}/photos`, {
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
      accessInstructions: document.getElementById('accessInstructions').value || null,
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
      agentEmail: els.agentEmail.value || null,
      language: CGI18N.getLang(),
    };

    setSubmitting(true);
    try {
      const bookingRes = await csrfFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const bookingData = await bookingRes.json();
      if (!bookingRes.ok) throw new Error(bookingData.error || 'Could not create the booking');

      await uploadPropertyPhotos(bookingData.bookingId);

      const sessionRes = await csrfFetch('/api/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingData.bookingId }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error || 'Could not start the payment');

      window.location.href = sessionData.url;
    } catch (err) {
      showToast(err.message || CGI18N.t('toast.genericError', 'Something went wrong. Please try again.'));
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

  // One function owns the menu's state so the class, aria-expanded and the
  // button's label can never drift apart — every path that opens or closes
  // the menu (button, link, Escape, outside click) goes through here.
  function setNavOpen(open) {
    mainNav.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open
      ? CGI18N.t('header.closeMenu', 'Close menu')
      : CGI18N.t('header.openMenu', 'Open menu'));
  }

  navToggle.addEventListener('click', () => setNavOpen(!mainNav.classList.contains('open')));
  mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setNavOpen(false)));

  // Escape closes the menu and returns focus to the control that opened it,
  // so a keyboard user isn't stranded inside a menu they can't dismiss.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mainNav.classList.contains('open')) {
      setNavOpen(false);
      navToggle.focus();
    }
  });

  // Tapping anywhere outside dismisses it — the expected behaviour for an
  // overlay menu on mobile, where there's no other obvious way out.
  document.addEventListener('click', e => {
    if (!mainNav.classList.contains('open')) return;
    if (mainNav.contains(e.target) || navToggle.contains(e.target)) return;
    setNavOpen(false);
  });

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

  // A handful of strings embed another element (a nested <span> that JS fills
  // in separately, or a couple of <a data-modal> links) — data-i18n only
  // swaps textContent/innerHTML wholesale, so these are rebuilt by hand
  // instead, keeping the exact child element/id the rest of the code expects.
  function applySpecialSpanishStrings() {
    if (CGI18N.getLang() !== 'es') return;
    document.getElementById('reCleanReminderLabel').innerHTML =
      '<input type="checkbox" id="reCleanReminder" name="reCleanReminder" checked> Notifícame si mi arrendador/agente no queda conforme con algo (re-limpieza gratuita dentro de <span id="recleanWindowHours">72h</span>)';
    document.getElementById('termsAgreeLabel').innerHTML =
      '<input type="checkbox" id="terms" name="terms" required> Acepto los <a href="#" data-modal="terms">términos y condiciones</a> y la <a href="#" data-modal="privacy">política de privacidad</a> *';
    document.getElementById('agentNotifyLabel').innerHTML =
      '<input type="checkbox" id="agentEmailToggle"> Notificar automáticamente a mi administrador de propiedad cuando la limpieza esté lista (opcional)';
    document.getElementById('faqA1').innerHTML =
      'Ofrecemos una garantía de re-limpieza gratuita dentro de <span id="faqRecleanWindowHours">72 hours</span> desde el servicio si algún ítem del checklist no cumple con el estándar de tu arrendador o agente.';
  }

  /* ============ Init ============ */
  async function init() {
    CGI18N.applyStatic();
    CGI18N.initToggleButtons();
    applySpecialSpanishStrings();

    const res = await fetch(`/api/config?lang=${CGI18N.getLang()}`);
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

    // Must run after renderBookingWizard, which is what populates the
    // selects and sets the date field's min/max.
    initLiveValidation();

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
      csrfFetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone }),
      }).catch(() => {});
    }
    document.getElementById('email').addEventListener('blur', captureLead);
    document.getElementById('phone').addEventListener('blur', captureLead);
    document.getElementById('keyAccess').addEventListener('change', () => {
      updateAccessPolicyUI(cfg);
      updatePriceSummary();
    });
    document.getElementById('agentEmailToggle').addEventListener('change', e => {
      document.getElementById('agentEmailWrap').hidden = !e.target.checked;
      if (!e.target.checked) els.agentEmail.value = '';
    });
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
        promoFeedback.textContent = CGI18N.tf('promo.applied', p => `✓ Code applied: ${p}% off`, Math.round(state.promoDiscount * 100));
        promoFeedback.className = 'promo-feedback promo-feedback-valid';
      } else if (looksLikeReferralCode) {
        promoFeedback.hidden = false;
        promoFeedback.textContent = CGI18N.t('promo.referral', 'We\'ll verify this code and apply your discount at checkout.');
        promoFeedback.className = 'promo-feedback promo-feedback-valid';
      } else {
        promoFeedback.hidden = false;
        promoFeedback.textContent = CGI18N.t('promo.invalid', '✗ This code isn\'t valid');
        promoFeedback.className = 'promo-feedback promo-feedback-invalid';
      }
      updatePriceSummary();
    });

    const dateInput = document.getElementById('bookingDate');
    dateInput.min = new Date().toISOString().split('T')[0];
    // A rolling horizon (not a fixed calendar-year cutoff) so nothing needs
    // special-casing in December for a January booking — see the matching
    // isValidBookingDate in server/config.js, which enforces this
    // independently either way.
    const maxBookingDate = new Date();
    maxBookingDate.setDate(maxBookingDate.getDate() + (cfg.booking.maxBookingHorizonDays ?? 90));
    dateInput.max = maxBookingDate.toISOString().split('T')[0];
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

    initScrollEffects();
    await checkResumePayment();
    applyReferralCodeFromUrl();
    applyRebookPrefill();
  }

  // Reveals .reveal elements the first time they scroll into view, and adds
  // a subtle shadow to the sticky header once the page has scrolled past
  // the hero — both purely cosmetic, so failing quietly (e.g. no
  // IntersectionObserver support) never blocks the page from working.
  function initScrollEffects() {
    const revealTargets = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && revealTargets.length) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      revealTargets.forEach(el => observer.observe(el));
    } else {
      revealTargets.forEach(el => el.classList.add('is-visible'));
    }

    const header = document.querySelector('.site-header');
    if (header) {
      const toggleHeaderShadow = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
      toggleHeaderShadow();
      window.addEventListener('scroll', toggleHeaderShadow, { passive: true });
    }
  }

  // If Stripe checkout was cancelled or a card was declined, the customer
  // lands back here via a URL carrying their existing booking id (see
  // cancel_url in server/routes/payments.js) — their time slot is already
  // held, so this offers a one-click way to pay again instead of silently
  // hitting "that slot is taken" if they try to fill out the form fresh.
  async function checkResumePayment() {
    const bookingId = new URLSearchParams(location.search).get('resume');
    if (!bookingId) return;

    let booking;
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`);
      if (!res.ok) return;
      booking = await res.json();
    } catch {
      return;
    }
    if (booking.status !== 'pending_payment') return;

    const banner = document.getElementById('resumeBanner');
    if (CGI18N.getLang() === 'es') {
      document.getElementById('resumeBannerText').innerHTML =
        'Ya comenzaste una reserva (<strong id="resumeBookingRef"></strong>) que aún no se ha pagado. Continúa donde la dejaste en vez de llenar el formulario de nuevo.';
    }
    document.getElementById('resumeBookingRef').textContent = booking.id;
    banner.hidden = false;
    document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.getElementById('resumePaymentBtn').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = CGI18N.t('resume.redirecting', 'Redirecting…');
      try {
        const res = await csrfFetch('/api/checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: booking.id }),
        });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error || 'Could not resume payment');
        window.location.href = data.url;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = CGI18N.t('resume.button', 'Resume payment');
        showToast(err.message);
      }
    });
  }

  // A referral share link (see the account portal's "Share" button) carries
  // the friend's code as ?ref=FRIEND-XXXX so they don't have to type it in —
  // it's the same promoCode field the server already resolves at checkout.
  function applyReferralCodeFromUrl() {
    const ref = new URLSearchParams(location.search).get('ref');
    if (!ref) return;
    els.promoCode.value = ref;
    els.promoCode.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', location.pathname + location.hash);
  }

  // "Book again" from the account portal stashes the previous booking's
  // property/contact details in sessionStorage (see account/app.js) and
  // sends the customer here with ?rebook=1 — same-tab, same-origin, so the
  // data never travels through a URL or server log.
  function applyRebookPrefill() {
    if (new URLSearchParams(location.search).get('rebook') !== '1') return;
    const raw = sessionStorage.getItem('cg_rebook_prefill');
    sessionStorage.removeItem('cg_rebook_prefill');
    history.replaceState(null, '', location.pathname + location.hash);
    if (!raw) return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.propertyType) {
      const pillBtn = document.querySelector(`#propertyTypePills .pill[data-value="${CSS.escape(data.propertyType)}"]`);
      if (pillBtn) pillBtn.click();
    }
    if (data.bedrooms != null) els.bedrooms.value = data.bedrooms;
    if (data.bathrooms != null) els.bathrooms.value = data.bathrooms;
    if (data.sqm != null) document.getElementById('sqm').value = data.sqm;
    if (data.furnished) document.getElementById('furnished').value = data.furnished;
    if (data.fullName) document.getElementById('fullName').value = data.fullName;
    if (data.phone) document.getElementById('phone').value = data.phone;
    if (data.email) document.getElementById('email').value = data.email;
    if (data.address) document.getElementById('address').value = data.address;
    if (data.postcode) document.getElementById('postcode').value = data.postcode;

    updatePriceSummary();
    document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(CGI18N.t('toast.rebookApplied', 'Your previous property details are pre-filled — please pick a new date and time.'));
  }

  init().catch(err => {
    console.error('Could not load the site configuration:', err);
    showToast(CGI18N.t('toast.siteLoadError', 'Could not load the site. Please refresh the page.'));
  });
})();
