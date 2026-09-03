// Single source of truth for the public origin this site advertises to the
// outside world — canonical URLs, og:url, robots.txt, sitemap.xml, suburb
// landing pages, Stripe success/cancel URLs and emailed links.
//
// This exists because that origin was previously read straight from
// process.env.PUBLIC_BASE_URL in four separate places. When that variable was
// left pointing at an old Railway-generated domain from a previous service,
// every canonical and og:url on the live site advertised a domain that isn't
// this one — search engines saw the real site as a duplicate of a preprod
// host and split its authority between the two.
//
// The resolution order below makes that specific failure impossible:
//
//   1. PUBLIC_BASE_URL, unless it names a *different* Railway-generated
//      domain than the one actually serving this service (see below).
//   2. RAILWAY_PUBLIC_DOMAIN — injected by Railway for the service's own
//      generated domain, so the fallback is always self-consistent.
//   3. The request's own host, as a last resort for local dev.
//
// A real custom domain (cleanglow.com.au) still wins via rule 1, because it
// isn't a *.up.railway.app host and so can never look "stale" — only a
// railway-generated domain belonging to some *other* service is overridden.

const RAILWAY_DOMAIN_SUFFIX = '.up.railway.app';

function normalize(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  // Anything reached over a real domain is served over TLS in production;
  // only loopback stays on http so local dev keeps working.
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  const protocol = isLocal ? url.protocol : 'https:';
  return `${protocol}//${url.host}`; // host keeps a non-default port; no trailing slash
}

function isRailwayGeneratedHost(host) {
  return Boolean(host) && host.endsWith(RAILWAY_DOMAIN_SUFFIX);
}

// Exported for the startup check in index.js — returns a warning string when
// PUBLIC_BASE_URL is being ignored, so a misconfigured deploy is visible in
// the logs instead of silently emitting canonicals for the wrong domain.
export function describeBaseUrlConfig() {
  const configured = normalize(process.env.PUBLIC_BASE_URL);
  const platform = normalize(process.env.RAILWAY_PUBLIC_DOMAIN);
  if (!configured) {
    return platform
      ? `PUBLIC_BASE_URL is not set — using the platform domain ${platform} for canonical URLs.`
      : 'PUBLIC_BASE_URL is not set and no platform domain was detected — canonical URLs will follow the request host.';
  }
  if (platform && configured !== platform && isRailwayGeneratedHost(new URL(configured).host)) {
    return `⚠️  PUBLIC_BASE_URL (${configured}) points at a Railway domain that isn't this service (${platform}). Ignoring it — set PUBLIC_BASE_URL to ${platform} or to your custom domain to silence this.`;
  }
  return null;
}

export function resolveBaseUrl(req) {
  const configured = normalize(process.env.PUBLIC_BASE_URL);
  const platform = normalize(process.env.RAILWAY_PUBLIC_DOMAIN);
  // `req.protocol` already honours X-Forwarded-Proto because index.js sets
  // `trust proxy`, so this stays http on localhost and https behind Railway.
  const fromRequest = req?.get('host') ? normalize(`${req.protocol}://${req.get('host')}`) : null;

  if (configured) {
    // A configured value is only overridden when it names a Railway-generated
    // domain that demonstrably isn't this service's. Either signal proves
    // that on its own — RAILWAY_PUBLIC_DOMAIN isn't guaranteed to be present,
    // so the host actually serving the request counts as evidence too.
    const knownGood = platform || fromRequest;
    const staleRailwayDomain =
      knownGood && configured !== knownGood && isRailwayGeneratedHost(new URL(configured).host);
    if (!staleRailwayDomain) return configured;
  }
  return platform || fromRequest || 'http://localhost:4242';
}
