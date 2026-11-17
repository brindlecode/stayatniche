/**
 * Did the last change to the site go live? Compares the commit the live site was built from
 * (https://stayatniche.com/build.json) with the newest commit on this branch that changed anything
 * Netlify builds (the same rule as scripts/netlify-ignore.sh: everything except data/pipeline and docs).
 * Writes data/pipeline/runs/deploy.json, which status.mjs puts at the top of STATUS.md. Exit 1 = failed.
 * Usage: node pipeline/deploy-check.mjs        (SITE_URL, NOW override the site and the clock, for tests)
 */
import { execFileSync } from 'node:child_process';
import { report } from './lib.mjs';

const SITE = (process.env.SITE_URL ?? 'https://stayatniche.com').replace(/\/$/, '');
const NOW = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const WAIT_MIN = 45; // a deploy normally takes 3-5 minutes; after this long a missing one is a failure
const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return null; } };
async function get(path) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(SITE + path, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'stayatniche-deploy-check' } }); return { status: r.status, text: await r.text() }; }
    catch (e) { if (i === 2) return { status: 0, text: String(e.message ?? e) }; await new Promise(r => setTimeout(r, 3000)); }
  }
}

const [expected, expectedAt] = (git('log', '-1', '--format=%H %cI', '--', '.', ':(exclude)data/pipeline', ':(exclude)docs') ?? '').split(' ');
const home = await get('/');
let out;
if (home.status !== 200) {
  out = { ok: false, state: 'failed', why: `canlı site açılmıyor (HTTP ${home.status || 'bağlantı yok'})` };
} else {
  const b = await get('/build.json');
  let live = null;
  try { live = JSON.parse(b.text).commit; } catch { /* no build.json yet */ }
  const ageMin = expectedAt ? Math.round((NOW - Date.parse(expectedAt)) / 60000) : null;
  if (!expected) out = { ok: true, state: 'unknown', why: 'son site değişikliği git geçmişinde bulunamadı' };
  else if (!live || live === 'unknown') out = { ok: true, state: 'unknown', why: 'canlı sitede build.json yok ya da okunamadı; son yayın doğrulanamadı', expected: expected.slice(0, 7) };
  else if (live === expected || git('merge-base', '--is-ancestor', expected, live) !== null) out = { ok: true, state: 'live', live: live.slice(0, 7), expected: expected.slice(0, 7), ageMin };
  else if (git('cat-file', '-e', `${live}^{commit}`) === null && git('rev-parse', '--verify', '-q', live) === null) out = { ok: true, state: 'unknown', why: 'canlı sitenin sürümü bu geçmişte yok', live: live.slice(0, 7), expected: expected.slice(0, 7) };
  else if (ageMin != null && ageMin < WAIT_MIN) out = { ok: true, state: 'pending', why: `yayın bekleniyor (${ageMin} dk önce)`, live: live.slice(0, 7), expected: expected.slice(0, 7), ageMin };
  else out = { ok: false, state: 'failed', why: `son site değişikliği (${expected.slice(0, 7)}, ${ageMin} dk önce) canlıya çıkmamış; canlı site ${live.slice(0, 7)} sürümünde`, live: live.slice(0, 7), expected: expected.slice(0, 7), ageMin };
}
report('deploy', out);
if (!out.ok) process.exit(1);
