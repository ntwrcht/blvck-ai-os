#!/bin/bash
set -e

echo "=== Harness Initialization: blvck-ai-os ==="

SCRIPTS="plugins/blvck-harness/skills/harness-engineering/scripts"

# Runs a command that is expected to fail a specific way. `set -e` would kill the script on a
# nonzero exit, and `cmd | node -e ...` would report the reader's exit code instead of the
# validator's — so capture the code directly and compare it.
expect_exit () {
  want="$1"; shift
  got=0
  "$@" >/dev/null 2>&1 || got=$?
  if [ "$got" != "$want" ]; then
    echo "FAIL: expected exit $want, got $got: $*"
    exit 1
  fi
}

echo "=== 1/5 Script syntax ==="
node --check "$SCRIPTS/create-harness.mjs"
node --check "$SCRIPTS/validate-harness.mjs"
node --check "$SCRIPTS/lib/harness-utils.mjs"
echo "OK"

echo "=== 2/5 JSON validity (manifests, templates, trackers, fixtures) ==="
find . -name '*.json' -not -path './.git/*' -not -path '*/node_modules/*' -print0 \
  | xargs -0 -I{} node -e "JSON.parse(require('fs').readFileSync('{}','utf8'))" \
  && echo "OK"

echo "=== 3/5 Scaffold + validate round-trip (solo and team) ==="
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

node "$SCRIPTS/create-harness.mjs" --target "$TMP/solo" >/dev/null
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/solo" >/dev/null
echo "solo: scaffold + validate exit 0"

node "$SCRIPTS/create-harness.mjs" --target "$TMP/team" --layout team --owner ci >/dev/null
FEAT_DIR="$(find "$TMP/team/features" -mindepth 1 -maxdepth 1 -type d | head -1)"
cp plugins/blvck-harness/skills/harness-engineering/templates/team/progress-entry.md \
   "$FEAT_DIR/progress/$(date +%F)-ci.md"
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/team" >/dev/null
echo "team: clean scaffold + validate exit 0"

# Copy the clean team repo before it gets a broken feature seeded into it — step 4 scores it
# through a user map and the two results have to agree.
cp -R "$TMP/team" "$TMP/team-mapped"

# Seed a broken feature; validate MUST fail (proves findings detection works)
mkdir -p "$TMP/team/features/feat-20200101-project-setup"
printf '{"id":"feat-20200101-project-setup","name":"bad fixture","description":"dup slug + dangling dep","dependencies":["feat-999"],"status":"in-progress","owner":"nobody","created":"2020-01-01","evidence":""}\n' \
  > "$TMP/team/features/feat-20200101-project-setup/status.json"
if node "$SCRIPTS/validate-harness.mjs" --target "$TMP/team" >/dev/null 2>&1; then
  echo "FAIL: validator did not flag seeded hygiene problems" && exit 1
fi
echo "team: seeded findings correctly rejected (exit 1)"

echo "=== 4/5 Adapted layout scores a foreign structure ==="
cp -R tests/fixtures/foreign-harness "$TMP/foreign"
expect_exit 0 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/foreign"
echo "adapted: foreign-shaped harness scores (exit 0)"

# The same 25 checks, expressed two ways: natively as team, and as a user map with layout:solo
# so the team adapter never runs and the globs do all the work. If these disagree, the map is
# not a real generalization of the layouts — it is a parallel implementation that will drift.
cp -R "$TMP/team-mapped" "$TMP/native-team"
cat > "$TMP/team-mapped/.harness-map.json" <<'MAP'
{
  "version": 1,
  "layout": "solo",
  "concepts": {
    "featureTracker": { "paths": ["features/*/status.json"] },
    "progressLog": { "paths": ["features/*/progress/*.md"] },
    "sessionHandoff": { "paths": ["features/*/progress/*.md"], "pick": "last" }
  }
}
MAP
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/native-team" --json > "$TMP/native.json"
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/team-mapped" --json > "$TMP/mapped.json"
node -e '
const native = require(process.argv[1]);
const mapped = require(process.argv[2]);
if (native.layout !== "team" || mapped.layout !== "adapted") {
  console.error(`FAIL: expected team vs adapted, got ${native.layout} vs ${mapped.layout}`);
  process.exit(1);
}
if (native.overall !== mapped.overall) {
  console.error(`FAIL: team scores ${native.overall}/100 natively but ${mapped.overall}/100 through an equivalent map`);
  process.exit(1);
}
' "$TMP/native.json" "$TMP/mapped.json"
echo "adapted: team layout expressed as a map scores identically"

echo "=== 5/5 Adapted layout cannot be gamed ==="

# Declaring a path is an assertion, not a pass: point the map at a file that is not there and
# the run must fail rather than quietly falling back to the built-in name.
cp -R tests/fixtures/foreign-harness "$TMP/missing"
rm -f "$TMP/missing/.harness/features.json"
expect_exit 1 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/missing"
echo "map: a declared path that does not exist fails (exit 1)"

# The whole point of the anti-gaming gate: a mapped instruction file still has to carry its
# load-bearing phrases in structure. Flat prose containing every right word earns nothing.
cp -R tests/fixtures/foreign-harness "$TMP/prose"
cat > "$TMP/prose/docs/agent-guide.md" <<'PROSE'
# Agent Guide

Kickoff is how we start: confirm the directory, read this guide, run make verify, then open
.harness/features.json and pick up the current item. The Single task rule means one item per
session. Acceptance criteria: an item is done only when it works and make verify passes and
the repo starts clean. Wrap up by appending to journal/ and recording blockers.
PROSE
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/prose" --json > "$TMP/prose.json" || true
node -e '
const result = require(process.argv[1]);
const checks = Object.values(result.subsystems).flatMap((subsystem) => subsystem.checks);
const gated = ["instructions.startupWorkflow", "instructions.definitionOfDone", "scope.oneFeatureAtATime", "lifecycle.endOfSession"];
const leaked = gated.filter((id) => checks.find((check) => check.id === id).pass);
if (leaked.length > 0) {
  console.error(`FAIL: flat prose passed the structured gate: ${leaked.join(", ")}`);
  process.exit(1);
}
' "$TMP/prose.json"
echo "map: flat prose does not pass the structured gate"

# A map the validator cannot trust is a config error (2), not a weak harness (1).
mkdir -p "$TMP/badmap"
printf '{"version":1,"concepts":{"instrucshuns":{"paths":["x.md"]}}}\n' > "$TMP/badmap/.harness-map.json"
expect_exit 2 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/badmap"
printf '{"version":1,"concepts":{"instructions":{"paths":["../../../etc/passwd"]}}}\n' > "$TMP/badmap/.harness-map.json"
expect_exit 2 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/badmap"
echo "map: invalid and out-of-tree maps are config errors (exit 2)"

# "We found nothing" must be distinguishable from "you have nothing" — the 20/100 floor
# cannot say which, so the flag has to.
mkdir -p "$TMP/empty"
expect_exit 1 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/empty"
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/empty" --json > "$TMP/empty.json" || true
node -e '
const result = require(process.argv[1]);
if (result.unscored !== true) {
  console.error(`FAIL: an empty directory reported ${result.overall}/100 without flagging itself unscored`);
  process.exit(1);
}
' "$TMP/empty.json"
echo "empty: reports unscored rather than a floor score (exit 1)"

echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "1. Read feature_list.json to see current feature state"
echo "2. Pick ONE unfinished feature to work on"
echo "3. Implement only that feature"
echo "4. Re-run verification before claiming done"
