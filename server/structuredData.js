// Schema.org graph shared by the home page and the suburb landing pages.
//
// One business entity, one service entity, both with stable @ids, so every
// page on the site talks about the SAME business rather than publishing a
// new "HousekeepingService" per URL (six suburb pages used to look to a
// crawler like six different businesses with the same name).
//
//   * The business node is typed `LocalBusiness` — the type local-business
//     tooling (Google's rich results, audit checks) looks for by name — and
//     carries `additionalType: HousekeepingService` for the specific trade.
//   * Prices live only on the Service node. Putting the same offers on both
//     nodes is how a result ends up with "multiple offers" warnings.
import { config } from './config.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function currencyOf(business) {
  return (business.currencyCode || 'AUD').toUpperCase();
}

// business.openingHours is structured ([{days, opens, closes}]) so it can be
// published as a real OpeningHoursSpecification. The free-text `hours`
// string ("Mon–Sat, 8:00am–8:00pm") is for humans; schema.org can't parse it.
export function openingHoursSpecification(business) {
  return (business.openingHours || [])
    .filter(slot => Array.isArray(slot.days) && slot.opens && slot.closes)
    .map(slot => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: slot.days.filter(d => WEEKDAYS.includes(d)),
      opens: slot.opens,
      closes: slot.closes,
    }));
}

// Service-area businesses publish the area they serve, not a shopfront
// (Google Business Profile allows exactly this). Only the keys that are set
// are emitted: a PostalAddress with an empty streetAddress is a validation
// error, not a partial address.
export function postalAddress(business) {
  const a = business.address;
  if (!a || !a.addressLocality) return undefined;
  const out = { '@type': 'PostalAddress' };
  for (const key of ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry']) {
    if (a[key]) out[key] = a[key];
  }
  return out;
}

// Human-readable counterpart of postalAddress(), for the footer.
export function addressText(business) {
  const a = business.address;
  if (!a || !a.addressLocality) return '';
  const parts = [a.streetAddress, a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(' ')].filter(Boolean);
  return parts.join(', ');
}

// Real social profile URLs only. The config ships "#" placeholders until the
// profiles exist, and a sameAs of "#" is worse than none.
export function socialProfileUrls(business) {
  return Object.values(business.social || {}).filter(url => /^https?:\/\//i.test(url));
}

export function businessNode(baseUrl) {
  const { business } = config;
  const currency = currencyOf(business);
  const node = {
    '@type': 'LocalBusiness',
    additionalType: 'https://schema.org/HousekeepingService',
    '@id': `${baseUrl}/#business`,
    name: business.name,
    description: business.seoDescription || business.heroDescription,
    url: `${baseUrl}/`,
    telephone: business.phone,
    email: business.email,
    priceRange: '$$',
    currenciesAccepted: currency,
    paymentAccepted: 'Credit Card, Debit Card',
    areaServed: (business.serviceAreas || []).map(name => ({ '@type': 'City', name })),
    // Prices are on the Service node; the business only points at it.
    makesOffer: { '@id': `${baseUrl}/#service` },
  };
  if (business.logoUrl) node.logo = `${baseUrl}${business.logoUrl}`;
  if (business.ogImageUrl) node.image = `${baseUrl}${business.ogImageUrl}`;
  const address = postalAddress(business);
  if (address) node.address = address;
  const hours = openingHoursSpecification(business);
  if (hours.length) node.openingHoursSpecification = hours;
  const sameAs = socialProfileUrls(business);
  if (sameAs.length) node.sameAs = sameAs;
  if (business.abn) {
    node.identifier = { '@type': 'PropertyValue', propertyID: 'ABN', value: business.abn };
  }
  return node;
}

// The priced thing being sold. `area` narrows it to one suburb on a landing
// page; on the home page it covers every service area.
export function serviceNode(baseUrl, { id = `${baseUrl}/#service`, url = `${baseUrl}/#booking`, area = null, name = null } = {}) {
  const { business, booking } = config;
  const currency = currencyOf(business);
  const areaServed = area
    ? { '@type': 'City', name: area }
    : (business.serviceAreas || []).map(n => ({ '@type': 'City', name: n }));

  // Real per-size prices straight from the pricing catalog, so the offers
  // published here can never drift from what the booking form charges.
  const sizeOffers = (booking?.sizeField?.options || []).map(option => ({
    '@type': 'Offer',
    name: `End of lease clean${area ? ` in ${area}` : ''} — ${option.label}`,
    price: String(option.price),
    priceCurrency: currency,
    priceSpecification: {
      '@type': 'PriceSpecification',
      price: String(option.price),
      priceCurrency: currency,
      // Only asserted when the business is actually GST-registered — for a
      // non-registered business there is no GST component to claim is
      // included, and stating either value would misrepresent the price.
      ...(business.gstRegistered ? { valueAddedTaxIncluded: true } : {}),
    },
    availability: 'https://schema.org/InStock',
    url,
    itemOffered: { '@type': 'Service', name: `End of lease clean — ${option.label}`, serviceType: 'End of lease cleaning' },
  }));
  const extraOffers = (booking?.extras || []).map(extra => ({
    '@type': 'Offer',
    name: extra.label || extra.key,
    price: String(extra.price),
    priceCurrency: currency,
    url,
  }));
  const prices = sizeOffers.map(o => Number(o.price)).filter(Number.isFinite);

  return {
    '@type': 'Service',
    '@id': id,
    name: name || `End of lease cleaning${area ? ` in ${area}` : ''}`,
    serviceType: 'End of lease cleaning',
    description: business.seoDescription || business.heroDescription,
    provider: { '@id': `${baseUrl}/#business` },
    areaServed,
    url,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'End of lease cleaning',
      itemListElement: [...sizeOffers, ...extraOffers],
    },
    ...(prices.length ? {
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: currency,
        lowPrice: String(Math.min(...prices)),
        highPrice: String(Math.max(...prices)),
        offerCount: String(prices.length),
        url,
      },
    } : {}),
  };
}

export function lowestPrice() {
  const prices = (config.booking?.sizeField?.options || []).map(o => Number(o.price)).filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : null;
}

// "7 days" / "72 hours" — same rule as formatWindow() in public/js/app.js.
export function recleanWindowText(business) {
  const hours = Number(business.recleanWindowHours ?? 168);
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hours`;
}
