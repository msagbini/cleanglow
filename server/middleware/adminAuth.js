import crypto from 'node:crypto';

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so pad instead of short-circuiting
  // on .length first (that comparison itself would leak length via timing).
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function adminAuth(req, res, next) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) {
    return res.status(503).json({ error: 'Panel de administración no configurado. Define ADMIN_USER y ADMIN_PASS en .env.' });
  }

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sepIndex = decoded.indexOf(':');
    const reqUser = sepIndex === -1 ? decoded : decoded.slice(0, sepIndex);
    const reqPass = sepIndex === -1 ? '' : decoded.slice(sepIndex + 1);
    if (safeEqual(reqUser, user) && safeEqual(reqPass, pass)) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Autenticación requerida');
}
