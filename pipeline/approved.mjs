/**
 * Lists approved candidates (ready for the writer) in cell priority order, and says what the
 * writer has to work with: pages fetched from the official site and characters of Wikipedia text.
 * Candidates the writer already gave up on are "blocked", not listed here (see STATUS.md).
 * Usage: node pipeline/approved.mjs [max=20]
 */
import { loadQueue, packName, loadPack } from './lib.mjs';
import { cellRanker, countryOf } from './priorities.mjs';

const q = loadQueue();
const rank = cellRanker(q);
const list = Object.values(q).filter(c => c.status === 'approved')
  .sort((a, b) => rank({ ...a, category: a.finalCategory }) - rank({ ...b, category: b.finalCategory }));
for (const c of list.slice(0, +(process.argv[2] ?? 20))) {
  const p = loadPack(c.id);
  const ev = p ? `${p.pages?.filter(x => x.text).length ?? 0} pages, ${(p.wikipedia?.text ?? p.wikipedia?.extract ?? '').length} wiki chars` : 'NO PACK';
  console.log([c.id, packName(c.id), c.finalCategory, countryOf(c), c.name, ev].join('\t'));
}
console.log(`${list.length} approved in total`);
