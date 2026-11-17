// Writes data/pipeline/STATUS.md: where every candidate is waiting, what the last run of each
// stage did, and anything that needs a person. Also prints warnings to the workflow summary.
import { writeFileSync, existsSync } from 'node:fs';
import { loadQueue, publishedHotels, isLiveHotel, STATUSES, UNDECIDED, runLog, INBOX, packPath, catOf } from './lib.mjs';
import { CATEGORIES } from './categories.mjs';
import { excludedName } from './priorities.mjs';

const q = Object.values(loadQueue());
const all = publishedHotels();
const pub = all.filter(isLiveHotel);
const drafts = all.filter(h => h.status === 'draft');
const n = (f) => q.filter(f).length;
const days = (iso) => iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400000) : null;

const und = q.filter(c => UNDECIDED.includes(c.status));
const havePack = existsSync(INBOX);
const waitingClassifier = havePack ? und.filter(c => !c.haiku && existsSync(packPath(c.id))).length : null;
const noSite = und.filter(c => !c.website && !c.wikidata && !excludedName(c));
const fetchFailed = und.filter(c => c.noEvidence && (c.website || c.wikidata));
const toFetch = und.filter(c => (c.website || c.wikidata) && !c.lastEvidence);
const classified = q.filter(c => c.status === 'classified');
const lastReview = q.map(c => c.reviewedAt).filter(Boolean).sort().pop();
const blocked = q.filter(c => c.status === 'blocked');
const why = {}; for (const c of fetchFailed) { const k = (c.noEvidenceWhy ?? 'neden kaydedilmemiş (eski kayıt)').replace(/: 0 .*/, ': bağlantı yok'); why[k] = (why[k] ?? 0) + 1; }

const stages = [
  ['Resmi sitesi bilinmiyor (site bulucu sırasında)', noSite.length, `aranan: ${n(c => c.siteSearchAt)}, bulunan: ${n(c => c.websiteSource === 'search')}`],
  ['Sitesi var, kanıt indirilecek (gece işi)', toFetch.length, ''],
  ['Site okunamadı, 30 günde bir yeniden denenir (3 denemede elenir)', fetchFailed.length, Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join('; ')],
  ['Kanıtı hazır, sınıflandırıcıyı bekliyor', waitingClassifier ?? 'bilinmiyor (kanıt klasörü yok)', ''],
  ['**Sizin kararınızı bekliyor (onay kuyruğu)**', classified.length, `araştırma istenen: ${classified.filter(c => c.research && !c.research.doneAt).length}; son kararınız: ${lastReview ? lastReview.slice(0, 10) : 'yok'}`],
  ['Onaylı, yazarı bekliyor', n(c => c.status === 'approved'), ''],
  ['Onaylı ama yazılamadı (kanıt yetersiz)', blocked.length, `yeni kanıt bekleyen: ${blocked.filter(c => c.blocked?.retry).length}`],
  ['Taslak sayfası hazır, "yayınla" bekliyor', n(c => c.status === 'drafted'), ''],
  ['Yayında (bu hattan)', n(c => c.status === 'published'), ''],
  ['Elendi / tekrar', n(c => c.status === 'rejected' || c.status === 'duplicate'), ''],
];

const log = runLog();
const warnings = [];
// Did the last change to the site really go live? (pipeline/deploy-check.mjs, run just before this)
const dep = log.deploy;
const deployLine = !dep ? '⚪ **Canlı yayın:** kontrol edilmedi (bu çalışmada deploy-check çalışmadı).'
  : dep.state === 'live' ? `✅ **Canlı yayın:** son site değişikliği canlıda (${dep.expected}).`
  : dep.state === 'pending' ? `🟡 **Canlı yayın:** ${dep.why}.`
  : dep.state === 'failed' ? `❌ **Canlı yayın BAŞARISIZ:** ${dep.why}. Netlify'daki yayın kaydına bakın.`
  : `⚪ **Canlı yayın:** ${dep.why}.`;
if (dep?.state === 'failed') warnings.unshift(`Canlı yayın: ${dep.why}.`);
for (const [stage, r] of Object.entries(log)) if (r.ok === false) warnings.push(`"${stage}" aşaması son çalışmasında hata verdi: ${r.error ?? JSON.stringify(r.brokenFiles ?? r)}`);
for (const [stage, max] of [['apply', 2], ['evidence', 2], ['reviews', 3], ['batches', 3]]) {
  const d = days(log[stage]?.at);
  if (d != null && d > max) warnings.push(`"${stage}" aşaması ${d} gündür çalışmadı.`);
}
if (classified.length > 100 && (days(lastReview) ?? 999) > 7) warnings.push(`Onay kuyruğunda ${classified.length} otel bekliyor ve son karar ${lastReview ? lastReview.slice(0, 10) : 'hiç'} tarihli. Hattın geri kalanı bu kararları bekliyor.`);
if (n(c => c.status === 'approved') > 0 && (days(log.writer?.at) ?? 999) > 3) warnings.push('Onaylı oteller var ama yazar 3 günden uzun süredir sonuç kaydetmedi.');
const orphanDrafted = q.filter(c => ['drafted', 'published'].includes(c.status) && c.slug && !all.some(h => h.slug === c.slug));
if (orphanDrafted.length) warnings.push(`Kuyrukta sayfası var görünen ama dosyası olmayan ${orphanDrafted.length} kayıt: ${orphanDrafted.slice(0, 5).map(c => c.slug).join(', ')}`);

const rows = Object.keys(CATEGORIES).map(cat => {
  const inCat = q.filter(c => catOf(c) === cat);
  return `| ${cat} | ${STATUSES.map(s => inCat.filter(c => c.status === s).length).join(' | ')} |`;
});
const fmt = (r) => Object.entries(r).filter(([k]) => k !== 'at' && k !== 'ok').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');

writeFileSync('data/pipeline/STATUS.md', [
  deployLine, '',
  '# Otel hattı durumu', '',
  `Güncelleme: ${new Date().toISOString()}. Kuyrukta ${q.length} aday. Sitede yayında ${pub.length} otel, ${drafts.length} taslak (${all.length} dosya).`, '',
  '## Dikkat', '', ...(warnings.length ? warnings.map(w => `- ⚠️ ${w}`) : ['- Sorun görünmüyor.']), '',
  '## Adaylar nerede bekliyor', '', '| Aşama | Aday | Not |', '|---|---|---|', ...stages.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`), '',
  ...(blocked.length ? ['## Yazılamayanlar', '', '| Otel | Neden | Deneme |', '|---|---|---|', ...blocked.map(c => `| ${c.name} | ${String(c.blocked?.reason ?? '').replace(/\|/g, '/')} | ${c.blocked?.tries ?? 0}${c.blocked?.retry ? '' : ' (bekliyor: sizin kararınız)'} |`), ''] : []),
  '## Son çalışmalar', '', '| Aşama | Zaman (UTC) | Sonuç |', '|---|---|---|',
  ...Object.entries(log).sort((a, b) => b[1].at.localeCompare(a[1].at)).map(([s, r]) => `| ${s} | ${r.at.slice(0, 16).replace('T', ' ')} | ${r.ok === false ? '❌ ' : ''}${fmt(r).replace(/\|/g, '/').slice(0, 400)} |`), '',
  '## Kategoriye göre', '', `| Kategori | ${STATUSES.join(' | ')} |`, `|---|${STATUSES.map(() => '---').join('|')}|`, ...rows, '',
].join('\n'));
console.log(`status written; ${warnings.length} warning(s)`);
for (const w of warnings) console.log(`::warning::${w}`);
