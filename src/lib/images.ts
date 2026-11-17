/**
 * Image resolver: zero-cost, zero-hotlink.
 *
 * 1. If the content file's `coverImage` points to a file that exists in /public, use it.
 * 2. Otherwise look for a file named after the slug anywhere under public/images/**
 *    (e.g. public/images/hotels/treehotel-sweden.webp). Drop a picture there and it is
 *    picked up automatically on the next build, no content edits needed.
 * 3. Otherwise a category photo (public/images/categories/<category>.*), if you added one.
 * 4. Otherwise the built-in illustrated poster for the category / continent.
 *
 * External URLs in content are still honoured as-is.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');
const EXT_RANK = ['.avif', '.webp', '.jpg', '.jpeg', '.png'];

// name (no extension) -> public URL, for every user-supplied image
const INDEX = new Map<string, string>();
function scan(dir: string, urlBase: string) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === 'art') continue; // built-in posters
      if (e.name === '_w') continue;  // smaller copies made at build time (scripts/responsive-images.mjs)
      scan(join(dir, e.name), `${urlBase}/${e.name}`);
    } else {
      const ext = extname(e.name).toLowerCase();
      if (!EXT_RANK.includes(ext)) continue;
      const name = basename(e.name, extname(e.name));
      const prev = INDEX.get(name);
      const url = `${urlBase}/${e.name}`;
      if (!prev || EXT_RANK.indexOf(ext) < EXT_RANK.indexOf(extname(prev))) INDEX.set(name, url);
    }
  }
}
scan(join(PUBLIC, 'images'), '/images');

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CATEGORY_ART = new Set([
  'treehouse-hotels', 'cave-hotels', 'underwater-rooms', 'castle-hotels', 'floating-hotels',
  'bubble-hotels', 'cliffside-hotels', 'desert-camps', 'jungle-lodges', 'ice-hotels',
  'safari-lodges', 'overwater-bungalows', 'lighthouse-hotels', 'train-hotels',
]);
const CONTINENT_ART = new Set(['europe', 'asia', 'africa', 'north-america', 'south-america', 'oceania', 'middle-east']);

export interface ImageContext {
  category?: string;
  continent?: string;
  slug?: string;
}

/** Built-in illustrated poster for a context; used as the last resort and as the on-error fallback. */
export function fallbackImage(ctx: ImageContext = {}): string {
  if (ctx.category && CATEGORY_ART.has(ctx.category)) return `/images/art/${ctx.category}.svg`;
  if (ctx.continent) {
    const c = slugify(ctx.continent);
    if (CONTINENT_ART.has(c)) return `/images/art/continent-${c}.svg`;
  }
  return '/images/art/continent-default.svg';
}

export function resolveImage(url: string | undefined, ctx: ImageContext = {}): string {
  // Your own files always win: public/images/**/<slug>.(webp|jpg|png)
  if (ctx.slug && INDEX.has(ctx.slug)) return INDEX.get(ctx.slug)!;
  if (url) {
    if (existsSync(join(PUBLIC, url))) return url;
    // External hotlinks in content files (e.g. old Unsplash URLs) are ignored on purpose:
    // unverified and inconsistent. Add a file under public/images/ instead.
  }
  if (ctx.category && INDEX.has(ctx.category)) return INDEX.get(ctx.category)!;
  if (ctx.continent && INDEX.has(slugify(ctx.continent))) return INDEX.get(slugify(ctx.continent))!;
  return fallbackImage(ctx);
}

/** Kept for API compatibility: images are served as-is (self-hosted). */
export function sizedImage(url: string, _width: number): string {
  return url;
}

/**
 * A photo that genuinely belongs to this item (never a shared category image).
 * Returns null when none exists, so the UI can show a typographic card instead
 * of repeating one stock image across many different hotels.
 */
export function ownPhoto(url: string | undefined, slug?: string): string | null {
  if (slug && INDEX.has(slug)) return INDEX.get(slug)!;
  if (url && !/^https?:/i.test(url) && existsSync(join(PUBLIC, url))) return url;
  return null;
}

/**
 * A free-licensed photo taken near the stay (public/images/area/<slug>--area.webp, from
 * scripts/fetch-area-photos.mjs). Shown only when the stay has no photo of its own, and always
 * labelled as the surrounding area.
 */
export function areaPhoto(slug?: string): string | null {
  return (slug && INDEX.get(`${slug}--area`)) || null;
}

/** Muted tone per category for photo-less cards: [background, ink]. */
export const CATEGORY_TONE: Record<string, [string, string]> = {
  'treehouse-hotels': ['#DCE5D6', '#23402C'],
  'cave-hotels': ['#EADCCB', '#5A3A22'],
  'underwater-rooms': ['#D3E3E8', '#123C4A'],
  'castle-hotels': ['#E2DDE6', '#3A2E48'],
  'floating-hotels': ['#D6E4E3', '#1D4642'],
  'bubble-hotels': ['#DAD9E8', '#262552'],
  'cliffside-hotels': ['#E8DDD3', '#5B3A28'],
  'desert-camps': ['#EFDCC5', '#6B3F1A'],
  'jungle-lodges': ['#D5E3D1', '#1F4424'],
  'ice-hotels': ['#DDE8EF', '#1C3B55'],
  'safari-lodges': ['#EADFC9', '#5A4219'],
  'overwater-bungalows': ['#D2E6E4', '#11484A'],
  'lighthouse-hotels': ['#E5E1DA', '#3B3530'],
  'train-hotels': ['#E6DDD8', '#4A2B2B'],
};

/** Cover for a guide: its category's photo, else a matching destination photo, else the site cover. */
export function guideImage(post: { data: { coverImage?: string; tags?: string[]; category?: string; title?: string } }, destinations: { slug: string; data: { name: string } }[] = []): string {
  const own = post.data.coverImage && !/^https?:/.test(post.data.coverImage) && existsSync(join(PUBLIC, post.data.coverImage)) ? post.data.coverImage : null;
  if (own) return own;
  const tags = post.data.tags ?? [];
  for (const t of tags) if (CATEGORY_ART.has(t) && INDEX.has(t)) return INDEX.get(t)!;
  const title = (post.data.title ?? '').toLowerCase();
  for (const t of tags) if (destinations.some(d => d.slug === t) && INDEX.has(t)) return INDEX.get(t)!;
  const hit = destinations.find(d => INDEX.has(d.slug) && title.includes(d.data.name.split(',')[0].toLowerCase()));
  if (hit) return INDEX.get(hit.slug)!;
  for (const cat of CATEGORY_ART) if (title.includes(cat.replace(/-hotels|-rooms|-camps|-lodges/, '').replace('-', ' ')) && INDEX.has(cat)) return INDEX.get(cat)!;
  return INDEX.get('hero') ?? '/og-default.png';
}

// ── Responsive images ─────────────────────────────────────────────────────────
// scripts/responsive-images.mjs (run before every build) writes smaller WebP copies of each photo and
// this manifest of real sizes. Missing manifest (e.g. unit tests) = plain src, no srcset.
type SizeEntry = { width: number; height: number; variants: { w: number; url: string }[] };
let SIZE_INDEX: Record<string, SizeEntry> = {};
try {
  SIZE_INDEX = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/.cache/stayatniche/image-sizes.json'), 'utf8'));
} catch { /* no manifest: images keep their single src */ }

/** How wide an image is drawn, per layout (the `sizes` attribute). */
export const SIZES = {
  /** Hotel cards and other grid cards: 1 column on phones, 2 on tablets, 3–4 on desktop. */
  card: '(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw',
  /** Full-bleed heroes. */
  full: '100vw',
  /*
   * Heroes drawn with object-cover in a box taller than the photo's shape on phones: the photo is
   * scaled to the box HEIGHT, so it needs more pixels than 100vw (at least height × aspect ratio).
   */
  /** Home hero: min-height 640px / 720px (sm) / 88vh (lg), photo 3:2. */
  homeHero: '(min-width: 1024px) max(100vw, 132vh), (min-width: 640px) max(100vw, 1080px), 960px',
  /** Destination hero: 288px / 460px (sm) tall, photos up to ~16:9. */
  destHero: '(min-width: 640px) max(100vw, 820px), max(100vw, 512px)',
  /** Category hero: height follows its text (tall on phones), so ask for a large file. */
  catHero: 'max(100vw, 1280px)',
  /** Wide image inside the page container (max-w-7xl). */
  wide: '(min-width: 1280px) 1216px, 100vw',
  /** Half the container on desktop. */
  half: '(min-width: 1024px) 50vw, 100vw',
  /** Round / square thumbnails up to 64px. */
  thumb: '64px',
} as const;

// Width range worth offering per layout (CSS width × 1–3 device pixel ratio).
const RANGE: Record<string, [number, number]> = {
  [SIZES.card]: [480, 1200],
  [SIZES.thumb]: [160, 480],
  [SIZES.half]: [480, Infinity],
  [SIZES.full]: [480, Infinity],
  [SIZES.homeHero]: [480, Infinity],
  [SIZES.destHero]: [480, Infinity],
  [SIZES.catHero]: [480, Infinity],
  [SIZES.wide]: [480, Infinity],
};

/** Real pixel size of a local photo, if known. */
export function imageSize(url: string | null | undefined): { width: number; height: number } | null {
  const e = url ? SIZE_INDEX[url] : undefined;
  return e ? { width: e.width, height: e.height } : null;
}

/**
 * <img> attributes for a local photo: src, srcset of the smaller copies plus the original, sizes, and
 * the true width/height (no layout shift). Spread it: <img {...imgAttrs(url, SIZES.card)} alt=… />.
 */
export function imgAttrs(url: string, sizes: string, fallback?: [number, number]): { src: string; srcset?: string; sizes?: string; width?: number; height?: number } {
  const e = SIZE_INDEX[url];
  // Not a measured photo (SVG art, placeholder): keep the box size the template asked for.
  if (!e) return fallback ? { src: url, width: fallback[0], height: fallback[1] } : { src: url };
  // Only the widths this layout can use: small layouts skip the big files, big ones skip the 160px thumb.
  const [min, max] = RANGE[sizes] ?? [0, Infinity];
  const cands = [...e.variants.map((v) => ({ w: v.w, url: v.url })), { w: e.width, url }].filter((c) => c.w >= min && c.w <= max);
  const srcset = cands.length > 1 ? cands.map((c) => `${c.url} ${c.w}w`).join(', ') : undefined;
  return { src: url, ...(srcset ? { srcset, sizes } : {}), width: e.width, height: e.height };
}
