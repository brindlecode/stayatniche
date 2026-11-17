/**
 * Writes the translated "which rooms qualify" sentence (data/niche-i18n/<lang>.json, {slug: text})
 * into src/content/translations/<lang>/hotels/<slug>.md as `niche_feature`. Idempotent.
 * Usage: node scripts/apply-niche-i18n.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
let n = 0, missing = [];
for (const lang of ['de', 'fr', 'es', 'it', 'nl']) {
  const file = `data/niche-i18n/${lang}.json`;
  if (!existsSync(file)) { missing.push(lang); continue; }
  for (const [slug, text] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) {
    const path = `src/content/translations/${lang}/hotels/${slug}.md`;
    if (!existsSync(path)) { missing.push(`${lang}/${slug}`); continue; }
    const t = readFileSync(path, 'utf8');
    const m = t.match(/^(---\n[\s\S]*?\n)---\n/);
    const head = m[1].replace(/^niche_feature:.*\n/m, '');
    writeFileSync(path, `${head}niche_feature: ${JSON.stringify(text)}\n---\n${t.slice(m[0].length)}`);
    n++;
  }
}
console.log(`${n} translated niche_feature written; missing: ${missing.join(', ') || 'none'}`);
