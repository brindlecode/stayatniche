/** Programmatic roundup pages (by country, and category × country) for every locale. */
import { SITE, slugify } from '../lib/site';
import { i18n, countryName, categorySlug, localePath, LOCALES, type Locale } from './index';
import { localized } from './content';

/**
 * A roundup page that lists fewer stays than this is built (its URL keeps working) but is thin:
 * noindex, out of the sitemap and out of the hreflang sets of its other languages.
 */
export const MIN_INDEXABLE = 3;

export const countrySlug = (locale: Locale, country: string) => slugify(countryName(locale, country));
export const bestSlug = (locale: Locale, cat: string, country: string) =>
  slugify(i18n(locale).t.best.slug(categorySlug(locale, cat), countrySlug(locale, country)));

/** Countries with ≥2 stays in this locale: [{ country (English), slug, hs }]. */
export async function countryGroups(locale: Locale) {
  const hotels = await localized('hotels', locale);
  const by = new Map<string, typeof hotels>();
  for (const h of hotels) by.set(h.en.country, [...(by.get(h.en.country) ?? []), h]);
  return [...by.entries()].filter(([, hs]) => hs.length >= 2).map(([country, hs]) => ({ country, slug: countrySlug(locale, country), hs }));
}

/** Category × country pairs with ≥2 stays in this locale. */
export async function bestGroups(locale: Locale) {
  const hotels = await localized('hotels', locale);
  const cats = await localized('categories', locale);
  const L = i18n(locale);
  const groups = new Map<string, { cat: string; country: string; hs: typeof hotels }>();
  for (const h of hotels) {
    const k = `${h.data.category}|${h.en.country}`;
    const g = groups.get(k) ?? { cat: h.data.category, country: h.en.country, hs: [] as typeof hotels };
    g.hs.push(h); groups.set(k, g);
  }
  return [...groups.values()].filter((g) => g.hs.length >= 2).map((g) => {
    const c = cats.find((x) => x.slug === g.cat);
    return { ...g, catTitle: L.cat(g.cat, c?.data.title ?? g.cat.replace(/-/g, ' ')), slug: bestSlug(locale, g.cat, g.country) };
  });
}

/**
 * Language versions of a country / best page (only locales where it exists). `indexable` is false for a
 * version that lists fewer than MIN_INDEXABLE stays: the language menu still links to it, hreflang does not.
 */
export async function roundupAlternates(kind: 'countries' | 'best', country: string, cat?: string) {
  const out: { locale: string; href: string; indexable: boolean }[] = [];
  for (const l of LOCALES as Locale[]) {
    const list = kind === 'countries' ? await countryGroups(l) : await bestGroups(l);
    const hit = list.find((g: any) => g.country === country && (!cat || g.cat === cat));
    if (hit) out.push({ locale: l, href: localePath(l, kind, hit.slug), indexable: hit.hs.length >= MIN_INDEXABLE });
  }
  return out;
}
export { SITE };
