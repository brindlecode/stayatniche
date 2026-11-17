/**
 * Exact Expedia pages for candidates, checked the way src/data/expedia-verification.json was built
 * (docs/EXPEDIA-COVERAGE.md): web search on expedia.com only; a page counts only when the search
 * result itself shows an expedia.com property URL whose name and place match the candidate.
 * Expedia is never fetched directly and a URL is never built or guessed.
 * Records go to data/pipeline/expedia-candidates.json, keyed by candidate id, in the same format
 * as src/data/expedia-verification.json. writer-result.mjs copies a confirmed one to the site files
 * when the stay gets its page.
 *
 *   node pipeline/expedia-check.mjs todo [max=60]     candidates on the shortlist (or next in rank) with
 *                                                     no record younger than 90 days -> data/pipeline/expedia-todo.json
 *   node pipeline/expedia-check.mjs apply <file>      results [{ id, status, url?, expediaTitle?, evidence, notes? }]
 *        status: confirmed (url required) | not_found | unconfirmed. A confirmed result whose URL is not an
 *        expedia.com property page, or whose name part shares no distinctive word with the stay, is stored as
 *        "unconfirmed" with the reason.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadQueue, today, report } from './lib.mjs';
import { tokens } from './identity.mjs';
import { countryOf } from './priorities.mjs';

export const PAGE = /^https:\/\/www\.expedia\.com\/([A-Za-z0-9-]+)-Hotels-([A-Za-z0-9-]+)\.h(\d+)\.Hotel-Information$/;
const FILE = 'data/pipeline/expedia-candidates.json';
const TODO = 'data/pipeline/expedia-todo.json';
const read = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const [cmd, arg] = process.argv.slice(2);
const records = read(FILE, {});
const q = loadQueue();

if (cmd === 'todo') {
  const max = +(arg ?? 60);
  const fresh = (r) => r && Date.now() - Date.parse(r.verifiedAt) < 90 * 86400000;
  const list = read('data/pipeline/shortlist.json', { items: [] }).items.map(x => q[x.id]).filter(Boolean)
    .filter(c => !fresh(records[c.id])).slice(0, max)
    .map(c => ({ id: c.id, name: c.name, town: c.city ?? null, region: c.region ?? null, country: countryOf(c), website: c.website ?? null }));
  writeFileSync(TODO, JSON.stringify(list, null, 1) + '\n');
  report('expedia-todo', { ok: true, todo: list.length });
} else if (cmd === 'apply') {
  const rows = read(arg, null);
  if (!Array.isArray(rows)) { console.error(`usage: node pipeline/expedia-check.mjs apply <results.json>  (${arg} is not a JSON list)`); process.exit(1); }
  const tally = { confirmed: 0, not_found: 0, unconfirmed: 0, unknownId: 0 };
  const ids = new Map(Object.entries(records).filter(([, r]) => r.status === 'confirmed').map(([k, r]) => [r.url.match(/\.h(\d+)\./)?.[1], k]));
  for (const r of rows) {
    const c = q[r?.id];
    if (!c) { tally.unknownId++; continue; }
    let status = ['confirmed', 'not_found', 'unconfirmed'].includes(r.status) ? r.status : 'unconfirmed';
    const note = [r.notes ?? r.note].filter(Boolean);
    let url = null;
    if (status === 'confirmed') {
      const u = String(r.url ?? '').replace(/[?#].*$/, '');
      const m = u.match(PAGE);
      const nameWords = new Set(tokens((m?.[2] ?? '').replace(/-/g, ' ')));
      if (!m) { status = 'unconfirmed'; note.push(`not an expedia.com property page URL: ${u || 'none'}`); }
      else if (!tokens(c.name).some(t => nameWords.has(t))) { status = 'unconfirmed'; note.push(`URL name "${m[2]}" shares no word with "${c.name}"`); }
      else if (String(r.evidence ?? '').trim().length < 10) { status = 'unconfirmed'; note.push('no evidence text'); }
      else if (ids.has(m[3]) && ids.get(m[3]) !== c.id) { status = 'unconfirmed'; note.push(`same Expedia id as ${ids.get(m[3])}`); }
      else { url = u; ids.set(m[3], c.id); }
    }
    records[c.id] = {
      status, method: r.method === 'web-search-url-id-title-location' ? r.method : 'web-search-title-location', verifiedAt: today(),
      ...(url ? { url, expediaTitle: r.expediaTitle ?? null } : {}), evidence: r.evidence ?? null, ...(note.length ? { notes: note.join('; ') } : {}),
    };
    tally[status]++;
  }
  writeFileSync(FILE, JSON.stringify(Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
  report('expedia', { ok: true, ...tally, records: Object.keys(records).length });
} else {
  console.error('usage: node pipeline/expedia-check.mjs todo [max] | apply <results.json>'); process.exit(1);
}
