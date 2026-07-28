// Loads config/business.json once — the single source of truth for branding,
// theme, and the service/pricing catalog. Swapping this file to reconfigure
// the whole site for a different business is the point; nothing here should
// need code changes to adapt to another catalog.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '..', 'config', 'business.json');

const raw = fs.readFileSync(configPath, 'utf8');
export const config = JSON.parse(raw);

const extraPriceByKey = Object.fromEntries(config.booking.extras.map(e => [e.key, e.price]));
const sizePriceByValue = Object.fromEntries(config.booking.sizeField.options.map(o => [o.value, o.price]));
const serviceTypeSurchargeByValue = Object.fromEntries(config.booking.serviceTypes.map(t => [t.value, t.surcharge]));
const urgencySurchargeByValue = Object.fromEntries(config.booking.urgencyOptions.map(u => [u.value, u.surcharge]));
const validExtraKeys = new Set(Object.keys(extraPriceByKey));

export function computeAmountCents(selection) {
  const sizeValue = String(selection.bedrooms ?? config.booking.sizeField.defaultValue);
  const secondaryValue = Number(selection.bathrooms ?? config.booking.secondaryField.defaultValue);
  const serviceType = selection.propertyType ?? config.booking.serviceTypes[0].value;
  const urgency = selection.urgency ?? config.booking.urgencyOptions[0].value;
  const extras = Array.isArray(selection.extras) ? selection.extras : [];
  const promoCode = String(selection.promoCode ?? '').trim().toUpperCase();

  let base = sizePriceByValue[sizeValue] ?? Object.values(sizePriceByValue)[0];
  base += serviceTypeSurchargeByValue[serviceType] ?? 0;
  base += Math.max(0, secondaryValue - 1) * config.booking.secondaryField.pricePerUnitBeyondFirst;

  const extrasTotal = extras.reduce((sum, key) => sum + (extraPriceByKey[key] ?? 0), 0);
  const urgencySurcharge = urgencySurchargeByValue[urgency] ?? 0;

  const subtotal = base + extrasTotal + urgencySurcharge;
  const discountRate = config.booking.promoCodes[promoCode] ?? 0;
  const total = Math.max(0, subtotal - subtotal * discountRate);

  return Math.round(total * 100); // Stripe amounts are in cents
}

export function isValidExtraKey(key) {
  return validExtraKeys.has(key);
}

// Public config exposed to the frontend — everything here is safe to expose,
// there are no secrets in config/business.json.
export function getPublicConfig() {
  return config;
}
