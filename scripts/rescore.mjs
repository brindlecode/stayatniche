/**
 * Recalculates the editorial score by docs/EDITORIAL-SCORE.md for the stays in
 * data/audit-niche/score-inputs.json: score = 3.5 + 0.7 x (Setting + Stay + Practicality), one decimal,
 * cut to the ceiling of the stay's niche_scope. Setting and Stay come from the file (editor judgement);
 * Practicality is counted from the page: +1 a working booking route (a bookingUrl and the stay is not
 * closed), +1 season stated (seasonalInfo), +0.5 check-in/out stated, +0.5 how to get there stated in the text.
 * Writes data/audit-niche/score-recalc.json and the new `rating` into each page.
 * Usage: node scripts/rescore.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { SCORE_CAP } from '../src/lib/niche.mjs';

export const ACCESS = /\b(airport|flight|fly|flies|flown|drive|driving|transfer|train|ferry|boat|helicopter|road|reached|reach|getting there|minutes|hours|km|kilomet|miles?)\b/i;
export function practicality(d, body) {
  return (d.bookingUrl && !d.closure ? 1 : 0) + (d.seasonalInfo?.bestTime ? 1 : 0) + (d.checkInOut ? 0.5 : 0) + (ACCESS.test(body) ? 0.5 : 0);
}
export const score = (setting, stay, pract, scope) => Math.min(Math.round((3.5 + 0.7 * (setting + stay + pract)) * 10) / 10, SCORE_CAP[scope]);

if (process.argv[1]?.endsWith('rescore.mjs')) {
  const inputs = JSON.parse(readFileSync('data/audit-niche/score-inputs.json', 'utf8'));
  const out = {};
  for (const [slug, i] of Object.entries(inputs)) {
    if (slug.startsWith('_')) continue;
    const path = `src/content/hotels/${slug}.md`;
    const t = readFileSync(path, 'utf8');
    const m = t.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const d = parse(m[1]);
    const pr = practicality(d, m[2]);
    const rating = score(i.setting, i.stay, pr, d.niche_scope);
    out[slug] = { was: d.rating, setting: i.setting, stay: i.stay, practicality: pr, uncapped: Math.round((3.5 + 0.7 * (i.setting + i.stay + pr)) * 10) / 10, ceiling: SCORE_CAP[d.niche_scope], rating, why: i.why };
    if (!process.argv.includes('--dry')) writeFileSync(path, t.replace(/^rating:.*$/m, `rating: ${rating}`));
  }
  if (!process.argv.includes('--dry')) writeFileSync('data/audit-niche/score-recalc.json', JSON.stringify(out, null, 1));
  console.table(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { was: v.was, S: v.setting, St: v.stay, P: v.practicality, now: v.rating, cap: v.ceiling }])));
}
