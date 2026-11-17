/** Table of the niche audit: hotel | old category | new category | niche_scope | source. Usage: node scripts/niche-audit-report.mjs <base-ref> > data/audit-niche/REPORT.md */
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
const base = process.argv[2] ?? 'origin/claude/setup-stayatniche-project-xHSQk';
const fm = (t) => parse(t.match(/^---\n([\s\S]*?)\n---/)[1]);
const rec = {};
for (const f of readdirSync('data/audit-niche').filter((f) => /^batch-\d+\.json$/.test(f))) for (const r of JSON.parse(readFileSync(`data/audit-niche/${f}`, 'utf8'))) rec[r.slug] = r;
const rows = [];
for (const f of readdirSync('src/content/hotels').filter((f) => f.endsWith('.md')).sort()) {
  const now = fm(readFileSync(`src/content/hotels/${f}`, 'utf8'));
  if (!now.niche_scope) continue;
  let old = '(new)';
  try { old = fm(execFileSync('git', ['show', `${base}:src/content/hotels/${f}`], { encoding: 'utf8' })).category; } catch {}
  const live = (now.status ?? 'published') === 'published';
  rows.push([now.name, f.replace('.md', ''), old, live ? now.category : `draft, 301 to ${rec[f.replace('.md', '')]?.closest_category ?? '?'}`, now.niche_scope, now.niche_source_url ?? '(none: unverified)']);
}
console.log('# Niche audit 2026-11-17\n\n| Hotel | Old category | New category | niche_scope | Source |\n|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r[0]} (${r[1]}) | ${r[2]} | ${r[3]} | ${r[4]} | ${r[5]} |`);
