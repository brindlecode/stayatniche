/**
 * Responsive image sizes, made at build time (runs before `astro build`, see package.json).
 *
 * For every photo under public/images/{hotels,area,categories,destinations} and public/images/hero.webp,
 * writes smaller WebP copies to public/images/_w/<width>/<same path>.webp for each width in WIDTHS that
 * is smaller than the original, plus a manifest of every photo's real size and its copies:
 * node_modules/.cache/stayatniche/image-sizes.json. src/lib/images.ts reads the manifest to give
 * <img> a srcset, sizes and its true width/height. Without the manifest pages simply get no srcset.
 *
 * Copies are only made when missing or when the original's content changed (hashes in _w/.sources.json;
 * file dates are useless after a fresh git checkout), so repeat builds are quick. On
 * Netlify the folder is kept between builds by netlify/plugins/image-cache. Copies of deleted
 * originals are removed. Nothing here is committed (public/images/_w is in .gitignore).
 */
import sharp from 'sharp';
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, dirname, extname } from 'node:path';
import { availableParallelism } from 'node:os';

export const WIDTHS = [160, 480, 800, 1200];
const PUBLIC = 'public';
const OUT = join(PUBLIC, 'images', '_w');
const MANIFEST = join('node_modules', '.cache', 'stayatniche', 'image-sizes.json');
const SOURCES = ['images/hotels', 'images/area', 'images/categories', 'images/destinations', 'images/hero.webp'];
const EXT = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif']);

const walk = (d) => (statSync(d).isDirectory() ? readdirSync(d).flatMap((f) => walk(join(d, f))) : [d]);
const files = SOURCES.map((s) => join(PUBLIC, s)).filter(existsSync).flatMap(walk).filter((f) => EXT.has(extname(f).toLowerCase()));

const variantPath = (file, w) => join(OUT, String(w), relative(join(PUBLIC, 'images'), file).replace(/\.[^.]+$/, '.webp'));
const url = (p) => '/' + relative(PUBLIC, p).split('\\').join('/');

const STAMPS = join(OUT, '.sources.json');
let stamps = {};
try { stamps = JSON.parse(readFileSync(STAMPS, 'utf8')); } catch { /* first run */ }
const newStamps = {};

const started = Date.now();
let made = 0;
const manifest = {};
const queue = [...files];
async function worker() {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const meta = await sharp(f).metadata();
    // Phones photos may carry an EXIF rotation: the displayed size is the rotated one.
    const [width, height] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
    const variants = [];
    const hash = createHash('sha1').update(readFileSync(f)).digest('hex');
    const changed = stamps[url(f)] !== hash;
    newStamps[url(f)] = hash;
    for (const w of WIDTHS.filter((w) => w < width)) {
      const out = variantPath(f, w);
      if (changed || !existsSync(out)) {
        mkdirSync(dirname(out), { recursive: true });
        await sharp(f).rotate().resize({ width: w }).webp({ quality: 72, effort: 4 }).toFile(out);
        made++;
      }
      variants.push({ w, url: url(out) });
    }
    manifest[url(f)] = { width, height, variants };
  }
}
await Promise.all(Array.from({ length: Math.min(8, availableParallelism()) }, worker));

// Remove copies whose original is gone.
const keep = new Set([STAMPS, ...Object.values(manifest).flatMap((m) => m.variants.map((v) => join(PUBLIC, v.url)))]);
let removed = 0;
if (existsSync(OUT)) for (const f of walk(OUT)) if (!keep.has(f)) { rmSync(f); removed++; }

mkdirSync(OUT, { recursive: true });
writeFileSync(STAMPS, JSON.stringify(newStamps));
mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, JSON.stringify(manifest));
console.log(`responsive images: ${files.length} photos, ${made} copies made, ${removed} removed, ${((Date.now() - started) / 1000).toFixed(1)}s`);
