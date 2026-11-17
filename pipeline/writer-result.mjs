/**
 * Records what the writer did with an approved candidate, so nothing stays "approved" forever.
 *   node pipeline/writer-result.mjs published <id> <slug>   page is live
 *   node pipeline/writer-result.mjs drafted   <id> <slug>   page written as status: draft
 *   node pipeline/writer-result.mjs blocked   <id> "<reason>" [--final]
 *        no truthful page can be written from the stored evidence. Without --final the nightly
 *        job fetches fresh evidence and hands the candidate back to the writer when it is
 *        better (up to 3 tries); with --final it waits for the owner (e.g. "not a public stay").
 *   node pipeline/writer-result.mjs duplicate <id> <existing slug>
 * published / drafted also copy a confirmed Expedia page from data/pipeline/expedia-candidates.json
 * into src/data/expedia-hotels.json and src/data/expedia-verification.json (never one already in use).
 * The review page is updated from these by the next classifier run (pipeline/review-items.mjs).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadQueue, saveQueue, report } from './lib.mjs';

const [what, id, arg, flag] = process.argv.slice(2);
const q = loadQueue();
const c = q[id];
const die = (m) => { console.error(m); process.exit(1); };
if (!['published', 'drafted', 'blocked', 'duplicate'].includes(what) || !id || !arg) die('usage: node pipeline/writer-result.mjs published|drafted|blocked|duplicate <id> <slug | reason> [--final]');
if (!c) die(`unknown candidate ${id}`);
if (what !== 'blocked' && !existsSync(`src/content/hotels/${arg}.md`)) die(`no page src/content/hotels/${arg}.md`);
const now = new Date().toISOString();
if (what === 'published') Object.assign(c, { status: 'published', slug: arg, publishedAt: c.publishedAt ?? now });
if (what === 'drafted') Object.assign(c, { status: 'drafted', slug: arg, draftedAt: c.draftedAt ?? now });
if (what === 'duplicate') Object.assign(c, { status: 'duplicate', duplicateOf: arg });
if (what === 'blocked') {
  const tries = c.blocked?.tries ?? 0;
  const retry = flag !== '--final' && tries < 3 && !!(c.website || c.wikidata);
  Object.assign(c, { status: 'blocked', blocked: { reason: arg, at: now, tries, retry } });
  if (retry) c.refetch = true;
} else delete c.blocked;
// A confirmed Expedia page found for the candidate (pipeline/expedia-check.mjs) goes with its page:
// the booking button then links to it. Same record format as the published hotels' records.
let expedia = null;
if (['published', 'drafted'].includes(what)) {
  const rec = (() => { try { return JSON.parse(readFileSync('data/pipeline/expedia-candidates.json', 'utf8'))[id]; } catch { return null; } })();
  const MAP = 'src/data/expedia-hotels.json', VER = 'src/data/expedia-verification.json';
  if (rec?.status === 'confirmed' && rec.url && existsSync(MAP) && existsSync(VER)) {
    const map = JSON.parse(readFileSync(MAP, 'utf8')), ver = JSON.parse(readFileSync(VER, 'utf8'));
    const hid = rec.url.match(/\.h(\d+)\./)?.[1];
    const taken = Object.entries(map).find(([s, u]) => s !== arg && u.match(/\.h(\d+)\./)?.[1] === hid);
    if (taken) console.log(`Expedia page not copied: ${taken[0]} already uses Expedia id ${hid}`);
    else if (!map[arg]) {
      map[arg] = rec.url; ver[arg] = { ...rec };
      const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(MAP, JSON.stringify(sorted(map), null, 2) + '\n'); writeFileSync(VER, JSON.stringify(sorted(ver), null, 2) + '\n');
      expedia = rec.url; console.log(`Expedia page added for ${arg}: ${rec.url}`);
    }
  }
}
saveQueue(q);
report('writer', { ok: true, last: `${what} ${c.name}`, ...(expedia ? { expedia } : {}) });
