import { Router } from 'express';
import { getPublicConfig } from '../config.js';
import { buildLegalContent } from '../legal.js';
import { GA_MEASUREMENT_ID } from '../analytics.js';

const router = Router();

router.get('/', (req, res) => {
  const lang = req.query.lang === 'es' ? 'es' : 'en';
  // A copy: getPublicConfig() hands back the config singleton for English,
  // and the legal copy must not be written onto it.
  res.json({
    ...getPublicConfig(lang),
    legal: buildLegalContent({ lang, analyticsEnabled: Boolean(GA_MEASUREMENT_ID) }),
  });
});

export default router;
