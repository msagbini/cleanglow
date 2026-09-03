// Google Analytics 4 behind explicit, opt-in consent.
//
// Three rules shape this file:
//
// 1. No measurement ID configured => no analytics, no banner, nothing. The
//    site sets no non-essential storage at all, so asking for consent would
//    be asking permission for something that never happens. The server only
//    emits the <meta name="ga-measurement-id"> tag (and only then widens the
//    CSP) when GA_MEASUREMENT_ID is set, so this file inerts itself here.
//
// 2. gtag.js is not fetched until the visitor accepts. Google's Consent Mode
//    still transmits cookieless pings to Google when analytics_storage is
//    "denied", which is a data transfer the visitor hasn't agreed to. Not
//    loading the script at all is the only version of "no tracking before
//    consent" that is actually true. Consent Mode defaults are set anyway,
//    as a second line of defence for the moment the script does load.
//
// 3. Rejecting is exactly as easy as accepting — one click, equally
//    prominent buttons — and the choice can be changed later from the
//    footer. Both are GDPR requirements, not styling preferences.
//
// The consent choice itself lives in localStorage rather than a cookie, so
// that visiting the site and declining leaves no cookie behind at all.
window.CGAnalytics = (() => {
  const STORAGE_KEY = 'cg_consent';
  const measurementId = document.querySelector('meta[name="ga-measurement-id"]')?.content || '';
  const configured = /^G-[A-Z0-9]+$/i.test(measurementId);

  let loaded = false;

  function readConsent() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'granted' || v === 'denied' ? v : null;
    } catch {
      // Private mode / storage blocked: treat as "no decision recorded". The
      // banner reappears next visit, which is the safe direction to fail.
      return null;
    }
  }

  function writeConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* nothing to do */ }
  }

  // Queue shim: track() calls made before (or without) gtag.js still resolve
  // to a no-op instead of throwing.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  function loadGtag() {
    if (loaded || !configured) return;
    loaded = true;

    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(s);

    gtag('js', new Date());
    // anonymize_ip is the default in GA4 and can't be turned off, but naming
    // it here documents the intent. No ad signals, no personalisation.
    gtag('config', measurementId, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  }

  /* ============ Consent banner ============ */

  function dismissBanner(banner, returnFocusTo) {
    banner.remove();
    if (returnFocusTo && document.contains(returnFocusTo)) returnFocusTo.focus();
  }

  function buildBanner() {
    const banner = document.createElement('section');
    banner.className = 'consent-banner';
    banner.id = 'consentBanner';
    // A non-modal region, not a dialog: it must not trap focus or block the
    // page. It sits first in the DOM so it is first in tab order, while
    // position: fixed keeps it visually at the bottom — and, being fixed, it
    // takes up no layout space, so it can't cause a layout shift.
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-labelledby', 'consentBannerTitle');
    banner.innerHTML = `
      <div class="consent-inner">
        <div class="consent-copy">
          <h2 id="consentBannerTitle">Cookies on this site</h2>
          <p>We'd like to use analytics cookies to understand how visitors use the site so we can improve it.
          They're optional — the booking form works either way. See our
          <a href="#" data-modal="cookies">cookie policy</a>.</p>
        </div>
        <div class="consent-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="consentReject">Reject</button>
          <button type="button" class="btn btn-primary btn-sm" id="consentAccept">Accept</button>
        </div>
      </div>`;
    document.body.prepend(banner);

    banner.querySelector('#consentAccept').addEventListener('click', () => {
      writeConsent('granted');
      loadGtag();
      dismissBanner(banner);
      refreshManageLink();
    });
    banner.querySelector('#consentReject').addEventListener('click', () => {
      writeConsent('denied');
      dismissBanner(banner);
      refreshManageLink();
    });
    return banner;
  }

  // Withdrawing consent has to be as easy as giving it, so the footer carries
  // a permanent entry point once a choice exists.
  function refreshManageLink() {
    const link = document.getElementById('manageCookiesLink');
    if (!link) return;
    link.hidden = !configured;
    if (!configured) return;
    const consent = readConsent();
    link.textContent = consent === 'granted' ? 'Cookie settings (analytics on)' : 'Cookie settings';
  }

  function openBanner() {
    if (!configured || document.getElementById('consentBanner')) return;
    buildBanner().querySelector('#consentAccept').focus();
  }

  /* ============ Public API ============ */

  // Safe to call unconditionally from anywhere in the app: it is a no-op
  // when GA isn't configured or the visitor hasn't opted in.
  function track(eventName, params) {
    if (!configured || readConsent() !== 'granted') return;
    loadGtag();
    gtag('event', eventName, params || {});
  }

  function init() {
    if (!configured) {
      refreshManageLink(); // hides the footer link when there is nothing to manage
      return;
    }
    const consent = readConsent();
    if (consent === 'granted') loadGtag();
    else if (consent === null) buildBanner();
    refreshManageLink();

    document.addEventListener('click', e => {
      if (e.target.closest('#manageCookiesLink')) {
        e.preventDefault();
        openBanner();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { track, isConfigured: () => configured, getConsent: readConsent, openBanner };
})();
