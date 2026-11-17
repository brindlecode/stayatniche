# Editorial score (frontmatter `rating`)

`rating` (1.0–10.0, one decimal) is **our own editorial score**. It is not a guest rating and not an
average of anything. The site labels it "editorial score" in all six languages, never publishes
`aggregateRating`, and shows no review counts. `reviewCount` is only allowed together with a
`reviewCountSource` that names where the number comes from (nothing on the site has one today).

## How to score a stay (reproducible)

1. **Find the ceiling** from `niche_scope` (checked by `tests/hotels.test.ts`, values in `src/lib/niche.mjs`):

   | niche_scope | meaning | highest score |
   |---|---|---|
   | `entire_property` | every bookable unit is the niche, confirmed by a citable source | 10.0 |
   | `specific_rooms` | only some rooms/units are the niche | 8.8 |
   | `unverified` | the feature could not be confirmed from a source | 8.5 |
   | `experience_only` | the niche is something to visit or do, not where you sleep | 7.5 |

2. **Place the stay under that ceiling** with three questions, each answered from the official source
   (or the other citable source in `niche_source_url`), 0–3 points each in half-point steps:
   - *Setting*: how much is the place itself the reason for the trip? (0 = incidental, 3 = the trip is for this place)
   - *Stay*: what do the rooms, food and service the source describes add? (0 = nothing stated, 3 = clearly distinctive)
   - *Practicality*: season, access, booking route stated clearly? (0 = unclear, 3 = clear and easy)
3. **Score = 3.5 + (Setting + Stay + Practicality) × 0.7**, rounded to one decimal, then cut to the ceiling.
   (Range 3.5 – 9.8. Example: 3 / 2.5 / 2 = 7.5 points → 3.5 + 5.25 = 8.8.)

The score is a judgement on documented facts, not on price, popularity, affiliate commission or
guest reviews. Commission never changes a score.

## Existing scores

Scores written before 2026-11-17 were editorial judgements without a written rubric. They were kept
as they were and only **lowered to the ceiling** of their `niche_scope`; they were not re-scored. New
and updated pages follow the steps above.
