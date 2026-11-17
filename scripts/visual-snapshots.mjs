/**
 * Visual baseline: screenshots of the home page, one hotel page and /hotels/ on mobile and desktop,
 * and a pixel comparison of two sets. Use it before and after a change to show the design is unchanged.
 *
 *   node scripts/visual-snapshots.mjs shoot <base-url> <out-dir>     e.g. https://stayatniche.com tests/visual/before
 *   node scripts/visual-snapshots.mjs compare <dir-a> <dir-b> [<diff-dir>]
 *
 * Needs Playwright with Chromium (not a project dependency: npx playwright install chromium, or a
 * machine that has it). Third-party scripts (tag manager, partner widgets) are blocked, animations and
 * scroll reveals are switched off, and the consent banner is hidden, so two runs of the same page match.
 * The comparison uses sharp (a dev dependency) and reports the share of pixels that differ.
 */
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

export const PAGES = [
  { name: 'home', path: '/' },
  { name: 'hotel', path: '/hotels/treehotel-sweden/' },
  { name: 'hotels', path: '/hotels/' },
];
export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
];
// Committed baseline (live site before the SEO/performance work of 2026-11-17): tests/visual/baseline/.
// Full pages get very long (/hotels/ lists every stay); the first 4 screens cover the header, hero,
// filters, first rows of cards and the booking card.
const SCREENS = 4;

const FREEZE = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  .reveal { opacity: 1 !important; transform: none !important; }
  #sn-consent { display: none !important; }
  iframe { visibility: hidden !important; }
`;

async function shoot(base, out) {
  // Playwright is not a project dependency: use the project's copy if installed, else a global one.
  const sharp = (await import('sharp')).default;
  const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const host = new URL(base).host;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await ctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      const ok = u.host === host || /fonts\.(googleapis|gstatic)\.com$/.test(u.host);
      return ok ? r.continue() : r.abort();
    });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      await page.goto(base.replace(/\/$/, '') + p.path, { waitUntil: 'networkidle', timeout: 90000 });
      await page.addStyleTag({ content: FREEZE });
      // Load every lazy image in the captured area, then come back to the top.
      const h = vp.height * SCREENS;
      for (let y = 0; y < h; y += vp.height / 2) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(150); }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); })));
      });
      await page.waitForTimeout(500);
      const full = await page.evaluate(() => document.documentElement.scrollHeight);
      const file = join(out, `${p.name}-${vp.name}.png`);
      const png = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: Math.min(full, h) } });
      // Palette PNG: about a third of the size, well under the comparison threshold (checked: <0.1% of pixels).
      await sharp(png).png({ palette: true, quality: 90, effort: 8, dither: 0.2 }).toFile(file);
      console.log(`shot ${file}`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}

async function compare(a, b, diffDir) {
  const sharp = (await import('sharp')).default;
  if (diffDir) mkdirSync(diffDir, { recursive: true });
  let worst = 0;
  for (const f of readdirSync(a).filter((f) => f.endsWith('.png')).sort()) {
    if (!existsSync(join(b, f))) { console.log(`${f}: missing in ${b}`); worst = 100; continue; }
    const [ia, ib] = await Promise.all([a, b].map((d) => sharp(join(d, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    const w = Math.min(ia.info.width, ib.info.width), h = Math.min(ia.info.height, ib.info.height);
    const diff = Buffer.alloc(w * h * 4);
    let changed = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const pa = (y * ia.info.width + x) * 4, pb = (y * ib.info.width + x) * 4, pd = (y * w + x) * 4;
      const d = Math.abs(ia.data[pa] - ib.data[pb]) + Math.abs(ia.data[pa + 1] - ib.data[pb + 1]) + Math.abs(ia.data[pa + 2] - ib.data[pb + 2]);
      const hit = d > 48; // ignore anti-aliasing and image re-encoding noise
      if (hit) changed++;
      diff[pd] = hit ? 255 : ia.data[pa] * 0.3; diff[pd + 1] = hit ? 0 : ia.data[pa + 1] * 0.3; diff[pd + 2] = hit ? 0 : ia.data[pa + 2] * 0.3; diff[pd + 3] = 255;
    }
    const pct = (changed / (w * h)) * 100;
    const sizeNote = ia.info.height !== ib.info.height ? ` (height ${ia.info.height} → ${ib.info.height})` : '';
    console.log(`${f}: ${pct.toFixed(2)}% of pixels differ${sizeNote}`);
    worst = Math.max(worst, pct);
    if (diffDir) await sharp(diff, { raw: { width: w, height: h, channels: 4 } }).png().toFile(join(diffDir, f));
  }
  console.log(`largest difference: ${worst.toFixed(2)}%`);
}

const [cmd, x, y, z] = process.argv.slice(2);
if (cmd === 'shoot' && x && y) await shoot(x, y);
else if (cmd === 'compare' && x && y) await compare(x, y, z);
else { console.error('usage: shoot <base-url> <out-dir> | compare <dir-a> <dir-b> [<diff-dir>]'); process.exit(2); }
