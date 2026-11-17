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
      if (h.data.reviewCount != null && (h.data.status ?? 'published') === 'published') expect(h.data.reviewCountSource, h.slug).toBeTruthy();
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

describe('notes shown at the top of a page exist in every language', () => {
  const langs = ['de', 'fr', 'es', 'it', 'nl'];
  const tr = (lang: string, slug: string) => {
    try { return parse(readFileSync(join(ROOT, `src/content/translations/${lang}/hotels/${slug}.md`), 'utf8').match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, any>; } catch { return null; }
  };
  it('a temporary closure has a note, a source and a check date, and is translated', () => {
    const closed = published.filter(h => h.data.closure);
    expect(closed.length).toBeGreaterThan(0);
    for (const h of closed) {
      expect(h.data.closure.note, h.slug).toBeTruthy();
      expect(h.data.closure.source_url, h.slug).toMatch(/^https?:\/\//);
      expect(h.data.closure.checked_at, h.slug).toBeTruthy();
      for (const l of langs) if (tr(l, h.slug)) expect(tr(l, h.slug)!.closure?.note, `${l}/${h.slug}`).toBeTruthy();
    }
  });
  it('the sentence naming which rooms qualify (specific_rooms), niche_note and niche_badge are translated', () => {
    for (const h of published) for (const l of langs) {
      const t = tr(l, h.slug);
      if (!t) continue;
      if (h.data.niche_scope === 'specific_rooms') expect(t.niche_feature, `${l}/${h.slug} niche_feature`).toBeTruthy();
      if (h.data.niche_note) expect(t.niche_note, `${l}/${h.slug} niche_note`).toBeTruthy();
      if (h.data.niche_badge) expect(t.niche_badge, `${l}/${h.slug} niche_badge`).toBeTruthy();
    }
  });
  it('a treehouse page that is only partly treehouses says so in niche_scope', () => {
    const nihi = hotels.find(h => h.slug === 'nihi-sumba-indonesia')!;
    expect(nihi.data.niche_scope).toBe('specific_rooms');
    expect(nihi.data.niche_badge).toBe('Only one villa');
  });
  it('stays that are not medieval castles carry a note saying so', () => {
    for (const s of ['castello-tafuri-italy', 'tyr-graig-castle-united-kingdom', 'locanda-al-castello-italy']) {
      expect(hotels.find(h => h.slug === s)!.data.niche_note, s).toMatch(/not a medieval/i);
    }
  });
});

describe('list fields stay lists of plain strings (an unquoted "a: b" turns into an object)', () => {
  const files = [
    ...hotels.map(h => [`src/content/hotels/${h.slug}.md`, h.data] as const),
    ...['de', 'fr', 'es', 'it', 'nl'].flatMap(l => readdirSync(join(ROOT, `src/content/translations/${l}/hotels`)).map(f => {
      const t = readFileSync(join(ROOT, `src/content/translations/${l}/hotels/${f}`), 'utf8');
      return [`translations/${l}/hotels/${f}`, parse(t.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, any>] as const;
    })),
  ];
  it('highlights, amenities, bestFor and tags hold only strings', () => {
    const bad: string[] = [];
    for (const [name, d] of files) for (const k of ['highlights', 'amenities', 'bestFor', 'tags']) {
      (d[k] ?? []).forEach((v: unknown, i: number) => { if (typeof v !== 'string') bad.push(`${name} ${k}[${i}]`); });
    }
    expect(bad).toEqual([]);
  });
});

describe('recalculated editorial scores follow the rubric', () => {
  const recalc = JSON.parse(readFileSync(join(ROOT, 'data/audit-niche/score-recalc.json'), 'utf8')) as Record<string, any>;
  it.each(Object.entries(recalc))('%s: rating = 3.5 + 0.7 x (setting + stay + practicality), cut to the ceiling', (slug, r: any) => {
    const h = hotels.find(x => x.slug === slug)!;
    const raw = Math.round((3.5 + 0.7 * (r.setting + r.stay + r.practicality)) * 10) / 10;
    expect(r.rating).toBe(Math.min(raw, SCORE_CAP[h.data.niche_scope as keyof typeof SCORE_CAP]));
    expect(h.data.rating).toBe(r.rating);
    for (const k of ['setting', 'stay']) { expect(r[k] % 0.5).toBe(0); expect(r[k]).toBeGreaterThanOrEqual(0); expect(r[k]).toBeLessThanOrEqual(3); }
  });
});
