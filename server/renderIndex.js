import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const FALLBACK_ICON_HREF = business => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E${encodeURIComponent(business.logoEmoji)}%3C/text%3E%3C/svg%3E`;

export function renderIndexHtml(baseUrl) {
  const { business } = config;
  const iconHref = business.logoUrl || FALLBACK_ICON_HREF(business);
  const ogImage = business.ogImageUrl ? `${baseUrl}${business.ogImageUrl}` : '';
  const replacements = {
    '{{SITE_TITLE}}': escapeHtml(`${business.name} | Book your service online`),
    '{{SITE_DESCRIPTION}}': escapeHtml(business.seoDescription || business.heroDescription),
    '{{SITE_URL}}': escapeHtml(baseUrl),
    '{{SITE_NAME}}': escapeHtml(business.name),
    '{{SITE_ICON_HREF}}': escapeHtml(iconHref),
    '{{SITE_OG_IMAGE}}': escapeHtml(ogImage),
  };
  return Object.entries(replacements).reduce(
    (html, [token, value]) => html.replaceAll(token, value),
    template
  );
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
