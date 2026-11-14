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
