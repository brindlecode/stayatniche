/**
 * Makes draft hotel pages public after the owner said so: sets `status: published` and today's
 * `publishedDate` in the English page and marks the queue entry published. Drafts have no
 * translations yet: launch the hotel-translator subagents for the slugs afterwards.
 * Usage: node pipeline/publish-drafts.mjs <slug> [slug...]     (--list shows the drafts)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadQueue, saveQueue, publishedHotels, today, report } from './lib.mjs';

const args = process.argv.slice(2);
const drafts = publishedHotels().filter(h => h.status === 'draft');
if (!args.length || args[0] === '--list') { for (const d of drafts) console.log(`${d.slug}\t${d.name}`); console.log(`${drafts.length} drafts`); process.exit(0); }
const q = loadQueue();
const done = [];
for (const slug of args) {
  const file = `src/content/hotels/${slug}.md`;
  if (!existsSync(file)) { console.error(`no page ${file}`); process.exitCode = 1; continue; }
  let t = readFileSync(file, 'utf8');
  if (!/^status:\s*["']?draft["']?\s*$/m.test(t)) { console.error(`${slug} is not a draft`); process.exitCode = 1; continue; }
  const missing = ['niche_scope', 'niche_feature', 'niche_verified_at', 'location'].filter(k => !new RegExp(`^${k}:`, 'm').test(t));
  if (missing.length) { console.error(`${slug}: not published, frontmatter lacks ${missing.join(', ')} (docs/NICHE-AUDIT.md)`); process.exitCode = 1; continue; }
  t = t.replace(/^status:\s*["']?draft["']?\s*$/m, 'status: published');
  t = /^publishedDate:/m.test(t) ? t.replace(/^publishedDate:.*$/m, `publishedDate: ${today()}`) : t.replace(/^status: published$/m, `publishedDate: ${today()}\nstatus: published`);
  writeFileSync(file, t);
  const c = Object.values(q).find(c => c.slug === slug);
  if (c) Object.assign(c, { status: 'published', publishedAt: new Date().toISOString() });
  done.push(slug);
}
saveQueue(q);
report('publish', { ok: !process.exitCode, published: done });
if (done.length) console.log(`Next: translate these with hotel-translator, then node scripts/i18n-check.mjs all hotels: ${done.join(' ')}`);
