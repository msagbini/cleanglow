// Analytics is opt-in at the deployment level: with no GA_MEASUREMENT_ID the
// pages never get the measurement id, never load gtag.js, never show a
// consent banner, and the CSP stays at 'self' only. Validated once here so
// every consumer (CSP, templates, the legal copy) agrees on whether it's on.
export const GA_MEASUREMENT_ID = /^G-[A-Z0-9]+$/i.test(process.env.GA_MEASUREMENT_ID || '')
  ? process.env.GA_MEASUREMENT_ID.trim()
  : '';
