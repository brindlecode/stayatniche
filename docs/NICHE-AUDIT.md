# Niche audit

Every published hotel carries, in its frontmatter:

| field | meaning |
|---|---|
| `niche_scope` | `entire_property`, `specific_rooms`, `experience_only` or `unverified` |
| `niche_feature` | one factual English sentence: what was verified (or what could not be) |
| `niche_source_url` | the page that supports it, official site preferred (required unless `unverified`) |
| `niche_verified_at` | the day the source was read |
| `location` | `{country, countryCode (ISO 3166-1 alpha-2), region, city, locality, coordinates}` |

`src/content/config.ts` refuses to build a `status: published` hotel without `niche_scope`,
`niche_feature`, `niche_verified_at` and `location`, and `tests/hotels.test.ts` checks the same
plus the rules below. A stay with `status: draft` needs none of them (the pipeline writes drafts first).

## Rules
- A verified scope needs a source URL; an `unverified` stay says what could not be confirmed.
- `specific_rooms` pages say so at the top (automatic notice, see `HotelView.astro`) and the body must name which rooms.
- Treehouses: only free-standing structures raised off the ground among trees (see `docs/pipeline/CLASSIFIER.md`).
- A stay that fits none of the 14 categories is set to `status: draft` and gets a 301 in `netlify.toml`
  to its closest category page (English and the five localized paths).
- Pipeline vocabulary maps: `whole_property` → `entire_property`, `some_units` → `specific_rooms`,
  `unclear` → `unverified`, `name_only` → rejected.
- Scores are capped by scope: see `docs/EDITORIAL-SCORE.md`.

## Audit 2026-11-17
Raw per-hotel results (source URL, quote, verdict, notes): `data/audit-niche/batch-*.json`.
Applied to the pages by `scripts/apply-niche-audit.mjs`.
