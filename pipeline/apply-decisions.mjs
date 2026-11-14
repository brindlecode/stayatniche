/**
 * Applies checked Haiku decisions (data/pipeline/decisions/<run>/checked.json) to the queue and
 * prunes evidence packs that are no longer needed. Idempotent: a decision file is applied once
 * per candidate, and a broken decision file is reported and skipped, never fatal.
 *   accepted / needs_review -> status "classified" (waits for the owner on the review page)
 *   rejected -> "rejected"; duplicate -> "duplicate"
 *   no_evidence -> unchanged, retried after 30 days; rejected after 3 empty tries
 * Also: rejects names on a category's exclude list, settles approved candidates that already
 * have a page on the site, and re-opens blocked candidates once fresh evidence has arrived.
 * Usage: node pipeline/apply-decisions.mjs
 */
import { readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { loadQueue, saveQueue, DECISIONS, INBOX, UNDECIDED, publishedHotels, matchesPublished, loadPack, report } from './lib.mjs';
import { excludedName } from './priorities.mjs';

const q = loadQueue();
const tally = {}; const broken = [];
const bump = (k) => (tally[k] = (tally[k] ?? 0) + 1);

for (const run of existsSync(DECISIONS) ? readdirSync(DECISIONS).sort() : []) {
  const file = `${DECISIONS}/${run}/checked.json`;
  if (!existsSync(file)) continue;
  let rows; try { rows = JSON.parse(readFileSync(file, 'utf8')); if (!Array.isArray(rows)) throw new Error('not a list'); } catch (e) { broken.push(`${file}: ${e.message}`); continue; }
  for (const d of rows) {
    const c = q[d?.id];
    if (!c || ['approved', 'blocked', 'drafted', 'published'].includes(c.status) || c.haiku?.file === file || c.noEvidenceFile === file) continue;
    // A decision older than the owner's research request does not answer it.
    if (c.research && !c.research.doneAt && !(c.research.fetchedAt && run >= c.research.fetchedAt)) continue;
    if (d.verdict === 'no_evidence') {
      c.noEvidence = (c.noEvidence ?? 0) + 1;
      c.noEvidenceAt = new Date().toISOString();
      c.noEvidenceFile = file;
      c.noEvidenceWhy = 'pages had no readable text';
      c.haiku = undefined;
      if (c.noEvidence >= 3) { c.status = 'rejected'; c.reasons = ['no readable website after 3 tries']; }
      bump('no_evidence'); continue;
    }
    c.haiku = {
      verdict: d.verdict, category: d.category ?? null, scope: d.niche_scope, confidence: d.confidence,
      feature: d.niche_feature ?? null, reason: d.reason ?? null, file, decidedAt: run,
    };
    if (c.research && !c.research.doneAt) { c.research.doneAt = run; c.research.result = d.verdict; }
    if (d.verdict === 'accepted' || d.verdict === 'needs_review') c.status = 'classified';
    else if (d.verdict === 'duplicate') c.status = 'duplicate';
    else { c.status = 'rejected'; c.reasons = [`haiku: ${d.reason ?? 'not a niche stay'}`]; }
    bump(d.verdict);
  }
}

const pub = publishedHotels();
for (const c of Object.values(q)) {
  if (UNDECIDED.includes(c.status) && excludedName(c)) { c.status = 'rejected'; c.reasons = ['excluded name']; bump('excluded'); }
  // Approved, but the site already has this stay: nothing left to write.
  if (['approved', 'blocked'].includes(c.status)) {
    const p = matchesPublished(c, pub);
    if (p?.source === c.id) { c.status = p.status === 'draft' ? 'drafted' : 'published'; c.slug = p.slug; delete c.blocked; bump('already has a page'); }
    else if (p) { c.status = 'duplicate'; c.duplicateOf = p.slug; delete c.blocked; bump('duplicate of a page'); }
  }
  // Blocked for thin evidence: back to the writer once a newer, readable pack exists (3 tries).
  if (c.status === 'blocked' && c.blocked?.retry) {
    const pack = loadPack(c.id);
    if (pack && pack.fetchedAt > c.blocked.at && (pack.pages?.some(p => p.text) || (pack.wikipedia?.text ?? '').length > 1500)) {
      c.status = 'approved'; c.blocked = { ...c.blocked, reopenedAt: new Date().toISOString() }; bump('reopened for the writer');
    }
  }
}

// Evidence packs are kept only while a decision or a page still needs them.
let pruned = 0, unreadable = 0;
if (existsSync(INBOX)) for (const f of readdirSync(INBOX)) {
  let pack; try { pack = JSON.parse(readFileSync(`${INBOX}/${f}`, 'utf8')); } catch { unreadable++; unlinkSync(`${INBOX}/${f}`); continue; }
  const c = q[pack.id];
  // Awaiting classification = fetched after the last "no evidence" verdict (if any).
  const waiting = c && !c.haiku && c.status !== 'rejected' && (!c.noEvidenceAt || pack.fetchedAt > c.noEvidenceAt);
  const keep = c && (['classified', 'approved', 'blocked', 'drafted'].includes(c.status) || waiting);
  if (!keep) { unlinkSync(`${INBOX}/${f}`); pruned++; }
}

saveQueue(q);
report('apply', { ok: !broken.length, applied: tally, pruned, unreadablePacks: unreadable, ...(broken.length ? { brokenFiles: broken } : {}) });
if (broken.length) process.exitCode = 1;
