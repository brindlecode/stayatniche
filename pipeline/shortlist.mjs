/**
 * Weekly shortlist: the 40 best candidates waiting for the owner, numbered, in Turkish.
 * Ranking: pipeline/screen.mjs rank() (whole property first, confidence, proof on the operator's
 * own site, under-represented categories, confirmed Expedia page).
 * At most a quarter of the list (10 of 40) comes from one category.
 * Only candidates that passed the pre-screen (prescreen.rule "pass"), with no open research
 * request and no possible duplicate of a page or of a better entry, can be on it.
 *
 * Writes data/pipeline/shortlist.json (also the review page's `shortlist/current` document) and
 * data/pipeline/SHORTLIST.md. Numbers stay fixed for the whole ISO week: during the week the
 * script only refreshes each item's state (waiting / approved / rejected). A new list is built
 * when the week changes, or with --force.
 * Turkish feature sentences: data/pipeline/shortlist-tr.json ({ "<id>": "<one sentence>" });
 * `--todo` lists the items that still need one (the classifier routine writes them).
 * Usage: node pipeline/shortlist.mjs [--force] [--todo] [--size 40]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadQueue, loadPack, publishedHotels, isLiveHotel, catOf, packName, report } from './lib.mjs';
import { rank, categoryBonus, isoWeek, quoteOnOwnSite, shortlistTable } from './screen.mjs';
import { countryOf } from './priorities.mjs';
import { findMatches } from './identity.mjs';

const SHORTLIST = 'data/pipeline/shortlist.json';
const TR = 'data/pipeline/shortlist-tr.json';
const EXPEDIA = 'data/pipeline/expedia-candidates.json';
const CAT_TR = {
  'treehouse-hotels': 'Ağaç ev', 'cave-hotels': 'Mağara', 'underwater-rooms': 'Su altı', 'castle-hotels': 'Kale / saray',
  'floating-hotels': 'Yüzen', 'bubble-hotels': 'Balon / kubbe', 'cliffside-hotels': 'Uçurum', 'desert-camps': 'Çöl kampı',
  'jungle-lodges': 'Orman lodge', 'ice-hotels': 'Buz / iglo', 'safari-lodges': 'Safari', 'overwater-bungalows': 'Su üstü bungalov',
  'lighthouse-hotels': 'Deniz feneri', 'train-hotels': 'Tren / vagon',
};
const args = process.argv.slice(2);
const SIZE = +(args[args.indexOf('--size') + 1] || 40) || 40;
const read = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };

const q = loadQueue();
const pages = publishedHotels();
const tr = read(TR, {});
const expedia = read(EXPEDIA, {});
const week = isoWeek();
const old = read(SHORTLIST, null);
const files = new Map();
const decisionOf = (c) => {
  const f = c.haiku?.file; if (!f) return null;
  if (!files.has(f)) files.set(f, read(f, []));
  return files.get(f).filter(d => d.id === c.id).find(d => (d.evidenceAt ?? null) === (c.haiku.evidenceAt ?? null)) ?? files.get(f).find(d => d.id === c.id) ?? null;
};

const STATE = { classified: 'bekliyor', approved: 'onaylandı', drafted: 'taslak yazıldı', published: 'yayında', blocked: 'yazılamadı', rejected: 'reddedildi', duplicate: 'tekrar' };
const commissionOf = (id) => {
  const e = expedia[id];
  if (e?.status === 'confirmed' && e.url) return { commission: 'evet', expediaUrl: e.url };
  if (e?.status === 'not_found') return { commission: 'hayır', expediaUrl: null };
  return { commission: 'kontrol edilmedi', expediaUrl: null };
};

function item(c, n) {
  const d = decisionOf(c); const p = loadPack(c.id);
  const cat = c.haiku?.category ?? catOf(c);
  const quotePage = d?.category_quote ? (p?.pages ?? []).find(x => `${x.title} ${x.description} ${x.text}`.replace(/\s+/g, ' ').toLowerCase().includes(d.category_quote.replace(/\s+/g, ' ').toLowerCase())) : null;
  const own = quoteOnOwnSite(d, p);
  const source = quotePage?.url ?? (own ? null : p?.wikipedia?.url) ?? p?.finalUrl ?? c.website ?? null;
  return {
    n, id: c.id, doc: packName(c.id), pid: c.pid ?? null,
    name: d?.official_name || c.name, place: [c.city, countryOf(c)].filter(Boolean).join(', ') || null,
    cat, catTr: CAT_TR[cat] ?? cat,
    feature: c.haiku?.feature ?? d?.niche_feature ?? null, featureTr: tr[c.id] ?? null,
    scope: c.haiku?.scope ?? null, confidence: c.haiku?.confidence ?? null,
    source, sourceKind: own ? 'resmi site' : source && /wikipedia\.org/.test(source) ? 'Wikipedia' : 'resmi site (alıntı yok)',
    ...commissionOf(c.id),
  };
}

let list;
if (old && old.week === week && !args.includes('--force')) {
  // Same week: keep the numbers, refresh what is known about each item.
  list = { ...old, items: old.items.map(x => { const c = q[x.id]; return c ? { ...x, ...commissionOf(x.id), featureTr: tr[x.id] ?? x.featureTr ?? null, state: STATE[c.status] ?? c.status } : { ...x, state: 'kuyrukta yok' }; }) };
} else {
  const live = pages.filter(isLiveHotel);
  const pubByCat = {}; for (const p of live) { const t = (readFileSync(`src/content/hotels/${p.slug}.md`, 'utf8').match(/^category:\s*["']?([a-z-]+)/m) ?? [])[1]; if (t) pubByCat[t] = (pubByCat[t] ?? 0) + 1; }
  const ctx = { catBonus: categoryBonus(pubByCat), expedia };
  // Possible duplicates (any reason) of a page or of a more senior entry keep a stay off the list.
  const waiting = Object.values(q).filter(c => c.status === 'classified' && c.prescreen?.rule === 'pass' && !(c.research && !c.research.doneAt));
  const recs = [
    ...pages.map(p => ({ ref: `page:${p.slug}`, name: p.name, lat: p.lat, lng: p.lng, sourceId: p.source, site: p.site, page: true })),
    ...Object.values(q).filter(c => !['rejected', 'duplicate'].includes(c.status)).map(c => ({ ref: c.id, id: c.id, wikidata: c.wikidata, name: c.name, lat: c.lat, lng: c.lng, website: c.website, city: c.city, region: c.region })),
  ];
  const m = findMatches(recs);
  const scored = waiting.map(c => ({ c, ...rank(c, decisionOf(c), loadPack(c.id), ctx) })).sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id));
  const pos = new Map(scored.map((s, i) => [s.c.id, i]));
  const blockedBy = (c) => (m.get(c.id) ?? []).find(h => h.ref.startsWith('page:') || ['approved', 'blocked', 'drafted', 'published'].includes(q[h.ref]?.status) || (pos.has(h.ref) && pos.get(h.ref) < pos.get(c.id)));
  const picked = []; const skippedDupes = [];
  const perCat = {}; const CAP = Math.ceil(SIZE / 4); // at most a quarter of the list from one category
  for (const s of scored) {
    if (picked.length >= SIZE) break;
    const b = blockedBy(s.c); if (b) { skippedDupes.push(`${s.c.name} ~ ${b.ref} (${b.why})`); continue; }
    const cat = s.c.haiku?.category ?? catOf(s.c);
    if ((perCat[cat] ?? 0) >= CAP) continue;
    perCat[cat] = (perCat[cat] ?? 0) + 1; picked.push(s);
  }
  list = {
    week, builtAt: new Date().toISOString(), size: picked.length, waiting: waiting.length,
    howToApprove: 'Onaylamak istediğiniz numaraları tek mesajda yazın, ör. "1 3 5-9". Listede olup seçmedikleriniz kuyrukta kalır.',
    items: picked.map((s, i) => ({ ...item(s.c, i + 1), score: s.score, parts: s.parts, state: 'bekliyor' })),
    skippedPossibleDuplicates: skippedDupes.slice(0, 20),
  };
}

if (args.includes('--todo')) {
  const todo = list.items.filter(x => !x.featureTr).map(x => ({ id: x.id, name: x.name, feature: x.feature }));
  console.log(JSON.stringify(todo, null, 1));
}
writeFileSync(SHORTLIST, JSON.stringify(list, null, 1) + '\n');
writeFileSync('data/pipeline/SHORTLIST.md', [
  `# Bu haftanın kısa listesi (${list.week})`, '',
  `${list.howToApprove} Liste ${list.builtAt.slice(0, 10)} tarihinde, onay bekleyen ${list.waiting} aday arasından sıralandı.`, '',
  ...shortlistTable(list), '',
].join('\n'));
report('shortlist', { ok: true, week: list.week, items: list.items.length, waiting: list.waiting, approved: list.items.filter(x => x.state === 'onaylandı').length, withoutTurkish: list.items.filter(x => !x.featureTr).length, expediaConfirmed: list.items.filter(x => x.commission === 'evet').length });
