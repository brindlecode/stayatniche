/**
 * Pre-screen and ranking rules for candidates waiting for the owner (status "classified").
 * Pure functions: no file access, so the tests can call them directly. The scripts that use
 * them are pipeline/prescreen.mjs (rules) and pipeline/shortlist.mjs (ranking).
 * The rules are the ones applied by hand on 2026-11-15 (81 rejected, 37 sent for research),
 * written down in docs/pipeline/CLASSIFIER.md, "Pre-screen rules".
 */
import { CATEGORIES } from './categories.mjs';

// Closed for good. Seasonal closures are not this (see SEASONAL_CLOSURE).
export const CLOSED = /permanently closed|we have (now )?closed( our doors)?( for good| permanently)?\b(?! for the (season|winter|summer))|no longer (open|operating|accepting (guests|bookings|reservations))|closed (for good|permanently|down for good)|this (hotel|property|lodge|camp) (has|is) (now )?(permanently )?closed(?! for the)|ceased trading|definitivamente cerrado|définitivement fermé|dauerhaft geschlossen|endgültig geschlossen/i;
export const SEASONAL_CLOSURE = /closed for the (season|winter|summer)|temporarily closed|closed until (further notice|spring|summer|\d{4})|reopen(ing|s)? in (spring|summer|\d{4})|winter break|saisonpause|fermé pour la saison/i;

// What the category needs to be proven, and the one-sentence reason when it is not.
export const PROOF = {
  'treehouse-hotels': 'Ağaç evin ağaçların arasında, yerden yüksek ve ayrı bir yapı olduğu kaynakta yazmıyor.',
  'cave-hotels': 'Odaların kayaya oyulmuş ya da bir mağaranın içinde olduğu kaynakta yazmıyor.',
  'underwater-rooms': 'Odanın su altında olduğu kaynakta yazmıyor.',
  'castle-hotels': 'Konukların tarihî kale binasının içinde kaldığı kaynakta kanıtlanmamış.',
  'floating-hotels': 'Konaklamanın su üzerinde yüzen bir yapıda olduğu kaynakta yazmıyor.',
  'bubble-hotels': 'Kubbenin şeffaf olduğu kaynakta yazmıyor; balon/cam kubbe özelliği kanıtlanmamış.',
  'cliffside-hotels': 'Odaların uçurum yüzeyinde ya da kenarında olduğu kaynakta yazmıyor; yalnızca konum ya da isim.',
  'desert-camps': 'Konaklamanın çölde bir kamp ya da lodge olduğu kaynakta yazmıyor.',
  'jungle-lodges': 'Yağmur ormanı içinde olduğu kanıtlanmamış; orman vurgusu yalnızca tanıtım cümlesinde.',
  'ice-hotels': 'Odaların buzdan/kardan ya da cam iglo olduğu kaynakta yazmıyor.',
  'safari-lodges': 'Koruma alanında oyun sürüşü (safari) sunan bir lodge olduğu kaynakta yazmıyor.',
  'overwater-bungalows': 'Bungalovların suyun üzerinde olduğu kaynakta yazmıyor.',
  'lighthouse-hotels': 'Konukların fener binasında ya da bekçi evinde kaldığı kaynakta yazmıyor; yalnızca adı ve teması fener.',
  'train-hotels': 'Konaklamanın gerçek bir vagon ya da tren içinde olduğu kaynakta yazmıyor.',
};

// Treehouse rule (site owner, 2026-11-15): among trees, raised off the ground, a separate structure.
// Evidence of how the units are built; without it a treehouse goes to research, never to the shortlist.
export const TREEHOUSE_BUILD = /\b(in|among|amongst|into|around|between) (the )?(tree|trees|treetops?|branches|canopy|crowns?)\b|\bstilts?\b|\bpillars?\b|\bposts\b|\bpiles\b|(above|off) the (ground|forest floor)|\b\d+(\.\d+)? ?(m|metres|meters|ft|feet) (high|up|above)|\bperched\b|\bsuspended\b|\belevated\b|\braised\b|\bup in the (air|branches|canopy)\b|\bbuilt (around|into|on) (a|an|the|two|three) [a-z ]{0,20}tree|\btree trunk|\bbaumkrone|\bstelzen|\bim baum|\bin den bäumen|\bdans les arbres|\bperchée?s?\b|\bpilotis\b|\bsur pieds?\b/i;
export const TREEHOUSE_NOT = /\b(multi-?storey|multi-?story|apartment block|hotel block|villa block|room in (the|a) (main )?(building|house))\b/i;

/** Text of the operator's own pages in an evidence pack (Wikipedia excluded). */
export const siteText = (pack) => (pack?.pages ?? []).map(p => [p.title, p.description, p.text, ...(p.captions ?? [])].filter(Boolean).join(' ')).join('\n');
const squash = (s = '') => s.toLowerCase().normalize('NFKC').replace(/[’‘`´]/g, "'").replace(/[“”«»„]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
/** Is the category quote on the operator's own site (not only in Wikipedia)? */
export const quoteOnOwnSite = (d, pack) => !!(d?.category_quote && squash(siteText(pack)).includes(squash(d.category_quote)));

/**
 * One candidate -> { action: 'keep' | 'reject' | 'research', rule, reason }.
 * d = its checked decision (checked.json entry), pack = its evidence pack or null, c = queue entry.
 * The order matters: the first rule that fits decides.
 */
export function screen(c, d, pack) {
  const flags = d?.red_flags ?? [];
  const conf = d?.confidence ?? c.haiku?.confidence ?? 0;
  const cat = d ? d.category ?? null : c.haiku?.category ?? null; // the decision's own answer, even when it is "none"
  const scope = d?.niche_scope ?? c.haiku?.scope ?? 'unclear';
  const op = d?.operating_status ?? 'unknown';
  const own = siteText(pack);
  const researched = !!c.research?.doneAt;
  const research = (rule, reason) => researched
    ? { action: 'keep', rule: `${rule}-after-research`, reason: `Araştırıldı, hâlâ belirsiz: ${reason}` }
    : { action: 'research', rule, reason };

  if (!d) return { action: 'keep', rule: 'no-decision-file', reason: 'Sınıflandırma kaydı bulunamadı; elle bakılmalı.' };
  // 1. Closed for good.
  if (op === 'closed' || CLOSED.test(own.slice(0, 40000)) || CLOSED.test(pack?.wikipedia?.extract ?? '')) {
    return { action: 'reject', rule: 'closed', reason: 'Kaynağa göre tesis kalıcı olarak kapanmış.' };
  }
  // 2. Fits none of the 14 categories.
  if (!cat || !CATEGORIES[cat]) {
    const what = d.other_niche_type ? ` (${d.other_niche_type})` : '';
    return { action: 'reject', rule: 'no-category', reason: `14 kategoriden hiçbirine uymuyor${what}; niş özelliği listedeki kategorilerde kanıtlanmadı.` };
  }
  // 3. The niche is only a name or a theme.
  if (scope === 'name_only' || (flags.includes('theme_only') && conf < 0.6)) {
    return { action: 'reject', rule: 'name-only', reason: `Niş yalnızca isimde ya da temada; ${PROOF[cat].charAt(0).toLowerCase()}${PROOF[cat].slice(1)}` };
  }
  // 4. No proof of the niche feature: the classifier itself found the evidence thin and the site is
  //    readable and open, so a second read would see the same pages.
  if (scope === 'unclear' && conf < 0.5 && op === 'open' && !researched && own.length > 0) {
    return { action: 'reject', rule: 'no-proof', reason: PROOF[cat] };
  }
  if (flags.includes('chain_generic') && conf <= 0.5) {
    return { action: 'reject', rule: 'no-proof', reason: `Zincir markalı standart bir tesis; ${PROOF[cat].charAt(0).toLowerCase()}${PROOF[cat].slice(1)}` };
  }
  // 5. Treehouse rule.
  if (cat === 'treehouse-hotels') {
    const said = `${d.category_quote ?? ''} ${d.niche_feature ?? ''} ${own}`;
    if (TREEHOUSE_NOT.test(`${d.niche_feature ?? ''} ${d.reason ?? ''}`)) return { action: 'reject', rule: 'treehouse', reason: 'Ağaç ev kuralı: birimler ayrı duran bir yapı değil (çok katlı bina, villa ya da otel odası).' };
    if (!TREEHOUSE_BUILD.test(said)) return research('treehouse', 'Ağaç ev kuralı: birimlerin nasıl inşa edildiği (ağaca bağlı ya da direkler üzerinde) kaynakta yazmıyor.');
  }
  // 6. Thin evidence: worth one more read.
  if (!pack) return research('no-pack', 'Kanıt paketi yok; otelin sitesi yeniden okunmalı.');
  if (!own.trim()) return research('no-own-site', 'Kanıt yetersiz: otelin kendi sitesi okunamadı, elde yalnızca Wikipedia/harita bilgisi var.');
  if (!d.category_quote) return research('no-quote', 'Kanıt yetersiz: niş özelliğini gösteren bir cümle kaynakta bulunamadı.');
  if (scope === 'unclear') return research('unclear-scope', 'Kanıt yetersiz: niş özelliğinin kapsamı kaynakta net değil.');
  if (op === 'unknown' && conf <= 0.65) return research('status-unknown', 'Kanıt yetersiz: tesisin şu an açık olduğu ve niş özelliği kaynakta yeterince net değil.');
  if ((flags.includes('closed_hint') || SEASONAL_CLOSURE.test(own.slice(0, 40000))) && op !== 'open') return research('closure-hint', 'Kanıt yetersiz: sitede kapanış ya da uzun ara notu var; tesisin şu an açık olduğu net değil.');
  return { action: 'keep', rule: 'pass', reason: '' };
}

/**
 * Ranking score for the weekly shortlist (higher first). Parts, in order of weight:
 *   niche_scope whole_property (entire property is the niche)   +30
 *   confidence (0-1)                                             +0..30
 *   category quote found on the operator's own site              +15 (own-site pages with text, no quote there: +5)
 *   under-represented category on the live site                  +0..15 (fewest published = 15)
 *   exact Expedia page confirmed                                 +10 (checked and not found: 0; not checked: +3)
 * Returns { score, parts } so the shortlist can say why a stay is where it is.
 */
export function rank(c, d, pack, ctx) {
  const scope = d?.niche_scope ?? c.haiku?.scope;
  const conf = d?.confidence ?? c.haiku?.confidence ?? 0;
  const cat = d?.category ?? c.haiku?.category;
  const parts = {
    scope: scope === 'whole_property' ? 30 : 0,
    confidence: Math.round(conf * 30),
    ownSite: quoteOnOwnSite(d, pack) ? 15 : siteText(pack).trim() ? 5 : 0,
    category: ctx.catBonus?.[cat] ?? 0,
    expedia: ({ confirmed: 10, not_found: 0 })[ctx.expedia?.[c.id]?.status] ?? 3,
  };
  return { score: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

/** Category bonus: the fewer live pages a category has, the higher (0..15). */
export function categoryBonus(publishedByCat) {
  const counts = Object.keys(CATEGORIES).map(k => publishedByCat[k] ?? 0);
  const max = Math.max(1, ...counts);
  return Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, Math.round(15 * (1 - (publishedByCat[k] ?? 0) / max))]));
}

/** "1 3 5-9, 12" -> [1, 3, 5, 6, 7, 8, 9, 12]. Anything else in the text is ignored. */
export function parseNumbers(text, max = 40) {
  const out = new Set();
  for (const [, a, b] of String(text).matchAll(/(\d+)\s*(?:[-–]\s*(\d+))?/g)) {
    const lo = +a, hi = b ? +b : +a;
    for (let n = Math.min(lo, hi); n <= Math.max(lo, hi) && n - Math.min(lo, hi) < 100; n++) if (n >= 1 && n <= max) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

/** ISO week, e.g. "2026-W47": the shortlist is rebuilt once per week. */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

const cell = (s) => String(s ?? '–').replace(/\|/g, '/').replace(/\n/g, ' ');
/** Markdown table of a shortlist (data/pipeline/shortlist.json); used by shortlist.mjs and status.mjs. */
export function shortlistTable(l) {
  return [
    '| # | Otel | Yer | Kategori | Niş özelliği | Kaynak | Komisyonlu bağlantı | Durum |', '|---|---|---|---|---|---|---|---|',
    ...l.items.map(x => `| ${x.n} | ${cell(x.name)} | ${cell(x.place)} | ${cell(x.catTr)} | ${cell(x.featureTr ?? `(çeviri bekliyor) ${x.feature ?? ''}`)} | ${x.source ? `[${x.sourceKind}](${x.source})` : '–'} | ${x.commission === 'evet' ? `evet ([Expedia](${x.expediaUrl}))` : x.commission} | ${x.state ?? 'bekliyor'} |`),
  ];
}
