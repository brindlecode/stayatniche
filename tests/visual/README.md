# Visual baseline

Screenshots of the live site (first four screens) on mobile (390×844) and desktop (1440×900), retaken on
2026-11-17 after the technical SEO / performance work (#64, #65, #67), whose design changes were checked
against the site before it (all under 0.2% of pixels outside photos). Retake them when content changes
the first screens (new scores reorder cards), so a comparison shows design changes, not content.

| page | file |
|---|---|
| home `/` | `home-mobile.png`, `home-desktop.png` |
| hotel `/hotels/treehotel-sweden/` | `hotel-mobile.png`, `hotel-desktop.png` |
| all stays `/hotels/` | `hotels-mobile.png`, `hotels-desktop.png` |

Compare a build (or the live site) with it:

```bash
npm run build && npx astro preview --port 4321 &
node scripts/visual-snapshots.mjs shoot http://localhost:4321 /tmp/shots-now
node scripts/visual-snapshots.mjs compare tests/visual/baseline /tmp/shots-now /tmp/shots-diff
```

`compare` prints the share of pixels that differ per page and writes red-marked diff images.
Below about 0.2% is text anti-aliasing noise; a layout change shows up as several percent.
Playwright with Chromium must be available (it is not a project dependency).
