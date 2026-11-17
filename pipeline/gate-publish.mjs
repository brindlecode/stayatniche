/**
 * Gate for the writer: run it after writing pages and BEFORE committing them.
 *   node pipeline/gate-publish.mjs <slug> [slug...]
 * 1. Every given page with `status: published` must pass the publication rules (src/lib/niche.mjs:
 *    niche fields, location, no unsourced reviewCount, score under its ceiling). A page that does not
 *    is set to `status: draft` and listed.
 * 2. Then `npm test`, `npm run build` and `node scripts/check-build.mjs` run once for the whole tree.
 *    If one fails, every given page is set to `status: draft` and the failing step is printed, so a
 *    broken page can never reach the live site; the writer records those stays as blocked.
 *    A page with `status: draft` is checked against the same rules and left a draft; a draft that
 *    fails is listed as "not ready", so the owner's later "yayınla" cannot fail on it.
 *    Missing translations (de, fr, es, it, nl) are listed for every page.
 * Exit code 0 = all given pages may stay published / are ready, 1 = a page was set to draft or a draft is not ready.
 * GATE_SKIP_BUILD=1 skips step 2 (used by the tests).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { nicheProblems } from '../src/lib/niche.mjs';

const slugs = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!slugs.length) { console.error('usage: node pipeline/gate-publish.mjs <slug> [slug...]'); process.exit(2); }
const file = s => `src/content/hotels/${s}.md`;
const drafted = [], notReady = [];
const LANGS = ['de', 'fr', 'es', 'it', 'nl'];
const toDraft = (slug, why) => {
  let t = readFileSync(file(slug), 'utf8');
  t = /^status:/m.test(t) ? t.replace(/^status:.*$/m, 'status: draft') : t.replace(/\n---\n/, '\nstatus: draft\n---\n');
  writeFileSync(file(slug), t);
  drafted.push({ slug, why });
  console.log(`DRAFT ${slug}: ${why}`);
};

for (const slug of slugs) {
  if (!existsSync(file(slug))) { console.error(`no page ${file(slug)}`); process.exitCode = 2; continue; }
  let data;
  try { data = parse(readFileSync(file(slug), 'utf8').match(/^---\n([\s\S]*?)\n---/)[1]); }
  catch (e) { toDraft(slug, `frontmatter does not parse: ${e.message.split('\n')[0]}`); continue; }
  const bad = nicheProblems({ ...data, status: 'published' });
  const missing = LANGS.filter(l => !existsSync(`src/content/translations/${l}/hotels/${slug}.md`));
  if (missing.length) console.log(`NOTE ${slug}: no translation yet for ${missing.join(', ')}`);
  if ((data.status ?? 'published') !== 'published') {
    // A draft is checked against the same rules, so the owner's "yayınla" never fails later.
    if (bad.length) { notReady.push(slug); console.log(`NOT READY ${slug} (draft): ${bad.map(b => `${b.path}: ${b.message}`).join('; ')}`); }
    else console.log(`ready ${slug} (draft${missing.length ? ', translations missing' : ', translated'})`);
    continue;
  }
  if (bad.length) toDraft(slug, bad.map(b => `${b.path}: ${b.message}`).join('; '));
}

if (process.env.GATE_SKIP_BUILD !== '1') {
  const still = slugs.filter(s => !drafted.some(d => d.slug === s));
  for (const [name, cmd, args] of [['npm test', 'npm', ['test']], ['npm run build', 'npm', ['run', 'build']], ['check-build', 'node', ['scripts/check-build.mjs']]]) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) {
      const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-15).join('\n');
      console.log(`${name} FAILED:\n${tail}`);
      for (const s of still) toDraft(s, `${name} failed with this page in the tree`);
      break;
    }
    console.log(`${name}: ok`);
  }
}
if (notReady.length) console.log(`${notReady.length} draft(s) not ready to publish: ${notReady.join(' ')}; fix them or record them with pipeline/writer-result.mjs blocked`);
console.log(drafted.length ? `${drafted.length} page(s) set to draft; record them with pipeline/writer-result.mjs blocked` : notReady.length ? 'gate failed' : 'gate passed');
process.exit(drafted.length || notReady.length ? 1 : 0);
