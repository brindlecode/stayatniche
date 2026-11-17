/**
 * Pure helpers for auditing the built site (dist/): hreflang clusters, canonicals, robots, internal
 * links and images, sitemap entries, Netlify redirects. No file system access here, so every rule is
 * unit-tested with small HTML strings (tests/site-audit.test.ts); tests/build/dist.test.ts applies
 * them to the real build.
 */

export const SITE = 'https://stayatniche.com';
export const LANGS = ['en', 'de', 'fr', 'es', 'it', 'nl'];

const unescape = (s) => s.replace(/&amp;|&#x26;|&#38;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'");
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? unescape(m[2] ?? m[3] ?? m[4] ?? '') : null;
};
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);

/** dist file → site path: dist/de/index.html → /de/, dist/404.html → /404.html */
export function fileToPath(rel) {
  const p = '/' + rel.replace(/\\/g, '/').replace(/^dist\//, '');
  return p.endsWith('/index.html') ? p.slice(0, -'index.html'.length) : p;
}

/** Site path → dist file candidates (Netlify serves /a/ from a/index.html and /a from a.html or a/index.html). */
export function pathToFiles(path) {
  const clean = decodeURI(path.split(/[?#]/)[0]);
  if (clean.endsWith('/')) return [`${clean}index.html`];
  return [clean, `${clean}/index.html`, `${clean}.html`];
}

export function headInfo(html) {
  const head = html.split(/<\/head>/i)[0];
  const canonical = tags(head, 'link').filter((t) => /rel\s*=\s*["']?canonical/i.test(t)).map((t) => attr(t, 'href'));
  const robots = tags(head, 'meta').filter((t) => /name\s*=\s*["']?robots/i.test(t)).map((t) => attr(t, 'content') ?? '');
  const alternates = tags(head, 'link')
    .filter((t) => /rel\s*=\s*["']?alternate/i.test(t) && attr(t, 'hreflang'))
    .map((t) => ({ hreflang: attr(t, 'hreflang'), href: attr(t, 'href') }));
  const verification = tags(head, 'meta').filter((t) => /name\s*=\s*["']?google-site-verification/i.test(t)).map((t) => attr(t, 'content'));
  return {
    canonical,
    robots,
    noindex: robots.some((r) => /noindex/i.test(r)),
    alternates,
    verification,
    lang: html.match(/<html[^>]*\slang="([^"]+)"/i)?.[1] ?? null,
  };
}

/** Internal link and image references in a page body: [{ kind: 'link'|'img', url }] (site paths only). */
export function references(html) {
  const out = [];
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<template\b[\s\S]*?<\/template>/gi, '');
  const local = (u) => {
    if (!u) return null;
    if (u.startsWith(SITE + '/')) u = u.slice(SITE.length);
    if (!u.startsWith('/') || u.startsWith('//')) return null;
    return u;
  };
  for (const t of tags(body, 'a')) { const u = local(attr(t, 'href')); if (u) out.push({ kind: 'link', url: u }); }
  for (const t of [...tags(body, 'img'), ...tags(body, 'source')]) {
    const s = local(attr(t, 'src')); if (s) out.push({ kind: 'img', url: s });
    for (const part of (attr(t, 'srcset') ?? '').split(',')) { const u = local(part.trim().split(/\s+/)[0]); if (u) out.push({ kind: 'img', url: u }); }
  }
  for (const t of tags(html.split(/<\/head>/i)[0], 'link')) {
    if (/rel\s*=\s*["']?(preload|icon|apple-touch-icon|manifest)/i.test(t)) { const u = local(attr(t, 'href')); if (u) out.push({ kind: 'img', url: u }); }
  }
  return out;
}

/** <img> tags with a problem: no alt attribute, or no width/height (layout shift). */
export function imageProblems(html) {
  const out = [];
  for (const t of tags(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''), 'img')) {
    if (attr(t, 'alt') === null) out.push({ tag: t.slice(0, 140), problem: 'missing alt' });
    if (!attr(t, 'width') || !attr(t, 'height')) out.push({ tag: t.slice(0, 140), problem: 'missing width/height' });
  }
  return out;
}

/**
 * hreflang cluster check over every page that declares alternates.
 * pages: Map<path, headInfo>. Returns a list of human-readable problems.
 * Rules: the page lists itself; x-default exists and equals the English version; every target exists,
 * is indexable, is its own canonical, and lists exactly the same set back (reciprocity).
 */
export function hreflangProblems(pages) {
  const problems = [];
  const key = (alts) => alts.map((a) => `${a.hreflang}=${a.href}`).sort().join('|');
  for (const [path, info] of pages) {
    const alts = info.alternates;
    if (!alts.length) continue;
    const self = SITE + path;
    if (!alts.some((a) => a.href === self && a.hreflang !== 'x-default')) problems.push(`${path}: hreflang set does not include the page itself`);
    const langs = alts.filter((a) => a.hreflang !== 'x-default').map((a) => a.hreflang);
    if (new Set(langs).size !== langs.length) problems.push(`${path}: duplicate hreflang codes`);
    for (const l of langs) if (!LANGS.includes(l)) problems.push(`${path}: unknown hreflang ${l}`);
    const xd = alts.filter((a) => a.hreflang === 'x-default');
    const en = alts.find((a) => a.hreflang === 'en');
    if (en && xd.length !== 1) problems.push(`${path}: ${xd.length} x-default entries (expected 1)`);
    if (en && xd[0] && xd[0].href !== en.href) problems.push(`${path}: x-default ${xd[0].href} is not the English page ${en.href}`);
    if (!en && xd.length) problems.push(`${path}: x-default without an English version`);
    for (const a of alts) {
      if (!a.href.startsWith(SITE + '/')) { problems.push(`${path}: hreflang ${a.hreflang} is not an absolute site URL (${a.href})`); continue; }
      const target = pages.get(a.href.slice(SITE.length));
      if (!target) { problems.push(`${path}: hreflang ${a.hreflang} → ${a.href} is not a built page`); continue; }
      if (target.noindex) problems.push(`${path}: hreflang ${a.hreflang} → ${a.href} is noindex`);
      if (target.canonical[0] !== a.href) problems.push(`${path}: hreflang ${a.hreflang} → ${a.href} has canonical ${target.canonical[0]}`);
      if (a.hreflang !== 'x-default' && key(target.alternates) !== key(alts)) problems.push(`${path}: ${a.href} lists a different hreflang set (not reciprocal)`);
    }
    if (info.noindex) problems.push(`${path}: noindex page declares hreflang alternates`);
  }
  return problems;
}

/** Sitemap XML → [{ loc, alternates: [{hreflang, href}] }] */
export function parseSitemap(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: unescape(m[1].match(/<loc>([^<]+)<\/loc>/)[1].trim()),
    alternates: [...m[1].matchAll(/<xhtml:link[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g)].map((x) => ({ hreflang: x[1], href: unescape(x[2]) })),
  }));
}

/** netlify.toml [[redirects]] blocks → [{ from, to, status }] in file order. */
export function parseRedirects(toml) {
  return [...toml.matchAll(/\[\[redirects\]\]\s*\n((?:[ \t]*\w+\s*=\s*[^\n]*\n?)+)/g)].map((m) => {
    const get = (k) => m[1].match(new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\n]*)"?`, 'm'))?.[1];
    return { from: get('from'), to: get('to'), status: Number(get('status') ?? 301), force: get('force') === 'true' };
  });
}

/** Does a Netlify redirect pattern ("/a/*", "/a/:slug") match a path? */
export function redirectMatches(from, path) {
  const strip = (p) => (p.length > 1 ? p.replace(/\/$/, '') : p);
  const re = new RegExp('^' + strip(from).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\/\*$/, '(?:/.*)?').replace(/\*/g, '.*').replace(/:[a-z]+/gi, '[^/]+') + '/?$');
  return re.test(strip(path)) || re.test(path);
}

/** The first 3xx redirect rule that matches a path (Netlify applies the first match), or null. */
export function firstRedirect(rules, path) {
  return rules.find((r) => r.status >= 300 && r.status < 400 && redirectMatches(r.from, path)) ?? null;
}
