export const SITE = 'https://stayatniche.com';
export const isLive = <T extends { data: { status?: string } }>(e: T) =>
  e.data.status !== 'draft' && e.data.status !== 'archived';

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Lowest nightly price in a range like "$300 - $600", or null when the page has no
// known price ("Rates vary"). Null must never be treated as cheap: callers skip it
// in price bands, filters and "cheapest" picks and show "Check rates" instead.
export const startPrice = (range: string | undefined | null): number | null => {
  const m = range?.match(/\d[\d,]*/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/,/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Lowest-priced entry among those with a known price; undefined if none has one.
export const cheapestKnown = <T extends { data: { priceRange: string } }>(hs: T[]): T | undefined =>
  hs.filter(h => startPrice(h.data.priceRange) != null)
    .sort((a, b) => startPrice(a.data.priceRange)! - startPrice(b.data.priceRange)!)[0];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/**
 * Place line without repeats: drops any part of `destination` that is just a country name
 * ("Kruger National Park, Limpopo, South Africa" + "South Africa" -> "Kruger National Park, Limpopo")
 * and repeated parts. Pass every spelling of the country that may occur (English, localized).
 */
export function cleanDestination(destination: string, ...countries: (string | undefined)[]): string {
  const drop = new Set(countries.filter(Boolean).map((c) => fold(c!)));
  const seen = new Set<string>();
  const parts = destination.split(',').map((p) => p.trim()).filter(Boolean).filter((p) => {
    const k = fold(p);
    if (drop.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return parts.length ? parts.join(', ') : destination;
}
/** "Göreme, Nevşehir, Türkiye": destination and country joined once. */
export function placeLabel(destination: string, country: string, localCountry: string = country): string {
  const d = cleanDestination(destination, country, localCountry);
  return fold(d) === fold(country) || fold(d) === fold(localCountry) ? localCountry : `${d}, ${localCountry}`;
}
