/**
 * Automatic pre-screen of the review queue (rules: pipeline/screen.mjs, written out in
 * docs/pipeline/CLASSIFIER.md "Pre-screen rules"). For every candidate waiting for the owner
 * (status "classified") that the owner has not touched:
 *   reject   -> status "rejected", reasons ["prescreen: <one sentence>"]   (the page shows it under
 *               "Reddettiklerim" with that sentence; the owner can still approve it there)
 *   research -> stays "classified", fresh evidence tonight (research + refetch, as the page's
 *               "Araştırılsın" button does), note = the one-sentence reason
 *   keep     -> stays in the queue for the weekly shortlist
 * Duplicates are settled before this by pipeline/dedupe.mjs.
 * Each decision is screened once (same decision file and evidence revision = already screened).
 * Usage: node pipeline/prescreen.mjs [--dry]
 */
import { readFileSync } from 'node:fs';
import { loadQueue, saveQueue, loadPack, report } from './lib.mjs';
import { screen } from './screen.mjs';

const DRY = process.argv.includes('--dry');
const q = loadQueue();
const files = new Map();
const decisionOf = (c) => {
  const f = c.haiku?.file; if (!f) return null;
  if (!files.has(f)) { try { files.set(f, JSON.parse(readFileSync(f, 'utf8'))); } catch { files.set(f, []); } }
  return files.get(f).filter(d => d.id === c.id).find(d => (d.evidenceAt ?? null) === (c.haiku.evidenceAt ?? null)) ?? files.get(f).find(d => d.id === c.id) ?? null;
};

const now = new Date().toISOString();
const tally = { reject: 0, research: 0, keep: 0 }; const rules = {}; let skipped = 0, already = 0;
for (const c of Object.values(q)) {
  if (c.status !== 'classified') continue;
  // The owner's own decisions and open research requests are never second-guessed.
  if (c.reviewedAt || (c.research && !c.research.doneAt)) { skipped++; continue; }
  if (c.prescreen && c.prescreen.file === c.haiku?.file && (c.prescreen.evidenceAt ?? null) === (c.haiku?.evidenceAt ?? null)) { already++; continue; }
  const r = screen(c, decisionOf(c), loadPack(c.id));
  tally[r.action]++; rules[r.rule] = (rules[r.rule] ?? 0) + 1;
  if (DRY) { if (r.action !== 'keep') console.log(`${r.action.padEnd(8)} ${r.rule.padEnd(15)} ${c.name} — ${r.reason}`); continue; }
  c.prescreen = { action: r.action, rule: r.rule, reason: r.reason || undefined, at: now, file: c.haiku?.file, evidenceAt: c.haiku?.evidenceAt };
  if (r.action === 'reject') Object.assign(c, { status: 'rejected', reasons: [`prescreen: ${r.reason}`] });
  if (r.action === 'research') Object.assign(c, { research: { askedAt: now, note: `Ön eleme: ${r.reason}`, by: 'prescreen' }, refetch: true });
}
if (!DRY) saveQueue(q);
report('prescreen', { ok: true, dry: DRY || undefined, ...tally, rules, ownerTouched: skipped, alreadyScreened: already });
