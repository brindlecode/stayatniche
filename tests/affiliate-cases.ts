/**
 * Inputs for the affiliate URL golden test. Every published hotel page plus a fixed set of
 * partner URLs as the site templates build them. tests/fixtures/affiliate-golden.json holds the
 * URLs these produced before the analytics change (2026-11-14); the test fails if any URL changes.
 * Regenerate only on purpose: UPDATE_GOLDEN=1 npx vitest run tests/affiliate.test.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { withTracking, hotelDealUrl, expediaHotelUrl, expediaSearchUrl, bookingSearchUrl, tpLink } from '../src/lib/affiliate';
import { APPROVED } from '../src/lib/tp-programs.mjs';

const HOTELS_DIR = join(__dirname, '../src/content/hotels');

export function hotels() {
  return readdirSync(HOTELS_DIR).filter(f => f.endsWith('.md')).sort().map(f => {
    const d = matter(readFileSync(join(HOTELS_DIR, f), 'utf8')).data as Record<string, any>;
    return { slug: f.replace(/\.md$/, ''), name: String(d.name ?? ''), destination: String(d.destination ?? ''), country: String(d.country ?? ''), bookingUrl: String(d.bookingUrl ?? ''), officialWebsite: d.officialWebsite ? String(d.officialWebsite) : '' };
  });
}

/** Partner URLs exactly as the templates (TripEssentials, HomeView, PostView, HotelRoundup, ExperienceView) pass them. */
export const PARTNER_URLS = [
  'https://www.kiwi.com/en/', 'https://www.kiwi.com/de/', 'https://www.welcomepickups.com/', 'https://localrent.com/en/',
  'https://www.klook.com/en-US/search-results/?query=Italy', 'https://www.tiqets.com/en/', 'https://www.tiqets.com/fr/',
  'https://radicalstorage.com/', 'https://www.airalo.com/', 'https://www.airalo.com/japan-esim', 'https://ektatraveling.com/',
  'https://www.airhelp.com/', 'https://www.expedia.com/Hotels', 'https://www.klook.com', 'https://tiqets.com', 'https://www.kiwi.com',
  'https://tiqets.com/en/search/?q=Cappadocia', 'https://www.kiwi.com/en/search/results/rome', 'https://www.welcomepickups.com/rome/airport-transfer/',
  'https://www.aviasales.com/search/IST0101', ...APPROVED.map(h => `https://www.${h}/some/deep/link?x=1`),
];

export function buildAll() {
  const out: Record<string, string> = {};
  for (const h of hotels()) {
    out[`hotelDealUrl:hotel-card:${h.slug}`] = hotelDealUrl(h.bookingUrl, h.name, h.destination, { campaign: 'hotel-card', content: h.slug });
    out[`hotelDealUrl:roundup-table:${h.slug}`] = hotelDealUrl(h.bookingUrl, h.name, h.destination, { campaign: 'roundup-table', content: h.slug });
    out[`expediaHotelUrl:hotel-offer:${h.slug}`] = expediaHotelUrl(h.slug, h.name, h.destination, { campaign: 'hotel-offer', content: h.slug });
    if (h.officialWebsite) out[`withTracking:hotel-detail:${h.slug}`] = withTracking(h.officialWebsite, { campaign: 'hotel-detail', content: h.slug });
    out[`expediaSearchUrl:${h.slug}`] = expediaSearchUrl(h.destination, h.country);
    out[`bookingSearchUrl:${h.slug}`] = bookingSearchUrl(h.destination, h.country);
  }
  for (const u of PARTNER_URLS) {
    out[`tpLink:essentials:${u}`] = tpLink('', u, 'essentials_some-hotel');
    out[`withTracking:homepage-partners:${u}`] = withTracking(u, { campaign: 'homepage-partners', content: 'k' });
    out[`withTracking:none:${u}`] = withTracking(u);
  }
  for (const u of ['/hotels/x/', '#top', '', 'not a url', 'https://tp.media/r?campaign_id=594&marker=688397', 'https://example.org/page?utm_source=keep', 'https://www.booking.com/hotel/x.html'])
    out[`withTracking:edge:${u}`] = withTracking(u, { campaign: 'c', content: 'd' });
  return out;
}
