/** Shared by the content schema, the tests and the pipeline: the niche audit vocabulary. */
export const NICHE_SCOPES = ['entire_property', 'specific_rooms', 'experience_only', 'unverified'];

/**
 * Ceiling of the editorial score by niche_scope (docs/EDITORIAL-SCORE.md). A stay whose niche is only
 * part of the property, or could not be verified, cannot outscore one that is the niche throughout.
 */
export const SCORE_CAP = { entire_property: 10, specific_rooms: 8.8, experience_only: 7.5, unverified: 8.5 };

/**
 * Publication rules for a hotel's frontmatter (used by the content schema and tests/hotels.test.ts).
 * Returns [{ path, message }]; empty = fine. Drafts and archived pages are not checked.
 */
export function nicheProblems(h) {
  if ((h.status ?? 'published') !== 'published') return [];
  const bad = [];
  const need = (ok, path, message) => { if (!ok) bad.push({ path, message }); };
  need(NICHE_SCOPES.includes(h.niche_scope), 'niche_scope', `a published hotel needs niche_scope (${NICHE_SCOPES.join(' | ')})`);
  need(!!h.niche_feature, 'niche_feature', 'a published hotel needs niche_feature (what was verified, or what could not be)');
  need(!!h.niche_verified_at, 'niche_verified_at', 'a published hotel needs niche_verified_at (the day the niche was checked)');
  if (h.niche_scope && h.niche_scope !== 'unverified') need(!!h.niche_source_url, 'niche_source_url', 'a verified niche_scope needs niche_source_url');
  need(!!h.location?.country && /^[A-Z]{2}$/.test(h.location?.countryCode ?? ''), 'location', 'a published hotel needs location {country, countryCode (ISO 3166-1 alpha-2), ...}');
  if (h.reviewCount != null) need(!!h.reviewCountSource, 'reviewCountSource', 'reviewCount is only allowed with a reviewCountSource (we collect no guest reviews)');
  if (NICHE_SCOPES.includes(h.niche_scope) && h.rating > SCORE_CAP[h.niche_scope]) need(false, 'rating', `editorial score ${h.rating} is above the ceiling ${SCORE_CAP[h.niche_scope]} for ${h.niche_scope} (docs/EDITORIAL-SCORE.md)`);
  return bad;
}
