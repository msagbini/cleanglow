// Cookie-based auth for the customer/agent account portal — the cookie value
// itself is a high-entropy random token (crypto.randomUUID()) stored
// server-side in customer_sessions, the same "unguessable id as the bearer
// credential" pattern used everywhere else in this app, just carried in an
// httpOnly cookie instead of a URL so it survives across visits without the
// customer having to keep re-requesting a magic link.
import { parse } from 'cookie';
import { getCustomerSession } from '../db.js';

export const SESSION_COOKIE_NAME = 'cg_session';

export function requireCustomerSession(req, res, next) {
  const cookies = parse(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  const session = getCustomerSession(token);
  if (!session) return res.status(401).json({ error: 'Your session has expired. Please request a new login link.' });

  req.customerEmail = session.email;
  next();
}
