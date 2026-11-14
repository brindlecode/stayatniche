/**
 * Lists evidence packs that still need a Haiku decision and splits them into batches for the
 * hotel-classifier subagents. A pack needs a decision when
 *   - its candidate has no decision yet, or the owner asked for research and the pack is newer
 *     than that request, and
 *   - no batch file written on or after the day the pack was fetched already covers it
 *     (decided today, applied by tonight's job).
 * Safe to run twice on the same day: new batches are numbered after the existing ones.
 * Writes data/pipeline/decisions/<run>/todo.json: [{ out: "<batch file to write>", packs: [paths] }].
 * Usage: node pipeline/next-batches.mjs <run name, e.g. 2026-10-09> [max packs=150] [batch size=17]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { loadQueue, INBOX, DECISIONS, report } from './lib.mjs';

const [run, max = 150, size = 17] = process.argv.slice(2);
if (!run) { console.error('usage: node pipeline/next-batches.mjs <run> [max] [batch size]'); process.exit(1); }
const q = loadQueue();
// id -> latest run (a date) whose batch files contain a decision for it.
const decidedOn = new Map(); const broken = [];
for (const r of existsSync(DECISIONS) ? readdirSync(DECISIONS) : [])
  for (const f of readdirSync(`${DECISIONS}/${r}`).filter(f => /^batch.*\.json$/.test(f)))
    try { for (const d of JSON.parse(readFileSync(`${DECISIONS}/${r}/${f}`, 'utf8'))) if (d?.id && r > (decidedOn.get(d.id) ?? '')) decidedOn.set(d.id, r); } catch { broken.push(`${r}/${f}`); }

const todo = []; let unreadable = 0;
for (const f of existsSync(INBOX) ? readdirSync(INBOX).sort() : []) {
  let pack; try { pack = JSON.parse(readFileSync(`${INBOX}/${f}`, 'utf8')); } catch { unreadable++; continue; }
  const c = q[pack.id];
  if (!c) continue;
  const research = c.status === 'classified' && c.research && !c.research.doneAt && pack.fetchedAt > (c.research.askedAt ?? '');
  const fresh = !c.haiku && ['new', 'verified', 'weak'].includes(c.status);
  if (!research && !fresh) continue;
  // "sample" and other non-date runs sort after dates, so only date runs count as recent.
  const on = decidedOn.get(pack.id);
  if (on && /^\d{4}-\d\d-\d\d/.test(on) && on >= pack.fetchedAt.slice(0, 10)) continue;
  todo.push(`${INBOX}/${f}`);
}
const take = todo.slice(0, +max);
const dir = `${DECISIONS}/${run}`;
mkdirSync(dir, { recursive: true });
const first = Math.max(0, ...readdirSync(dir).map(f => +(f.match(/^batch-(\d+)\.json$/) ?? [])[1] || 0)) + 1;
const batches = [];
for (let i = 0; i < take.length; i += +size) batches.push({ out: `${dir}/batch-${first + batches.length}.json`, packs: take.slice(i, i + +size) });
writeFileSync(`${dir}/todo.json`, JSON.stringify(batches, null, 1) + '\n');
report('batches', { ok: true, needDecision: todo.length, taken: take.length, batches: batches.length, unreadablePacks: unreadable, ...(broken.length ? { brokenBatchFiles: broken } : {}) });
console.log(`-> ${dir}/todo.json`);
