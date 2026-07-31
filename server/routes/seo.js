import { Router } from 'express';

const router = Router();

router.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
    ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api', `Sitemap: ${baseUrl}/sitemap.xml`].join('\n')
  );
});

router.get('/sitemap.xml', (req, res) => {
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  // Same-page #anchors aren't distinct indexable pages to Google — this is
  // a genuine single-page site today, so the honest sitemap lists just the
  // one real URL. Suburb landing pages are a "later" item, not today's scope.
  const urls = ['/'];
  const body = urls.map(u => `  <url><loc>${baseUrl}${u}</loc></url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
});

export default router;
