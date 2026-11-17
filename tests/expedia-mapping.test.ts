// Every exact Expedia mapping carries a verification record, and every published hotel is either
// mapped or on record as checked. A mapping without status, method and date fails the build.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..');
const mapping = JSON.parse(readFileSync(join(ROOT, 'src/data/expedia-hotels.json'), 'utf8')) as Record<string, string>;
const records = JSON.parse(readFileSync(join(ROOT, 'src/data/expedia-verification.json'), 'utf8')) as Record<string, any>;
const hotelDir = join(ROOT, 'src/content/hotels');
const hotels = readdirSync(hotelDir).filter(f => f.endsWith('.md')).map(f => {
  const [, head] = readFileSync(join(hotelDir, f), 'utf8').match(/^---\n([\s\S]*?)\n---\n/)!;
  return { slug: f.replace(/\.md$/, ''), data: parse(head, { schema: 'core' } as any) as Record<string, any> };
});
const slugs = new Set(hotels.map(h => h.slug));
const published = hotels.filter(h => (h.data.status ?? 'published') === 'published');

const METHODS = ['web-search-title-location', 'web-search-url-id-title-location'];
const day = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = /^https:\/\/www\.expedia\.com\/[A-Za-z0-9-]+\.h\d+\.Hotel-Information$/;

describe('Expedia hotel mappings (src/data/expedia-hotels.json)', () => {
  const entries = Object.entries(mapping);
  it('is not empty', () => expect(entries.length).toBeGreaterThan(50));
  it.each(entries)('%s is a property page with a complete verification record', (slug, url) => {
    expect(slugs.has(slug), `${slug} has no hotel page`).toBe(true);
    expect(url, `${slug}: not an expedia.com property page URL`).toMatch(PAGE);
    const r = records[slug];
    expect(r, `${slug}: no verification record`).toBeTruthy();
    expect(r.status, `${slug}: status`).toBe('confirmed');
    expect(METHODS, `${slug}: method`).toContain(r.method);
    expect(r.verifiedAt, `${slug}: verifiedAt`).toMatch(day);
    expect(String(r.evidence ?? '').trim().length, `${slug}: evidence`).toBeGreaterThan(10);
    expect(r.url, `${slug}: record url differs from the mapped url`).toBe(url);
  });
  it('maps no two hotels to the same Expedia property', () => {
    const ids = entries.map(([, u]) => u.match(/\.h(\d+)\./)![1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Expedia verification records (src/data/expedia-verification.json)', () => {
  it('has no confirmed record without a mapping and no record for an unknown hotel', () => {
    for (const [slug, r] of Object.entries(records)) {
      expect(slugs.has(slug), `${slug}: no hotel page`).toBe(true);
      if (r.status === 'confirmed') expect(mapping[slug], `${slug}: confirmed but not mapped`).toBeTruthy();
      else expect(mapping[slug], `${slug}: ${r.status} but still mapped`).toBeUndefined();
    }
  });
  it('gives every record a known status, a method and a date', () => {
    for (const [slug, r] of Object.entries(records)) {
      expect(['confirmed', 'not_found', 'unconfirmed'], `${slug}: status`).toContain(r.status);
      expect(r.method, `${slug}: method`).toBeTruthy();
      expect(r.verifiedAt, `${slug}: verifiedAt`).toMatch(day);
    }
  });
  it('covers every published hotel: mapped, or recorded as checked without an exact page', () => {
    const missing = published.filter(h => !mapping[h.slug] && !records[h.slug]).map(h => h.slug);
    expect(missing, `published hotels neither mapped nor checked: ${missing.join(', ')}`).toEqual([]);
  });
});
