import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

export function renderIndexHtml(baseUrl) {
  const { business } = config;
  const replacements = {
    '{{SITE_TITLE}}': `${business.name} | Reserva tu servicio online`,
    '{{SITE_DESCRIPTION}}': business.seoDescription || business.heroDescription,
    '{{SITE_URL}}': baseUrl,
    '{{SITE_NAME}}': business.name,
    '{{SITE_ICON}}': business.logoEmoji,
  };
  return Object.entries(replacements).reduce(
    (html, [token, value]) => html.replaceAll(token, escapeHtml(value)),
    template
  );
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
