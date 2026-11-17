// Pre-screen, ranking, weekly shortlist, approval by numbers, property ids / duplicates,
// candidate Expedia checks and the monthly re-check (docs/pipeline/CLASSIFIER.md, README.md).
import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { screen, rank, categoryBonus, parseNumbers, isoWeek, TREEHOUSE_BUILD } from '../pipeline/screen.mjs';
import { sameProperty, domainOf, findMatches, STRONG } from '../pipeline/identity.mjs';

const ROOT = resolve(__dirname, '..');
let dir: string;
const run = (script: string, ...args: string[]) => execFileSync('node', [join(dir, 'pipeline', script), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, SKIP_FETCH: '1' } });
const queue = () => JSON.parse(readFileSync(join(dir, 'data/pipeline/candidates.json'), 'utf8'));
const read = (p: string) => JSON.parse(readFileSync(join(dir, p), 'utf8'));
const write = (path: string, data: unknown) => { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), typeof data === 'string' ? data : JSON.stringify(data)); };

const FILE = 'data/pipeline/decisions/2026-11-10/checked.json';
const cand = (id: string, extra = {}) => ({ id, name: 'Glen Castle', categories: ['castle-hotels'], category: 'castle-hotels', lat: 56.1, lng: -4.2, website: 'https://glencastle.example/', wikidata: null, country: 'United Kingdom', city: 'Callander', status: 'classified', haiku: { verdict: 'accepted', category: 'castle-hotels', scope: 'whole_property', confidence: 0.9, feature: 'Rooms in a 15th-century castle keep', file: FILE }, ...extra });
const pack = (id: string, extra = {}) => ({ id, name: 'Glen Castle', fetchedAt: '2026-11-10T07:00:00.000Z', website: 'https://glencastle.example/', finalUrl: 'https://glencastle.example/', pages: [{ url: 'https://glencastle.example/rooms', title: 'Rooms', text: 'Sleep in a fifteenth century castle keep with nine bedrooms.' }], wikipedia: null, ...extra });
const decision = (id: string, extra = {}) => ({ id, is_lodging: true, operating_status: 'open', category: 'castle-hotels', niche_scope: 'whole_property', confidence: 0.9, category_quote: 'Sleep in a fifteenth century castle keep', red_flags: [], other_niche_type: null, niche_feature: 'Rooms in a 15th-century castle keep', verdict: 'accepted', ...extra });
const hotelPage = (slug: string, fm: Record<string, string>) => write(`src/content/hotels/${slug}.md`, `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\nBody.\n`);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'screen-'));
  cpSync(join(ROOT, 'pipeline'), join(dir, 'pipeline'), { recursive: true });
  mkdirSync(join(dir, 'src/content/hotels'), { recursive: true });
  mkdirSync(join(dir, '.pipeline-data/inbox'), { recursive: true });
  write('src/data/expedia-hotels.json', {});
  write('src/data/expedia-verification.json', {});
});

describe('pre-screen rules (2026-11-15, written down)', () => {
  const c = cand('a');
  it('rejects a stay the source says closed for good', () => {
    expect(screen(c, decision('a'), pack('a', { pages: [{ text: 'We have permanently closed. Thank you.' }] }))).toMatchObject({ action: 'reject', rule: 'closed' });
    expect(screen(c, decision('a', { operating_status: 'closed' }), pack('a')).action).toBe('reject');
    // closed for the season is not closed for good
    expect(screen(c, decision('a', { operating_status: 'seasonal' }), pack('a', { pages: [{ text: 'Sleep in a fifteenth century castle keep. Closed for the season until April.' }] })).rule).not.toBe('closed');
  });
  it('rejects a niche outside the 14 categories, naming what it is', () => {
    const r = screen(c, decision('a', { category: null, other_niche_type: 'yurt' }), pack('a'));
    expect(r).toMatchObject({ action: 'reject', rule: 'no-category' });
    expect(r.reason).toBe('14 kategoriden hiçbirine uymuyor (yurt); niş özelliği listedeki kategorilerde kanıtlanmadı.');
  });
  it('rejects name- or theme-only niches and unproven features with a one-sentence reason', () => {
    expect(screen(c, decision('a', { niche_scope: 'name_only' }), pack('a')).rule).toBe('name-only');
    expect(screen(c, decision('a', { red_flags: ['theme_only'], confidence: 0.4 }), pack('a')).rule).toBe('name-only');
    const r = screen(c, decision('a', { niche_scope: 'unclear', confidence: 0.4 }), pack('a'));
    expect(r).toEqual({ action: 'reject', rule: 'no-proof', reason: 'Konukların tarihî kale binasının içinde kaldığı kaynakta kanıtlanmamış.' });
    expect(r.reason.split('.').filter(Boolean)).toHaveLength(1);
  });
  it('sends thin evidence to research instead of rejecting it', () => {
    expect(screen(c, decision('a', { niche_scope: 'unclear', confidence: 0.5 }), pack('a')).rule).toBe('unclear-scope');
    expect(screen(c, decision('a', { niche_scope: 'unclear', confidence: 0.4, operating_status: 'unknown' }), pack('a')).action).toBe('research');
    expect(screen(c, decision('a'), pack('a', { pages: [], wikipedia: { text: 'A castle.' } })).rule).toBe('no-own-site');
    expect(screen(c, decision('a', { operating_status: 'unknown', confidence: 0.6 }), pack('a')).rule).toBe('status-unknown');
    expect(screen(c, decision('a', { category_quote: null }), pack('a')).rule).toBe('no-quote');
    expect(screen(c, decision('a'), null).rule).toBe('no-pack');
  });
  it('does not send a stay to research twice', () => {
    const r = screen({ ...c, research: { askedAt: 'x', doneAt: '2026-11-12' } }, decision('a', { niche_scope: 'unclear', confidence: 0.5 }), pack('a'));
    expect(r).toMatchObject({ action: 'keep', rule: 'unclear-scope-after-research' });
  });
  it('treehouse rule: how the unit is built must be in the source', () => {
    const t = { ...c, haiku: { ...c.haiku, category: 'treehouse-hotels' } };
    const d = decision('a', { category: 'treehouse-hotels', category_quote: 'Our treehouses', niche_feature: 'Two treehouses' });
    expect(screen(t, d, pack('a', { pages: [{ text: 'Our treehouses sleep four.' }] }))).toMatchObject({ action: 'research', rule: 'treehouse' });
    expect(screen(t, d, pack('a', { pages: [{ text: 'Our treehouses stand on stilts among the oaks.' }] })).action).toBe('keep');
    expect(screen(t, { ...d, niche_feature: 'Rooms in a multi-storey treehouse hotel block' }, pack('a')).rule).toBe('treehouse');
    for (const s of ['built around an old oak tree', 'six metres above the ground', 'Cabanes perchées dans les arbres', 'Baumhaus auf Stelzen', 'raised platforms']) expect(TREEHOUSE_BUILD.test(s), s).toBe(true);
    expect(TREEHOUSE_BUILD.test('Treehouse Suite with a view of the garden')).toBe(false);
  });
  it('keeps a well-proven stay', () => expect(screen(c, decision('a'), pack('a'))).toMatchObject({ action: 'keep', rule: 'pass' }));
});

describe('ranking and shortlist helpers', () => {
  const ctx = { catBonus: categoryBonus({ 'castle-hotels': 40, 'cave-hotels': 20 }), expedia: { b: { status: 'confirmed' }, c: { status: 'not_found' } } };
  it('ranks whole property, confidence, own-site proof, rare category and a confirmed Expedia page', () => {
    const base = rank(cand('a'), decision('a'), pack('a'), ctx).score;
    expect(rank(cand('a'), decision('a', { niche_scope: 'some_units' }), pack('a'), ctx).score).toBe(base - 30);
    expect(rank(cand('a'), decision('a', { confidence: 0.6 }), pack('a'), ctx).score).toBeLessThan(base);
    expect(rank(cand('a'), decision('a'), pack('a', { pages: [], wikipedia: { text: 'Sleep in a fifteenth century castle keep' } }), ctx).score).toBe(base - 15);
    expect(rank(cand('b'), decision('b'), pack('b'), ctx).score).toBe(base + 7);   // confirmed: 10 instead of 3
    expect(rank(cand('c'), decision('c'), pack('c'), ctx).score).toBe(base - 3);   // checked, not found: 0
    expect(ctx.catBonus['underwater-rooms']).toBe(15); expect(ctx.catBonus['castle-hotels']).toBe(0); expect(ctx.catBonus['cave-hotels']).toBe(8);
  });
  it('reads approval numbers the way people write them', () => {
    expect(parseNumbers('1 3 5-9, 12')).toEqual([1, 3, 5, 6, 7, 8, 9, 12]);
    expect(parseNumbers('onay: 2,4 ve 40-38; 41 99')).toEqual([2, 4, 38, 39, 40]);
    expect(parseNumbers('hiçbiri')).toEqual([]);
  });
  it('numbers weeks by ISO week', () => {
    expect(isoWeek(new Date('2026-11-17T12:00:00Z'))).toBe('2026-W47');
    expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
  });
});

describe('property identity', () => {
  const at = (lat: number, lng: number, extra = {}) => ({ name: 'X', lat, lng, ...extra });
  it('matches on source id, official domain nearby and distinctive name', () => {
    expect(sameProperty({ id: 'osm:node/1', wikidata: 'Q5', ...at(0, 0) }, { id: 'wd:Q5', ...at(5, 5) })).toBe('same source id');
    expect(sameProperty({ id: 'a', website: 'https://www.glen.co.uk/rooms', ...at(56, -4) }, { id: 'b', website: 'http://book.glen.co.uk', ...at(56.005, -4) })).toBe('same official domain');
    expect(sameProperty({ id: 'a', name: 'Kilima Safari Camp', lat: -3, lng: 37 }, { id: 'b', name: 'Kilima Safari Camp', lat: -3.1, lng: 37.1 })).toBe('same name');
  });
  it('does not match a chain domain far away, listings, or neighbours that share a place word', () => {
    expect(sameProperty({ ...at(-24, 31), id: 'a', name: 'A Camp', website: 'https://andbeyond.example/a' }, { ...at(-3, 35), id: 'b', name: 'B Lodge', website: 'https://andbeyond.example/b' })).toBeNull();
    expect(domainOf('https://www.booking.com/hotel/x')).toBeNull();
    expect(domainOf('https://www.glen.co.uk/')).toBe('glen.co.uk');
    const g = (name: string) => ({ id: name, name, city: 'Göreme', lat: 38.643, lng: 34.828 });
    expect(sameProperty(g('Göreme Cave Rooms'), g('Göreme Valley Cave House'))).toBeNull();
  });
  it('treats generic names, other trade words and bare proximity as warnings only', () => {
    expect(sameProperty({ id: 'a', name: 'Desert Camp', lat: 1, lng: 1 }, { id: 'b', name: 'Desert Camp', lat: 1.001, lng: 1 })).toBe('same generic name nearby');
    expect(sameProperty({ id: 'a', name: 'Etosha Safari Lodge', lat: -19.2, lng: 15.9 }, { id: 'b', name: 'Etosha Safari Camp', lat: -19.21, lng: 15.9 })).toBe('similar name nearby');
    expect(sameProperty({ id: 'a', name: 'Zamek Sarny', lat: 50, lng: 16 }, { id: 'b', name: 'Zamek Sarny Dom Kompozytorow', lat: 50.0005, lng: 16 })).toBe('within 150 m');
    for (const w of ['same generic name nearby', 'similar name nearby', 'within 150 m']) expect(STRONG.has(w)).toBe(false);
    const m = findMatches([{ ref: 'a', name: 'Desert Camp', lat: 1, lng: 1 }, { ref: 'b', name: 'Desert Camp', lat: 1.001, lng: 1 }]);
    expect(m.get('a')).toEqual([{ ref: 'b', why: 'same generic name nearby', strong: false }]);
  });
});

describe('dedupe: stable ids and duplicates in the queue', () => {
  it('gives ids that survive a rename, marks duplicates of a page and of a better entry, and settles its own page', () => {
    hotelPage('glen-castle-uk', { name: '"Glen Castle"', category: 'castle-hotels', 'coordinates': '{ lat: 56.1, lng: -4.2 }', officialWebsite: '"https://glencastle.example/"', sourceId: '"osm:way/1"', status: 'published' });
    write('data/pipeline/candidates.json', {
      'osm:way/1': cand('osm:way/1', { status: 'weak' }),                                         // its own page
      'wd:Q9': cand('wd:Q9', { status: 'classified', website: null, name: 'Glen Castle Hotel' }),  // same name as the page
      'osm:node/7': cand('osm:node/7', { name: 'Kilima Safari Camp', website: 'https://kilima.example/', lat: -3, lng: 37, haiku: { confidence: 0.9 } }),
      'osm:node/8': cand('osm:node/8', { name: 'Kilima Safari Camp', website: null, lat: -3.01, lng: 37, status: 'weak' }),
      'osm:node/9': cand('osm:node/9', { name: 'Other Lodge', website: 'https://other.example/', lat: 10, lng: 10 }),
    });
    run('dedupe.mjs');
    let q = queue();
    expect(q['osm:way/1']).toMatchObject({ status: 'published', slug: 'glen-castle-uk' });
    expect(q['wd:Q9']).toMatchObject({ status: 'duplicate', duplicateOf: 'glen-castle-uk', duplicateWhy: 'same name' });
    expect(q['osm:node/8']).toMatchObject({ status: 'duplicate', duplicateOf: 'osm:node/7' });
    expect(q['osm:node/9'].status).toBe('classified');
    expect(q['osm:node/8'].pid).toBe(q['osm:node/7'].pid);
    expect(q['osm:node/9'].pid).toMatch(/^sn-[0-9a-z]{9}$/);
    const pageId = Object.entries(read('data/pipeline/properties.json')).find(([, e]: any) => e.slugs.includes('glen-castle-uk'))![0];
    expect(q['osm:way/1'].pid).toBe(pageId);
    expect(readFileSync(join(dir, 'data/pipeline/DUPLICATES.md'), 'utf8')).toMatch(/Glen Castle Hotel/);
    // Renamed entry and renamed page keep their ids.
    const before = q['osm:node/9'].pid;
    q['osm:node/9'].name = 'Other Lodge & Spa Retreat'; write('data/pipeline/candidates.json', q);
    hotelPage('glen-castle-hotel-scotland', { name: '"Glen Castle Hotel"', category: 'castle-hotels', 'coordinates': '{ lat: 56.1, lng: -4.2 }', officialWebsite: '"https://glencastle.example/"', sourceId: '"osm:way/1"', status: 'published' });
    execFileSync('rm', [join(dir, 'src/content/hotels/glen-castle-uk.md')]);
    run('dedupe.mjs');
    q = queue();
    expect(q['osm:node/9'].pid).toBe(before);
    expect(Object.entries(read('data/pipeline/properties.json')).find(([, e]: any) => e.slugs.includes('glen-castle-hotel-scotland'))![0]).toBe(pageId);
    expect(read('data/pipeline/runs/dedupe.json')).toMatchObject({ newIds: 0, duplicates: 0 });
  });
});

describe('prescreen -> review page -> shortlist -> approval by numbers', () => {
  const setup = () => {
    write(FILE, [decision('osm:way/1'), decision('osm:way/2', { category: null, other_niche_type: 'yurt' }), decision('osm:way/3', { niche_scope: 'unclear', confidence: 0.5 }), decision('osm:way/4', { niche_scope: 'some_units', confidence: 0.8 })]);
    write('data/pipeline/candidates.json', {
      'osm:way/1': cand('osm:way/1'),
      'osm:way/2': cand('osm:way/2', { name: 'Yurt Place', website: 'https://yurt.example/', lat: 1, lng: 1 }),
      'osm:way/3': cand('osm:way/3', { name: 'Maybe Castle', website: 'https://maybe.example/', lat: 2, lng: 2 }),
      'osm:way/4': cand('osm:way/4', { name: 'Part Castle', website: 'https://part.example/', lat: 3, lng: 3, haiku: { ...cand('x').haiku, scope: 'some_units', confidence: 0.8 } }),
      'osm:way/5': cand('osm:way/5', { name: 'Owner Castle', website: 'https://owner.example/', lat: 4, lng: 4, reviewedAt: '2026-11-11T00:00:00Z' }),
    });
    for (const i of [1, 2, 3, 4]) write(`.pipeline-data/inbox/osm_way_${i}.json`, pack(`osm:way/${i}`));
  };

  it('rejects and sends to research once, never touches what the owner decided, and the page shows it', () => {
    setup();
    run('prescreen.mjs'); run('prescreen.mjs');
    const q = queue();
    expect(q['osm:way/1']).toMatchObject({ status: 'classified', prescreen: { action: 'keep', rule: 'pass' } });
    expect(q['osm:way/2']).toMatchObject({ status: 'rejected', reasons: ['prescreen: 14 kategoriden hiçbirine uymuyor (yurt); niş özelliği listedeki kategorilerde kanıtlanmadı.'] });
    expect(q['osm:way/3']).toMatchObject({ status: 'classified', refetch: true, research: { by: 'prescreen', note: 'Ön eleme: Kanıt yetersiz: niş özelliğinin kapsamı kaynakta net değil.' } });
    expect(q['osm:way/5'].prescreen).toBeUndefined();
    expect(read('data/pipeline/runs/prescreen.json')).toMatchObject({ reject: 0, research: 0, alreadyScreened: 2 }) // way/2 is rejected now, way/3 waits for its research;
    // The review page gets the reasons; a second sync does not ask for research again.
    for (const i of [2, 3]) write(`export/queue/osm_way_${i}.json`, { id: `osm:way/${i}`, name: 'x', cat: 'castle-hotels', status: 'pending', decision: null, note: '', reviewedAt: null });
    run('review-items.mjs', 'data/pipeline/decisions/2026-11-13', 'export');
    const ups = read('data/pipeline/decisions/2026-11-13/queue-updates.json').flat().map((u: any) => ({ doc: u.doc_id, ...JSON.parse(readFileSync(u.file_path, 'utf8')) }));
    expect(ups.find((u: any) => u.doc === 'osm_way_2')).toMatchObject({ decision: 'reject', note: 'Ön eleme (otomatik): 14 kategoriden hiçbirine uymuyor (yurt); niş özelliği listedeki kategorilerde kanıtlanmadı.' });
    const res = ups.find((u: any) => u.doc === 'osm_way_3');
    expect(res).toMatchObject({ decision: 'research', reviewedAt: q['osm:way/3'].research.askedAt });
    write('export/queue/osm_way_3.json', { id: 'osm:way/3', name: 'x', cat: 'castle-hotels', status: 'pending', decision: 'research', note: res.note, reviewedAt: res.reviewedAt });
    write('export/queue/osm_way_2.json', { id: 'osm:way/2', name: 'x', cat: 'castle-hotels', status: 'pending', decision: 'reject', note: 'x', reviewedAt: null });
    run('sync-reviews.mjs', 'export');
    expect(queue()['osm:way/3'].research.askedAt).toBe(q['osm:way/3'].research.askedAt);
    expect(queue()['osm:way/2'].reasons[0]).toMatch(/^prescreen:/);
    // The owner approves the pre-screen's reject on the card afterwards: the owner wins.
    write('export/queue/osm_way_2.json', { id: 'osm:way/2', name: 'x', cat: 'castle-hotels', status: 'pending', decision: 'approve', finalCat: 'castle-hotels', note: '', reviewedAt: '2099-01-01T00:00:00Z' });
    run('sync-reviews.mjs', 'export');
    expect(queue()['osm:way/2'].status).toBe('approved');
  });

  it('builds a numbered weekly list, keeps the numbers for the week, and approves by numbers', () => {
    setup();
    write('data/pipeline/expedia-candidates.json', { 'osm:way/1': { status: 'confirmed', url: 'https://www.expedia.com/Glen-Hotels-Glen-Castle.h123.Hotel-Information', method: 'web-search-title-location', verifiedAt: '2026-11-17', evidence: 'result names Glen Castle, Glen' } });
    write('data/pipeline/shortlist-tr.json', { 'osm:way/1': '15. yüzyıldan kalma bir kale burcunda odalar.' });
    run('prescreen.mjs'); run('shortlist.mjs');
    const l = read('data/pipeline/shortlist.json');
    expect(l.week).toBe(isoWeek());
    expect(l.items.map((x: any) => x.id)).toEqual(['osm:way/1', 'osm:way/4']); // rejected, research and owner-touched are left out
    expect(l.items[0]).toMatchObject({ n: 1, name: 'Glen Castle', place: 'Callander, United Kingdom', catTr: 'Kale / saray', featureTr: '15. yüzyıldan kalma bir kale burcunda odalar.', commission: 'evet', sourceKind: 'resmi site', source: 'https://glencastle.example/rooms' });
    expect(l.items[1]).toMatchObject({ n: 2, commission: 'kontrol edilmedi', featureTr: null });
    expect(readFileSync(join(dir, 'data/pipeline/SHORTLIST.md'), 'utf8')).toMatch(/\| 1 \| Glen Castle \| Callander, United Kingdom \| Kale \/ saray \|/);
    run('shortlist-approve.mjs', '1');
    const q = queue();
    expect(q['osm:way/1']).toMatchObject({ status: 'approved', finalCategory: 'castle-hotels', approvedVia: 'shortlist' });
    expect(q['osm:way/4'].status).toBe('classified');
    const page = read(`data/pipeline/decisions/${new Date().toISOString().slice(0, 10)}/shortlist-approve.json`).flat();
    expect(page).toEqual([expect.objectContaining({ op: 'update', collection: 'queue', doc_id: 'osm_way_1', data: expect.objectContaining({ decision: 'approve', finalCat: 'castle-hotels' }) })]);
    // An older page save without the decision does not undo it; the list keeps its numbers.
    write('export/queue/osm_way_1.json', { id: 'osm:way/1', name: 'x', cat: 'castle-hotels', status: 'pending', decision: null, note: '', reviewedAt: '2026-11-11T00:00:00Z' });
    run('sync-reviews.mjs', 'export');
    expect(queue()['osm:way/1'].status).toBe('approved');
    run('shortlist.mjs');
    expect(read('data/pipeline/shortlist.json').items.map((x: any) => [x.n, x.state])).toEqual([[1, 'onaylandı'], [2, 'bekliyor']]);
    // The writer's page gets the confirmed Expedia page.
    hotelPage('glen-castle-uk', { name: '"Glen Castle"', status: 'draft' });
    run('writer-result.mjs', 'drafted', 'osm:way/1', 'glen-castle-uk');
    expect(read('src/data/expedia-hotels.json')).toEqual({ 'glen-castle-uk': 'https://www.expedia.com/Glen-Hotels-Glen-Castle.h123.Hotel-Information' });
    expect(read('src/data/expedia-verification.json')['glen-castle-uk']).toMatchObject({ status: 'confirmed', method: 'web-search-title-location' });
  });
});

describe('candidate Expedia check', () => {
  it('stores only an expedia.com property page that names the stay; never a guess', () => {
    write('data/pipeline/candidates.json', { a: cand('a', { name: 'Botel Marina' }), b: cand('b', { name: 'Fingal' }), c: cand('c', { name: 'Glen Castle' }), d: cand('d') });
    write('r.json', [
      { id: 'a', status: 'confirmed', url: 'https://www.expedia.com/Prague-Hotels-Botel-Marina.h90430125.Hotel-Information?chkin=1', evidence: 'result title Botel Marina, Prague' },
      { id: 'b', status: 'confirmed', url: 'https://www.expedia.es/Edinburgh-Hotels-Fingal.h1.Hotel-Information', evidence: 'spanish site result' },
      { id: 'c', status: 'confirmed', url: 'https://www.expedia.com/Glen-Hotels-Other-Inn.h5.Hotel-Information', evidence: 'some result in Glen' },
      { id: 'd', status: 'not_found', evidence: 'two searches, nothing' },
    ]);
    run('expedia-check.mjs', 'apply', 'r.json');
    const r = read('data/pipeline/expedia-candidates.json');
    expect(r.a).toMatchObject({ status: 'confirmed', url: 'https://www.expedia.com/Prague-Hotels-Botel-Marina.h90430125.Hotel-Information' });
    expect(r.b).toMatchObject({ status: 'unconfirmed' }); expect(r.b.url).toBeUndefined();
    expect(r.c.status).toBe('unconfirmed'); expect(r.c.notes).toMatch(/shares no word/);
    expect(r.d).toMatchObject({ status: 'not_found', verifiedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });
});

describe('monthly re-check of live hotels', () => {
  it('checks every live hotel, reports a broken Expedia mapping, changes nothing, and waits a month', () => {
    hotelPage('a', { name: '"A"', officialWebsite: '"https://a.example/"', status: 'published' });
    hotelPage('b', { name: '"B"', niche_source_url: '"https://b.example/rooms"' });
    hotelPage('c', { name: '"C"', status: 'draft' });
    write('src/data/expedia-hotels.json', { a: 'https://www.expedia.com/X-Hotels-A.h1.Hotel-Information', b: 'https://www.expedia.com/X-Hotels-B.h2.Hotel-Information' });
    write('src/data/expedia-verification.json', { a: { status: 'confirmed', url: 'https://www.expedia.com/X-Hotels-A.h1.Hotel-Information', verifiedAt: new Date().toISOString().slice(0, 10) } });
    const pageA = readFileSync(join(dir, 'src/content/hotels/a.md'), 'utf8');
    run('recheck.mjs');
    const r = read('data/pipeline/recheck.json');
    expect(r.results.map((x: any) => [x.slug, x.url, x.expedia.state])).toEqual([['a', 'https://a.example/', 'valid'], ['b', 'https://b.example/rooms', 'invalid']]);
    expect(r.summary).toMatchObject({ hotels: 2, expediaValid: 1, expediaInvalid: 1 });
    expect(readFileSync(join(dir, 'src/content/hotels/a.md'), 'utf8')).toBe(pageA);
    expect(run('recheck.mjs')).toMatch(/next after 28 days/);
    expect(existsSync(join(dir, 'data/pipeline/runs/recheck.json'))).toBe(true);
  });
});
