import { Router } from 'express';
import { listSuburbs } from '../suburbs.js';
import { resolveBaseUrl } from '../baseUrl.js';
import { LEGAL_PAGES } from '../legal.js';

const router = Router();

router.get('/robots.txt', (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    // These are reached only through an unguessable token in the URL (a
    // cleaner's job link, a customer's proof-of-clean page, the account
    // portal). They already carry <meta name="robots" content="noindex">,
    // but a crawler has to fetch a private URL to see that — keeping them
    // out of robots.txt means it never requests them in the first place.
    'Disallow: /cleaner/',
    'Disallow: /proof/',
    'Disallow: /account/',
    'Disallow: /success.html',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join('\n'));
});

// The content of these pages changes only when config/business.json does,
// which is also the only thing that can change the build — so the process
// start time is an honest <lastmod> without needing to track edits.
const LASTMOD = new Date().toISOString().slice(0, 10);

router.get('/sitemap.xml', (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  // Same-page #anchors aren't distinct indexable pages to Google, so those
  // stay off the list — but the suburb landing pages are genuinely distinct
  // server-rendered URLs, so they belong here.
  const urls = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    ...listSuburbs().map(s => ({ loc: `/end-of-lease-cleaning-${s.slug}`, priority: '0.8', changefreq: 'monthly' })),
    ...Object.values(LEGAL_PAGES).map(p => ({ loc: p.path, priority: '0.3', changefreq: 'yearly' })),
  ];
  const body = urls
    .map(u => `  <url>\n    <loc>${baseUrl}${u.loc}</loc>\n    <lastmod>${LASTMOD}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join('\n');
  // Crawlers re-fetch this often; a short cache keeps it cheap without
  // holding a stale list after a redeploy adds a suburb.
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
});

export default router;
