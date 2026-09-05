// Suburb landing pages — one per entry in config.booking's business.serviceAreas,
// server-rendered (no client JS dependency) so search engines see real,
// distinct content per URL instead of duplicate/thin pages. Booking itself
// still happens on the single home-page form (not duplicated per suburb) —
// every page's CTA links back to /#booking, keeping pricing/availability
// logic in one place.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ASSET_VERSION } from './assetVersion.js';
import { businessNode, serviceNode, addressText, lowestPrice } from './structuredData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(__dirname, '..', 'public', 'suburb.html'), 'utf8');

export function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

const suburbs = (config.business.serviceAreas || []).map(name => ({ name, slug: slugify(name) }));
const suburbBySlug = Object.fromEntries(suburbs.map(s => [s.slug, s]));

export function listSuburbs() {
  return suburbs;
}

export function getSuburbBySlug(slug) {
  return suburbBySlug[slug] ?? null;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

export function renderSuburbHtml(suburb, baseUrl, gaMeasurementId = '') {
  const { business } = config;
  const canonicalUrl = `${baseUrl}/end-of-lease-cleaning-${suburb.slug}`;
  const title = `End of Lease Cleaning in ${suburb.name} | ${business.name}`;
  const description = `Professional end of lease / bond cleaning in ${suburb.name}, Melbourne. 100% bond-back guarantee*, instant online quotes, fully insured cleaners. Book in 3 minutes.`;
  const ogImage = business.ogImageUrl ? `${baseUrl}${business.ogImageUrl}` : '';
  const recleanDays = Math.round((business.recleanWindowHours ?? 168) / 24);

  const otherSuburbsHtml = suburbs
    .filter(s => s.slug !== suburb.slug)
    .map(s => `<a href="/end-of-lease-cleaning-${s.slug}">${escapeHtml(s.name)}</a>`)
    .join('\n            ');

  // @graph: the one business entity (same @id as the home page — this is
  // not a different business per suburb), the priced service scoped to this
  // suburb, and the breadcrumb trail back to the homepage — the latter is
  // what lets a result render "cleanglow… › End of lease cleaning › Fitzroy"
  // instead of a bare URL.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      businessNode(baseUrl),
      serviceNode(baseUrl, {
        id: `${canonicalUrl}#service`,
        url: canonicalUrl,
        area: suburb.name,
        name: `${business.name} — End of lease cleaning in ${suburb.name}`,
      }),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'End of lease cleaning', item: `${baseUrl}/#services` },
          { '@type': 'ListItem', position: 3, name: suburb.name, item: canonicalUrl },
        ],
      },
    ],
  });

  const priceFrom = lowestPrice();

  const replacements = {
    '{{SUBURB_NAME}}': escapeHtml(suburb.name),
    '{{SITE_TITLE}}': escapeHtml(title),
    '{{SITE_DESCRIPTION}}': escapeHtml(description),
    '{{CANONICAL_URL}}': escapeHtml(canonicalUrl),
    '{{ASSET_VERSION}}': ASSET_VERSION,
    '{{ANALYTICS_META}}': gaMeasurementId
      ? `<meta name="ga-measurement-id" content="${escapeHtml(gaMeasurementId)}">`
      : '',
    '{{SITE_NAME}}': escapeHtml(business.name),
    '{{SITE_ICON_HREF}}': escapeHtml(business.logoUrl || '/img/logo-mark.svg'),
    '{{SITE_OG_IMAGE}}': escapeHtml(ogImage),
    '{{PHONE_DISPLAY}}': escapeHtml(business.phoneDisplay || ''),
    '{{PHONE_HREF}}': escapeHtml(business.phone || ''),
    '{{EMAIL}}': escapeHtml(business.email || ''),
    '{{HOURS_TEXT}}': escapeHtml(business.hours || ''),
    '{{ADDRESS_TEXT}}': escapeHtml(addressText(business)),
    '{{PRICE_FROM}}': priceFrom === null ? '' : `${escapeHtml(business.currencySymbol || '$')}${priceFrom}`,
    '{{RECLEAN_WINDOW_DAYS}}': String(recleanDays),
    '{{OTHER_SUBURBS_LINKS}}': otherSuburbsHtml,
    '{{JSONLD}}': jsonLd,
  };
  // Function replacement so "$&"/"$`"/"$'" in a value stay literal — see renderIndex.js.
  return Object.entries(replacements).reduce((html, [token, value]) => html.replaceAll(token, () => value), template);
}
