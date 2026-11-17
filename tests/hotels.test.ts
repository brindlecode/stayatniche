// Niche audit rules for hotel pages (docs/NICHE-AUDIT.md, docs/EDITORIAL-SCORE.md).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { NICHE_SCOPES, SCORE_CAP, nicheProblems } from '../src/lib/niche.mjs';

const ROOT = resolve(__dirname, '..');
const dir = join(ROOT, 'src/content/hotels');
const categories = readdirSync(join(ROOT, 'src/content/categories')).map(f => f.replace(/\.md$/, ''));
const hotels = readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
  const t = readFileSync(join(dir, f), 'utf8');
  const [, head, body] = t.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
  return { slug: f.replace(/\.md$/, ''), data: parse(head, { schema: 'core' } as any) as Record<string, any>, body };
});
const published = hotels.filter(h => (h.data.status ?? 'published') === 'published');
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

describe('niche_scope is required to publish', () => {
  const ok = {
    status: 'published', rating: 8, niche_scope: 'entire_property', niche_feature: 'Every room is carved into rock.',
    niche_source_url: 'https://example.com/rooms', niche_verified_at: '2026-11-17', location: { country: 'Turkey', countryCode: 'TR' },
  };
  it('accepts a complete page', () => expect(nicheProblems(ok)).toEqual([]));
  it('rejects a page without niche_scope', () => {
    const { niche_scope, ...rest } = ok;
    expect(nicheProblems(rest).map(p => p.path)).toContain('niche_scope');
  });
  it('rejects an unknown niche_scope', () => expect(nicheProblems({ ...ok, niche_scope: 'whole_property' }).map(p => p.path)).toContain('niche_scope'));
  it('needs a source URL unless unverified', () => {
    const { niche_source_url, ...rest } = ok;
    expect(nicheProblems(rest).map(p => p.path)).toContain('niche_source_url');
    expect(nicheProblems({ ...rest, niche_scope: 'unverified' })).toEqual([]);
  });
  it('needs the verification date, the feature sentence and a location with an ISO code', () => {
    expect(nicheProblems({ ...ok, niche_verified_at: undefined }).map(p => p.path)).toContain('niche_verified_at');
    expect(nicheProblems({ ...ok, niche_feature: '' }).map(p => p.path)).toContain('niche_feature');
    expect(nicheProblems({ ...ok, location: { country: 'Turkey', countryCode: 'Turkey' } }).map(p => p.path)).toContain('location');
  });
  it('does not ask drafts for any of it', () => expect(nicheProblems({ status: 'draft', rating: 9 })).toEqual([]));
  it('keeps the score under the ceiling of its scope and allows reviewCount only with a source', () => {
    expect(nicheProblems({ ...ok, niche_scope: 'specific_rooms', rating: 9.4 }).map(p => p.path)).toContain('rating');
    expect(nicheProblems({ ...ok, reviewCount: 427 }).map(p => p.path)).toContain('reviewCountSource');
    expect(nicheProblems({ ...ok, reviewCount: 427, reviewCountSource: 'https://example.com/reviews' })).toEqual([]);
  });
});

describe('every published hotel page', () => {
  it('exists in numbers that make the audit meaningful', () => expect(published.length).toBeGreaterThan(100));
  it.each(published.map(h => [h.slug, h]))('%s passes the publication rules', (_s, h: any) => {
    expect(nicheProblems(h.data), JSON.stringify(nicheProblems(h.data))).toEqual([]);
  });
  it('is in one of the 14 categories and has a valid scope and day', () => {
    for (const h of published) {
      expect(categories, h.slug).toContain(h.data.category);
      expect(NICHE_SCOPES, h.slug).toContain(h.data.niche_scope);
      expect(iso(h.data.niche_verified_at), h.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it('has a location consistent with its legacy country (code, no repeated country in city/region)', () => {
    for (const h of published) {
      const l = h.data.location;
      expect(l.countryCode, h.slug).toMatch(/^[A-Z]{2}$/);
      for (const k of ['region', 'city', 'locality']) expect(l[k]?.toLowerCase(), `${h.slug} ${k}`).not.toBe(l.country.toLowerCase());
    }
  });
  it('has no reviewCount without a source, and no guest-review wording for the editorial score', () => {
    for (const h of hotels) {
      if (h.data.reviewCount != null) expect(h.data.reviewCountSource, h.slug).toBeTruthy();
      expect(`${h.data.description}\n${h.body}`, h.slug).not.toMatch(/personally (reviewed|tested|stayed)|best in the world/i);
    }
  });
  it('states in the page which rooms qualify when only some do', () => {
    for (const h of published.filter(h => h.data.niche_scope === 'specific_rooms')) {
      expect(h.data.niche_feature.length, h.slug).toBeGreaterThan(30);
    }
  });
  it('keeps the score ceilings in sync with the docs', () => {
    const doc = readFileSync(join(ROOT, 'docs/EDITORIAL-SCORE.md'), 'utf8');
    for (const [scope, cap] of Object.entries(SCORE_CAP)) expect(doc).toMatch(new RegExp(`\`${scope}\`[^\\n]*\\| ${Number(cap).toFixed(1)} \\|`));
  });
});

describe('drafted stays leave the live site through a redirect', () => {
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  it('has a 301 from every stay set to draft by the audit', () => {
    for (const h of hotels.filter(h => h.data.status === 'draft' && h.data.niche_scope !== undefined)) {
      expect(toml, h.slug).toContain(`from = "/hotels/${h.slug}"`);
    }
  });
});

describe('no content links to a drafted or archived stay', () => {
  // The built-site check (tests/build/dist.test.ts) covers rendered pages; this one catches it in the
  // Markdown already, in every language: blog posts, guides, destinations, best-of text.
  const notLive = new Set(hotels.filter(h => (h.data.status ?? 'published') !== 'published').map(h => h.slug));
  const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(d, e.name)) : e.name.endsWith('.md') ? [join(d, e.name)] : []);
  const segs = 'hotels|unterkuenfte|hebergements|alojamientos|alloggi|verblijven';
  it('in any Markdown link', () => {
    const bad: string[] = [];
    for (const f of files(join(ROOT, 'src/content'))) {
      const t = readFileSync(f, 'utf8');
      for (const m of t.matchAll(new RegExp(`\\]\\((?:https://stayatniche\\.com)?(?:/[a-z]{2})?/(?:${segs})/([a-z0-9-]+)`, 'g')))
        if (notLive.has(m[1])) bad.push(`${f.slice(ROOT.length + 1)} → ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
});
