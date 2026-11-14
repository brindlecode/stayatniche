/**
 * Stores official websites found by web search for candidates that had none.
 * Input: <run dir>/sites.json = [{ id, url | null, title, why }] written by the site-finder.
 * A URL is accepted only if it is https/http, is not a listing / social / reference site, and
 * the property's name shows in the host or in the page title. Everything else counts as
 * "not found". Either way the candidate is marked as searched, so it is not looked up again.
 * The nightly job then fetches evidence from the accepted sites. Idempotent.
 * Usage: node pipeline/apply-websites.mjs <decisions run dir>
 */
import { readFileSync, existsSync } from 'node:fs';
import { loadQueue, saveQueue, hostOf, LISTING_HOST, norm, today, report } from './lib.mjs';

const dir = (process.argv[2] ?? '').replace(/\/$/, '');
if (!dir) { console.error('usage: node pipeline/apply-websites.mjs <decisions run dir>'); process.exit(1); }
const file = `${dir}/sites.json`;
if (!existsSync(file)) { report('sites', { ok: true, found: 0, note: 'no sites.json' }); process.exit(0); }
let rows; try { rows = JSON.parse(readFileSync(file, 'utf8')); if (!Array.isArray(rows)) throw new Error('not a list'); } catch (e) { report('sites', { ok: false, error: `${file}: ${e.message}` }); process.exit(1); }
const GENERIC = new Set(['castle', 'castello', 'castillo', 'schloss', 'chateau', 'zamek', 'kasteel', 'palace', 'house', 'cave', 'cueva', 'cuevas', 'tree', 'treehouse', 'safari', 'camp', 'camping', 'jungle', 'desert', 'lighthouse', 'cliff', 'bubble', 'igloo', 'train', 'boat', 'houseboat', 'floating', 'guest', 'guesthouse', 'inn', 'villa', 'villas', 'suites', 'rooms', 'apartments', 'eco', 'ecolodge', 'river', 'beach', 'park', 'view', 'royal', 'grand', 'hostel', 'motel', 'bungalow', 'bungalows', 'cabin', 'cabins', 'cottage', 'cottages', 'farm', 'garden', 'mountain', 'lake', 'island', 'national', 'hills', 'valley', 'saint']);
const q = loadQueue();
const tally = { found: 0, none: 0, refused: 0 }; const refused = [];
for (const r of rows) {
  const c = q[r?.id];
  if (!c || c.website) continue;
  c.siteSearchAt = today();
  const host = hostOf(r.url ?? '');
  if (!r.url || !host) { c.siteSearch = 'none'; tally.none++; continue; }
  const tokens = norm(c.name).split(' ').filter(t => t.length >= 4 && !GENERIC.has(t));
  const flat = (s) => norm(s ?? '').replace(/ /g, '');
  const named = tokens.length ? tokens.some(t => flat(host).includes(t) || norm(r.title ?? '').includes(t)) : flat(r.title).includes(flat(c.name));
  if (!/^https?:\/\//.test(r.url) || LISTING_HOST.test(host) || !named) { c.siteSearch = 'refused'; tally.refused++; refused.push(`${c.name}: ${r.url}`); continue; }
  Object.assign(c, { website: r.url, websiteSource: 'search', siteSearch: 'found' });
  delete c.lastEvidence; // fetch evidence from the new site on the next nightly run
  if (c.blocked) { c.blocked.retry = true; c.refetch = true; }
  tally.found++;
}
saveQueue(q);
report('sites', { ok: true, ...tally, ...(refused.length ? { refusedUrls: refused.slice(0, 20) } : {}) });
