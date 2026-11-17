// Rules of the build audit (scripts/lib/site-audit.mjs), checked on small hand-written pages.
// tests/build/dist.test.ts applies the same rules to the real build.
import { describe, it, expect } from 'vitest';
import {
  SITE, fileToPath, pathToFiles, headInfo, references, imageProblems, hreflangProblems,
  parseSitemap, parseRedirects, redirectMatches, firstRedirect,
} from '../scripts/lib/site-audit.mjs';

const page = (path: string, alts: [string, string][], extra = '') => `<!DOCTYPE html><html lang="en"><head>
<link rel="canonical" href="${SITE}${path}">
<meta name="robots" content="index,follow">${extra}
${alts.map(([l, p]) => `<link rel="alternate" hreflang="${l}" href="${SITE}${p}">`).join('\n')}
</head><body></body></html>`;
const cluster: [string, string][] = [['en', '/hotels/a/'], ['de', '/de/unterkuenfte/a/'], ['x-default', '/hotels/a/']];
const pages = (entries: [string, string][]) => new Map(entries.map(([p, h]) => [p, headInfo(h)]));

describe('paths', () => {
  it('maps dist files to site paths and back', () => {
    expect(fileToPath('dist/index.html')).toBe('/');
    expect(fileToPath('dist/de/unterkuenfte/a/index.html')).toBe('/de/unterkuenfte/a/');
    expect(fileToPath('dist/404.html')).toBe('/404.html');
    expect(pathToFiles('/hotels/a/')).toEqual(['/hotels/a/index.html']);
    expect(pathToFiles('/hotels/a?x=1#top')).toContain('/hotels/a/index.html');
  });
});

describe('head', () => {
  it('reads canonical, robots, alternates and the verification tag', () => {
    const h = headInfo(page('/x/', cluster, '<meta name="google-site-verification" content="abc123"><meta name="robots" content="noindex,follow">'));
    expect(h.canonical).toEqual([`${SITE}/x/`]);
    expect(h.noindex).toBe(true);
    expect(h.alternates).toHaveLength(3);
    expect(h.verification).toEqual(['abc123']);
  });
});

describe('hreflang reciprocity', () => {
  const ok = pages([['/hotels/a/', page('/hotels/a/', cluster)], ['/de/unterkuenfte/a/', page('/de/unterkuenfte/a/', cluster)]]);
  it('accepts a complete, reciprocal cluster with x-default = English', () => expect(hreflangProblems(ok)).toEqual([]));
  it('flags a page that does not link back', () => {
    const p = pages([['/hotels/a/', page('/hotels/a/', cluster)], ['/de/unterkuenfte/a/', page('/de/unterkuenfte/a/', [['de', '/de/unterkuenfte/a/']])]]);
    expect(hreflangProblems(p).join('\n')).toMatch(/not reciprocal/);
  });
  it('flags a missing or wrong x-default', () => {
    const noXd: [string, string][] = cluster.slice(0, 2);
    expect(hreflangProblems(pages([['/hotels/a/', page('/hotels/a/', noXd)], ['/de/unterkuenfte/a/', page('/de/unterkuenfte/a/', noXd)]])).join('\n')).toMatch(/0 x-default/);
    const wrong: [string, string][] = [...noXd, ['x-default', '/de/unterkuenfte/a/']];
    expect(hreflangProblems(pages([['/hotels/a/', page('/hotels/a/', wrong)], ['/de/unterkuenfte/a/', page('/de/unterkuenfte/a/', wrong)]])).join('\n')).toMatch(/is not the English page/);
  });
  it('flags a target that is not built, noindex, or canonical elsewhere', () => {
    expect(hreflangProblems(pages([['/hotels/a/', page('/hotels/a/', cluster)]])).join('\n')).toMatch(/not a built page/);
    const noindexDe = page('/de/unterkuenfte/a/', cluster, '<meta name="robots" content="noindex">');
    expect(hreflangProblems(pages([['/hotels/a/', page('/hotels/a/', cluster)], ['/de/unterkuenfte/a/', noindexDe]])).join('\n')).toMatch(/is noindex/);
    const elsewhere = page('/de/unterkuenfte/a/', cluster).replace(`${SITE}/de/unterkuenfte/a/">\n<meta`, `${SITE}/de/">\n<meta`);
    expect(hreflangProblems(pages([['/hotels/a/', page('/hotels/a/', cluster)], ['/de/unterkuenfte/a/', elsewhere]])).join('\n')).toMatch(/has canonical/);
  });
});

describe('references and images', () => {
  const html = `<head><link rel="preload" as="image" href="/images/hero.webp"></head><body>
    <a href="/hotels/a/">a</a><a href="https://stayatniche.com/blog/b/">b</a><a href="https://example.com/">x</a><a href="//cdn.example.com/">y</a>
    <img src="/images/a.webp" srcset="/images/a-480.webp 480w, /images/a-800.webp 800w" alt="A" width="4" height="3">
    <img src="/images/b.webp"><script>var s = '<a href="/not-a-link/">';</script></body>`;
  it('collects internal links and every image candidate, and ignores scripts and external URLs', () => {
    const refs = references(html);
    expect(refs.filter(r => r.kind === 'link').map(r => r.url)).toEqual(['/hotels/a/', '/blog/b/']);
    expect(refs.filter(r => r.kind === 'img').map(r => r.url)).toEqual(['/images/a.webp', '/images/a-480.webp', '/images/a-800.webp', '/images/b.webp', '/images/hero.webp']);
  });
  it('flags images without alt or size', () => {
    expect(imageProblems(html).map(p => p.problem)).toEqual(['missing alt', 'missing width/height']);
  });
});

describe('sitemap and redirects', () => {
  it('parses sitemap entries with their alternates', () => {
    const xml = `<urlset><url><loc>${SITE}/a/</loc><xhtml:link rel="alternate" hreflang="de" href="${SITE}/de/a/"/></url><url><loc>${SITE}/b/</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual([{ loc: `${SITE}/a/`, alternates: [{ hreflang: 'de', href: `${SITE}/de/a/` }] }, { loc: `${SITE}/b/`, alternates: [] }]);
  });
  it('parses netlify.toml redirects and matches them like Netlify', () => {
    const rules = parseRedirects(`[[redirects]]\n  from = "/hotels/old/*"\n  to = "/categories/x/"\n  status = 301\n\n[[redirects]]\n  from = "/hotels/old"\n  to = "/categories/x/"\n  status = 301\n\n[[redirects]]\n  from = "/de/*"\n  to = "/de/404/"\n  status = 404\n`);
    expect(rules).toHaveLength(3);
    expect(redirectMatches('/hotels/old', '/hotels/old/')).toBe(true);
    expect(redirectMatches('/hotels/old/*', '/hotels/old/photos')).toBe(true);
    expect(redirectMatches('/hotels/old', '/hotels/older/')).toBe(false);
    expect(firstRedirect(rules, '/hotels/old/')?.to).toBe('/categories/x/');
    expect(firstRedirect(rules, '/de/anything/')).toBeNull(); // 404 rules are not redirects
  });
});
