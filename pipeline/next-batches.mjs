/**
 * Lists evidence packs that still need a Haiku decision and splits them into batches for the
 * hotel-classifier subagents. A pack needs a decision when
 *   - its candidate has no decision yet, or the owner asked for research and the pack is newer
 *     than that request, and
 *   - no earlier decision was made on this same revision of the pack (checked.json records the
 *     pack's fetch time as `evidenceAt`), and no batch file that has not been checked yet covers it.
 * Safe to run twice on the same day: new batches are numbered after the existing ones.
 * Writes data/pipeline/decisions/<run>/todo.json: [{ out: "<batch file to write>", packs: [paths] }].
 * Usage: node pipeline/next-batches.mjs <run name, e.g. 2026-10-09> [max packs=150] [batch size=17]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { loadQueue, INBOX, DECISIONS, report } from './lib.mjs';

const [run, max = 150, size = 17] = process.argv.slice(2);
if (!run) { console.error('usage: node pipeline/next-batches.mjs <run> [max] [batch size]'); process.exit(1); }
const q = loadQueue();
// Checked decisions: id -> set of evidence revisions (pack fetch times) already decided on.
// Older checked files have no `evidenceAt`; for those only the run date is known.
// Unchecked batches (the session stopped before check-decisions): id -> latest such run.
const revisions = new Map(); const legacy = new Map(); const unchecked = new Map(); const broken = [];
for (const r of existsSync(DECISIONS) ? readdirSync(DECISIONS) : []) {
  const inChecked = new Set();
  try {
    for (const d of JSON.parse(readFileSync(`${DECISIONS}/${r}/checked.json`, 'utf8'))) {
      if (!d?.id) continue; inChecked.add(d.id);
      if (d.evidenceAt) revisions.set(d.id, (revisions.get(d.id) ?? new Set()).add(d.evidenceAt));
      else if (r > (legacy.get(d.id) ?? '')) legacy.set(d.id, r);
    }
  } catch {}
  for (const f of readdirSync(`${DECISIONS}/${r}`).filter(f => /^batch.*\.json$/.test(f)))
    try { for (const d of JSON.parse(readFileSync(`${DECISIONS}/${r}/${f}`, 'utf8'))) if (d?.id && !inChecked.has(d.id) && r > (unchecked.get(d.id) ?? '')) unchecked.set(d.id, r); } catch { broken.push(`${r}/${f}`); }
}
const isDate = (r) => /^\d{4}-\d\d-\d\d/.test(r ?? '');

const todo = []; let unreadable = 0;
for (const f of existsSync(INBOX) ? readdirSync(INBOX).sort() : []) {
  let pack; try { pack = JSON.parse(readFileSync(`${INBOX}/${f}`, 'utf8')); } catch { unreadable++; continue; }
  const c = q[pack.id];
  if (!c) continue;
  const research = c.status === 'classified' && c.research && !c.research.doneAt && pack.fetchedAt > (c.research.askedAt ?? '');
  const fresh = !c.haiku && ['new', 'verified', 'weak'].includes(c.status);
  if (!research && !fresh) continue;
  const day = pack.fetchedAt.slice(0, 10);
  if (revisions.get(pack.id)?.has(pack.fetchedAt)) continue;                           // this revision is decided
  if (isDate(unchecked.get(pack.id)) && unchecked.get(pack.id) >= day) continue;       // decided, not checked yet
  // A dated run without revisions covers a first decision, never a research re-read.
  if (!research && isDate(legacy.get(pack.id)) && legacy.get(pack.id) >= day) continue;
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
