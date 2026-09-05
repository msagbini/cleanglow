// Real pages for the legal copy (see server/legal.js for why). Same chrome
// as the suburb pages, same tokens, same escaping rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ASSET_VERSION } from './assetVersion.js';
import { buildLegalContent, LEGAL_PAGES } from './legal.js';
import { addressText, businessNode } from './structuredData.js';
import { analyticsHtmlAttrs } from './renderIndex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(__dirname, '..', 'public', 'legal.html'), 'utf8');

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

export function renderLegalHtml(key, { baseUrl, lang = 'en', gaMeasurementId = '' }) {
  const page = LEGAL_PAGES[key];
  if (!page) return null;
  const { business } = config;
  const content = buildLegalContent({ lang, analyticsEnabled: Boolean(gaMeasurementId), headingTag: 'h2' });
  const entry = content[key];
  const canonicalUrl = `${baseUrl}${page.path}`;
  const otherPolicies = Object.entries(LEGAL_PAGES)
    .filter(([k]) => k !== key)
    .map(([k, p]) => `<a href="${p.path}${lang === 'es' ? '?lang=es' : ''}">${escapeHtml(content[k].title)}</a>`)
    .join('');
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      businessNode(baseUrl),
      {
        '@type': 'WebPage',
        '@id': canonicalUrl,
        name: entry.title,
        description: page.description,
        url: canonicalUrl,
        inLanguage: lang === 'es' ? 'es' : 'en-AU',
        isPartOf: { '@type': 'WebSite', name: business.name, url: `${baseUrl}/` },
        about: { '@id': `${baseUrl}/#business` },
      },
    ],
  });
  const replacements = {
    '{{LANG}}': lang === 'es' ? 'es' : 'en-AU',
    '{{ANALYTICS_HTML_ATTRS}}': analyticsHtmlAttrs(gaMeasurementId),
    '{{ANALYTICS_META}}': gaMeasurementId
      ? `<meta name="ga-measurement-id" content="${escapeHtml(gaMeasurementId)}">`
      : '',
    '{{ASSET_VERSION}}': ASSET_VERSION,
    '{{PAGE_TITLE}}': escapeHtml(entry.title),
    '{{PAGE_DESCRIPTION}}': escapeHtml(page.description),
    '{{CANONICAL_URL}}': escapeHtml(canonicalUrl),
    '{{SITE_NAME}}': escapeHtml(business.name),
    '{{SITE_ICON_HREF}}': escapeHtml(business.logoUrl || '/img/logo-mark.svg'),
    '{{SITE_OG_IMAGE}}': escapeHtml(business.ogImageUrl ? `${baseUrl}${business.ogImageUrl}` : ''),
    '{{PHONE_DISPLAY}}': escapeHtml(business.phoneDisplay || ''),
    '{{PHONE_HREF}}': escapeHtml(business.phone || ''),
    '{{EMAIL}}': escapeHtml(business.email || ''),
    '{{ABN}}': escapeHtml(business.abn || ''),
    '{{HOURS_TEXT}}': escapeHtml(business.hours || ''),
    '{{ADDRESS_TEXT}}': escapeHtml(addressText(business)),
    '{{BODY}}': entry.body,
    '{{OTHER_POLICIES}}': otherPolicies,
    '{{JSONLD}}': jsonLd,
    '{{THEME_COLOR}}': escapeHtml(config.theme?.primary || '#0f7a6b'),
  };
  return Object.entries(replacements).reduce((html, [token, value]) => html.replaceAll(token, () => value), template);
}
