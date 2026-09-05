// A genuine reload (F5 / reload button) should feel like arriving fresh —
// not leave the visitor stranded mid-scroll wherever they happened to be.
// Deep links like /#pricing must still scroll to that section on a normal
// visit, so this only acts when the Navigation Timing API confirms this
// load actually was a reload — never on a first visit or an in-page anchor
// click (those aren't "reloads" at all, so they're untouched). Loaded as an
// external file (not inline) so the site's CSP (script-src 'self', no
// unsafe-inline) doesn't block it, and with `defer` so it never blocks
// parsing: the browser restores scroll position at load, after deferred
// scripts run, so setting scrollRestoration here is still in time.
history.scrollRestoration = 'manual';
try {
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav && nav.type === 'reload') {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo(0, 0);
  }
} catch { /* Navigation Timing unsupported — nothing to do */ }
