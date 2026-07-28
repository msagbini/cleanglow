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
const frequencyByValue = Object.fromEntries((config.booking.frequencyOptions ?? []).map(f => [f.value, f]));

export function getFrequencyOption(frequency) {
  return frequencyByValue[frequency] ?? config.booking.frequencyOptions?.[0] ?? { value: 'once', discount: 0, stripeInterval: null };
}

export function isValidFrequency(frequency) {
  return frequency in frequencyByValue;
}

// Computes the per-visit price. For recurring frequencies this is the
// discounted amount Stripe will charge on every billing cycle, not a one-off
// total — the recurring cadence itself is handled by a Stripe Subscription.
export function computeAmountCents(selection) {
  const sizeValue = String(selection.bedrooms ?? config.booking.sizeField.defaultValue);
  const secondaryValue = Number(selection.bathrooms ?? config.booking.secondaryField.defaultValue);
  const serviceType = selection.propertyType ?? config.booking.serviceTypes[0].value;
  const urgency = selection.urgency ?? config.booking.urgencyOptions[0].value;
  const extras = Array.isArray(selection.extras) ? selection.extras : [];
  const promoCode = String(selection.promoCode ?? '').trim().toUpperCase();
  const frequency = getFrequencyOption(selection.frequency);

  let base = sizePriceByValue[sizeValue] ?? Object.values(sizePriceByValue)[0];
  base += serviceTypeSurchargeByValue[serviceType] ?? 0;
  base += Math.max(0, secondaryValue - 1) * config.booking.secondaryField.pricePerUnitBeyondFirst;

  const extrasTotal = extras.reduce((sum, key) => sum + (extraPriceByKey[key] ?? 0), 0);
  const urgencySurcharge = urgencySurchargeByValue[urgency] ?? 0;

  const subtotal = base + extrasTotal + urgencySurcharge;
  const promoRate = config.booking.promoCodes[promoCode] ?? 0;
  const afterPromo = Math.max(0, subtotal - subtotal * promoRate);
  const total = afterPromo * (1 - (frequency.discount ?? 0));

  return Math.round(total * 100); // Stripe amounts are in cents
}

export function isValidExtraKey(key) {
  return validExtraKeys.has(key);
}

// Prices are always GST-inclusive (required for consumer-facing prices in
// Australia) — this only computes the GST component for display on
// receipts/invoices, it never changes the amount charged.
export function computeGstComponentCents(amountCents) {
  if (!config.business.gstRegistered) return 0;
  const rate = config.business.gstRate ?? 0.1;
  return Math.round(amountCents - amountCents / (1 + rate));
}

// Public config exposed to the frontend — everything here is safe to expose,
// there are no secrets in config/business.json.
export function getPublicConfig() {
  return config;
}
