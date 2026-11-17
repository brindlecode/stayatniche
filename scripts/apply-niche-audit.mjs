/**
 * Writes the niche audit (data/audit-niche/batch-*.json) into the hotel pages:
 * niche_scope / niche_feature / niche_source_url / niche_verified_at, the structured `location`,
 * a new category, status draft, the score ceiling, and removes unsourced reviewCount.
 * Idempotent. Redirects for drafted stays are written by scripts/draft-redirects.mjs.
 * Usage: node scripts/apply-niche-audit.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { NICHE_SCOPES, SCORE_CAP } from '../src/lib/niche.mjs';

const DRY = process.argv.includes('--dry');
const AUDIT_DAY = '2026-11-17';
const CATEGORIES = readdirSync('src/content/categories').map(f => f.replace(/\.md$/, ''));

// Legacy `country` strings -> ISO 3166-1 alpha-2 + official English country name.
const COUNTRY = {
  USA: 'US', 'United States': 'US', UK: 'GB', 'United Kingdom': 'GB', England: 'GB', Scotland: 'GB', Wales: 'GB',
  'Northern Ireland': 'GB', UAE: 'AE', Turkey: 'TR', 'St. Lucia': 'LC', Czechia: 'CZ', Laos: 'LA', Vietnam: 'VN',
};
const NAMES = { GB: 'United Kingdom', US: 'United States', TR: 'Turkey', AE: 'United Arab Emirates', LC: 'Saint Lucia', CZ: 'Czechia', LA: 'Laos', VN: 'Vietnam', PF: 'French Polynesia' };
const UK_NATIONS = new Set(['England', 'Scotland', 'Wales', 'Northern Ireland']);
const regions = new Intl.DisplayNames(['en'], { type: 'region' });
const byName = new Map();
for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) { const c = String.fromCharCode(a, b); try { const n = regions.of(c); if (n && n !== c) byName.set(n.toLowerCase(), c); } catch { /* not a region */ } }
const codeOf = (country) => COUNTRY[country] ?? byName.get(country.toLowerCase());

const fm = (t) => { const m = t.match(/^---\n([\s\S]*?)\n---/); return m ? parse(m[1]) : {}; };
const q = (s) => JSON.stringify(String(s));
const strip = (v, ...bad) => { const s = (v ?? '').toString().trim(); return s && !bad.some(b => b && s.toLowerCase() === b.toLowerCase()) ? s : null; };

const records = new Map();
for (const f of readdirSync('data/audit-niche').filter(f => /^batch-\d+\.json$/.test(f)).sort()) {
  for (const r of JSON.parse(readFileSync(`data/audit-niche/${f}`, 'utf8'))) records.set(r.slug, r);
}

const out = { applied: 0, moved: [], drafted: [], capped: [], noRecord: [], issues: [] };
for (const file of readdirSync('src/content/hotels').filter(f => f.endsWith('.md'))) {
  const slug = file.replace(/\.md$/, '');
  const path = `src/content/hotels/${file}`;
  let t = readFileSync(path, 'utf8');
  const d = fm(t);
  const live = (d.status ?? 'published') === 'published';
  const r = records.get(slug);
  if (!r) { if (live) out.noRecord.push(slug); continue; }

  // Which category does the verdict leave it in?
  let category = d.category;
  if (r.verdict === 'move') {
    if (!CATEGORIES.includes(r.new_category)) { out.issues.push(`${slug}: bad new_category ${r.new_category}`); continue; }
    category = r.new_category;
  }
  const draft = r.verdict === 'draft';
  if (draft && !CATEGORIES.includes(r.closest_category)) out.issues.push(`${slug}: draft without a valid closest_category`);
  if (!NICHE_SCOPES.includes(r.niche_scope)) { out.issues.push(`${slug}: bad niche_scope ${r.niche_scope}`); continue; }
  const scope = r.niche_scope;
  const sourceUrl = scope === 'unverified' ? (r.source_url && /^https?:\/\//.test(r.source_url) ? r.source_url : null) : r.source_url;
  if (scope !== 'unverified' && !/^https?:\/\//.test(sourceUrl ?? '')) { out.issues.push(`${slug}: verified scope without source url`); continue; }

  // location
  // Multi-country rail journeys: the route's departure country (the page names the route).
  const multi = d.country === 'Multiple';
  const code = multi ? 'GB' : codeOf(d.country);
  if (!code) { out.issues.push(`${slug}: no ISO code for country "${d.country}"`); continue; }
  const countryName = NAMES[code] ?? regions.of(code);
  const rl = r.location ?? {};
  let region = strip(rl.region, countryName, d.country);
  if (!region && UK_NATIONS.has(d.country)) region = d.country;
  const city = strip(rl.city, countryName, d.country);
  const locality = multi ? 'London to Venice (multi-country rail route)' : strip(rl.locality, countryName, d.country, city ?? '');
  const lines = ['location:', `  country: ${q(countryName)}`, `  countryCode: ${q(code)}`];
  if (region) lines.push(`  region: ${q(region)}`);
  if (city) lines.push(`  city: ${q(city)}`);
  if (locality) lines.push(`  locality: ${q(locality)}`);
  if (d.coordinates?.lat != null) lines.push('  coordinates:', `    lat: ${d.coordinates.lat}`, `    lng: ${d.coordinates.lng}`);
  const niche = [
    `niche_scope: ${scope}`,
    `niche_feature: ${q(r.niche_feature)}`,
    ...(sourceUrl ? [`niche_source_url: ${q(sourceUrl)}`] : []),
    `niche_verified_at: ${AUDIT_DAY}`,
  ];

  // Remove earlier audit output, then re-add (idempotent).
  const [, head, body] = t.match(/^(---\n[\s\S]*?\n)---\n([\s\S]*)$/);
  let h = head;
  h = h.replace(/^(niche_scope|niche_feature|niche_source_url|niche_verified_at):.*\n/gm, '');
  h = h.replace(/^location:\n(?:[ ]{2,}.*\n)+/m, '');
  h = h.replace(/^reviewCount:.*\n/m, '');
  if (category !== d.category) h = h.replace(/^category:.*$/m, `category: ${category}`);
  if (draft) h = /^status:/m.test(h) ? h.replace(/^status:.*$/m, 'status: draft') : h + 'status: draft\n';
  // score ceiling
  const cap = SCORE_CAP[scope];
  if (d.rating > cap) { h = h.replace(/^rating:.*$/m, `rating: ${cap}`); out.capped.push(`${slug} ${d.rating}->${cap}`); }
  h += lines.join('\n') + '\n' + niche.join('\n') + '\n';
  t = `${h}---\n${body}`;
  if (!DRY) writeFileSync(path, t);
  out.applied++;
  if (category !== d.category) out.moved.push(`${slug}: ${d.category} -> ${category}`);
  if (draft && live) out.drafted.push(`${slug}: closest ${r.closest_category}`);
}
console.log(JSON.stringify(out, null, 1));
