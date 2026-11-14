/**
 * Lists candidates that have no website and no Wikidata item, so no evidence can be fetched
 * for them. The classifier routine looks each one up with web search (site-finder subagent)
 * and writes the result next to this list; pipeline/apply-websites.mjs checks and stores it.
 * Order: candidates the owner already approved first, then cell priority, then score.
 * Writes data/pipeline/decisions/<run>/sites-todo.json.
 * Usage: node pipeline/needs-website.mjs <run> [max=20]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadQueue, DECISIONS, UNDECIDED, catOf, report } from './lib.mjs';
import { cellRanker, countryOf, excludedName } from './priorities.mjs';

const [run, max = 20] = process.argv.slice(2);
if (!run) { console.error('usage: node pipeline/needs-website.mjs <run> [max]'); process.exit(1); }
const q = loadQueue();
const rank = cellRanker(q);
const open = (c) => !c.website && !c.siteSearchAt && !excludedName(c);
const owner = Object.values(q).filter(c => ['approved', 'blocked'].includes(c.status) && open(c));
const rest = Object.values(q).filter(c => UNDECIDED.includes(c.status) && !c.wikidata && open(c))
  .sort((a, b) => rank(a) - rank(b) || (b.score ?? 0) - (a.score ?? 0));
const take = [...owner, ...rest].slice(0, +max).map(c => ({ id: c.id, name: c.name, city: c.city ?? null, region: c.region ?? null, country: countryOf(c), category: c.finalCategory ?? catOf(c), lat: c.lat, lng: c.lng }));
mkdirSync(`${DECISIONS}/${run}`, { recursive: true });
writeFileSync(`${DECISIONS}/${run}/sites-todo.json`, JSON.stringify(take, null, 1) + '\n');
report('sites-todo', { ok: true, withoutWebsite: owner.length + rest.length, taken: take.length });
console.log(`-> ${DECISIONS}/${run}/sites-todo.json`);
