import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ASSET_VERSION } from './assetVersion.js';
import { businessNode, serviceNode, addressText, recleanWindowText } from './structuredData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const FALLBACK_ICON_HREF = business => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E${encodeURIComponent(business.logoEmoji)}%3C/text%3E%3C/svg%3E`;

function buildBusinessJsonLd(baseUrl) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [businessNode(baseUrl), serviceNode(baseUrl)],
  });
}

// The FAQ accordion and its FAQPage markup come from the same config list,
// so the answer a visitor reads and the answer a crawler indexes can never
// disagree (they did: the HTML default said "72 hours" until JS ran, while
// the JSON-LD said "7 days").
function faqItems({ business, faq }) {
  const gstNote = business.gstRegistered ? ' All prices include GST.' : '';
  const windowText = recleanWindowText(business);
  return (faq || []).map(item => ({
    q: item.q,
    text: item.a.replaceAll('{recleanWindow}', windowText).replaceAll('{gstNote}', gstNote),
    html: escapeHtml(item.a)
      // The span is what app.js's formatWindow() updates; it must survive escaping.
      .replaceAll('{recleanWindow}', `<span id="faqRecleanWindowHours">${escapeHtml(windowText)}</span>`)
      .replaceAll('{gstNote}', escapeHtml(gstNote)),
  }));
}

function buildFaqHtml(config) {
  return faqItems(config).map((item, i) => `
      <div class="accordion-item">
        <button class="accordion-trigger" aria-expanded="false" data-i18n="faq.q${i + 1}">${escapeHtml(item.q)}</button>
        <div class="accordion-panel"><p${i === 0 ? ' id="faqA1"' : ` data-i18n="faq.a${i + 1}"`}>${item.html}</p></div>
      </div>`).join('');
}

function buildFaqJsonLd(config) {
  const items = faqItems(config);
  if (!items.length) return '';
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.text },
    })),
  })}</script>`;
}

// Mirrors renderPricingTiers() in public/js/app.js — same markup — so the
// prices exist in the served HTML (crawlers, no-JS) and the client pass
// replaces them with an identical block.
function buildPricingCardsHtml({ business, pricingTiers }) {
  const symbol = escapeHtml(business.currencySymbol);
  return (pricingTiers || []).map((tier, i) => `
      <div class="price-card reveal reveal-delay-${i + 1} ${tier.featured ? 'featured' : ''}" ${tier.presetBedrooms ? `data-preset-bedrooms="${escapeHtml(tier.presetBedrooms)}"` : ''}>
        ${tier.featured ? '<span class="price-tag">Most booked</span>' : ''}
        <h3>${escapeHtml(tier.label)}</h3>
        <p class="price">from ${symbol}${escapeHtml(tier.priceFrom)}</p>
        <ul>${(tier.features || []).map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
        ${tier.presetBedrooms ? '<button type="button" class="btn btn-primary btn-sm price-card-select">Book this size</button>' : ''}
      </div>`).join('');
}

// Mirrors renderHero() in public/js/app.js — same sample selection, same
// markup — so the client-side pass replaces this with an identically sized
// block and nothing moves.
function buildHeroCardRows({ business, booking }) {
  const sampleSize = booking.sizeField.options[Math.min(2, booking.sizeField.options.length - 1)];
  const sampleExtras = booking.extras.slice(0, 2);
  const sampleType = booking.serviceTypes[0];
  const total = sampleSize.price + sampleType.surcharge + sampleExtras.reduce((sum, e) => sum + e.price, 0);
  const symbol = escapeHtml(business.currencySymbol);
  const row = (label, value, extraClass = '') =>
    `<div class="hero-card-row${extraClass}"><span><span class="inline-icon"></span>${label}</span><span>${value}</span></div>`;
  return [
    row(`${escapeHtml(sampleType.label)} ${escapeHtml(sampleSize.label)}`, `from ${symbol}${sampleSize.price}`),
    ...sampleExtras.map(e => row(escapeHtml(e.label), `+ ${symbol}${e.price}`)),
    `<div class="hero-card-row hero-card-total"><span>Estimated total</span><span>${symbol}${total}</span></div>`,
  ].join('');
}

export function renderIndexHtml(baseUrl, csrfToken = '', gaMeasurementId = '', searchConsoleToken = '') {
  const { business, theme } = config;
  const iconHref = business.logoUrl || FALLBACK_ICON_HREF(business);
  const ogImage = business.ogImageUrl ? `${baseUrl}${business.ogImageUrl}` : '';
  const serviceAreasText = (business.serviceAreas || []).join(', ');
  const replacements = {
    '{{SITE_TITLE}}': escapeHtml(business.seoTitle || `${business.name} | Book your service online`),
    '{{SITE_DESCRIPTION}}': escapeHtml(business.seoDescription || business.heroDescription),
    '{{SITE_URL}}': escapeHtml(baseUrl),
    '{{ASSET_VERSION}}': ASSET_VERSION,
    '{{SITE_NAME}}': escapeHtml(business.name),
    '{{SITE_ICON_HREF}}': escapeHtml(iconHref),
    '{{SITE_OG_IMAGE}}': escapeHtml(ogImage),
    // Server-rendered so a crawler (or anything that doesn't execute JS) sees
    // the real hero copy and service areas immediately — these previously
    // only existed as JS-filled placeholder text ("Loading…") in the raw
    // HTML. The client-side render in app.js still runs on top of this and
    // is harmless/idempotent for real browsers.
    '{{HERO_TITLE_HTML}}': business.heroTitleHtml,
    '{{HERO_DESCRIPTION}}': escapeHtml(business.heroDescription),
    '{{SERVICE_AREAS_TEXT}}': escapeHtml(serviceAreasText),
    // The rest of the hero copy, for the same reason as the title above —
    // and because these three were the last things still growing .hero-copy
    // after first paint, which measured a 0.38 cumulative layout shift on
    // its own. The icon slot is emitted empty but at its final size, so the
    // client-side pass (which owns the SVG icon set) drops the icons into
    // boxes that were already reserved and nothing moves.
    '{{HERO_BADGE}}': escapeHtml(business.badgeText || ''),
    '{{HERO_TRUST_HTML}}': (business.heroTrust || [])
      .map(item => `<li><span class="hero-trust-icon"></span><span>${escapeHtml(item.text)}</span></li>`)
      .join(''),
    '{{HERO_FOOTNOTE_HTML}}': business.guaranteeFootnote
      ? `${escapeHtml(business.guaranteeFootnote)} <a href="/terms" data-modal="terms">Guarantee Terms</a>`
      : '',
    // On mobile the quote card sits ABOVE the hero copy (.hero-visual has
    // order: -1), so filling it from JS pushed the whole hero down by ~185px
    // after first paint — the single largest remaining layout shift. Same
    // approach as the trust list: emit the real rows server-side with an
    // empty, correctly-sized icon slot for the client pass to fill.
    '{{HERO_CARD_ROWS_HTML}}': buildHeroCardRows(config),
    '{{LOCAL_BUSINESS_JSONLD}}': buildBusinessJsonLd(baseUrl),
    '{{FAQ_JSONLD}}': buildFaqJsonLd(config),
    '{{FAQ_HTML}}': buildFaqHtml(config),
    '{{PRICING_CARDS_HTML}}': buildPricingCardsHtml(config),
    // Contact details in the served HTML. They used to be hardcoded
    // placeholders ("(03) 9000 0000", a different business's email) that JS
    // overwrote after load — so every crawler and no-JS client saw the wrong
    // phone number.
    '{{PHONE_HREF}}': escapeHtml(business.phone || ''),
    '{{PHONE_DISPLAY}}': escapeHtml(business.phoneDisplay || business.phone || ''),
    '{{EMAIL}}': escapeHtml(business.email || ''),
    '{{HOURS_TEXT}}': escapeHtml(business.hours || ''),
    '{{ADDRESS_TEXT}}': escapeHtml(addressText(business)),
    // Double-submit CSRF token — the client reads this back out of the
    // meta tag and echoes it in X-CSRF-Token on every write request.
    '{{CSRF_TOKEN}}': escapeHtml(csrfToken),
    // Emitted only when analytics is configured — its absence is what makes
    // public/js/analytics.js inert (no gtag.js, no consent banner).
    '{{ANALYTICS_META}}': gaMeasurementId
      ? `<meta name="ga-measurement-id" content="${escapeHtml(gaMeasurementId)}">`
      : '',
    '{{ANALYTICS_HTML_ATTRS}}': analyticsHtmlAttrs(gaMeasurementId),
    '{{THEME_COLOR}}': escapeHtml(theme?.primary || '#0f7a6b'),
    // Search Console ownership proof, on the home page only (that is where
    // Google looks). Set SEARCH_CONSOLE_VERIFICATION to the token from
    // "HTML tag" verification; absent, nothing is emitted.
    '{{VERIFICATION_META}}': searchConsoleToken
      ? `<meta name="google-site-verification" content="${escapeHtml(searchConsoleToken)}">`
      : '',
  };
  return Object.entries(replacements).reduce(
    // The replacement is passed as a function, not a string: a string
    // replacement would still interpret "$&", "$`" and "$'" inside these
    // config-derived values (which now include "$"-prefixed prices) and
    // splice page content back into the output.
    (html, [token, value]) => html.replaceAll(token, () => value),
    template
  );
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// Consent-gated analytics is invisible in the served HTML by design (no
// gtag.js until the visitor accepts), which an auditor can't tell apart
// from "no analytics at all". These two static attributes on <html> declare
// what is going on — the measurement id, and that a consent step gates it —
// for anything reading the markup. Both are omitted when analytics is off:
// a consent marker without an id would claim a banner that never appears.
export function analyticsHtmlAttrs(gaMeasurementId) {
  return gaMeasurementId
    ? ` data-ga-id="${escapeHtml(gaMeasurementId)}" data-consent="analytics"`
    : '';
}

// success.html is rendered (not served off disk) so its tokens are filled:
// the analytics meta, the cache-busting asset version, and — so the page is
// a complete document even before success.js fills in the booking — the
// contact details, canonical URL and business name.
const successTemplate = fs.readFileSync(path.join(__dirname, '..', 'public', 'success.html'), 'utf8');

export function renderSuccessHtml(baseUrl, gaMeasurementId = '') {
  const { business, theme } = config;
  const replacements = {
    '{{ANALYTICS_META}}': gaMeasurementId
      ? `<meta name="ga-measurement-id" content="${escapeHtml(gaMeasurementId)}">`
      : '',
    '{{ANALYTICS_HTML_ATTRS}}': analyticsHtmlAttrs(gaMeasurementId),
    '{{ASSET_VERSION}}': ASSET_VERSION,
    '{{SITE_URL}}': escapeHtml(baseUrl),
    '{{SITE_NAME}}': escapeHtml(business.name),
    '{{SITE_ICON_HREF}}': escapeHtml(business.logoUrl || FALLBACK_ICON_HREF(business)),
    '{{SITE_OG_IMAGE}}': escapeHtml(business.ogImageUrl ? `${baseUrl}${business.ogImageUrl}` : ''),
    '{{PHONE_HREF}}': escapeHtml(business.phone || ''),
    '{{PHONE_DISPLAY}}': escapeHtml(business.phoneDisplay || business.phone || ''),
    '{{EMAIL}}': escapeHtml(business.email || ''),
    '{{ABN}}': escapeHtml(business.abn || ''),
    '{{THEME_COLOR}}': escapeHtml(theme?.primary || '#0f7a6b'),
  };
  return Object.entries(replacements).reduce(
    (html, [token, value]) => html.replaceAll(token, () => value),
    successTemplate
  );
}
