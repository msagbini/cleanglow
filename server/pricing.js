// Canonical pricing source. Values here MUST match public/js/app.js — the
// client copy exists only for the instant-feedback UI; this file is what
// actually determines the amount charged, computed from the raw selections
// the client sends (never from a client-supplied total).

export const BASE_PRICE_BY_BEDROOMS = { '0': 89, '1': 99, '2': 129, '3': 169, '4': 199, '5': 249 };
export const BATHROOM_EXTRA = 15;
export const PROPERTY_TYPE_SURCHARGE = { apartment: 0, house: 20, studio: -10, office: 15 };
export const PROPERTY_TYPE_LABEL = { apartment: 'Piso', house: 'Casa', studio: 'Estudio', office: 'Oficina' };
export const EXTRA_PRICES = {
  oven: 25, fridge: 15, carpet: 45, windows: 25, walls: 20,
  balcony: 18, garage: 22, pest: 55, ironing: 30,
};
export const URGENCY_SURCHARGE = { standard: 0, 'next-day': 20, 'same-day': 40 };
export const PROMO_CODES = { BIENVENIDO10: 0.10, LIMPIEZA5: 0.05 };

export function computeAmountCents(selection) {
  const bedrooms = String(selection.bedrooms ?? '2');
  const bathrooms = Number(selection.bathrooms ?? 1);
  const propertyType = selection.propertyType ?? 'apartment';
  const urgency = selection.urgency ?? 'standard';
  const extras = Array.isArray(selection.extras) ? selection.extras : [];
  const promoCode = String(selection.promoCode ?? '').trim().toUpperCase();

  let base = BASE_PRICE_BY_BEDROOMS[bedrooms] ?? BASE_PRICE_BY_BEDROOMS['2'];
  base += PROPERTY_TYPE_SURCHARGE[propertyType] ?? 0;
  base += Math.max(0, bathrooms - 1) * BATHROOM_EXTRA;

  const extrasTotal = extras.reduce((sum, key) => sum + (EXTRA_PRICES[key] ?? 0), 0);
  const urgencySurcharge = URGENCY_SURCHARGE[urgency] ?? 0;

  const subtotal = base + extrasTotal + urgencySurcharge;
  const discountRate = PROMO_CODES[promoCode] ?? 0;
  const total = Math.max(0, subtotal - subtotal * discountRate);

  return Math.round(total * 100); // Stripe amounts are in cents
}
