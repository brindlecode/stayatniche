// Checks on the built site (dist/). Run after `npm run build`: node scripts/check-build.mjs runs this file
// (SITE_BUILD_TESTS=1). Rules live in scripts/lib/site-audit.mjs and are unit-tested in tests/site-audit.test.ts.
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { parse } from 'yaml';
import {
  SITE, fileToPath, pathToFiles, headInfo, references, imageProblems, hreflangProblems,
  parseSitemap, parseRedirects, firstRedirect,
} from '../../scripts/lib/site-audit.mjs';
import { LOCALES, localePath } from '../../src/i18n/locales.mjs';
import { verificationCode } from '../../src/lib/site';

const ROOT = resolve(__dirname, '../..');
const DIST = join(ROOT, 'dist');
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
const exists = (p: string) => pathToFiles(p).some(f => existsSync(join(DIST, f)));
const report = (problems: string[], max = 40) => (problems.length ? `${problems.length} problems:\n${problems.slice(0, max).join('\n')}` : '');

type Page = { path: string; html: string; info: ReturnType<typeof headInfo> };
let pages: Map<string, Page>;
let indexable: Page[];
let sitemap: ReturnType<typeof parseSitemap>;
const rules = parseRedirects(readFileSync(join(ROOT, 'netlify.toml'), 'utf8'));

// Hotels that are not live: drafts and archived pages (every language path).
const hotelDir = join(ROOT, 'src/content/hotels');
const notLive = readdirSync(hotelDir).filter(f => f.endsWith('.md')).flatMap(f => {
  const head = readFileSync(join(hotelDir, f), 'utf8').match(/^---\n([\s\S]*?)\n---/)![1];
  const status = (parse(head, { schema: 'core' } as any) as any).status ?? 'published';
  return status === 'published' ? [] : [f.replace(/\.md$/, '')];
});
const notLivePaths = notLive.flatMap(slug => LOCALES.map((l: string) => localePath(l, 'hotels', slug)));
const isNotLivePath = (u: string) => { const p = u.split(/[?#]/)[0].replace(/\/?$/, '/'); return notLivePaths.includes(p); };

beforeAll(() => {
  pages = new Map();
  for (const f of walk(DIST).filter(f => f.endsWith('.html') && !f.includes('/admin/'))) {
    const html = readFileSync(f, 'utf8');
    const path = fileToPath(relative(ROOT, f));
    pages.set(path, { path, html, info: headInfo(html) });
  }
  indexable = [...pages.values()].filter(p => !p.info.noindex);
  sitemap = parseSitemap(readFileSync(join(DIST, 'sitemap.xml'), 'utf8'));
});

describe.skipIf(!existsSync(DIST))('built site', () => {
  it('has the pages it should (sanity)', () => {
    expect(pages.size).toBeGreaterThan(1000);
    expect(notLive.length).toBeGreaterThan(0);
  });

  describe('canonicals and robots', () => {
    it('gives every indexable page exactly one canonical, pointing at itself', () => {
      const bad = indexable.filter(p => p.info.canonical.length !== 1 || p.info.canonical[0] !== SITE + p.path).map(p => `${p.path} → ${p.info.canonical.join(', ')}`);
      expect(bad, report(bad)).toEqual([]);
    });
    it('keeps error pages out of the index', () => {
      const bad = [...pages.values()].filter(p => /(^|\/)404(\.html|\/)$/.test(p.path) && !p.info.noindex).map(p => p.path);
      expect(bad).toEqual([]);
    });
  });

  describe('hreflang', () => {
    it('is reciprocal across en/de/fr/es/it/nl, lists the page itself and has x-default = English', () => {
      const infos = new Map([...pages.values()].map(p => [p.path, p.info]));
      const problems = hreflangProblems(infos);
      expect(problems, report(problems)).toEqual([]);
    });
    it('matches the <html lang> of every target', () => {
      const bad: string[] = [];
      for (const p of indexable) for (const a of p.info.alternates) {
        if (a.hreflang === 'x-default') continue;
        const t = pages.get(a.href.slice(SITE.length));
        if (t && t.info.lang !== a.hreflang) bad.push(`${p.path}: ${a.href} is lang=${t.info.lang}, hreflang says ${a.hreflang}`);
      }
      expect(bad, report(bad)).toEqual([]);
    });
  });

  describe('sitemap', () => {
    it('lists only built, indexable, self-canonical pages that are not redirected', () => {
      const bad: string[] = [];
      for (const u of sitemap) {
        const path = u.loc.slice(SITE.length);
        const p = pages.get(path);
        if (!u.loc.startsWith(SITE + '/')) bad.push(`${u.loc}: not a site URL`);
        else if (!p) bad.push(`${u.loc}: no built page`);
        else {
          if (p.info.noindex) bad.push(`${u.loc}: page is noindex`);
          if (p.info.canonical[0] !== u.loc) bad.push(`${u.loc}: canonical is ${p.info.canonical[0]}`);
        }
        const r = firstRedirect(rules, path);
        if (r && !p) bad.push(`${u.loc}: redirected to ${r.to}`);
      }
      expect(bad, report(bad)).toEqual([]);
    });
    it('has no duplicate URLs and the same alternates as the pages', () => {
      const locs = sitemap.map(u => u.loc);
      expect(locs.length - new Set(locs).size).toBe(0);
      const bad: string[] = [];
      const key = (a: { hreflang: string; href: string }[]) => a.map(x => `${x.hreflang}=${x.href}`).sort().join('|');
      for (const u of sitemap) {
        const p = pages.get(u.loc.slice(SITE.length));
        if (p && key(u.alternates) !== key(p.info.alternates)) bad.push(`${u.loc}: sitemap alternates differ from the page's hreflang`);
      }
      expect(bad, report(bad)).toEqual([]);
    });
    it('includes every indexable page', () => {
      const listed = new Set(sitemap.map(u => u.loc));
      const missing = indexable.filter(p => p.path.endsWith('/') && !listed.has(SITE + p.path)).map(p => p.path);
      expect(missing, report(missing)).toEqual([]);
    });
  });

  describe('links and images', () => {
    it('has no internal link or image that 404s', () => {
      const bad = new Set<string>();
      for (const p of pages.values()) for (const r of references(p.html)) {
        if (!exists(r.url) && !firstRedirect(rules, r.url.split(/[?#]/)[0])) bad.add(`${p.path}: ${r.kind} ${r.url}`);
      }
      expect([...bad], report([...bad])).toEqual([]);
    });
    it('has no internal link that goes through a redirect', () => {
      const bad = new Set<string>();
      for (const p of pages.values()) for (const r of references(p.html)) {
        const path = r.url.split(/[?#]/)[0];
        if (r.kind === 'link' && !exists(r.url)) { const rd = firstRedirect(rules, path); if (rd) bad.add(`${p.path}: ${r.url} → ${rd.to}`); }
      }
      expect([...bad], report([...bad])).toEqual([]);
    });
    it('gives every image an alt attribute', () => {
      const bad = [...pages.values()].flatMap(p => imageProblems(p.html).filter(x => x.problem === 'missing alt').map(x => `${p.path}: ${x.problem} ${x.tag}`));
      expect(bad, report(bad)).toEqual([]);
    });
  });

  describe('drafted and archived hotels', () => {
    it('have no built page in any language', () => {
      expect(notLivePaths.filter(p => pages.has(p))).toEqual([]);
    });
    it('are not linked from any page (cards, guides, blog posts, best-of pages, any language)', () => {
      const bad = new Set<string>();
      for (const p of pages.values()) for (const r of references(p.html)) if (r.kind === 'link' && isNotLivePath(r.url)) bad.add(`${p.path} → ${r.url}`);
      expect([...bad], report([...bad])).toEqual([]);
    });
    it('are not in the sitemap, the search indexes, the RSS feed or llms-full.txt', () => {
      const files = ['sitemap.xml', 'rss.xml', 'llms.txt', 'llms-full.txt', ...walk(DIST).filter(f => f.endsWith('search-index.json')).map(f => relative(DIST, f))];
      const bad: string[] = [];
      for (const f of files) {
        if (!existsSync(join(DIST, f))) continue;
        const text = readFileSync(join(DIST, f), 'utf8');
        for (const slug of notLive) if (new RegExp(`/${slug}(/|"|\\s|<|$)`).test(text)) bad.push(`${f}: ${slug}`);
      }
      expect(bad, report(bad)).toEqual([]);
    });
    it('redirect (301) from every language path to a live, indexable page, with no chain', () => {
      const bad: string[] = [];
      for (const path of notLivePaths) {
        const r = firstRedirect(rules, path);
        // Stays that were never published have no URL to keep; they need no redirect.
        if (!r) continue;
        if (r.status !== 301) bad.push(`${path}: status ${r.status}`);
        const target = pages.get(r.to);
        if (!target) bad.push(`${path} → ${r.to}: target is not a built page`);
        else if (target.info.noindex) bad.push(`${path} → ${r.to}: target is noindex`);
        if (firstRedirect(rules, r.to) && !exists(r.to)) bad.push(`${path} → ${r.to}: redirect chain`);
      }
      expect(bad, report(bad)).toEqual([]);
    });
  });

  describe('redirect rules', () => {
    it('point at built, indexable pages and never at another redirect', () => {
      const bad: string[] = [];
      for (const r of rules.filter(r => r.status >= 300 && r.status < 400 && r.to.startsWith('/'))) {
        const to = r.to.replace(/:splat|\*/g, '');
        if (/:/.test(to)) continue; // placeholders other than splat
        if (!exists(to)) bad.push(`${r.from} → ${r.to}: target not built`);
        else { const t = pages.get(to.split(/[?#]/)[0]); if (t?.info.noindex) bad.push(`${r.from} → ${r.to}: target is noindex`); }
        if (!exists(to) && firstRedirect(rules, to)) bad.push(`${r.from} → ${r.to}: chain`);
      }
      expect(bad, report(bad)).toEqual([]);
    });
  });

  describe('thin listing pages', () => {
    const listing = (p: Page) => /^\/(?:(?:de|fr|es|it|nl)\/)?(?:categories|kategorien|categorias|categorie|categorieen|countries|laender|pays|paises|paesi|landen|best|beste|meilleurs|mejores|migliori)\/[^/]+\/$/.test(p.path);
    const cards = (html: string) => (html.match(/<article\b[^>]*\sdata-hotel[\s>]/g) ?? []).length;
    it('are noindex and out of the sitemap when they list fewer than 3 stays', () => {
      const listed = new Set(sitemap.map(u => u.loc));
      const bad = [...pages.values()].filter(p => listing(p) && cards(p.html) < 3 && (!p.info.noindex || listed.has(SITE + p.path))).map(p => `${p.path} (${cards(p.html)} stays)`);
      expect(bad, report(bad)).toEqual([]);
    });
    it('stay indexable when they list 3 or more', () => {
      const bad = [...pages.values()].filter(p => listing(p) && cards(p.html) >= 3 && p.info.noindex).map(p => p.path);
      expect(bad, report(bad)).toEqual([]);
    });
  });

  describe('/hotels/ index', () => {
    // Was 777 KB with inline Tailwind classes and icons on every card (2026-11-17); now ~515 KB.
    const paths = ['/hotels/', '/de/unterkuenfte/', '/fr/hebergements/', '/es/alojamientos/', '/it/alloggi/', '/nl/verblijven/'];
    it('stays under 600 KB of HTML in every language', () => {
      for (const p of paths) expect(pages.get(p)!.html.length, p).toBeLessThan(600_000);
    });
    it('keeps what the filters, shareable URLs and filter_use need on every card', () => {
      for (const p of paths) {
        const html = pages.get(p)!.html;
        const cards = [...html.matchAll(/<article\b[^>]*\sdata-hotel[\s>][^>]*>/g)].map(m => m[0]);
        expect(cards.length, p).toBeGreaterThan(100);
        for (const c of cards) for (const a of ['data-slug', 'data-name', 'data-place', 'data-cat', 'data-cat-name', 'data-rating', 'data-featured']) expect(c, `${p} ${a}`).toContain(a);
        for (const id of ['id="grid"', 'id="f-q"', 'id="f-price"', 'id="f-sort"', 'id="f-reset"', 'id="f-count"', "track('filter_use'", 'URLSearchParams']) expect(html, `${p} ${id}`).toContain(id);
      }
    });
    it('defines every icon a page uses through <use>', () => {
      const bad: string[] = [];
      for (const p of pages.values()) for (const m of p.html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<use href="#([^"]+)"/g)) if (!p.html.includes(`id="${m[1]}"`)) bad.push(`${p.path}: #${m[1]}`);
      expect([...new Set(bad)], report([...new Set(bad)])).toEqual([]);
    });
  });

  describe('structured data', () => {
    const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    it('is valid JSON with no aggregateRating or review counts', () => {
      const bad: string[] = [];
      for (const p of pages.values()) {
        let blocks: any[] = [];
        try { blocks = ld(p.html); } catch { bad.push(`${p.path}: invalid JSON-LD`); continue; }
        if (/aggregateRating|reviewCount/.test(JSON.stringify(blocks))) bad.push(`${p.path}: rating markup`);
      }
      expect(bad, report(bad)).toEqual([]);
    });
    it('has a BreadcrumbList that matches the visible breadcrumb', () => {
      const bad: string[] = [];
      for (const p of indexable) {
        const crumbs = ld(p.html).filter(b => b['@type'] === 'BreadcrumbList');
        if (!crumbs.length) continue;
        const visible = p.html.match(/<nav[^>]*data-breadcrumb[^>]*>([\s\S]*?)<\/nav>/)?.[1];
        if (!visible) { bad.push(`${p.path}: BreadcrumbList without a visible breadcrumb`); continue; }
        const names = [...visible.matchAll(/<(a|span)\b[^>]*>([^<]+)<\/\1>/g)].map(m => m[2].trim()).filter(t => t && t !== '/');
        const ldNames = crumbs[0].itemListElement.map((i: any) => String(i.name).replace(/&amp;/g, '&'));
        const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"');
        if (JSON.stringify(names.map(decode)) !== JSON.stringify(ldNames)) bad.push(`${p.path}: visible [${names.join(' / ')}] vs JSON-LD [${ldNames.join(' / ')}]`);
      }
      expect(bad, report(bad)).toEqual([]);
    });
  });

  describe('Search Console verification', () => {
    const code = verificationCode(JSON.parse(readFileSync(join(ROOT, 'src/content/settings/seo.json'), 'utf8')).googleVerification);
    it('outputs the google-site-verification tag only when seo.json has a code, and on every page', () => {
      const bad = [...pages.values()].filter(p => JSON.stringify(p.info.verification) !== JSON.stringify(code ? [code] : [])).map(p => p.path);
      expect(bad.slice(0, 10)).toEqual([]);
    });
  });
});
