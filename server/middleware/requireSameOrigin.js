// Basic Auth credentials are cached by the browser and auto-attached to any
// request to this origin, regardless of which page triggered it — unlike a
// cookie, they get none of SameSite's protection. A bare cross-site
// auto-submitting form (no body needed) is enough to trigger a state-changing
// admin action if the admin's browser has cached credentials. Browsers always
// set Origin (falling back to Referer) on requests using an unsafe method, so
// checking it here blocks that class of attack without needing a session/
// CSRF-token system this app doesn't otherwise have.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const expectedHost = req.get('host');
  const originHeader = req.headers.origin || req.headers.referer;
  if (!originHeader) {
    return res.status(403).json({ error: 'Missing Origin header' });
  }

  let actualHost;
  try {
    actualHost = new URL(originHeader).host;
  } catch {
    return res.status(403).json({ error: 'Invalid Origin header' });
  }

  if (actualHost !== expectedHost) {
    return res.status(403).json({ error: 'Cross-origin request rejected' });
  }

  next();
}
