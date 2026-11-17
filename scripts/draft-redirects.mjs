/**
 * 301 redirects for stays the niche audit set to draft: every language path of the hotel page goes to
 * the closest category page (data/audit-niche/*.json, verdict "draft"). Rewrites one marked block in
 * netlify.toml, so it can be run again. Usage: node scripts/draft-redirects.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { LOCALES, localePath } from '../src/i18n/locales.mjs';

const START = '# >>> niche audit drafts (scripts/draft-redirects.mjs) >>>';
const END = '# <<< niche audit drafts <<<';
const drafts = [];
for (const f of readdirSync('data/audit-niche').filter(f => /^batch-\d+\.json$/.test(f)).sort())
  for (const r of JSON.parse(readFileSync(`data/audit-niche/${f}`, 'utf8')))
    if (r.verdict === 'draft') drafts.push(r);
const status = (slug) => (readFileSync(`src/content/hotels/${slug}.md`, 'utf8').match(/^status:\s*(\S+)/m) ?? [])[1];

const rule = (from, to) => `[[redirects]]\n  from = "${from}"\n  to = "${to}"\n  status = 301\n`;
let block = `${START}\n# Stays that fit none of the 14 categories (audit 2026-11-17): the page is a draft, visitors go to the closest category.\n`;
for (const r of drafts.sort((a, b) => a.slug.localeCompare(b.slug))) {
  if (status(r.slug) !== 'draft') continue;
  for (const l of LOCALES) {
    const from = localePath(l, 'hotels', r.slug).replace(/\/$/, '');
    const to = localePath(l, 'categories', r.closest_category);
    block += `\n${rule(from + '/*', to)}\n${rule(from, to)}`;
  }
}
block += `${END}\n`;
let toml = readFileSync('netlify.toml', 'utf8');
if (toml.includes(START)) toml = toml.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}\\n`), block);
else toml = toml.replace('[[redirects]]\n  from = "/rss"', `${block}\n[[redirects]]\n  from = "/rss"`);
writeFileSync('netlify.toml', toml);
console.log(`${drafts.length} drafted stays, redirects written`);
