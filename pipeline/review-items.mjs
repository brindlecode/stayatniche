/**
 * Keeps the owner's review page in step with the queue. Two outputs in <run dir>:
 *   queue-batches.json  new review documents (ArtifactData batch "set", no if_version)
 *   queue-updates.json  changes to documents that already exist (batch "update"; the sender
 *                       adds each document's version from the export listing as if_version)
 * New documents: every candidate Haiku accepted or flagged for review in this run.
 * Updates (only with an export dir): research results, pages the writer published or could
 * not write, duplicates that were settled, and fresh duplicate warnings.
 * Idempotent: with the export dir, nothing that is already on the page is sent again.
 * Usage: node pipeline/review-items.mjs <decisions run dir> [review page export dir]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadQueue, INBOX, packName, catOf, publishedHotels, dupeIndex, findDupes, report } from './lib.mjs';
import { cellRanker, countryOf } from './priorities.mjs';

const [dirArg, exportDir] = process.argv.slice(2);
if (!dirArg) { console.error('usage: node pipeline/review-items.mjs <decisions run dir> [export dir]'); process.exit(1); }
const dir = dirArg.replace(/\/$/, '');
const run = dir.split('/').pop();
const q = loadQueue();
const rank = cellRanker(q);
const idx = dupeIndex(q, publishedHotels());
const checked = existsSync(`${dir}/checked.json`) ? JSON.parse(readFileSync(`${dir}/checked.json`, 'utf8')) : [];
mkdirSync(`${dir}/queue`, { recursive: true });

// Documents already on the page, by doc id.
const onPage = new Map();
const walk = (d) => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.json') ? [join(d, f)] : []);
if (exportDir && existsSync(exportDir)) for (const f of walk(exportDir)) {
  try { const raw = JSON.parse(readFileSync(f, 'utf8')); const doc = raw?.data?.id ? raw.data : raw; if (doc?.id) onPage.set(packName(doc.id), doc); } catch {}
}

const squash = (s = '') => s.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
/** The fields Haiku and the evidence pack contribute to a review document. */
function evidenceFields(d, c) {
  const packFile = `${INBOX}/${packName(d.id)}.json`;
  let ev = {}; try { ev = JSON.parse(readFileSync(packFile, 'utf8')); } catch {}
  const cat = d.category ?? null;
  const country = countryOf(c) ?? ev.country ?? null;
  const url = ev.finalUrl ?? ev.website ?? c.website ?? null;
  // Where the quoted sentence was found, so "source" points at the page the owner can check.
  const quote = d.category_quote ?? null;
  const quotePage = quote ? (ev.pages ?? []).find(p => squash(`${p.title} ${p.description} ${p.text}`).includes(squash(quote))) : null;
  const inWiki = quote && !quotePage && squash(`${ev.wikipedia?.extract} ${ev.wikipedia?.text}`).includes(squash(quote));
  const excerpt = quote ? null : ((ev.pages ?? []).find(p => p.description)?.description || ev.wikipedia?.extract || (ev.pages ?? [])[0]?.text || '').slice(0, 320) || null;
  return {
    id: d.id, name: d.official_name || ev.name || c.name, mapName: ev.name ?? c.name ?? null, country, city: ev.city ?? c.city ?? null, region: ev.region ?? c.region ?? null,
    cell: `${cat ?? 'other'}|${country ?? '?'}`, rank: rank({ ...c, category: cat ?? catOf(c) }),
    cat, other: d.other_niche_type ?? null, regexCat: catOf(c) ?? null, regexStatus: c.status ?? null,
    verdict: d.verdict, scope: d.niche_scope, conf: d.confidence, feature: d.niche_feature ?? null, reason: d.reason ?? null,
    quote, quoteUrl: quotePage?.url ?? (inWiki ? ev.wikipedia?.url : null) ?? null, excerpt,
    highlights: (d.highlights ?? []).map(x => x.text).slice(0, 6), amenities: (d.amenities ?? []).map(x => x.text).slice(0, 10),
    roomCount: d.room_count?.value ?? null, season: d.season?.text ?? null, access: d.access?.text ?? null, audience: d.audience ?? null,
    url, urlFound: (c.websiteSource ?? ev.websiteSource) === 'search', lat: ev.lat ?? c.lat ?? null, lng: ev.lng ?? c.lng ?? null,
    wiki: ev.wikipedia?.url ?? null, pages: ev.pages?.length ?? 0, run,
    dupes: findDupes(c, idx),
  };
}

const sets = []; const updates = [];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

for (const d of checked) {
  const c = q[d.id] ?? {};
  const k = packName(d.id);
  const old = onPage.get(k);
  const researched = c.research && !c.research.doneAt;
  if (old && researched) {
    // The owner asked for a second look: replace the evidence, hand the decision back.
    const rejected = !['accepted', 'needs_review'].includes(d.verdict);
    if (old.researched !== run) updates.push({ doc_id: k, data: { ...evidenceFields(d, c), researched: run, researchResult: d.verdict, decision: rejected ? 'reject' : null, note: rejected ? `Araştırma sonucu: ${d.reason ?? 'niş değil'}` : (old.note ?? '') } });
    continue;
  }
  if (old || !['accepted', 'needs_review'].includes(d.verdict)) continue;
  const doc = { ...evidenceFields(d, c), status: 'pending', decision: null, finalCat: null, note: '', reviewedAt: null, slug: null, publishedAt: null, hold: null };
  writeFileSync(`${dir}/queue/${k}.json`, JSON.stringify(doc, null, 1) + '\n');
  sets.push({ op: 'set', collection: 'queue', doc_id: k, file_path: resolve(`${dir}/queue/${k}.json`) });
}

// Bring existing documents in line with what happened to their candidates since.
const now = new Date().toISOString();
for (const [k, old] of onPage) {
  if (updates.some(u => u.doc_id === k)) continue;
  const c = q[old.id];
  if (!c || old.status === 'closed' || (old.status === 'published' && c.status === 'published')) continue;
  const data = {};
  if (c.status === 'published' && c.slug) Object.assign(data, { status: 'published', slug: c.slug, publishedAt: old.publishedAt ?? now, hold: null, draft: false });
  else if (old.status === 'published') continue; // the page says published, the queue disagrees: leave it for a person
  else if (c.status === 'duplicate') Object.assign(data, { status: 'closed', closedWhy: `duplicate of ${c.duplicateOf ?? 'another entry'}` });
  else if (c.status === 'drafted') { if (old.slug !== c.slug || !old.draft) Object.assign(data, { slug: c.slug, draft: true, hold: null }); }
  else if (c.status === 'blocked') { if (!same(old.hold, c.blocked?.reason)) data.hold = c.blocked?.reason ?? 'could not be written'; }
  else if (c.status === 'rejected' && old.decision !== 'reject' && !c.reasons?.[0]?.startsWith('reviewer:')) Object.assign(data, { decision: 'reject', note: `Otomatik: ${c.reasons?.[0] ?? 'elendi'}` });
  else if (old.hold) data.hold = null;
  if (c.research?.result === 'no readable source' && old.researched !== c.research.doneAt) Object.assign(data, { researched: c.research.doneAt, researchResult: 'no readable source', decision: null });
  if (old.status === 'pending' && !old.decision && !data.status) { const dupes = findDupes(c, idx); if (!same(old.dupes ?? [], dupes)) data.dupes = dupes; }
  if (Object.keys(data).length) updates.push({ doc_id: k, data });
}

const chunk = (list) => { const out = []; for (let i = 0; i < list.length; i += 50) out.push(list.slice(i, i + 50)); return out; };
writeFileSync(`${dir}/queue-batches.json`, JSON.stringify(chunk(sets), null, 1) + '\n');
// Each update's fields go in a file, so the sender only adds if_version to the entry.
writeFileSync(`${dir}/queue-updates.json`, JSON.stringify(chunk(updates.map(u => {
  const file = `${dir}/queue/${u.doc_id}.update.json`;
  writeFileSync(file, JSON.stringify(u.data, null, 1) + '\n');
  return { op: 'update', collection: 'queue', doc_id: u.doc_id, file_path: resolve(file) };
})), null, 1) + '\n');
report('review', { ok: true, newDocs: sets.length, updates: updates.length, onPage: onPage.size, exportGiven: !!exportDir });
console.log(`-> ${dir}/queue-batches.json, ${dir}/queue-updates.json`);
