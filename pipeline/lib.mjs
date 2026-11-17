import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, appendFileSync, mkdirSync } from 'node:fs';

export const UA = 'StayAtNicheBot/1.0 (+https://stayatniche.com/about/)';
export const QUEUE = 'data/pipeline/candidates.json';
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Evidence packs live on the orphan `pipeline-data` branch, checked out here (git-ignored).
export const DATA_DIR = process.env.PIPELINE_DATA ?? '.pipeline-data';
export const INBOX = `${DATA_DIR}/inbox`;
export const DECISIONS = 'data/pipeline/decisions';
export const packName = (id) => id.replace(/[^a-z0-9]+/gi, '_');
export const today = () => new Date().toISOString().slice(0, 10);
export const catOf = (c) => c.category ?? c.categories?.[0];
export const km = (a, b, c, d) => { const R = 6371, r = x => x * Math.PI / 180; const x = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
export const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(the|hotel|resort|lodge|&|and|spa)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export async function getJSON(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (r.ok) return await r.json();
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (i + 1)); continue; }
      return null;
    } catch { await sleep(3000 * (i + 1)); }
  }
  return null;
}

export function loadQueue() { return existsSync(QUEUE) ? JSON.parse(readFileSync(QUEUE, 'utf8')) : {}; }
export function saveQueue(q) {
  const sorted = Object.fromEntries(Object.entries(q).sort(([a], [b]) => a.localeCompare(b)));
  // Write to a temp file first: a killed job must never leave half a queue behind.
  writeFileSync(QUEUE + '.tmp', JSON.stringify(sorted, null, 1) + '\n');
  renameSync(QUEUE + '.tmp', QUEUE);
}

/**
 * Candidate statuses.
 *   new -> verified / weak (cheap name + keyword check) -> classified (Haiku found a niche, waits
 *   for the owner) -> approved (owner said yes) -> drafted (page written as a draft) -> published.
 *   blocked = approved, but the writer could not write a truthful page (reason in `blocked.reason`).
 *   rejected / duplicate = out.
 */
export const STATUSES = ['new', 'verified', 'weak', 'classified', 'approved', 'blocked', 'drafted', 'published', 'rejected', 'duplicate'];
export const UNDECIDED = ['new', 'verified', 'weak'];
export const packPath = (id) => `${INBOX}/${packName(id)}.json`;
export function loadPack(id) { try { return JSON.parse(readFileSync(packPath(id), 'utf8')); } catch { return null; } }
export const hostOf = (u) => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };
// Hosts that list several distinct properties, so a shared host does not mean "same property".
export const MULTI_HOST = /(^|\.)(nationaltrust\.org\.uk|landmarktrust\.org\.uk|yha\.org\.uk|booking\.com|airbnb\.[a-z.]+|facebook\.com|instagram\.com|hilton\.com|marriott\.com|hyatt\.com|ihg\.com|accor\.com|wixsite\.com|nps\.gov|cloudbeds\.com|linktr\.ee|linkumtours\.com|keywesthistoricinns\.com|reflectionsholidays\.com\.au|jetwinghotels\.com|santashotels\.fi|doc\.govt\.nz|paradores\.es|pousadas\.pt)$/i;
// Hosts that are never a property's own website (listings, social, reference).
export const LISTING_HOST = /(^|\.)(booking|airbnb|tripadvisor|expedia|hotels|agoda|trivago|kayak|vrbo|hostelworld|hotelscombined|trip|orbitz|priceline|lastminute|google|facebook|instagram|youtube|tiktok|pinterest|x|twitter|linkedin|yelp|wikipedia|wikidata|wikivoyage|openstreetmap|foursquare|mapcarta|lonelyplanet|michelin|cntraveler|timeout|theguardian|telegraph|linktr|glampinghub|hipcamp|pitchup|canopyandstars|coolcamping|sawdays|i-escape|mrandmrssmith|tablethotels|slh|lhw|relaischateaux|historichotels|unusualhotelsoftheworld|uniqhotels|atlasobscura|stayatniche)\.[a-z.]+$/i;

/** Every stage records what it did here; status.mjs prints it and the workflow summary shows it. */
// One small file per stage (data/pipeline/runs/<stage>.json), so jobs that run at different times
// never edit the same file.
export const RUNLOG = 'data/pipeline/runs';
export function report(stage, data = {}) {
  mkdirSync(RUNLOG, { recursive: true });
  writeFileSync(`${RUNLOG}/${stage}.json`, JSON.stringify({ at: new Date().toISOString(), ...data }, null, 1) + '\n');
  const line = `${stage}: ${Object.entries(data).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- **${stage}**: ${line.slice(stage.length + 2)}\n`); } catch {}
}
/** Marks a stage as failed in the run log and exits non-zero, so the workflow reports it. */
export function fail(stage, error) {
  report(stage, { ok: false, error: String(error?.message ?? error).slice(0, 300) });
  process.exit(1);
}

/** Hotels already published on the site (name + coordinates) for de-duplication. */
// Every hotel file (drafts included, so discovery never re-adds them). Use isLiveHotel to count what is public.
export function publishedHotels() {
  return readdirSync('src/content/hotels').filter(f => f.endsWith('.md')).map(f => {
    const t = readFileSync(`src/content/hotels/${f}`, 'utf8').split('---')[1] ?? '';
    return { slug: f.slice(0, -3), site: hostOf((t.match(/^officialWebsite:\s*(.+)$/m) ?? [])[1]?.trim().replace(/^["']|["']$/g, '') ?? ''), name: (t.match(/^name:\s*(.+)$/m) ?? [])[1]?.replace(/^["']|["']$/g, '') ?? '', lat: +(t.match(/lat:\s*(-?[\d.]+)/) ?? [])[1], lng: +(t.match(/lng:\s*(-?[\d.]+)/) ?? [])[1], source: (t.match(/^sourceId:\s*(.+)$/m) ?? [])[1]?.trim().replace(/^["']|["']$/g, ''), status: (t.match(/^status:\s*(.+)$/m) ?? [])[1]?.trim().replace(/^["']|["']$/g, '') || 'published' };
  });
}
// Same rule as isLive() in src/lib/site.ts: draft and archived pages are not public.
export const isLiveHotel = h => h.status !== 'draft' && h.status !== 'archived';
// Word order does not matter: "Snowhotel Kirkenes" and "Kirkenes Snowhotel" are one place.
export const nameKey = (s) => norm(s).split(' ').sort().join(' ');
export function matchesPublished(c, pub) {
  return pub.find(p => p.source === c.id) ?? pub.find(p => (nameKey(p.name) && nameKey(p.name) === nameKey(c.name)) || (!isNaN(p.lat) && km(p.lat, p.lng, c.lat, c.lng) < 0.3 && norm(c.name).split(' ')[0] === norm(p.name).split(' ')[0]));
}

/**
 * Duplicate warnings for the review page: other entries that look like the same property.
 * `idx` comes from dupeIndex(queue, pages). Returns [{ kind: 'site' | 'queue', ref, name, status, why }].
 */
export function dupeIndex(q, pub) {
  const live = Object.values(q).filter(c => ['classified', 'approved', 'blocked', 'drafted', 'published'].includes(c.status));
  return { pub, live };
}
export function findDupes(c, idx) {
  const out = []; const n = nameKey(c.name); const h = hostOf(c.website ?? ''); const shared = h && !MULTI_HOST.test(h) && !LISTING_HOST.test(h);
  const near = (o, kmMax) => o.lat != null && c.lat != null && !isNaN(o.lat) && km(o.lat, o.lng, c.lat, c.lng) < kmMax;
  for (const p of idx.pub) {
    if (p.source === c.id || p.slug === c.slug) continue; // its own page
    const why = n && nameKey(p.name) === n && near(p, 50) ? 'same name' : shared && p.site === h ? 'same website' : near(p, 0.15) ? 'under 150 m away' : null;
    if (why) out.push({ kind: 'site', ref: p.slug, name: p.name, status: p.status, why });
  }
  for (const o of idx.live) {
    if (o.id === c.id || (o.slug && out.some(d => d.ref === o.slug))) continue;
    const why = n && nameKey(o.name) === n && near(o, 50) ? 'same name' : shared && hostOf(o.website ?? '') === h ? 'same website' : near(o, 0.15) ? 'under 150 m away' : null;
    if (why) out.push({ kind: 'queue', ref: o.id, name: o.name, status: o.status, why });
  }
  return out.slice(0, 5);
}
export function runLog() {
  const log = {};
  if (existsSync(RUNLOG)) for (const f of readdirSync(RUNLOG).filter(f => f.endsWith('.json'))) try { log[f.slice(0, -5)] = JSON.parse(readFileSync(`${RUNLOG}/${f}`, 'utf8')); } catch {}
  return log;
}
