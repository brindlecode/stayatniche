// Accessibility rules that can be checked in the source (keyboard focus, text contrast).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import config from '../tailwind.config.mjs';

const ROOT = resolve(__dirname, '..');
const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(d, e.name)) : e.name.endsWith('.astro') ? [join(d, e.name)] : []);
const astro = files(join(ROOT, 'src')).map(f => ({ f: f.slice(ROOT.length + 1), t: readFileSync(f, 'utf8') }));

const lum = (hex: string) => {
  const c = [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const warm = (config as any).theme.extend.colors.warm;

describe('text contrast (WCAG AA 4.5:1 for body text)', () => {
  it('secondary grey text (warm-500) passes on white, the page background and warm-100', () => {
    for (const bg of ['#FFFFFF', warm[50], warm[100]]) expect(contrast(warm[500], bg), bg).toBeGreaterThanOrEqual(4.5);
  });
  it('the light grey (warm-400, about 2.4:1) is not used for small text on light pages', () => {
    const bad: string[] = [];
    for (const { f, t } of astro) {
      if (/Footer\.astro$/.test(f)) continue; // dark background
      for (const m of t.matchAll(/<(p|span|td)\b[^>]*class="[^"]*\btext-warm-400\b[^"]*\b(text-xs|text-sm|text-\[1[01]px\])[^"]*"/g)) bad.push(`${f}: ${m[0].slice(0, 90)}`);
      for (const m of t.matchAll(/<(p|span|td)\b[^>]*class="[^"]*\b(text-xs|text-sm|text-\[1[01]px\])[^"]*\btext-warm-400\b[^"]*"/g)) bad.push(`${f}: ${m[0].slice(0, 90)}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('keyboard focus is visible', () => {
  it('every field that removes the outline on focus puts a ring, outline or border change back', () => {
    const bad: string[] = [];
    for (const { f, t } of astro) for (const m of t.matchAll(/class=(?:"([^"]*)"|'([^']*)')/g)) {
      const cls = m[1] ?? m[2];
      if (!/(^|\s)(focus:)?outline-none(\s|$)/.test(cls)) continue;
      if (!/focus(-visible)?:(ring|outline|border)/.test(cls)) bad.push(`${f}: ${cls.slice(0, 100)}`);
    }
    expect(bad).toEqual([]);
  });
  it('the home search form and the /hotels/ selects show a focus-visible indicator', () => {
    const home = astro.find(x => x.f.endsWith('HomeView.astro'))!.t;
    expect(home.match(/focus-visible:outline-forest-600/g)?.length).toBe(3);
    const idx = astro.find(x => x.f.endsWith('HotelsIndexView.astro'))!.t;
    expect(idx.match(/focus-visible:ring-forest-600/g)?.length).toBe(2);
  });
  it('uses a light focus outline on dark sections', () => {
    expect(astro.find(x => x.f.endsWith('BaseLayout.astro'))!.t).toMatch(/footer :focus-visible[^{]*\{ outline-color: #FAF9F6; \}/);
  });
  it('the mobile menu button reports whether the menu is open', () => {
    const h = astro.find(x => x.f.endsWith('Header.astro'))!.t;
    expect(h).toMatch(/id="mobile-menu-toggle"[^>]*aria-expanded="false"/);
    expect(h).toMatch(/setAttribute\('aria-expanded'/);
  });
});
