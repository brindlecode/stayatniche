#!/bin/sh
# Netlify "ignore" check. Exit 0 = skip this build, any other code = build.
# Skips only when we can really compare with the last built commit and the
# change touches nothing but data/pipeline or docs (nightly pipeline commits).
# If the cache is missing (CACHED_COMMIT_REF empty, e.g. after the repo moved or
# the build cache was cleared) or the commit is not in the clone, it builds.
if [ -z "$CACHED_COMMIT_REF" ] || [ -z "$COMMIT_REF" ] || [ "$CACHED_COMMIT_REF" = "$COMMIT_REF" ]; then
  echo "ignore-check: no previous build commit to compare with, building"
  exit 1
fi
if ! git cat-file -e "$CACHED_COMMIT_REF^{commit}" 2>/dev/null; then
  echo "ignore-check: previous build commit $CACHED_COMMIT_REF not in clone, building"
  exit 1
fi
if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- . ':(exclude)data/pipeline' ':(exclude)docs'; then
  echo "ignore-check: only data/pipeline or docs changed since $CACHED_COMMIT_REF, skipping"
  exit 0
fi
echo "ignore-check: site files changed since $CACHED_COMMIT_REF, building"
exit 1
