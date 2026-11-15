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

## 5. Push
`git add data/pipeline/decisions/$RUN data/pipeline/candidates.json data/pipeline/runs`, commit
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

## Rules
- Never edit evidence packs, `pipeline-data`, hotel pages or anything under `src/`.
- Never change `decision`, `finalCat` or `note` on a review document, except through
  `queue-updates.json`.
- Web search is only for step 4. Search results are never facts about a hotel.

## Final message
One line per stage, taken from the scripts' summary lines: reviews synced (approved / rejected /
research), packs classified (accepted / needs review / rejected / no evidence), review page (new /
updated), websites (found / none), and **every step that failed and why**.
