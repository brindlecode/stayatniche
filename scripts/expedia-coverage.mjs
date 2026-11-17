/**
 * What does each published hotel's booking button do? Exact Expedia page (earns commission),
 * Expedia search (generic), or the hotel's own site only. Usage: node scripts/expedia-coverage.mjs [--list]
 * The rules mirror hotelDealUrl() in src/lib/affiliate.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
const map = JSON.parse(readFileSync('src/data/expedia-hotels.json', 'utf8'));
const dir = 'src/content/hotels/';
const out = { exact: [], search: [], official: [] };
for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
  const fm = readFileSync(dir + f, 'utf8').split('---')[1];
  if (((fm.match(/^status:\s*"?(\w*)/m) || [])[1] || 'published') !== 'published') continue; // a missing status means published
  const slug = f.replace(/\.md$/, '');
  const book = (fm.match(/^bookingUrl:\s*"?([^"\n]*)"?/m) || [])[1] || '';
  (map[slug] ? out.exact : /(^|\/\/|\.)(expedia|booking)\.com/.test(book) ? out.search : out.official).push(slug);
}
const total = out.exact.length + out.search.length + out.official.length;
console.log(`published ${total}: exact Expedia page ${out.exact.length} (${(100 * out.exact.length / total).toFixed(1)}%), Expedia search ${out.search.length}, official site only ${out.official.length}`);
if (process.argv.includes('--list')) for (const k of ['search', 'official']) console.log(`\n${k}:\n  ${out[k].join('\n  ')}`);
