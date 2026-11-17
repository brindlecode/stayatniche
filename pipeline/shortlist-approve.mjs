/**
 * The owner approves by numbers from this week's shortlist, in one message: "1 3 5-9".
 * Use this when the owner sends the numbers to a Claude session instead of using the box on the
 * review page (both do the same thing). For every number:
 *   - the candidate becomes "approved" with the shortlist's category, so the writer takes it;
 *   - a page update is written to data/pipeline/decisions/<today>/shortlist-approve.json
 *     (send each inner list with ArtifactData action "batch" on the review page), so the page and
 *     the queue agree and the next sync does not undo the approval.
 * Numbers not given stay in the queue. A number whose stay is no longer waiting is skipped and said.
 * Usage: node pipeline/shortlist-approve.mjs "<numbers>"
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadQueue, saveQueue, publishedHotels, matchesPublished, DECISIONS, today, report } from './lib.mjs';
import { parseNumbers } from './screen.mjs';

const text = process.argv.slice(2).join(' ');
const list = (() => { try { return JSON.parse(readFileSync('data/pipeline/shortlist.json', 'utf8')); } catch { return null; } })();
if (!list?.items?.length) { console.error('no shortlist (data/pipeline/shortlist.json); run node pipeline/shortlist.mjs first'); process.exit(1); }
const nums = parseNumbers(text, list.items.length);
if (!nums.length) { console.error(`usage: node pipeline/shortlist-approve.mjs "1 3 5-9"  (no numbers between 1 and ${list.items.length} in "${text}")`); process.exit(1); }

const q = loadQueue(); const pub = publishedHotels();
const now = new Date().toISOString();
const done = [], skipped = [], writes = [];
for (const n of nums) {
  const x = list.items.find(i => i.n === n); const c = x && q[x.id];
  if (!c) { skipped.push(`${n}: kuyrukta yok`); continue; }
  if (c.status !== 'classified') { skipped.push(`${n} ${c.name}: zaten ${c.status}`); continue; }
  const p = matchesPublished(c, pub);
  if (p) { Object.assign(c, { status: 'duplicate', duplicateOf: p.slug }); skipped.push(`${n} ${c.name}: sitede zaten var (${p.slug})`); continue; }
  Object.assign(c, { status: 'approved', reasons: [], finalCategory: x.cat, reviewedAt: now, approvedVia: 'shortlist', shortlistWeek: list.week });
  x.state = 'onaylandı';
  writes.push({ op: 'update', collection: 'queue', doc_id: x.doc, data: { decision: 'approve', finalCat: x.cat, note: `Haftalık liste ${list.week} #${n}`, reviewedAt: now } });
  done.push(`${n} ${c.name}`);
}
saveQueue(q);
writeFileSync('data/pipeline/shortlist.json', JSON.stringify(list, null, 1) + '\n');
const dir = `${DECISIONS}/${today()}`; mkdirSync(dir, { recursive: true });
const batches = []; for (let i = 0; i < writes.length; i += 50) batches.push(writes.slice(i, i + 50));
writeFileSync(`${dir}/shortlist-approve.json`, JSON.stringify(batches, null, 1) + '\n');
for (const d of done) console.log(`onaylandı: ${d}`);
for (const s of skipped) console.log(`atlandı: ${s}`);
report('shortlist-approve', { ok: true, week: list.week, approved: done.length, skipped: skipped.length, pageUpdates: `${dir}/shortlist-approve.json` });
