// CSRF protection for the *public* write endpoints (booking, checkout,
// photo upload, lead capture). The authenticated surfaces (/api/admin,
// /api/cleaner, /api/account) already sit behind requireSameOrigin; this
// covers the unauthenticated booking funnel, which had nothing at all.
//
// Pattern: double-submit cookie. The server issues one random token, sends
// it back two ways — an httpOnly cookie and a <meta name="csrf-token"> in
// the server-rendered HTML — and every unsafe request must echo the meta
// value in an X-CSRF-Token header. An attacker's page can trigger the
// cookie to be sent (cookies are attached cross-site) but cannot read the
// meta tag out of our HTML (same-origin policy), so it can't produce a
// matching header. httpOnly means the token is also out of reach of any XSS
// that manages to run script on the page.
//
// Origin/Referer is checked as a second, independent layer: a request that
// somehow carries a valid token but declares a foreign origin is still
// rejected.
import crypto from 'node:crypto';
import { parse, serialize } from 'cookie';

export const CSRF_COOKIE_NAME = 'cg_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h — comfortably longer than any booking session
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function readCookieToken(req) {
  const value = parse(req.headers.cookie || '')[CSRF_COOKIE_NAME];
  // Only accept a well-formed token — a malformed/injected cookie value
  // should be replaced, never compared against.
  return /^[0-9a-f]{64}$/.test(value || '') ? value : null;
}

// Returns the token the current visitor should embed in their HTML, reusing
// the one they already hold so a page served from the browser's back/forward
// cache never carries a token the cookie no longer matches.
export function issueCsrfToken(req, res) {
  const existing = readCookieToken(req);
  const token = existing || crypto.randomBytes(32).toString('hex');
  if (!existing) {
    res.append('Set-Cookie', serialize(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure || req.get('x-forwarded-proto') === 'https',
      path: '/',
      maxAge: TOKEN_MAX_AGE_SECONDS,
    }));
  }
  return token;
}

function sameOrigin(req) {
  const originHeader = req.headers.origin || req.headers.referer;
  if (!originHeader) return false;
  try {
    return new URL(originHeader).host === req.get('host');
  } catch {
    return false;
  }
}

export function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  if (!sameOrigin(req)) {
    return res.status(403).json({ error: 'Cross-origin request rejected', code: 'csrf' });
  }

  const cookieToken = readCookieToken(req);
  const headerToken = req.get(CSRF_HEADER_NAME);
  const valid =
    cookieToken &&
    typeof headerToken === 'string' &&
    headerToken.length === cookieToken.length &&
    crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));

  if (!valid) {
    // `code` lets the client tell a CSRF rejection apart from a validation
    // 403 and transparently re-fetch a token + retry once (see app.js).
    return res.status(403).json({ error: 'Invalid or missing CSRF token. Please reload the page and try again.', code: 'csrf' });
  }
  next();
}
