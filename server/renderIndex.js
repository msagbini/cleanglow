import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const FALLBACK_ICON_HREF = business => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E${encodeURIComponent(business.logoEmoji)}%3C/text%3E%3C/svg%3E`;

function buildLocalBusinessJsonLd(business, baseUrl) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'HousekeepingService',
    name: business.name,
    description: business.seoDescription || business.heroDescription,
    url: baseUrl,
    telephone: business.phone,
    priceRange: '$$',
    areaServed: (business.serviceAreas || []).map(name => ({ '@type': 'City', name })),
  });
}

export function renderIndexHtml(baseUrl) {
  const { business } = config;
  const iconHref = business.logoUrl || FALLBACK_ICON_HREF(business);
  const ogImage = business.ogImageUrl ? `${baseUrl}${business.ogImageUrl}` : '';
  const serviceAreasText = (business.serviceAreas || []).join(', ');
  const replacements = {
    '{{SITE_TITLE}}': escapeHtml(business.seoTitle || `${business.name} | Book your service online`),
    '{{SITE_DESCRIPTION}}': escapeHtml(business.seoDescription || business.heroDescription),
    '{{SITE_URL}}': escapeHtml(baseUrl),
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
    '{{LOCAL_BUSINESS_JSONLD}}': buildLocalBusinessJsonLd(business, baseUrl),
  };
  return Object.entries(replacements).reduce(
    (html, [token, value]) => html.replaceAll(token, value),
    template
  );
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
