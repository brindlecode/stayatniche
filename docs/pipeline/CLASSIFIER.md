# Daily classifier runbook (for the scheduled Claude session)

Goal: copy the owner's review decisions into the queue, turn last night's evidence packs into
Haiku decisions, keep the review page in step with the queue, and look up websites for
candidates that have none. You do not write hotel pages (the writer routine does that).

- Repo: `brindlecode/stayatniche`, default branch `claude/setup-stayatniche-project-xHSQk` (call it `$B`).
- Review page: https://claude.ai/artifact/WC5XfcRYrJmXf8aqCCfDz7 (collection `queue`).
- Run name: today's date, e.g. `2026-10-09` (call it `$RUN`); `$D` = `data/pipeline/decisions/$RUN`.

Every step can be run again after a failure: nothing is applied or sent twice. If a step fails,
say so in the final message and carry on with the next one. Every script prints one summary line
and records it in `data/pipeline/runs/<stage>.json` (commit those files with your changes).
Do not commit `data/pipeline/STATUS.md`; the nightly job writes it.

## 0. Setup
```
git fetch origin $B && git checkout -B $B origin/$B
rm -rf .pipeline-data && mkdir -p .pipeline-data
git fetch --depth 1 origin pipeline-data && git archive FETCH_HEAD | tar -x -C .pipeline-data
```
If `pipeline-data` does not exist, skip step 2.

## 1. Copy the owner's decisions into the queue
1. ArtifactData `action: "list"`, `url` = review page, `collection: "queue"`,
   `query: {"limit": 1000}`, `out_dir: "/tmp/review-export"`. If the result has a `next_cursor`,
   call again with that cursor until there is none. **Keep the listing**: it shows each
   document's `version`, which step 3 needs.
2. `node pipeline/sync-reviews.mjs /tmp/review-export`
   (approve -> `approved`, reject -> `rejected`, "Araştırılsın" -> fresh evidence tonight).
3. Commit and push (see "Pushing").

## 2. Classify new evidence packs
1. `node pipeline/next-batches.mjs $RUN 150` writes `$D/todo.json`:
   `[{ "out": "<batch file>", "packs": [<pack paths>] }, ...]`. Zero batches is normal: go to step 3.
2. For every entry launch a `hotel-classifier` subagent (Haiku), at most 6 at a time, in the
   background:
   > Working directory: <repo path>. Classify these evidence files (read each fully): <packs>.
   > A pack with a "reviewerQuestion" is a second look the owner asked for: answer that question
   > in "reason". Write the JSON array (one object per file, "id" copied from each file) to <out>.
3. Check each `out` file parses and has one object per pack. Re-run a failed batch once; if it
   fails again, delete its file (those packs stay in the inbox and come back tomorrow).
4. `node pipeline/check-decisions.mjs $D` verifies every quote against the evidence and writes
   `checked.json` and `REPORT.md`. It reports broken batch files instead of stopping.

## 2b. Settle what the rules can settle (no AI, idempotent)
`node pipeline/apply-decisions.mjs && node pipeline/dedupe.mjs && node pipeline/prescreen.mjs`
puts today's decisions into the queue, gives every entry its stable property id, marks duplicates
and runs the pre-screen (rules below), so step 3 never puts a stay on the page that a rule rejects.
The nightly job runs the same three scripts.

## 3. Bring the review page up to date
`node pipeline/review-items.mjs $D /tmp/review-export` (run it even when step 2 had nothing) writes
- `$D/queue-batches.json`: new documents. Send each inner list with ArtifactData
  `action: "batch"`, `url` = review page, `writes` = that list. No `if_version`.
- `$D/queue-updates.json`: changes to existing documents (research results, published / blocked /
  duplicate stays, duplicate warnings). Send each inner list the same way, adding to every entry
  `"if_version": <that document's version from the step 1 listing>`. If a batch is refused
  because a version changed, the owner is using the page: skip that batch, it is rebuilt tomorrow.

## 4. Find websites for candidates that have none (at most 20 a day)
1. `node pipeline/needs-website.mjs $RUN 20` writes `$D/sites-todo.json`. Empty list: skip.
2. Launch one `site-finder` subagent (Haiku, web search):
   > Find the official websites for the candidates in $D/sites-todo.json and write the result to $D/sites.json
3. `node pipeline/apply-websites.mjs $D` accepts only non-listing sites that name the property.
   The nightly job fetches evidence from the accepted sites.
If web search is not available in this session, skip this step and say so.

## 4b. Weekly shortlist (Mondays, or whenever `data/pipeline/shortlist.json` is from an earlier week)
1. `node pipeline/shortlist.mjs --force --size 60` ranks the queue; `node pipeline/expedia-check.mjs todo 60`
   lists the stays without a recent Expedia check in `data/pipeline/expedia-todo.json`.
2. Check them for an exact Expedia page (up to 3 `general-purpose` subagents of 20, web search with
   `allowed_domains: ["expedia.com"]`, query `"<name> <town> <country>"`). Accept only a result whose URL is
   `https://www.expedia.com/<City>-Hotels-<Name>.h<digits>.Hotel-Information` and whose title or snippet names
   this property in this place; never build or edit a URL; never fetch Expedia. Name or town not an exact
   match: `unconfirmed`. Results `[{id, status, url?, expediaTitle?, method, evidence, notes?}]` ->
   `node pipeline/expedia-check.mjs apply <file>` (it refuses any URL that is not a property page or does not
   name the stay). If web search is not available, skip this; the list says "kontrol edilmedi".
3. `node pipeline/shortlist.mjs --force` builds the 40 for this ISO week (numbers stay fixed all week).
   `node pipeline/shortlist.mjs --todo` lists items without a Turkish sentence: translate each English
   `feature` into one plain Turkish sentence (translation only, add nothing) into
   `data/pipeline/shortlist-tr.json` (`{"<id>": "<cümle>"}`), then `node pipeline/shortlist.mjs` again.
4. ArtifactData `set`, `url` = review page, `collection: "shortlist"`, `doc_id: "current"`,
   `file_path: data/pipeline/shortlist.json`. The page shows it at the top; the nightly job puts it in STATUS.md.
On other days run `node pipeline/shortlist.mjs` (no `--force`): it only refreshes each item's state; then
send the same `set` so the page shows what was approved.

**The owner approves by numbers.** On the page (box at the top) nothing else is needed. If the owner sends
the numbers to a Claude session instead ("onay: 1 3 5-9"), run `node pipeline/shortlist-approve.mjs "1 3 5-9"`,
send each inner list of `data/pipeline/decisions/<today>/shortlist-approve.json` with ArtifactData
`action: "batch"` (no `if_version`), and push. Numbers not given stay in the queue.

## 5. Push
`git add data/pipeline/decisions/$RUN data/pipeline/candidates.json data/pipeline/runs data/pipeline/shortlist*.json data/pipeline/SHORTLIST.md data/pipeline/expedia-*.json data/pipeline/properties.json data/pipeline/DUPLICATES.md`, commit
`pipeline: classify <n> candidates ($RUN)`, then push (see "Pushing").

## Pushing
`git pull --rebase origin $B && git push origin HEAD:$B`. On a conflict in `candidates.json`:
`git rebase --abort`, keep your `$D` directory, `git reset --hard origin/$B`, run steps 1.2 and
4.3 again (both are idempotent), commit and push.

## Category rule: treehouses (site owner, 2026-11-15)
A unit is a treehouse only if it is **among trees, raised off the ground, and a separate
free-standing structure**. Built in or attached to a tree, and on stilts or pillars among trees,
both count; the decision's `niche_feature` and later the page must say which it is. A
multi-storey building, a villa or hotel block, a room in a larger building, or a property that
merely has "treehouse" in its name does not count. No description of how the units are built
(room descriptions and photo captions are evidence) means `needs_review`, never `accepted`.
The `hotel-classifier` agent carries the same rule; if a batch comes back with a treehouse
accepted on the name alone, re-run that batch.

## Pre-screen rules (automatic since 2026-11-17; the owner's manual pre-screen of 2026-11-15, written down)
`pipeline/prescreen.mjs` (rules in `pipeline/screen.mjs`) looks once at every stay waiting for the owner
(`classified`) that the owner has not touched, reading its checked decision and evidence pack. The first
rule that fits decides, and each outcome carries one Turkish sentence that the review page shows:

| # | Rule | Result |
|---|---|---|
| 1 | Closed for good: decision `operating_status: closed`, or the operator's pages / Wikipedia say "permanently closed", "no longer operating", "ceased trading" (a seasonal closure is not this) | reject |
| 2 | Fits none of the 14 categories (decision has no category; `other_niche_type` names what it is) | reject: "14 kategoriden hiçbirine uymuyor (…)" |
| 3 | Niche only in the name or the theme (`niche_scope: name_only`, or flag `theme_only` with confidence < 0.6) | reject |
| 4 | No proof of the niche feature: `niche_scope: unclear`, confidence < 0.5, open, the site was readable, not researched yet; or flag `chain_generic` with confidence ≤ 0.5 | reject with the category's proof sentence (e.g. castle: "Konukların tarihî kale binasının içinde kaldığı kaynakta kanıtlanmamış.") |
| 5 | Treehouse rule (below): units described as a multi-storey building, villa or hotel block | reject |
|   | Treehouse rule: nothing in the source says how the units are built (in/attached to a tree, on stilts, pillars, raised, metres above the ground) | needs research |
| 6 | Thin evidence: no pack; no readable page from the operator's own site (Wikipedia only); no verified quote for the niche; scope unclear; status unknown with confidence ≤ 0.65; a closure or long-break notice while not clearly open | needs research |
| – | Everything else | stays, ranked for the weekly shortlist |

A stay already researched once is never sent to research again: it stays in the queue, off the shortlist,
for the owner. Duplicates (of a page or of another candidate) are settled before, by `pipeline/dedupe.mjs`
(rules: same source id, same official domain nearby or with the same name, same distinctive name within
50 km; 150 m proximity, a generic name or a similar name with another trade word is only a warning).
"Needs research" is the page's "Araştırılsın": fresh evidence tonight, then Haiku reads it again.
A rejected card stays visible under "Reddettiklerim" with its reason; if the owner approves it there,
the owner's decision wins. Checked against the 621 decisions of 2026-11-15: the rules agree on 604 (97%);
of the rest, 9 are treehouses the newer treehouse rule sends to research, and 2 animal-park "safari"
hotels the owner rejected that the rules keep (they only rank low).

**Ranking for the shortlist** (`rank()` in `pipeline/screen.mjs`): whole property is the niche +30;
confidence × 30; verified quote on the operator's own site +15 (own-site pages but no quote there +5);
under-represented category on the live site +0..15; exact Expedia page confirmed +10 (checked, none: 0;
not checked: +3). At most 10 of the 40 from one category. A stay with a possible duplicate of a page, of an
approved stay or of a higher-ranked stay is left off the list.

## Rules
- Never edit evidence packs, `pipeline-data`, hotel pages or anything under `src/`.
- Never change `decision`, `finalCat` or `note` on a review document, except through
  `queue-updates.json`.
- Web search is only for step 4. Search results are never facts about a hotel.

## Final message
One line per stage, taken from the scripts' summary lines: reviews synced (approved / rejected /
research), packs classified (accepted / needs review / rejected / no evidence), pre-screen (rejected /
research / kept), review page (new / updated), shortlist (week, approved so far), websites (found / none),
and **every step that failed and why**.
