/**
 * Monthly re-check of the hotels that are live on the site. For each page with status published:
 *   site      does its officialWebsite (else niche_source_url) still answer (HTTP status after redirects, or the error)?
 *   operating does that page say it closed for good, or is the domain parked / for sale?
 *   expedia   is its Expedia mapping (src/data/expedia-hotels.json) still a valid property-page URL
 *             with a confirmed verification record, used by no other hotel, verified in the last 180 days?
 *             Expedia itself is not fetched (it answers automated requests with 429); a mapping older
 *             than 180 days is listed for a fresh web-search check (docs/EXPEDIA-COVERAGE.md method).
 * Results: data/pipeline/recheck.json (every hotel) and data/pipeline/runs/recheck.json (summary);
 * status.mjs lists the problems in STATUS.md. Nothing is unpublished or changed automatically.
 * Runs only when the last full run is 28 days old or more (the nightly job calls it every night).
 * Usage: node pipeline/recheck.mjs [--force] [--limit N]      (SKIP_FETCH=1: no network, for tests)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { publishedHotels, isLiveHotel, UA, report, today } from './lib.mjs';
import { CLOSED } from './screen.mjs';

const args = process.argv.slice(2);
const OUT = 'data/pipeline/recheck.json';
const prev = (() => { try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return null; } })();
const ageDays = prev?.at ? (Date.now() - Date.parse(prev.at)) / 86400000 : Infinity;
if (!args.includes('--force') && ageDays < 28) { console.log(`recheck: last run ${prev.at.slice(0, 10)}, next after 28 days`); process.exit(0); }
const LIMIT = args.includes('--limit') ? +args[args.indexOf('--limit') + 1] : Infinity;

const PARKED = /this domain (name )?(is|may be) for sale|buy this domain|domain (is )?parked|parked free|hugedomains|sedo\.com|dan\.com\/|afternic|godaddy\.com\/domainsearch|domain has expired|account (has been )?suspended|website (is )?(currently )?suspended/i;
const PAGE = /^https:\/\/www\.expedia\.com\/[A-Za-z0-9-]+\.h(\d+)\.Hotel-Information$/;
const map = JSON.parse(readFileSync('src/data/expedia-hotels.json', 'utf8'));
const ver = JSON.parse(readFileSync('src/data/expedia-verification.json', 'utf8'));
const idCount = {}; for (const u of Object.values(map)) { const id = u.match(/\.h(\d+)\./)?.[1]; if (id) idCount[id] = (idCount[id] ?? 0) + 1; }

async function site(url) {
  if (!url) return { state: 'none', note: 'resmi site yazılı değil' };
  if (process.env.SKIP_FETCH === '1') return { state: 'skipped' };
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      const html = (await r.text()).slice(0, 300000);
      const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const closed = CLOSED.exec(text.slice(0, 40000)); const parked = PARKED.exec(html.slice(0, 60000));
      return { state: r.ok ? 'ok' : `http ${r.status}`, status: r.status, finalUrl: r.url !== url ? r.url : undefined,
        operating: parked ? 'parked' : closed ? 'closed' : 'no closure notice', said: (parked ?? closed)?.[0] };
    } catch (e) { if (i === 1) return { state: 'error', note: String(e.cause?.code ?? e.message ?? e).slice(0, 80) }; await new Promise(r => setTimeout(r, 3000)); }
  }
}
function expedia(slug) {
  const u = map[slug]; const r = ver[slug];
  if (!u) return { state: r ? `no mapping (${r.status})` : 'no mapping, not checked' };
  const m = u.match(PAGE);
  if (!m) return { state: 'invalid', note: 'URL is not an expedia.com property page' };
  if (r?.status !== 'confirmed' || r.url !== u) return { state: 'invalid', note: 'no matching confirmed verification record' };
  if (idCount[m[1]] > 1) return { state: 'invalid', note: `Expedia id ${m[1]} used by ${idCount[m[1]]} hotels` };
  const age = (Date.now() - Date.parse(r.verifiedAt)) / 86400000;
  return age > 180 ? { state: 'stale', note: `verified ${r.verifiedAt}; search again` } : { state: 'valid', verifiedAt: r.verifiedAt };
}

const live = publishedHotels().filter(isLiveHotel).slice(0, LIMIT);
const results = [];
const queue = [...live];
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let h; (h = queue.shift());) {
    // No yaml package here: the nightly job runs without npm ci.
    const head = readFileSync(`src/content/hotels/${h.slug}.md`, 'utf8').split('---')[1] ?? '';
    const field = (k) => (head.match(new RegExp(`^${k}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm')) ?? [])[1] ?? null;
    // Older pages have no officialWebsite; the official page cited for the niche stands in for it.
    const url = field('officialWebsite') ?? field('niche_source_url');
    results.push({ slug: h.slug, name: h.name, url, site: await site(url), expedia: expedia(h.slug) });
  }
}));
results.sort((a, b) => a.slug.localeCompare(b.slug));
const problem = (r) => !['ok', 'skipped'].includes(r.site.state) || ['closed', 'parked'].includes(r.site.operating) || ['invalid', 'stale'].includes(r.expedia.state);
const n = (f) => results.filter(f).length;
const summary = {
  ok: true, hotels: results.length,
  siteOk: n(r => r.site.state === 'ok'), siteDown: n(r => !['ok', 'skipped', 'none'].includes(r.site.state)), noSite: n(r => r.site.state === 'none'),
  saysClosed: n(r => r.site.operating === 'closed'), parked: n(r => r.site.operating === 'parked'),
  expediaValid: n(r => r.expedia.state === 'valid'), expediaInvalid: n(r => r.expedia.state === 'invalid'), expediaStale: n(r => r.expedia.state === 'stale'),
  problems: n(problem),
};
mkdirSync('data/pipeline', { recursive: true });
writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), day: today(), summary, results }, null, 1) + '\n');
report('recheck', summary);
