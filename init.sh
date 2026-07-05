#!/bin/bash
set -e

echo "=== Harness Initialization: ai-system ==="

SCRIPTS="plugins/harness/skills/harness-engineering/scripts"

echo "=== 1/3 Script syntax ==="
node --check "$SCRIPTS/create-harness.mjs"
node --check "$SCRIPTS/validate-harness.mjs"
node --check "$SCRIPTS/lib/harness-utils.mjs"
echo "OK"

echo "=== 2/3 JSON validity (manifests, templates, trackers) ==="
find . -name '*.json' -not -path './.git/*' -not -path '*/node_modules/*' -print0 \
  | xargs -0 -I{} node -e "JSON.parse(require('fs').readFileSync('{}','utf8'))" \
  && echo "OK"

echo "=== 3/3 Scaffold + validate round-trip (solo and team) ==="
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

node "$SCRIPTS/create-harness.mjs" --target "$TMP/solo" >/dev/null
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/solo" >/dev/null
echo "solo: scaffold + validate exit 0"

node "$SCRIPTS/create-harness.mjs" --target "$TMP/team" --layout team --owner ci >/dev/null
FEAT_DIR="$(find "$TMP/team/features" -mindepth 1 -maxdepth 1 -type d | head -1)"
cp plugins/harness/skills/harness-engineering/templates/team/progress-entry.md \
   "$FEAT_DIR/progress/$(date +%F)-ci.md"
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/team" >/dev/null
echo "team: clean scaffold + validate exit 0"

# Seed a broken feature; validate MUST fail (proves findings detection works)
mkdir -p "$TMP/team/features/feat-20200101-project-setup"
printf '{"id":"feat-20200101-project-setup","name":"bad fixture","description":"dup slug + dangling dep","dependencies":["feat-999"],"status":"in-progress","owner":"nobody","created":"2020-01-01","evidence":""}\n' \
  > "$TMP/team/features/feat-20200101-project-setup/status.json"
if node "$SCRIPTS/validate-harness.mjs" --target "$TMP/team" >/dev/null 2>&1; then
  echo "FAIL: validator did not flag seeded hygiene problems" && exit 1
fi
echo "team: seeded findings correctly rejected (exit 1)"

echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "1. Read feature_list.json to see current feature state"
echo "2. Pick ONE unfinished feature to work on"
echo "3. Implement only that feature"
echo "4. Re-run verification before claiming done"
