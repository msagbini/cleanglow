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
const extraMaxQuantityByKey = Object.fromEntries(config.booking.extras.map(e => [e.key, e.maxQuantity ?? 1]));
const sizeOptionByValue = Object.fromEntries(config.booking.sizeField.options.map(o => [o.value, o]));
const sizePriceByValue = Object.fromEntries(config.booking.sizeField.options.map(o => [o.value, o.price]));
const serviceTypeSurchargeByValue = Object.fromEntries(config.booking.serviceTypes.map(t => [t.value, t.surcharge]));
const urgencySurchargeByValue = Object.fromEntries(config.booking.urgencyOptions.map(u => [u.value, u.surcharge]));
const keyAccessSurchargeByValue = Object.fromEntries((config.booking.keyAccessOptions ?? []).map(k => [k.value, k.surcharge ?? 0]));
const validExtraKeys = new Set(Object.keys(extraPriceByKey));
const frequencyByValue = Object.fromEntries((config.booking.frequencyOptions ?? []).map(f => [f.value, f]));

// Urgency tiers exist so last-minute bookings pay a surcharge — but that only
// works if the tier actually matches how much notice the customer gave. This
// derives the tier from the booking date itself so pricing can never be
// gamed by picking "Standard (48h+)" while booking for today.
const urgencyTiersByMinDays = [...config.booking.urgencyOptions].sort(
  (a, b) => (b.minDaysAhead ?? 0) - (a.minDaysAhead ?? 0)
);

export function deriveUrgencyForDate(bookingDateStr) {
  const fallback = config.booking.urgencyOptions[0];
  if (!bookingDateStr) return fallback;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const chosen = new Date(`${bookingDateStr}T00:00:00`);
  if (Number.isNaN(chosen.getTime())) return fallback;
  const daysAhead = Math.round((chosen - today) / 86400000);
  const match = urgencyTiersByMinDays.find(u => daysAhead >= (u.minDaysAhead ?? 0));
  return match ?? urgencyTiersByMinDays[urgencyTiersByMinDays.length - 1];
}

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
  // Urgency pricing is never trusted from the client — it's derived from the
  // booking date itself, so "Standard (48h+)" can never be paired with a
  // same-day date to dodge the same-day/next-day surcharge.
  const urgency = deriveUrgencyForDate(selection.bookingDate).value;
  const extras = Array.isArray(selection.extras) ? selection.extras : [];
  const promoCode = String(selection.promoCode ?? '').trim().toUpperCase();
  const frequency = getFrequencyOption(selection.frequency);

  const sizeOption = sizeOptionByValue[sizeValue];
  let base = sizePriceByValue[sizeValue] ?? Object.values(sizePriceByValue)[0];
  base += serviceTypeSurchargeByValue[serviceType] ?? 0;
  base += Math.max(0, secondaryValue - 1) * config.booking.secondaryField.pricePerUnitBeyondFirst;

  // Bedroom/bathroom counts alone don't capture how big the property actually
  // is — a "2 bedroom" listing can hide much more floor area than typical.
  // Charging for real square metres above what's typical for that room count
  // closes that gap instead of relying purely on the honesty of the count.
  const sqm = Number(selection.sqm) || 0;
  const typicalSqm = sizeOption?.typicalSqm ?? 0;
  const oversizeSqm = Math.max(0, sqm - typicalSqm);
  const oversizeSurcharge = oversizeSqm * (config.booking.oversizeSurchargePerSqm ?? 0);

  const keyAccessSurcharge = keyAccessSurchargeByValue[selection.keyAccess] ?? 0;

  const extrasTotal = extras.reduce((sum, key) => sum + (extraPriceByKey[key] ?? 0), 0);
  const urgencySurcharge = urgencySurchargeByValue[urgency] ?? 0;

  const subtotal = base + extrasTotal + urgencySurcharge + oversizeSurcharge + keyAccessSurcharge;
  const promoRate = config.booking.promoCodes[promoCode] ?? 0;
  const afterPromo = Math.max(0, subtotal - subtotal * promoRate);
  const total = afterPromo * (1 - (frequency.discount ?? 0));

  return Math.round(total * 100); // Stripe amounts are in cents
}

export function isValidExtraKey(key) {
  return validExtraKeys.has(key);
}

// Without this, an unrecognized bedrooms/size value silently fell back to
// the cheapest catalog tier in computeAmountCents instead of being rejected
// — a real 5-bedroom booking could be priced as a Studio by simply sending a
// bedrooms value that doesn't match any catalog option.
export function isValidSizeValue(value) {
  return String(value) in sizeOptionByValue;
}

// Extras are a flat array of keys, one entry per unit (e.g. 3 curtains ==
// the key "curtains" repeated 3 times) — this caps how many times a single
// key may repeat, so a bad payload can't inflate a line indefinitely.
export function isValidExtraQuantity(key, count) {
  return count <= (extraMaxQuantityByKey[key] ?? 1);
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
