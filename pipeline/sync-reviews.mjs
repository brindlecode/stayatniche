/**
 * Copies the owner's decisions from the review page into the queue. Input: the page's `queue`
 * documents exported with ArtifactData (`list` with `out_dir`), one JSON file each.
 *   "approve"  -> status "approved" (the writer writes it), finalCategory = the chosen category
 *   "reject"   -> status "rejected"
 *   "research" -> stays "classified"; the nightly job fetches fresh evidence and the classifier
 *                 reads it again with the owner's note
 *   "unsure" (older page versions) -> stays "classified", nothing else happens
 *   no decision -> stays "classified"; an earlier approve / reject is undone
 * Candidates that already have a page (drafted / published) are never touched. An approval by number
 * (pipeline/shortlist-approve.mjs) newer than the page's last save is kept; a card the owner decides
 * after the automatic pre-screen rejected it follows the owner.
 * Idempotent: running it twice on the same export changes nothing the second time.
 * Usage: node pipeline/sync-reviews.mjs <export dir>
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadQueue, saveQueue, publishedHotels, matchesPublished, report } from './lib.mjs';
import { CATEGORIES } from './categories.mjs';

const root = process.argv[2];
if (!root || !existsSync(root)) { console.error('usage: node pipeline/sync-reviews.mjs <export dir>  (directory not found)'); process.exit(1); }
const files = (d) => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith('.json') ? [join(d, f)] : []);
const q = loadQueue();
const pub = publishedHotels();
const tally = {}; let read = 0, bad = 0;
const bump = (k) => (tally[k] = (tally[k] ?? 0) + 1);

for (const f of files(root)) {
  let raw; try { raw = JSON.parse(readFileSync(f, 'utf8')); } catch { bad++; continue; }
  const doc = raw?.data?.id ? raw.data : raw;
  const c = q[doc?.id];
  if (!c) continue;
  read++;
  if (['published', 'drafted', 'duplicate'].includes(c.status) || doc.status !== 'pending') continue;
  const cat = CATEGORIES[doc.finalCat] ? doc.finalCat : doc.cat;
  const byReviewer = c.status === 'rejected' && c.reasons?.[0]?.startsWith('reviewer:');
  // The automatic pre-screen rejected it, and the owner decided on the card after that: the owner wins.
  const overScreen = c.status === 'rejected' && c.reasons?.[0]?.startsWith('prescreen:') && (doc.reviewedAt ?? '') > (c.prescreen?.at ?? '');
  if (doc.decision === 'approve' && CATEGORIES[cat]) {
    if (c.status === 'blocked') { c.finalCategory = cat; continue; } // the writer already tried; see blocked.reason
    if (c.status === 'rejected' && !byReviewer && !overScreen) continue; // dropped by a later check; the page shows why
    const p = matchesPublished(c, pub);
    if (p?.source === c.id) { Object.assign(c, { status: p.status === 'draft' ? 'drafted' : 'published', slug: p.slug }); delete c.duplicateOf; bump('already has a page'); continue; }
    if (p) { c.status = 'duplicate'; c.duplicateOf = p.slug; bump('duplicate of a page'); continue; }
    if (c.status !== 'approved') bump('approved');
    Object.assign(c, { status: 'approved', reasons: [], finalCategory: cat, reviewNote: doc.note || undefined, reviewedAt: doc.reviewedAt ?? null });
  } else if (doc.decision === 'reject') {
    if (c.status !== 'rejected') bump('rejected');
    if (c.status !== 'rejected' || byReviewer) Object.assign(c, { status: 'rejected', reasons: [`reviewer: ${doc.note || 'rejected on review page'}`], reviewedAt: doc.reviewedAt ?? null });
    delete c.blocked;
  } else {
    // Approved by number from the weekly shortlist after the page was last saved: keep it.
    const byNumber = c.approvedVia === 'shortlist' && (c.reviewedAt ?? '') > (doc.reviewedAt ?? '');
    if ((['approved', 'blocked'].includes(c.status) && !byNumber) || byReviewer) { c.status = 'classified'; c.reasons = []; delete c.blocked; bump('reopened'); }
    if (doc.decision === 'research' && c.status === 'classified' && c.research?.askedAt !== (doc.reviewedAt ?? 'unknown')) {
      c.research = { askedAt: doc.reviewedAt ?? 'unknown', note: doc.note || '' };
      c.refetch = true;
      bump('research requested');
    }
  }
}
if (!read) { report('reviews', { ok: false, error: `no review documents found in ${root}`, unreadable: bad }); process.exit(1); }
saveQueue(q);
report('reviews', { ok: true, documents: read, changed: tally, unreadable: bad });
