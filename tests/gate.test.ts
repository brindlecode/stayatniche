// The writer's gate and the nightly live-deploy check (docs/pipeline/WRITER.md, pipeline/status.mjs).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
let dir: string;
const complete = `---
name: "Test Lodge"
category: treehouse-hotels
destination: "Somewhere, Region"
country: "Germany"
description: "A test."
priceRange: "Rates vary"
rating: 8
niche_scope: entire_property
niche_feature: "Six free-standing houses on stilts among the trees."
niche_source_url: "https://example.com/rooms"
niche_verified_at: 2026-11-17
location:
  country: "Germany"
  countryCode: "DE"
status: published
---
Body.
`;
const page = (slug: string, text: string) => { mkdirSync(join(dir, 'src/content/hotels'), { recursive: true }); writeFileSync(join(dir, `src/content/hotels/${slug}.md`), text); };
const gate = (...slugs: string[]) => spawnSync('node', [join(ROOT, 'pipeline/gate-publish.mjs'), ...slugs], { cwd: dir, encoding: 'utf8', env: { ...process.env, GATE_SKIP_BUILD: '1' } });
const status = (slug: string) => readFileSync(join(dir, `src/content/hotels/${slug}.md`), 'utf8').match(/^status:\s*(\S+)/m)?.[1];

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gate-')); });

describe('publish gate', () => {
  it('leaves a complete page published', () => {
    page('good', complete);
    const r = gate('good');
    expect(r.status).toBe(0);
    expect(status('good')).toBe('published');
  });
  it('sets a page without niche_scope to draft and fails', () => {
    page('fake', complete.replace(/niche_scope:.*\n/, '').replace(/niche_feature:.*\n/, ''));
    const r = gate('fake');
    expect(r.status).toBe(1);
    expect(status('fake')).toBe('draft');
    expect(r.stdout).toMatch(/DRAFT fake: .*niche_scope/);
  });
  it('sets a page with an unsourced reviewCount, a missing location or a score over its ceiling to draft', () => {
    page('a', complete.replace('rating: 8', 'rating: 8\nreviewCount: 427'));
    page('b', complete.replace(/location:\n  country.*\n  countryCode.*\n/, ''));
    page('c', complete.replace('entire_property', 'specific_rooms').replace('rating: 8', 'rating: 9.5'));
    const r = gate('a', 'b', 'c');
    expect(r.status).toBe(1);
    expect(['a', 'b', 'c'].map(status)).toEqual(['draft', 'draft', 'draft']);
  });
  it('leaves drafts as drafts, but reports an incomplete one as not ready to publish', () => {
    page('d', complete.replace('status: published', 'status: draft').replace(/niche_scope:.*\n/, ''));
    page('ok', complete);
    const r = gate('d', 'ok');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/NOT READY d \(draft\): .*niche_scope/);
    expect([status('d'), status('ok')]).toEqual(['draft', 'published']);
  });
  it('passes a complete draft as ready and lists missing translations', () => {
    page('d', complete.replace('status: published', 'status: draft'));
    const r = gate('d');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/NOTE d: no translation yet for de, fr, es, it, nl/);
    expect(r.stdout).toMatch(/ready d \(draft, translations missing\)/);
    expect(status('d')).toBe('draft');
  });
});

describe('live deploy check', () => {
  let server: Server; let port: number; let liveCommit: string | null; let homeStatus = 200;
  let when = '2026-11-17T10:00:00Z';
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_COMMITTER_DATE: when, GIT_AUTHOR_DATE: when } }).trim();
  beforeEach(async () => {
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    mkdirSync(join(dir, 'data/pipeline/runs'), { recursive: true });
    writeFileSync(join(dir, 'a.txt'), '1'); git('add', '-A'); git('commit', '-q', '-m', 'one');
    when = '2026-11-17T10:10:00Z'; writeFileSync(join(dir, 'a.txt'), '2'); git('commit', '-qam', 'site change');
    homeStatus = 200;
    server = createServer((req, res) => {
      if (req.url === '/build.json') { if (liveCommit === null) { res.statusCode = 404; return res.end('no'); } return res.end(JSON.stringify({ commit: liveCommit })); }
      res.statusCode = homeStatus; res.end('home');
    });
    await new Promise<void>(r => server.listen(0, r)); port = (server.address() as any).port;
  });
  afterEach(() => new Promise<void>(r => server.close(() => r())));
  // Async on purpose: the test server lives in this process, so a blocking spawn would starve it.
  const run = async (now: string) => {
    let code = 0;
    try { await execFileAsync('node', [join(ROOT, 'pipeline/deploy-check.mjs')], { cwd: dir, env: { ...process.env, SITE_URL: `http://127.0.0.1:${port}`, NOW: now } }); }
    catch (e: any) { code = e.code ?? 1; }
    return { code, log: JSON.parse(readFileSync(join(dir, 'data/pipeline/runs/deploy.json'), 'utf8')) };
  };
  const head = () => git('rev-parse', 'HEAD');
  it('is fine when the live site was built from the last site change', async () => {
    liveCommit = head();
    const r = await run('2026-11-17T12:00:00Z');
    expect(r.code).toBe(0); expect(r.log.state).toBe('live');
  });
  it('fails when the live site is older than the last site change for a long time, waits when it is recent', async () => {
    liveCommit = git('rev-parse', 'HEAD~1');
    const late = await run('2026-11-17T12:00:00Z');
    expect(late.code).toBe(1); expect(late.log.state).toBe('failed');
    const soon = await run('2026-11-17T10:20:00Z');
    expect(soon.code).toBe(0); expect(soon.log.state).toBe('pending');
  });
  it('ignores pipeline-data commits (they do not build)', async () => {
    liveCommit = head();
    writeFileSync(join(dir, 'data/pipeline/x.json'), '{}'); git('add', '-A'); when = '2026-11-18T01:00:00Z'; git('commit', '-q', '-m', 'nightly');
    expect((await run('2026-11-18T05:00:00Z')).log.state).toBe('live');
  });
  it('fails when the site does not answer, and says unknown when build.json is missing', async () => {
    homeStatus = 503; liveCommit = head();
    expect((await run('2026-11-17T12:00:00Z')).code).toBe(1);
    homeStatus = 200; liveCommit = null;
    const r = await run('2026-11-17T12:00:00Z');
    expect(r.code).toBe(0); expect(r.log.state).toBe('unknown');
  });
});
