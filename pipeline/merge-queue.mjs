/**
 * Three-way merge of the queue when two jobs changed candidates.json at the same time
 * (the nightly job and a Claude routine). Works per candidate and per field, so both sides'
 * changes survive; if both changed the same field, "theirs" (what is already on the branch,
 * i.e. the owner's decisions and the writer's results) wins over "ours" (the nightly job,
 * whose work can be redone).
 * Usage: node pipeline/merge-queue.mjs <base.json> <ours.json> <theirs.json>   (writes the queue)
 */
import { readFileSync } from 'node:fs';
import { saveQueue, report } from './lib.mjs';

const [base, ours, theirs] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const out = {}; let both = 0, conflicts = 0;
for (const id of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
  const b = base[id], o = ours[id], t = theirs[id];
  if (!o || !t) { out[id] = o ?? t; continue; } // candidates are never deleted
  if (eq(o, t) || eq(b, o)) { out[id] = t; continue; }
  if (eq(b, t)) { out[id] = o; continue; }
  both++;
  const m = {};
  for (const k of new Set([...Object.keys(o), ...Object.keys(t)])) {
    const v = eq(b?.[k], t[k]) ? o[k] : t[k];
    if (!eq(b?.[k], o[k]) && !eq(b?.[k], t[k]) && !eq(o[k], t[k])) conflicts++;
    if (v !== undefined) m[k] = v;
  }
  out[id] = m;
}
saveQueue(out);
report('merge', { ok: true, candidates: Object.keys(out).length, changedOnBothSides: both, fieldConflictsTheirsWon: conflicts });
