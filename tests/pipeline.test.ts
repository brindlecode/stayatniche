// Pipeline handoffs: each script is run as the jobs run it, in a throwaway copy of the layout.
import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
let dir: string;
const run = (script: string, ...args: string[]) => execFileSync('node', [join(dir, 'pipeline', script), ...args], { cwd: dir, encoding: 'utf8' });
const queue = () => JSON.parse(readFileSync(join(dir, 'data/pipeline/candidates.json'), 'utf8'));
const write = (path: string, data: unknown) => { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), typeof data === 'string' ? data : JSON.stringify(data)); };
const cand = (id: string, extra = {}) => ({ id, name: 'Glen Castle', categories: ['castle-hotels'], category: 'castle-hotels', lat: 56.1, lng: -4.2, website: 'https://glencastle.example/', wikidata: null, country: 'United Kingdom', status: 'weak', ...extra });
const pack = (id: string, extra = {}) => ({ id, name: 'Glen Castle', fetchedAt: '2026-11-10T07:00:00.000Z', website: 'https://glencastle.example/', pages: [{ url: 'https://glencastle.example/', kind: 'home', title: 'Glen Castle', description: '', text: 'Sleep in a fifteenth century castle keep with nine bedrooms.' }], jsonLd: [], wikipedia: null, notes: [], ...extra });
const decision = (id: string, extra = {}) => ({ id, is_lodging: true, operating_status: 'open', category: 'castle-hotels', niche_scope: 'whole_property', confidence: 0.9, category_quote: 'Sleep in a fifteenth century castle keep', red_flags: [], highlights: [], amenities: [], reason: 'castle keep', ...extra });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pipeline-'));
  cpSync(join(ROOT, 'pipeline'), join(dir, 'pipeline'), { recursive: true });
  mkdirSync(join(dir, 'src/content/hotels'), { recursive: true });
  mkdirSync(join(dir, '.pipeline-data/inbox'), { recursive: true });
});

describe('classification handoff', () => {
  it('takes a pack once, applies the decision once, and survives a broken batch file', () => {
    write('data/pipeline/candidates.json', { 'osm:way/1': cand('osm:way/1'), 'osm:way/2': cand('osm:way/2', { name: 'Other Castle', website: 'https://other.example/' }) });
    write('.pipeline-data/inbox/osm_way_1.json', pack('osm:way/1'));
    write('.pipeline-data/inbox/osm_way_2.json', pack('osm:way/2', { name: 'Other Castle' }));
    run('next-batches.mjs', '2026-11-10', '150', '1');
    const todo = JSON.parse(readFileSync(join(dir, 'data/pipeline/decisions/2026-11-10/todo.json'), 'utf8'));
    expect(todo.map((b: any) => b.packs.length)).toEqual([1, 1]);
    write(todo[0].out, [decision('osm:way/1')]);
    write(todo[1].out, '[{ not json');
    expect(() => run('check-decisions.mjs', 'data/pipeline/decisions/2026-11-10')).toThrow(); // reported, non-zero
    expect(JSON.parse(readFileSync(join(dir, 'data/pipeline/decisions/2026-11-10/checked.json'), 'utf8')).map((d: any) => d.verdict)).toEqual(['accepted']);
    // The decided pack is not handed out again; the one in the broken batch is.
    run('next-batches.mjs', '2026-11-10', '150', '1');
    const again = JSON.parse(readFileSync(join(dir, 'data/pipeline/decisions/2026-11-10/todo.json'), 'utf8'));
    expect(again.map((b: any) => b.packs[0])).toEqual(['.pipeline-data/inbox/osm_way_2.json']);
    expect(again[0].out).toMatch(/batch-3\.json$/); // never overwrites an earlier batch
    run('apply-decisions.mjs'); run('apply-decisions.mjs');
    expect(queue()['osm:way/1'].status).toBe('classified');
    expect(queue()['osm:way/2'].status).toBe('weak');
    expect(existsSync(join(dir, '.pipeline-data/inbox/osm_way_1.json'))).toBe(true); // kept for the writer
  });

  it('classifies a pack again when it was fetched after an earlier "no evidence" decision', () => {
    write('data/pipeline/candidates.json', { 'osm:way/1': cand('osm:way/1', { noEvidence: 1, noEvidenceAt: '2026-10-09T08:00:00.000Z', noEvidenceFile: 'data/pipeline/decisions/2026-10-08/checked.json' }) });
    write('data/pipeline/decisions/2026-10-08/batch-1.json', [decision('osm:way/1')]);
    write('.pipeline-data/inbox/osm_way_1.json', pack('osm:way/1'));
    run('next-batches.mjs', '2026-11-10');
    expect(JSON.parse(readFileSync(join(dir, 'data/pipeline/decisions/2026-11-10/todo.json'), 'utf8'))).toHaveLength(1);
  });
});

describe('review handoff', () => {
  const doc = (extra = {}) => ({ id: 'osm:way/1', name: 'Glen Castle', cat: 'castle-hotels', status: 'pending', decision: null, finalCat: null, note: '', reviewedAt: '2026-11-11T09:00:00.000Z', ...extra });
  beforeEach(() => write('data/pipeline/candidates.json', { 'osm:way/1': cand('osm:way/1', { status: 'classified', haiku: { verdict: 'accepted', file: 'x' } }) }));

  it('approve, then the writer blocks it, then a second sync leaves it blocked', () => {
    write('export/queue/osm_way_1.json', doc({ decision: 'approve', finalCat: 'cave-hotels' }));
    run('sync-reviews.mjs', 'export');
    expect(queue()['osm:way/1']).toMatchObject({ status: 'approved', finalCategory: 'cave-hotels' });
    run('writer-result.mjs', 'blocked', 'osm:way/1', 'Kanıt yetersiz');
    expect(queue()['osm:way/1']).toMatchObject({ status: 'blocked', refetch: true });
    run('sync-reviews.mjs', 'export');
    expect(queue()['osm:way/1'].status).toBe('blocked');
    // Fresh readable evidence hands it back to the writer.
    write('.pipeline-data/inbox/osm_way_1.json', pack('osm:way/1', { fetchedAt: '2099-01-01T00:00:00.000Z' }));
    run('apply-decisions.mjs');
    expect(queue()['osm:way/1'].status).toBe('approved');
  });

  it('"needs research" asks for fresh evidence once, and the page gets the blocked reason', () => {
    write('export/queue/osm_way_1.json', doc({ decision: 'research', note: 'Odalar kalede mi?' }));
    run('sync-reviews.mjs', 'export'); run('sync-reviews.mjs', 'export');
    const c = queue()['osm:way/1'];
    expect(c).toMatchObject({ status: 'classified', refetch: true, research: { note: 'Odalar kalede mi?' } });
    write('export/queue/osm_way_1.json', doc({ decision: 'approve' }));
    run('sync-reviews.mjs', 'export');
    run('writer-result.mjs', 'blocked', 'osm:way/1', 'Kanıt yetersiz', '--final');
    run('review-items.mjs', 'data/pipeline/decisions/2026-11-12', 'export');
    const updates = JSON.parse(readFileSync(join(dir, 'data/pipeline/decisions/2026-11-12/queue-updates.json'), 'utf8')).flat();
    expect(updates).toHaveLength(1);
    expect(JSON.parse(readFileSync(updates[0].file_path, 'utf8'))).toEqual({ hold: 'Kanıt yetersiz' });
  });

  it('refuses an export with no documents instead of reporting success', () => {
    mkdirSync(join(dir, 'empty'));
    expect(() => run('sync-reviews.mjs', 'empty')).toThrow();
  });
});

describe('research and blocked retries', () => {
  it('re-reads a pack fetched the same day as the first decision, and applies the new decision', () => {
    const file = 'data/pipeline/decisions/2026-11-10/checked.json';
    write('data/pipeline/candidates.json', { 'osm:way/1': cand('osm:way/1', { status: 'classified', haiku: { verdict: 'needs_review', file, evidenceAt: '2026-11-10T07:00:00.000Z' }, research: { askedAt: '2026-11-10T09:00:00.000Z', note: '?', fetchedAt: '2026-11-10' } }) });
    write('data/pipeline/decisions/2026-11-10/batch-1.json', [decision('osm:way/1')]);
    write(file, [{ ...decision('osm:way/1'), verdict: 'needs_review', evidenceAt: '2026-11-10T07:00:00.000Z' }]);
    write('.pipeline-data/inbox/osm_way_1.json', pack('osm:way/1', { fetchedAt: '2026-11-10T10:00:00.000Z' }));
    run('next-batches.mjs', '2026-11-10');
    const todo = JSON.parse(readFileSync(join(dir, 'data/pipeline/decisions/2026-11-10/todo.json'), 'utf8'));
    expect(todo).toHaveLength(1);
    write(todo[0].out, [decision('osm:way/1')]);
    run('check-decisions.mjs', 'data/pipeline/decisions/2026-11-10');
    run('next-batches.mjs', '2026-11-10');
    expect(JSON.parse(readFileSync(join(dir, 'data/pipeline/decisions/2026-11-10/todo.json'), 'utf8'))).toHaveLength(0);
    run('apply-decisions.mjs');
    expect(queue()['osm:way/1']).toMatchObject({ status: 'classified', haiku: { verdict: 'accepted', evidenceAt: '2026-11-10T10:00:00.000Z' }, research: { doneAt: '2026-11-10', result: 'accepted' } });
    // The page never got the result: it is rebuilt from the saved decision.
    write('export/queue/osm_way_1.json', { id: 'osm:way/1', name: 'Glen Castle', cat: 'castle-hotels', status: 'pending', decision: 'research', note: '?' });
    run('review-items.mjs', 'data/pipeline/decisions/2026-11-11', 'export');
    const updates = JSON.parse(readFileSync(join(dir, 'data/pipeline/decisions/2026-11-11/queue-updates.json'), 'utf8')).flat();
    expect(JSON.parse(readFileSync(updates[0].file_path, 'utf8'))).toMatchObject({ researched: '2026-11-10', decision: null, verdict: 'accepted' });
  });

  it('a blocked stay whose re-fetch found nothing is tried again later, three times in all', () => {
    const blocked = (tries: number, lastEvidence?: string) => ({ 'osm:way/1': cand('osm:way/1', { status: 'blocked', website: 'http://127.0.0.1:9/', lastEvidence, blocked: { reason: 'x', at: '2026-11-01T00:00:00.000Z', tries, retry: true } }) });
    write('data/pipeline/candidates.json', blocked(0));
    run('evidence.mjs', '--next', '5');
    expect(queue()['osm:way/1'].blocked).toMatchObject({ tries: 1, retry: true });
    run('evidence.mjs', '--next', '5');                       // fetched today: not again yet
    expect(queue()['osm:way/1'].blocked.tries).toBe(1);
    write('data/pipeline/candidates.json', blocked(2, '2026-01-01'));
    run('evidence.mjs', '--next', '5');
    expect(queue()['osm:way/1'].blocked).toMatchObject({ tries: 3, retry: false });
    expect(queue()['osm:way/1'].status).toBe('blocked');
  }, 60000);
});

describe('queue merge and website finder', () => {
  it('keeps both sides; the branch wins a real conflict', () => {
    const base = { a: cand('a'), b: cand('b') };
    write('base.json', base);
    write('ours.json', { a: { ...base.a, lastEvidence: '2026-11-12' }, b: { ...base.b, status: 'rejected' }, c: cand('c') });
    write('theirs.json', { a: { ...base.a, status: 'approved' }, b: { ...base.b, status: 'published' } });
    write('data/pipeline/candidates.json', {});
    run('merge-queue.mjs', 'base.json', 'ours.json', 'theirs.json');
    const q = queue();
    expect(q.a).toMatchObject({ status: 'approved', lastEvidence: '2026-11-12' });
    expect(q.b.status).toBe('published');
    expect(q.c).toBeTruthy();
  });

  it('accepts only a site that names the property and is not a listing', () => {
    write('data/pipeline/candidates.json', { a: cand('a', { website: null, name: 'Myres Castle' }), b: cand('b', { website: null, name: 'Myres Castle' }), c: cand('c', { website: null, name: 'Myres Castle' }) });
    write('data/pipeline/decisions/r/sites.json', [
      { id: 'a', url: 'https://www.myrescastle.co.uk/', title: 'Myres Castle' },
      { id: 'b', url: 'https://www.booking.com/hotel/gb/myres-castle.html', title: 'Myres Castle' },
      { id: 'c', url: 'https://www.somethingelse.example/', title: 'Holiday homes in Fife' },
    ]);
    run('apply-websites.mjs', 'data/pipeline/decisions/r');
    const q = queue();
    expect(q.a).toMatchObject({ website: 'https://www.myrescastle.co.uk/', websiteSource: 'search' });
    expect(q.b.website).toBeNull(); expect(q.c.website).toBeNull();
    expect(q.b.siteSearch).toBe('refused');
  });
});
