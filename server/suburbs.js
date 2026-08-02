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

export function renderSuburbHtml(suburb, baseUrl) {
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

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'HousekeepingService',
    name: business.name,
    description,
    url: canonicalUrl,
    telephone: business.phone,
    priceRange: '$$',
    areaServed: { '@type': 'City', name: suburb.name },
  });

  const replacements = {
    '{{SUBURB_NAME}}': escapeHtml(suburb.name),
    '{{SITE_TITLE}}': escapeHtml(title),
    '{{SITE_DESCRIPTION}}': escapeHtml(description),
    '{{CANONICAL_URL}}': escapeHtml(canonicalUrl),
    '{{SITE_NAME}}': escapeHtml(business.name),
    '{{SITE_ICON_HREF}}': escapeHtml(business.logoUrl || '/img/logo-mark.svg'),
    '{{SITE_OG_IMAGE}}': escapeHtml(ogImage),
    '{{PHONE_DISPLAY}}': escapeHtml(business.phoneDisplay || ''),
    '{{PHONE_HREF}}': escapeHtml(business.phone || ''),
    '{{RECLEAN_WINDOW_DAYS}}': String(recleanDays),
    '{{OTHER_SUBURBS_LINKS}}': otherSuburbsHtml,
    '{{JSONLD}}': jsonLd,
  };
  return Object.entries(replacements).reduce((html, [token, value]) => html.replaceAll(token, value), template);
}
