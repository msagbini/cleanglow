import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ASSET_VERSION } from './assetVersion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const FALLBACK_ICON_HREF = business => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E${encodeURIComponent(business.logoEmoji)}%3C/text%3E%3C/svg%3E`;

function buildLocalBusinessJsonLd(business, baseUrl) {
  const { booking } = config;
  const currency = (business.currencyCode || 'AUD').toUpperCase();

  // Real per-size prices straight from the pricing catalog, so the offers
  // published here can never drift from what the booking form charges.
  // Previously the only price signal was a generic priceRange: '$$'.
  const sizeOffers = (booking?.sizeField?.options || []).map(option => ({
    '@type': 'Offer',
    name: `End of lease clean — ${option.label}`,
    price: String(option.price),
    priceCurrency: currency,
    priceSpecification: {
      '@type': 'PriceSpecification',
      price: String(option.price),
      priceCurrency: currency,
      // Only asserted when the business is actually GST-registered — for a
      // non-registered business there is no GST component to claim is
      // included, and stating either value would misrepresent the price.
      ...(business.gstRegistered ? { valueAddedTaxIncluded: true } : {}),
    },
    availability: 'https://schema.org/InStock',
    url: `${baseUrl}/#booking`,
  }));

  const extraOffers = (booking?.extras || []).map(extra => ({
    '@type': 'Offer',
    name: extra.label || extra.key,
    price: String(extra.price),
    priceCurrency: currency,
    url: `${baseUrl}/#booking`,
  }));

  const prices = sizeOffers.map(o => Number(o.price)).filter(Number.isFinite);

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'HousekeepingService',
    '@id': `${baseUrl}/#business`,
    name: business.name,
    description: business.seoDescription || business.heroDescription,
    url: baseUrl,
    telephone: business.phone,
    email: business.email,
    image: business.ogImageUrl ? `${baseUrl}${business.ogImageUrl}` : undefined,
    priceRange: '$$',
    currenciesAccepted: currency,
    openingHours: business.hours,
    areaServed: (business.serviceAreas || []).map(name => ({ '@type': 'City', name })),
    // The concrete, priced thing being sold — this is what lets a result
    // carry a price, rather than just naming the business.
    makesOffer: [...sizeOffers, ...extraOffers],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'End of lease cleaning',
      itemListElement: sizeOffers.map(offer => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: offer.name, serviceType: 'End of lease cleaning' },
        price: offer.price,
        priceCurrency: offer.priceCurrency,
      })),
    },
    ...(prices.length ? {
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: currency,
        lowPrice: String(Math.min(...prices)),
        highPrice: String(Math.max(...prices)),
        offerCount: String(prices.length),
      },
    } : {}),
  });
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

export function renderIndexHtml(baseUrl, csrfToken = '', gaMeasurementId = '') {
  const { business } = config;
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
      ? `${escapeHtml(business.guaranteeFootnote)} <a href="#" data-modal="terms">Guarantee Terms</a>`
      : '',
    // On mobile the quote card sits ABOVE the hero copy (.hero-visual has
    // order: -1), so filling it from JS pushed the whole hero down by ~185px
    // after first paint — the single largest remaining layout shift. Same
    // approach as the trust list: emit the real rows server-side with an
    // empty, correctly-sized icon slot for the client pass to fill.
    '{{HERO_CARD_ROWS_HTML}}': buildHeroCardRows(config),
    '{{LOCAL_BUSINESS_JSONLD}}': buildLocalBusinessJsonLd(business, baseUrl),
    // Double-submit CSRF token — the client reads this back out of the
    // meta tag and echoes it in X-CSRF-Token on every write request.
    '{{CSRF_TOKEN}}': escapeHtml(csrfToken),
    // Emitted only when analytics is configured — its absence is what makes
    // public/js/analytics.js inert (no gtag.js, no consent banner).
    '{{ANALYTICS_META}}': gaMeasurementId
      ? `<meta name="ga-measurement-id" content="${escapeHtml(gaMeasurementId)}">`
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

// success.html carries no business copy — only the two tokens every page
// needs (the analytics meta tag and the asset-version cache buster). It used
// to be served straight off disk by express.static, which would have shipped
// the literal "{{ANALYTICS_META}}" text to the browser once tokens were
// added to it.
const successTemplate = fs.readFileSync(path.join(__dirname, '..', 'public', 'success.html'), 'utf8');

export function renderSuccessHtml(gaMeasurementId = '') {
  const replacements = {
    '{{ANALYTICS_META}}': gaMeasurementId
      ? `<meta name="ga-measurement-id" content="${escapeHtml(gaMeasurementId)}">`
      : '',
    '{{ASSET_VERSION}}': ASSET_VERSION,
  };
  return Object.entries(replacements).reduce(
    (html, [token, value]) => html.replaceAll(token, () => value),
    successTemplate
  );
}
