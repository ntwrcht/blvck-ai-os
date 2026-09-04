#!/bin/bash
set -e

echo "=== Harness Initialization: blvck-ai-os ==="

SCRIPTS="plugins/blvck-harness/skills/harness-engineering/scripts"
PM_SCRIPTS="plugins/blvck-pm/skills/pm-os/scripts"

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

echo "=== 1/7 Script syntax ==="
node --check "$SCRIPTS/create-harness.mjs"
node --check "$SCRIPTS/validate-harness.mjs"
node --check "$SCRIPTS/lib/harness-utils.mjs"
node --check "$PM_SCRIPTS/create-vault.mjs"
node --check "$PM_SCRIPTS/validate-vault.mjs"
node --check "$PM_SCRIPTS/lib/vault-utils.mjs"
echo "OK"

echo "=== 2/7 JSON validity (manifests, templates, trackers, fixtures) ==="
find . -name '*.json' -not -path './.git/*' -not -path '*/node_modules/*' -print0 \
  | xargs -0 -I{} node -e "JSON.parse(require('fs').readFileSync('{}','utf8'))" \
  && echo "OK"

echo "=== 3/7 Scaffold + validate round-trip (solo and team) ==="
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

echo "=== 4/7 Adapted layout scores a foreign structure ==="
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

echo "=== 5/7 Adapted layout cannot be gamed ==="

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

echo "=== 6/7 PM vault round-trip (scaffold, then a filled vault) ==="

# The fixture's current-focus.md carries a placeholder date rather than a real one. The
# freshness check is genuinely time-dependent, so a hardcoded date would pass today and fail
# CI in a month — that would be the test rotting, not the code.
stamp_focus () {
  sed "s/FIXTURE_DATE/$(date +%F)/" "$1/ABOUT-ME/current-focus.md" > "$1/ABOUT-ME/current-focus.md.tmp"
  mv "$1/ABOUT-ME/current-focus.md.tmp" "$1/ABOUT-ME/current-focus.md"
}

# A scaffold is not a vault. create-vault.mjs leaves exactly the placeholders a human has to
# answer, so validating straight after scaffolding MUST fail — otherwise an untouched skeleton
# reads as a finished vault, which is how the identity-file defect stayed invisible for two
# releases.
node "$PM_SCRIPTS/create-vault.mjs" --target "$TMP/vault" --product "CI Product" --agents blind-reviewer >/dev/null
expect_exit 1 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/vault"
echo "pm: fresh scaffold is unfinished, not passing (exit 1)"

cp -R tests/fixtures/pm-vault "$TMP/pm-filled"
stamp_focus "$TMP/pm-filled"
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-filled"
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-filled" --json > "$TMP/pm.json"
node -e '
const result = require(process.argv[1]);
if (result.overall !== 100) {
  console.error(`FAIL: the filled fixture should score 100/100, got ${result.overall}`);
  process.exit(1);
}
' "$TMP/pm.json"
echo "pm: filled vault scores 100/100 (exit 0)"

echo "=== 7/7 PM vault cannot be gamed ==="

# Same rule as the harness map: a declared path is an assertion, and a broken one fails the run
# rather than costing a few points. Without this a typo'd config reads as a passing vault.
cp -R tests/fixtures/pm-vault "$TMP/pm-missing"
stamp_focus "$TMP/pm-missing"
rm -f "$TMP/pm-missing/PROJECTS/northwind/vision.md"
expect_exit 1 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-missing"
echo "pm: a declared path that does not exist fails (exit 1)"

# "measured" is the terminal status and the only one that has to carry a result. An item that
# claims it without one says an outcome finished while its number is unknown — the exact failure
# the lifecycle exists to prevent, so it blocks independently of the score. It scored 96/100.
cp -R tests/fixtures/pm-vault "$TMP/pm-nomeasure"
stamp_focus "$TMP/pm-nomeasure"
node -e '
const fs = require("fs");
const file = process.argv[1];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
delete data.items.find((item) => item.status === "measured").measured;
fs.writeFileSync(file, JSON.stringify(data, null, 2));
' "$TMP/pm-nomeasure/PROJECTS/northwind/roadmap.json"
expect_exit 1 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-nomeasure"
echo "pm: a measured outcome with no result blocks regardless of score (exit 1)"

# A config the validator cannot trust is a config error (2), not a weak vault (1).
mkdir -p "$TMP/pm-badconfig"
printf '{"version":1,"paths":{"visshun":"x.md"}}\n' > "$TMP/pm-badconfig/pm-os.config.json"
expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-badconfig"
printf '{"version":1,"paths":{"vision":"../../../etc/passwd"}}\n' > "$TMP/pm-badconfig/pm-os.config.json"
expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-badconfig"
echo "pm: unknown roles and out-of-tree paths are config errors (exit 2)"

# 2.0.0 retired the markdown config. A vault that still has only the old one must fail LOUDLY
# with the conversion command, never be half-read and scored on a guess — and the conversion
# must then produce a vault that passes.
cp -R tests/fixtures/pm-vault "$TMP/pm-legacy"
stamp_focus "$TMP/pm-legacy"
rm -f "$TMP/pm-legacy/pm-os.config.json"
cat > "$TMP/pm-legacy/pm-os.config.md" <<'LEGACY'
# PM OS Config

## Paths
- Identity: ABOUT-ME/ (identity file: ABOUT-ME/CLAUDE.md)
- Product context: PROJECTS/northwind/CLAUDE.md
- Vision: PROJECTS/northwind/vision.md
- Roadmap: PROJECTS/northwind/roadmap.json
- Templates: TEMPLATES/
- Outputs: CLAUDE-OUTPUTS/
- Agents: .claude/agents/

## Language
- Language: en
LEGACY
expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-legacy"
node "$PM_SCRIPTS/create-vault.mjs" --upgrade-config --target "$TMP/pm-legacy" >/dev/null
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-legacy"
echo "pm: a pre-2.0.0 markdown config fails loudly, then upgrades to passing"

# A completeness override the tool cannot parse looks configured and does nothing — the worst
# of the three outcomes, so it is a failure rather than a shrug.
cp -R tests/fixtures/pm-vault "$TMP/pm-badoverride"
stamp_focus "$TMP/pm-badoverride"
node -e '
const fs = require("fs");
const file = process.argv[1];
const config = JSON.parse(fs.readFileSync(file, "utf8"));
config.completeness = { prd: { remove: ["success metric"] } };
fs.writeFileSync(file, JSON.stringify(config, null, 2));
' "$TMP/pm-badoverride/pm-os.config.json"
expect_exit 1 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-badoverride"
echo "pm: an unparseable completeness override fails (exit 1)"

# The completeness gate WARNS and never blocks, so this asserts a score change, not an exit code.
# An unmet item costs a point only when nobody acknowledged it; a "## Completeness" section in the
# document turns the same gap into a recorded decision and the score goes back to full.
cp -R tests/fixtures/pm-vault "$TMP/pm-gap"
stamp_focus "$TMP/pm-gap"
PRD="$TMP/pm-gap/CLAUDE-OUTPUTS/prds/prd-dunning-retry-v1-2026-08-14.md"
node -e '
const fs = require("fs");
const file = process.argv[1];
let body = fs.readFileSync(file, "utf8");
body = body.split("## Completeness")[0].trimEnd() + "\n";
body = body.replace(/\| Recovered revenue per active customer \|[^\n]*\n/, "|  |  |  |  |  |\n");
fs.writeFileSync(file, body);
' "$PRD"
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-gap" --json > "$TMP/pm-gap.json"
node -e '
const result = require(process.argv[1]);
const check = Object.values(result.modules).flatMap((m) => m.checks).find((c) => c.id === "plan.completeness");
if (check.pass) {
  console.error("FAIL: a PRD with no success metric passed the completeness gate");
  process.exit(1);
}
if (result.overall === 100) {
  console.error("FAIL: an unacknowledged gap did not cost anything");
  process.exit(1);
}
' "$TMP/pm-gap.json"
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-gap"
echo "pm: an unmet checklist item costs score but never blocks (exit 0)"

# Same gap, acknowledged in the document. A recorded trade-off is a decision, not a defect.
cp -R tests/fixtures/pm-vault "$TMP/pm-ack"
stamp_focus "$TMP/pm-ack"
node -e '
const fs = require("fs");
const file = process.argv[1];
const body = fs.readFileSync(file, "utf8")
  .replace(/\| Recovered revenue per active customer \|[^\n]*\n/, "|  |  |  |  |  |\n");
fs.writeFileSync(file, body);
' "$TMP/pm-ack/CLAUDE-OUTPUTS/prds/prd-dunning-retry-v1-2026-08-14.md"
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-ack" --json > "$TMP/pm-ack.json"
node -e '
const result = require(process.argv[1]);
if (result.overall !== 100) {
  console.error(`FAIL: an acknowledged gap should cost nothing, scored ${result.overall}`);
  process.exit(1);
}
' "$TMP/pm-ack.json"
echo "pm: the same gap, acknowledged in the document, costs nothing"

# "We found nothing" must stay distinguishable from "you have nothing".
mkdir -p "$TMP/pm-empty"
expect_exit 1 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-empty"
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-empty" --json > "$TMP/pm-empty.json" || true
node -e '
const result = require(process.argv[1]);
if (result.unscored !== true) {
  console.error(`FAIL: an empty directory reported ${result.overall}/100 without flagging itself unscored`);
  process.exit(1);
}
' "$TMP/pm-empty.json"
echo "pm: an empty directory reports unscored (exit 1)"

echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "1. Read feature_list.json to see current feature state"
echo "2. Pick ONE unfinished feature to work on"
echo "3. Implement only that feature"
echo "4. Re-run verification before claiming done"
