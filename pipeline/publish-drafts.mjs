/**
 * Makes draft hotel pages public after the owner said so: sets `status: published` and today's
 * `publishedDate` in the English page and its translations, and marks the queue entry published.
 * Usage: node pipeline/publish-drafts.mjs <slug> [slug...]     (--list shows the drafts)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { loadQueue, saveQueue, publishedHotels, today, report } from './lib.mjs';

const args = process.argv.slice(2);
const drafts = publishedHotels().filter(h => h.status === 'draft');
if (!args.length || args[0] === '--list') { for (const d of drafts) console.log(`${d.slug}\t${d.name}`); console.log(`${drafts.length} drafts`); process.exit(0); }
const q = loadQueue();
const langs = existsSync('src/content/translations') ? readdirSync('src/content/translations') : [];
const done = [];
for (const slug of args) {
  const file = `src/content/hotels/${slug}.md`;
  if (!existsSync(file)) { console.error(`no page ${file}`); process.exitCode = 1; continue; }
  for (const f of [file, ...langs.map(l => `src/content/translations/${l}/hotels/${slug}.md`)].filter(existsSync)) {
    let t = readFileSync(f, 'utf8');
    t = t.replace(/^status:\s*["']?draft["']?\s*$/m, 'status: published');
    if (f === file) t = /^publishedDate:/m.test(t) ? t.replace(/^publishedDate:.*$/m, `publishedDate: ${today()}`) : t.replace(/^status: published$/m, `publishedDate: ${today()}\nstatus: published`);
    writeFileSync(f, t);
  }
  const c = Object.values(q).find(c => c.slug === slug);
  if (c) Object.assign(c, { status: 'published', publishedAt: new Date().toISOString() });
  done.push(slug);
}
saveQueue(q);
report('publish', { ok: !process.exitCode, published: done });
