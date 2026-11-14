import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildAll } from './affiliate-cases';
import {
  withTracking, hotelDealUrl, expediaHotelUrl, expediaSearchUrl, tpLink,
  providerOf, isAffiliateUrl, isExpediaSearch, linkKind, trackAttrs, destinationOf,
} from '../src/lib/affiliate';
import { partnerLink, safeUrl, TP_MARKER, TP_TRS } from '../src/lib/tp-programs.mjs';

const GOLDEN = join(__dirname, 'fixtures/affiliate-golden.json');
const tp = (url: string) => new URL(url).searchParams;

describe('generated URLs are unchanged (golden file from before the analytics change)', () => {
  const now = buildAll();
  if (process.env.UPDATE_GOLDEN === '1') writeFileSync(GOLDEN, JSON.stringify(now, null, 1) + '\n');
  const before: Record<string, string> = JSON.parse(readFileSync(GOLDEN, 'utf8'));

  test('no partner case disappeared (hotel cases may come and go with the hotel files)', () => {
    const perHotel = /^(hotelDealUrl|expediaHotelUrl|expediaSearchUrl|bookingSearchUrl|withTracking:hotel-detail):/;
    const missing = Object.keys(before).filter(k => !perHotel.test(k) && !(k in now));
    expect(missing).toEqual([]);
  });
  test('every URL identical', () => {
    const changed = Object.keys(before).filter(k => k in now && now[k] !== before[k]).map(k => `${k}\n  before: ${before[k]}\n  after:  ${now[k]}`);
    expect(changed).toEqual([]);
  });
});

describe('Travelpayouts links', () => {
  test('verified program (Expedia) is wrapped with marker, trs, p, campaign_id and sub_id', () => {
    const url = partnerLink('https://www.expedia.com/Hotels', 'hotel-card_some-hotel');
    expect(url.startsWith('https://tp.media/r?')).toBe(true);
    const q = tp(url);
    expect(q.get('marker')).toBe(TP_MARKER);
    expect(q.get('trs')).toBe(TP_TRS);
    expect(q.get('campaign_id')).toBe('594');
    expect(q.get('p')).toBe('8645');
    expect(q.get('sub_id')).toBe('hotel-card_some-hotel');
    expect(q.get('u')).toBe('https://www.expedia.com/Hotels');
  });
  test('sub_id is cut to 60 characters and encoded', () => {
    const q = tp(partnerLink('https://www.expedia.com/Hotels', 'a b&c'.repeat(30)));
    expect(q.get('sub_id')).toBe('a b&c'.repeat(30).slice(0, 60));
  });
  test('approved but unverified partners stay plain brand URLs for Travelpayouts Drive', () => {
    expect(partnerLink('https://www.klook.com/en-US/search-results/?query=Italy', 'x')).toBe('https://www.klook.com/en-US/search-results/?query=Italy');
  });
  test('unreliable deep links are replaced by a stable landing page; home pages are kept', () => {
    expect(safeUrl('https://www.kiwi.com/en/search/results/rome')).toBe('https://www.kiwi.com/en/');
    expect(safeUrl('https://www.kiwi.com/de/')).toBe('https://www.kiwi.com/de/');
    expect(safeUrl('https://www.tiqets.com/en/')).toBe('https://www.tiqets.com/en/');
  });
  test('tpLink ignores the program id and uses tp-programs.mjs', () => {
    expect(tpLink('999', 'https://www.expedia.com/Hotels', 's')).toBe(partnerLink('https://www.expedia.com/Hotels', 's'));
  });
});

describe('withTracking', () => {
  test('internal links, anchors and existing tp.media links are untouched', () => {
    expect(withTracking('/hotels/x/')).toBe('/hotels/x/');
    expect(withTracking('#faq')).toBe('#faq');
    const t = 'https://tp.media/r?campaign_id=594&marker=688397&p=8645&trs=478307&u=x';
    expect(withTracking(t, { campaign: 'c' })).toBe(t);
  });
  test('sub_id is campaign_content', () => {
    expect(tp(withTracking('https://www.expedia.com/Hotels', { campaign: 'blog-footer', content: 'expedia' })).get('sub_id')).toBe('blog-footer_expedia');
    expect(tp(withTracking('https://www.expedia.com/Hotels')).get('sub_id')).toBe('site');
  });
  test('non-partner sites get UTM parameters without overriding existing ones', () => {
    const u = new URL(withTracking('https://example.org/?utm_source=keep', { campaign: 'hotel-detail', content: 'slug' }));
    expect(u.searchParams.get('utm_source')).toBe('keep');
    expect(u.searchParams.get('utm_medium')).toBe('affiliate');
    expect(u.searchParams.get('utm_campaign')).toBe('hotel-detail');
    expect(u.searchParams.get('utm_content')).toBe('slug');
  });
});

describe('hotel booking links', () => {
  test('a stay with its own Expedia page links to that page', () => {
    const url = expediaHotelUrl('ashford-castle-ireland', 'Ashford Castle', 'Cong, County Mayo', { campaign: 'hotel-offer', content: 'ashford-castle-ireland' });
    expect(destinationOf(url)).toMatch(/\.h\d+\.Hotel-Information$/);
    expect(isExpediaSearch(url)).toBe(false);
    expect(linkKind(url)).toBe('hotel_page');
  });
  test('a stay without an Expedia page gets a search for its name, recognised as a search', () => {
    const url = expediaHotelUrl('no-such-slug', 'Test Lodge', 'Somewhere, Region', { campaign: 'hotel-offer', content: 'no-such-slug' });
    expect(destinationOf(url)).toBe('https://www.expedia.com/Hotel-Search?destination=Test%20Lodge%2C%20Somewhere&adults=2');
    expect(isExpediaSearch(url)).toBe(true);
    expect(linkKind(url)).toBe('hotel_search');
  });
  test('Booking.com links go to Expedia while no Booking.com partner ID is set', () => {
    const url = hotelDealUrl('https://www.booking.com/hotel/x.html', 'Test Lodge', 'Somewhere', { campaign: 'hotel-card', content: 'no-such-slug' });
    expect(new URL(url).hostname).toBe('tp.media');
    expect(isExpediaSearch(url)).toBe(true);
  });
  test('an Expedia city list counts as a search, not the hotel page', () => {
    expect(isExpediaSearch(withTracking('https://www.expedia.com/Homer-Hotels.d6291.Travel-Guide-Hotels'))).toBe(true);
    expect(isExpediaSearch(expediaSearchUrl('Cappadocia', 'Turkey'))).toBe(true);
  });
  test('official websites are not affiliate links', () => {
    const url = hotelDealUrl('https://www.belmond.com/trains/', 'Train', 'Somewhere', { campaign: 'hotel-card', content: 'x' });
    expect(isAffiliateUrl(url)).toBe(false);
    expect(linkKind(url)).toBe('official_site');
    expect(providerOf(url)).toBe('official_site');
  });
});

describe('analytics attributes', () => {
  test('provider names', () => {
    expect(providerOf(partnerLink('https://www.expedia.com/Hotels', 's'))).toBe('expedia');
    expect(providerOf('https://www.klook.com/')).toBe('klook');
    expect(providerOf('https://ektatraveling.com/')).toBe('ektatraveling');
    expect(providerOf('https://www.airalo.com/japan-esim')).toBe('airalo');
  });
  test('trackAttrs never contains the URL or personal data, only page facts', () => {
    const url = expediaHotelUrl('no-such-slug', 'Test Lodge', 'Somewhere', { campaign: 'hotel-card', content: 'no-such-slug' });
    expect(trackAttrs(url, { track: 'booking', placement: 'hotel_card', hotel: 'no-such-slug', category: 'cave-hotels', country: 'Turkey' })).toEqual({
      'data-track': 'booking', 'data-placement': 'hotel_card', 'data-provider': 'expedia', 'data-link-type': 'hotel_search',
      'data-affiliate': '1', 'data-hotel-slug': 'no-such-slug', 'data-category': 'cave-hotels', 'data-country': 'Turkey',
    });
    expect(trackAttrs('https://www.belmond.com/', { track: 'booking', placement: 'hotel_compare_list' })).toEqual({
      'data-track': 'booking', 'data-placement': 'hotel_compare_list', 'data-provider': 'official_site', 'data-link-type': 'official_site',
    });
    expect(trackAttrs('https://www.klook.com/', { track: 'partner', placement: 'trip_essentials' })['data-link-type']).toBe('partner');
  });
});
