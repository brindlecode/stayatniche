#!/usr/bin/env node
/**
 * generate-hotel-content.js — DISABLED
 *
 * This script used to turn HotelLook fetch results into hotel pages. It wrote
 * templated descriptions, guessed highlights/amenities from the category,
 * derived prices from star ratings and published pages straight away. None of
 * that is acceptable: every fact on a hotel page must come from a source.
 *
 * The HotelLook fetch it depended on has been retired. New hotel pages come
 * from the evidence-based pipeline in pipeline/ (see docs/pipeline/), always
 * as status: draft until the owner approves them.
 *
 * Running this script now only prints this notice and exits non-zero.
 */

console.error(
  'generate-hotel-content.js is disabled: it produced templated text, guessed amenities and star-based prices.\n' +
  'Add hotels through the pipeline in pipeline/ (docs/pipeline/); new pages go in as status: draft.'
);
process.exit(1);
