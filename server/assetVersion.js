// A short content hash of the CSS/JS actually shipped to the browser, used
// as a `?v=` cache buster on their <link>/<script> tags.
//
// Without it, every static asset was served with `Cache-Control: max-age=0`,
// so a returning visitor re-validated the stylesheet, both scripts and every
// font on *every* navigation — five conditional round-trips before the page
// could paint, even when nothing had changed. Versioning the URLs lets those
// same files be cached immutably for a year, and a deploy that changes them
// changes the hash, so nobody is ever served a stale bundle.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const VERSIONED_FILES = [
  'css/styles.css',
  'css/suburb.css',
  'css/success.css',
  'js/success.js',
  'js/i18n.js',
  'js/analytics.js',
  'js/app.js',
  'js/reload-scroll-fix.js',
];

function computeVersion() {
  const hash = crypto.createHash('sha256');
  for (const rel of VERSIONED_FILES) {
    try {
      hash.update(fs.readFileSync(path.join(publicDir, rel)));
    } catch {
      // A missing optional asset shouldn't stop the server from booting;
      // it just doesn't contribute to the hash.
    }
  }
  return hash.digest('hex').slice(0, 12);
}

// Computed once at boot — the files can't change without a redeploy.
export const ASSET_VERSION = computeVersion();
