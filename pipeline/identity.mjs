/**
 * Property identity: which queue entries and site pages are the same real place, and a stable
 * internal ID for each place (`pid`, e.g. "sn-4k2j9q1a") that survives renames.
 * Pure functions; pipeline/dedupe.mjs applies them to the queue.
 *
 * Two records are the same property when any of these holds (first match wins, it is the reason):
 *   same source id      the same OSM element or Wikidata item (an OSM entry's wikidata tag counts)
 *   same official domain  the same own website, not a listing / multi-property host, and either
 *                       within 2 km or with the same name (one chain domain far away is not enough)
 *   same name           the same normalised name (word order ignored) within 50 km; a name made only
 *                       of generic or common words ("Castle Hotel", "Jungle Lodge") within 1 km is only
 *                       a warning ("same generic name nearby"). The same distinctive words with another
 *                       trade word ("Etosha Safari Lodge" / "Etosha Safari Camp", two real places) within
 *                       5 km is also only a warning ("similar name nearby").
 *   within 150 m        coordinates within 150 m and a distinctive name word in common. This one is
 *                       only a *possible* duplicate (a warning): neighbours in Göreme or Matera share
 *                       place words, so it never marks an entry or merges ids by itself.
 * Coordinates alone are never enough: two lodges can share a hillside.
 */
import { createHash } from 'node:crypto';
import { km, norm, nameKey, hostOf, MULTI_HOST, LISTING_HOST } from './lib.mjs';

const SECOND_LEVEL = /^(co|com|org|net|gov|ac|or|ne|go|gob|edu)$/;
/** Registrable domain of a property's own site, or null for listings, social pages and multi-property hosts. */
export function domainOf(url) {
  const h = hostOf(url ?? '');
  if (!h || MULTI_HOST.test(h) || LISTING_HOST.test(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
  const parts = h.split('.');
  const keep = parts.length >= 3 && SECOND_LEVEL.test(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-keep).join('.');
}

// Words that say what kind of place it is, not which one.
const GENERIC = new Set('castle castello castillo schloss chateau kasteel zamek burg palace palacio palazzo manor tower torre cave caves cueva grotta house houses home homes tree treehouse treehouses baumhaus lighthouse fyr phare faro leuchtturm camp camps tented tent tents safari game desert jungle rainforest eco ecolodge floating boat houseboat bubble dome domes igloo igloos ice snow cliff cliffs train railway station carriage wagon inn suites suite villa villas boutique guest guesthouse bed breakfast b b cottage cottages cabin cabins chalet chalets apartments rooms holiday holidays retreat park garden gardens luxury view la le el il de di du des del da do das dos der den het van von am an im zu of in at on by old new great little grand royal country village our your my casa maison haus hof hus base trek tours tour family'.split(' '));
export const tokens = (s, common) => norm(s).split(' ').filter(w => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w) && !common?.has(w));
/** STRONG reasons merge ids and mark duplicates; the others are warnings. */
export const STRONG = new Set(['same source id', 'same official domain', 'same name']);

/** Source ids of a record: its own id, its Wikidata item, and a page's sourceId. */
export function sourceKeys(r) {
  const out = new Set();
  for (const id of [r.id, r.sourceId, r.source && /:/.test(r.source) ? r.source : null]) if (id) out.add(id);
  if (r.wikidata) out.add(`wd:${r.wikidata}`);
  return [...out];
}

/**
 * Why a and b are the same property, or null. a/b: { id?, sourceId?, wikidata?, name, lat, lng, website? / site? }
 * common: words found in many names (place names such as "cappadocia"), treated as generic.
 */
export function sameProperty(a, b, common) {
  const ka = sourceKeys(a), kb = new Set(sourceKeys(b));
  if (ka.some(k => kb.has(k))) return 'same source id';
  const hasXY = (r) => r.lat != null && r.lng != null && !isNaN(r.lat) && !isNaN(r.lng);
  const d = hasXY(a) && hasXY(b) ? km(a.lat, a.lng, b.lat, b.lng) : null;
  const na = nameKey(a.name ?? ''), nb = nameKey(b.name ?? '');
  const sameName = na && na === nb;
  const da = a.domain ?? domainOf(a.website ?? a.site), db = b.domain ?? domainOf(b.website ?? b.site);
  if (da && da === db && ((d != null && d < 2) || sameName)) return 'same official domain';
  // Same distinctive words ("Senyati Safari Lodge" / "Senyati Safari Camp") count as the same name.
  // Place names (town, region) say where, not which: "Göreme Cave Rooms" / "Göreme Valley Cave House".
  const place = new Set([a.city, a.region, a.place, b.city, b.region, b.place].flatMap(x => x ? norm(x).split(' ') : []));
  const ta = tokens(a.name ?? '', common).filter(t => !place.has(t)), tb0 = tokens(b.name ?? '', common).filter(t => !place.has(t));
  const sameWords = (ta.length > 1 || ta.some(t => t.length >= 5)) && ta.length === tb0.length && [...new Set(ta)].sort().join(' ') === [...new Set(tb0)].sort().join(' ');
  if (sameName && ta.length && d != null && d < 50) return 'same name';
  if (sameName && d != null && d < 1) return 'same generic name nearby';
  if (sameWords && d != null && d < 5) return 'similar name nearby';
  if (d != null && d < 0.15) {
    const tb = new Set(tb0);
    if (ta.some(t => tb.has(t))) return 'within 150 m';
  }
  return null;
}

/** New stable id from the record's first source id (or page slug). */
export const newPid = (seed) => 'sn-' + BigInt('0x' + createHash('sha256').update(String(seed)).digest('hex').slice(0, 12)).toString(36).padStart(9, '0').slice(-9);

/**
 * Groups records into properties. records: [{ ref, ...fields }]. Returns Map(ref -> [{ ref, why }])
 * of matches, using cheap indexes (source ids, domains, names, a 0.05° grid) instead of all pairs.
 */
export function findMatches(records) {
  const by = { key: new Map(), domain: new Map(), name: new Map(), cell: new Map() };
  const put = (m, k, r) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(r); };
  const cell = (lat, lng) => `${Math.floor(lat / 0.05)}:${Math.floor(lng / 0.05)}`;
  for (const r of records) {
    r.domain ??= domainOf(r.website ?? r.site);
    for (const k of sourceKeys(r)) put(by.key, k, r);
    put(by.domain, r.domain, r);
    put(by.name, nameKey(r.name ?? ''), r);
    if (r.lat != null && !isNaN(r.lat)) put(by.cell, cell(r.lat, r.lng), r);
  }
  // Words in 8 or more names are place or trade words here, not names.
  const df = new Map();
  for (const r of records) for (const t of new Set(tokens(r.name ?? ''))) df.set(t, (df.get(t) ?? 0) + 1);
  const common = new Set([...df].filter(([, n]) => n >= 8).map(([t]) => t));
  const out = new Map();
  for (const r of records) {
    const near = new Set();
    for (const k of sourceKeys(r)) for (const o of by.key.get(k) ?? []) near.add(o);
    for (const o of by.domain.get(r.domain) ?? []) near.add(o);
    for (const o of by.name.get(nameKey(r.name ?? '')) ?? []) near.add(o);
    if (r.lat != null && !isNaN(r.lat)) {
      const [y, x] = cell(r.lat, r.lng).split(':').map(Number);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of by.cell.get(`${y + i}:${x + j}`) ?? []) near.add(o);
    }
    const hits = [];
    for (const o of near) { if (o === r) continue; const why = sameProperty(r, o, common); if (why) hits.push({ ref: o.ref, why, strong: STRONG.has(why) }); }
    if (hits.length) out.set(r.ref, hits);
  }
  return out;
}
