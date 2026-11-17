/**
 * Stable property ids and duplicate detection (rules in pipeline/identity.mjs).
 *   1. Every queue entry gets `pid`, every hotel page an entry in data/pipeline/properties.json.
 *      An id, once given, is kept: it is found again by source id, slug, domain or place, so a
 *      renamed stay or a renamed page keeps its id. Records found to be one property share the id
 *      of the senior record (a page first, then the oldest entry); the other id is kept in `formerPids`.
 *   2. Entries still waiting (new / verified / weak / classified) that are the same property as a
 *      page or as a better entry are set to `duplicate` with `duplicateOf` and `duplicateWhy`.
 *      An entry whose own source id is on a page is set to that page's status instead.
 *      Approved, blocked, drafted and published entries are never changed.
 * Writes data/pipeline/DUPLICATES.md (every duplicate found this run, with the reason).
 * Usage: node pipeline/dedupe.mjs [--dry]      (--dry: report only, change nothing)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadQueue, saveQueue, publishedHotels, report } from './lib.mjs';
import { findMatches, newPid, sameProperty, STRONG } from './identity.mjs';

const DRY = process.argv.includes('--dry');
const REG = 'data/pipeline/properties.json';
const q = loadQueue();
const pages = publishedHotels();
const reg = existsSync(REG) ? JSON.parse(readFileSync(REG, 'utf8')) : {};

function destination(slug) { try { return (readFileSync(`src/content/hotels/${slug}.md`, 'utf8').match(/^destination:\s*["']?(.*?)["']?\s*$/m) ?? [])[1] ?? null; } catch { return null; } }
const WAITING = ['new', 'verified', 'weak', 'classified'];
const SENIOR = { page: 0, published: 1, drafted: 2, approved: 3, blocked: 4, classified: 5, verified: 6, weak: 7, new: 8, rejected: 9, duplicate: 10 };
const records = [
  ...pages.map(p => ({ ref: `page:${p.slug}`, kind: 'page', slug: p.slug, name: p.name, lat: p.lat, lng: p.lng, sourceId: p.source, site: p.site, status: 'page', pageStatus: p.status, place: destination(p.slug) })),
  ...Object.values(q).map(c => ({ ref: c.id, kind: 'cand', c, id: c.id, wikidata: c.wikidata, name: c.name, lat: c.lat, lng: c.lng, website: c.website, status: c.status, city: c.city, region: c.region })),
];
const byRef = new Map(records.map(r => [r.ref, r]));
const matches = findMatches(records);

// Union-find over the matches.
const parent = new Map(records.map(r => [r.ref, r.ref]));
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
for (const [a, hits] of matches) for (const h of hits.filter(h => h.strong)) { const ra = find(a), rb = find(h.ref); if (ra !== rb) parent.set(ra, rb); }
const clusters = new Map();
for (const r of records) { const k = find(r.ref); if (!clusters.has(k)) clusters.set(k, []); clusters.get(k).push(r); }

// Existing ids: queue entries carry theirs; pages are looked up in the registry by slug or source id.
const regBySlug = new Map(), regById = new Map();
for (const [pid, e] of Object.entries(reg)) { for (const s of e.slugs ?? []) regBySlug.set(s, pid); for (const i of e.ids ?? []) regById.set(i, pid); }
// A page whose file was renamed (no slug or source id match) is found again by the same rules as a
// duplicate (same official domain nearby, same distinctive name), against registry entries whose slugs
// are all gone, so its id survives the rename.
const pageSlugs = new Set(pages.map(p => p.slug));
const orphans = Object.entries(reg).filter(([, e]) => (e.slugs ?? []).length && e.slugs.every(s => !pageSlugs.has(s)));
const recovered = new Map();
for (const r of records.filter(r => r.kind === 'page' && !regBySlug.has(r.slug) && !(r.sourceId && regById.has(r.sourceId)))) {
  const hit = orphans.find(([pid, e]) => !recovered.has(pid) && STRONG.has(sameProperty(r, { name: e.name, lat: e.lat, lng: e.lng, domain: e.domain })));
  if (hit) recovered.set(hit[0], r.slug), regBySlug.set(r.slug, hit[0]);
}
const existingPid = (r) => r.kind === 'page' ? (regBySlug.get(r.slug) ?? (r.sourceId && regById.get(r.sourceId)) ?? null) : (r.c.pid ?? regById.get(r.id) ?? null);

const conf = (r) => r.c?.haiku?.confidence ?? 0;
const seniority = (a, b) => (SENIOR[a.status] ?? 11) - (SENIOR[b.status] ?? 11)
  || (a.pageStatus === 'draft') - (b.pageStatus === 'draft')
  || conf(b) - conf(a)
  || String(a.c?.firstSeen ?? '').localeCompare(String(b.c?.firstSeen ?? ''))
  || a.ref.localeCompare(b.ref);

const newReg = {}; const marked = []; let pidsNew = 0, pidsMerged = 0, bigSkipped = 0, settled = 0, multi = 0;
for (const members of clusters.values()) {
  members.sort(seniority);
  // A very large group means the rules chained unrelated places together: give each its own id, mark nothing.
  const groups = members.length > 8 ? (bigSkipped++, members.map(m => [m])) : [members];
  for (const g of groups) {
    if (g.length > 1) multi++;
    const pid = g.map(existingPid).find(Boolean) ?? newPid(g[0].kind === 'page' ? `page:${g[0].sourceId ?? g[0].slug}` : g[0].ref);
    for (const r of g) {
      const had = existingPid(r);
      if (!had) pidsNew++; else if (had !== pid) pidsMerged++;
      if (r.kind === 'cand' && !DRY) {
        if (had && had !== pid) r.c.formerPids = [...new Set([...(r.c.formerPids ?? []), had])];
        r.c.pid = pid;
      }
    }
    const lead = g.find(r => r.kind === 'page') ?? g[0];
    const e = newReg[pid] ?? { name: lead.name, slugs: [], ids: [], domain: null, lat: isNaN(lead.lat) ? null : lead.lat ?? null, lng: isNaN(lead.lng) ? null : lead.lng ?? null };
    for (const r of g) {
      if (r.kind === 'page') e.slugs.push(r.slug);
      if (r.sourceId) e.ids.push(r.sourceId);
      if (r.kind === 'cand' && r.status !== 'rejected') e.ids.push(r.id);
      e.domain ??= r.domain ?? null;
    }
    if (e.slugs.length) newReg[pid] = { ...e, slugs: [...new Set(e.slugs)].sort(), ids: [...new Set(e.ids)].sort(), formerPids: [...new Set(g.map(existingPid).filter(p => p && p !== pid))] };
    if (!newReg[pid]?.formerPids?.length) delete newReg[pid]?.formerPids;

    // Duplicates: a waiting entry that directly matches a more senior, still-live record.
    if (g.length < 2) continue;
    for (const r of g) {
      if (r.kind !== 'cand' || !WAITING.includes(r.status)) continue;
      const hits = (matches.get(r.ref) ?? []).filter(h => h.strong).map(h => ({ ...h, o: byRef.get(h.ref) }))
        .filter(h => h.o && !['rejected', 'duplicate'].includes(h.o.status) && seniority(h.o, r) < 0)
        .sort((a, b) => seniority(a.o, b.o));
      const best = hits[0]; if (!best) continue;
      if (best.o.kind === 'page' && best.o.sourceId === r.id) {
        settled++;
        if (!DRY) Object.assign(r.c, { status: best.o.pageStatus === 'draft' ? 'drafted' : 'published', slug: best.o.slug });
        continue;
      }
      const of = best.o.kind === 'page' ? best.o.slug : best.o.ref;
      marked.push({ id: r.ref, name: r.name, status: r.status, of, ofName: best.o.name, ofKind: best.o.kind === 'page' ? 'page' : best.o.status, why: best.why });
      if (!DRY) Object.assign(r.c, { status: 'duplicate', duplicateOf: of, duplicateWhy: best.why, reasons: [`duplicate: ${best.why} (${of})`] });
    }
  }
}

// Possible duplicates (within 150 m, no stronger sign): listed for a person, nothing changed.
const possible = [];
for (const c of Object.values(q)) {
  if (c.status !== 'classified') continue;
  for (const h of (matches.get(c.id) ?? []).filter(h => !h.strong)) {
    const o = byRef.get(h.ref);
    if (o && !['rejected', 'duplicate'].includes(o.status)) { possible.push({ id: c.id, name: c.name, of: o.kind === 'page' ? o.slug : o.ref, ofName: o.name, ofKind: o.kind === 'page' ? 'page' : o.status, why: h.why }); break; }
  }
}
const count = (f) => marked.filter(f).length;
const byWhy = {}; for (const m of marked) byWhy[m.why] = (byWhy[m.why] ?? 0) + 1;
const summary = {
  ok: true, dry: DRY || undefined, properties: new Set(records.map(r => r.kind === 'cand' ? (r.c.pid ?? r.ref) : r.ref)).size,
  groupsWithSeveralRecords: multi, newIds: pidsNew, idsMerged: pidsMerged, largeGroupsSkipped: bigSkipped,
  duplicates: marked.length, inReviewQueue: count(m => m.status === 'classified'), ofPage: count(m => m.ofKind === 'page'), ofCandidate: count(m => m.ofKind !== 'page'),
  byReason: byWhy, alreadyHasPage: settled, possibleInReviewQueue: possible.length,
};
if (!DRY) {
  saveQueue(q);
  writeFileSync(REG, JSON.stringify(Object.fromEntries(Object.entries(newReg).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
  const cell = (s) => String(s ?? '').replace(/\|/g, '/');
  writeFileSync('data/pipeline/DUPLICATES.md', [
    '# Tekrar kayıtlar', '',
    `Son çalışma: ${new Date().toISOString().slice(0, 10)}. Bu çalışmada bulunan: ${marked.length} (onay kuyruğundan: ${summary.inReviewQueue}). Kurallar: \`pipeline/identity.mjs\`.`, '',
    '| Kayıt | Durumu | Aynısı | Neden |', '|---|---|---|---|',
    ...marked.map(m => `| ${cell(m.name)} (\`${m.id}\`) | ${m.status} | ${cell(m.ofName)} (\`${m.of}\`, ${m.ofKind === 'page' ? 'sitede' : m.ofKind}) | ${m.why} |`), '',
    '## Olası tekrarlar (onay kuyruğunda, değiştirilmedi)', '',
    'Yalnızca 150 m yakınlık ve ortak bir isim kelimesi var; onay sayfasında uyarı olarak görünür.', '',
    '| Kayıt | Yakınındaki | Neden |', '|---|---|---|',
    ...possible.map(m => `| ${cell(m.name)} (\`${m.id}\`) | ${cell(m.ofName)} (\`${m.of}\`, ${m.ofKind === 'page' ? 'sitede' : m.ofKind}) | ${m.why} |`), '',
  ].join('\n'));
}
report('dedupe', summary);
