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

echo "=== 1/10 Script syntax ==="
node --check "$SCRIPTS/create-harness.mjs"
node --check "$SCRIPTS/validate-harness.mjs"
node --check "$SCRIPTS/lib/harness-utils.mjs"
node --check "$PM_SCRIPTS/create-vault.mjs"
node --check "$PM_SCRIPTS/validate-vault.mjs"
node --check "$PM_SCRIPTS/lib/vault-utils.mjs"
node --check tests/workflow-sim.mjs
node --check tests/pm-workflow-sim.mjs
echo "OK"

echo "=== 2/10 JSON validity (manifests, templates, trackers, fixtures) ==="
find . -name '*.json' -not -path './.git/*' -not -path '*/node_modules/*' -print0 \
  | xargs -0 -I{} node -e "JSON.parse(require('fs').readFileSync('{}','utf8'))" \
  && echo "OK"

echo "=== 3/10 Scaffold + validate round-trip (solo and team) ==="
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

node "$SCRIPTS/create-harness.mjs" --target "$TMP/solo" >/dev/null
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/solo" >/dev/null
# The handoff's startup step must name the instruction file the scaffold actually wrote.
grep -q 'Read `CLAUDE.md`' "$TMP/solo/session-handoff.md" || { echo "FAIL: handoff does not name CLAUDE.md"; exit 1; }
node "$SCRIPTS/create-harness.mjs" --target "$TMP/solo-agents" --agent-file AGENTS.md >/dev/null
grep -q 'Read `AGENTS.md`' "$TMP/solo-agents/session-handoff.md" || { echo "FAIL: handoff does not name AGENTS.md"; exit 1; }
if grep -rq '{{' "$TMP/solo" "$TMP/solo-agents"; then echo "FAIL: unfilled {{TOKEN}} in a solo scaffold"; exit 1; fi
echo "solo: scaffold + validate exit 0; handoff names the instruction file that was written"

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

echo "=== 4/10 Adapted layout scores a foreign structure ==="
cp -R tests/fixtures/foreign-harness "$TMP/foreign"
expect_exit 0 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/foreign"
echo "adapted: foreign-shaped harness scores (exit 0)"

# /blvck-harness:check discovers a map and scores it from a scratch file before the user agrees
# to save anything: the map must work from outside the repo, and the repo must stay untouched.
cp -R tests/fixtures/foreign-harness "$TMP/discover"
mv "$TMP/discover/.harness-map.json" "$TMP/discovered-map.json"
expect_exit 1 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/discover"
expect_exit 0 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/discover" --map "$TMP/discovered-map.json"
[ ! -e "$TMP/discover/.harness-map.json" ] || { echo "FAIL: scoring a scratch map wrote into the repo"; exit 1; }
echo "adapted: a discovered map scores from outside the repo without writing into it"

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

echo "=== 5/10 Adapted layout cannot be gamed ==="

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

echo "=== 6/10 PM vault round-trip (scaffold, then a filled vault) ==="

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

echo "=== 7/10 PM vault cannot be gamed ==="

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

echo "=== 8/10 PM codebase registry ==="

# Repos are built here rather than committed as fixtures: a nested .git cannot live inside this
# repo's history. Each case starts from the filled fixture, so a regression shows as a score or
# exit change against a known 100/100 baseline.
make_repo () {
  mkdir -p "$1"
  git -C "$1" init -q
}
registry () {
  node -e '
const fs = require("fs");
const [file, json] = process.argv.slice(1);
const config = JSON.parse(fs.readFileSync(file, "utf8"));
config.codebases = JSON.parse(json);
fs.writeFileSync(file, JSON.stringify(config, null, 2));
' "$1/pm-os.config.json" "$2"
}
check_json () {
  node "$PM_SCRIPTS/validate-vault.mjs" --target "$1" --json > "$TMP/registry.json" || true
  node -e "const r = require(process.argv[1]); $2" "$TMP/registry.json"
}

# The baseline: one repo inside (the default home) and one outside (a clone shared with another
# vault). Outside is legal for codebases only — they earn no points, so there is no score to
# borrow. The inside repo carries a {{TOKEN}} in its README: a repo is not vault material, and
# before 2.2.0 that line alone blocked the whole vault.
cp -R tests/fixtures/pm-vault "$TMP/pm-code"
stamp_focus "$TMP/pm-code"
make_repo "$TMP/pm-code/CODE/billing-api"
touch "$TMP/pm-code/CODE/billing-api/CLAUDE.md" "$TMP/pm-code/CODE/billing-api/init.sh"
echo "Deploy with {{DEPLOY_TARGET}}." > "$TMP/pm-code/CODE/billing-api/README.md"
make_repo "$TMP/shared/point-service"
registry "$TMP/pm-code" "[{\"name\":\"billing-api\",\"path\":\"CODE/billing-api\",\"scope\":\"mine\",\"branch\":\"main\"},{\"name\":\"point-service\",\"path\":\"$TMP/shared/point-service\",\"scope\":\"dependency\"}]"
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
check_json "$TMP/pm-code" '
if (r.overall !== 100) { console.error(`FAIL: a vault with a clean registry scored ${r.overall}`); process.exit(1); }
if (r.warnings.length) { console.error(`FAIL: unexpected warnings: ${r.warnings.join("; ")}`); process.exit(1); }
'
echo "pm: codebases inside and outside the vault score 100/100, and a repo's {{TOKEN}} is not read"

# Skipped by what a folder IS, not its name: a plain folder called CODE/ is still vault material.
mkdir -p "$TMP/pm-code/CODE/notes"
echo "{{UNANSWERED}}" > "$TMP/pm-code/CODE/notes/scratch.md"
expect_exit 1 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
rm -rf "$TMP/pm-code/CODE/notes"
echo "pm: a folder named CODE/ that is not a repo is still read (exit 1)"

# Warnings never move the score or the exit code. An undeclared nested repo gets named; a root
# CLAUDE.md over a nested repo gets named, because it loads in every coding session there.
make_repo "$TMP/pm-code/CODE/stray"
echo "# Vault rules" > "$TMP/pm-code/CLAUDE.md"
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
check_json "$TMP/pm-code" '
const text = r.warnings.join("\n");
if (!/CODE\/stray/.test(text)) { console.error("FAIL: an undeclared nested repo was not named"); process.exit(1); }
if (!/billing-api: sits inside the vault/.test(text)) { console.error("FAIL: the root CLAUDE.md leak was not named"); process.exit(1); }
if (/point-service/.test(text)) { console.error("FAIL: a repo outside the vault cannot inherit its CLAUDE.md"); process.exit(1); }
if (r.overall !== 100) { console.error(`FAIL: warnings cost score (${r.overall})`); process.exit(1); }
'
echo "pm: an undeclared repo and a leaking root CLAUDE.md warn, never block (exit 0)"

# An acknowledged inheritance is a decision, not a gap: it silences that entry's warning and only
# that one. The undeclared stray repo must still be named.
registry "$TMP/pm-code" "[{\"name\":\"billing-api\",\"path\":\"CODE/billing-api\",\"scope\":\"mine\",\"rootClaudeMd\":\"accepted\"},{\"name\":\"point-service\",\"path\":\"$TMP/shared/point-service\",\"scope\":\"dependency\"}]"
check_json "$TMP/pm-code" '
const text = r.warnings.join("\n");
if (/billing-api/.test(text)) { console.error("FAIL: an accepted root CLAUDE.md still warned"); process.exit(1); }
if (!/CODE\/stray/.test(text)) { console.error("FAIL: accepting one warning silenced an unrelated one"); process.exit(1); }
'
registry "$TMP/pm-code" '[{"name":"billing-api","path":"CODE/billing-api","scope":"mine","rootClaudeMd":"yes"}]'
expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
rm -rf "$TMP/pm-code/CODE/stray" "$TMP/pm-code/CLAUDE.md"
registry "$TMP/pm-code" "[{\"name\":\"billing-api\",\"path\":\"CODE/billing-api\",\"scope\":\"mine\",\"branch\":\"main\"},{\"name\":\"point-service\",\"path\":\"$TMP/shared/point-service\",\"scope\":\"dependency\"}]"
echo "pm: \"rootClaudeMd\": \"accepted\" silences only its own warning, and any other value exits 2"

# A `mine` repo without a harness is a weak result, not a broken promise: it scores, never blocks.
rm "$TMP/pm-code/CODE/billing-api/init.sh"
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
check_json "$TMP/pm-code" '
const c = Object.values(r.modules).flatMap((m) => m.checks).find((x) => x.id === "config.codebaseHarness");
if (c.pass || r.overall === 100) { console.error("FAIL: a mine repo with no init.sh cost nothing"); process.exit(1); }
'
touch "$TMP/pm-code/CODE/billing-api/init.sh"
echo "pm: a mine repo without a harness costs score but never blocks (exit 0)"

# A registered codebase is an assertion, like any declared path: gone, or not a repo, blocks.
registry "$TMP/pm-code" '[{"name":"gone","path":"CODE/gone","scope":"mine"}]'
expect_exit 1 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
mkdir -p "$TMP/pm-code/CODE/plain"
registry "$TMP/pm-code" '[{"name":"plain","path":"CODE/plain","scope":"dependency"}]'
expect_exit 1 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
echo "pm: a codebase that is gone or is not a repo fails (exit 1)"

# An entry the tool cannot parse looks configured and does nothing, so it is a config error.
registry "$TMP/pm-code" '[{"name":"billing-api","path":"CODE/billing-api","scope":"owned"}]'
expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
registry "$TMP/pm-code" '[{"name":"billing-api","path":"CODE/billing-api","scope":"mine","role":"owned"}]'
expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
registry "$TMP/pm-code" '{"billing-api":"CODE/billing-api"}'
expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-code"
echo "pm: an unknown scope, an unknown key, or a non-array registry is a config error (exit 2)"

echo "=== 9/10 Dynamic workflow mode ==="

# Mode decides how work runs, never how the harness scores: a dynamic scaffold must score exactly
# what a classic one does, in both layouts, and classic output must not change at all.
for LAYOUT in solo team; do
  node "$SCRIPTS/create-harness.mjs" --target "$TMP/classic-$LAYOUT" --layout $LAYOUT --owner ci >/dev/null
  node "$SCRIPTS/create-harness.mjs" --target "$TMP/dynamic-$LAYOUT" --layout $LAYOUT --owner ci --mode dynamic --host github --target-branch develop >/dev/null
  if [ "$LAYOUT" = team ]; then
    for R in classic dynamic; do
      D="$(find "$TMP/$R-team/features" -mindepth 1 -maxdepth 1 -type d | head -1)"
      cp plugins/blvck-harness/skills/harness-engineering/templates/team/progress-entry.md "$D/progress/$(date +%F)-ci.md"
    done
  fi
  node "$SCRIPTS/validate-harness.mjs" --target "$TMP/classic-$LAYOUT" --json > "$TMP/c.json"
  node "$SCRIPTS/validate-harness.mjs" --target "$TMP/dynamic-$LAYOUT" --json > "$TMP/d.json"
  node -e '
const c = require(process.argv[1]), d = require(process.argv[2]);
if (c.overall !== d.overall) { console.error(`FAIL: classic ${c.overall} vs dynamic ${d.overall}`); process.exit(1); }
if (c.workflow.mode !== "classic" || d.workflow.mode !== "dynamic") { console.error("FAIL: mode not reported"); process.exit(1); }
' "$TMP/c.json" "$TMP/d.json"
  grep -q "blvck-harness:workflow-mode:start" "$TMP/dynamic-$LAYOUT/CLAUDE.md" || { echo "FAIL: no Workflow Mode section"; exit 1; }
  if grep -q "workflow-mode" "$TMP/classic-$LAYOUT/CLAUDE.md"; then echo "FAIL: classic scaffold changed"; exit 1; fi
done
for NAME in product-owner tech-lead developer qa-engineer; do
  F="$TMP/dynamic-solo/.claude/agents/$NAME.md"
  [ -f "$F" ] || { echo "FAIL: persona $NAME not scaffolded"; exit 1; }
  # The workflow calls each persona by name, so the frontmatter name must match the file.
  grep -q "^name: $NAME$" "$F" || { echo "FAIL: $NAME.md frontmatter name does not match its file"; exit 1; }
  grep -q "^tools: " "$F" || { echo "FAIL: $NAME.md has no explicit tool budget"; exit 1; }
done
[ ! -d "$TMP/classic-solo/.claude" ] || { echo "FAIL: classic scaffold wrote .claude/"; exit 1; }
echo "dynamic: solo and team score identically to classic; classic output untouched; four personas scaffolded"

# A 1.x harness upgrades in place: the section is inserted once, and re-running is a no-op.
node "$SCRIPTS/create-harness.mjs" --target "$TMP/classic-solo" --mode dynamic --preset lean >/dev/null
node "$SCRIPTS/create-harness.mjs" --target "$TMP/classic-solo" --mode dynamic --preset lean >/dev/null
[ "$(grep -c 'blvck-harness:workflow-mode:start' "$TMP/classic-solo/CLAUDE.md")" = 1 ] || { echo "FAIL: section duplicated on re-run"; exit 1; }
grep -q '| audit | off |' "$TMP/classic-solo/CLAUDE.md" || { echo "FAIL: lean preset not rendered"; exit 1; }
expect_exit 0 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/classic-solo"
echo "dynamic: a classic harness upgrades in place, idempotently"

# A broken config is a broken command, not a weak harness: exit 2, never a fallback to defaults.
CFG="$TMP/dynamic-solo/.claude/harness-workflow.json"
cp "$CFG" "$TMP/good.json"
for BAD in \
  '.mode = "turbo"' \
  '.stages.implement.enabled = false' \
  '.stages.implement.agents = 17' \
  '.stages.plan.agents = 0' \
  '.stages.deploy = {"enabled":true,"agents":1,"skills":[]}' \
  '.stages.review.skills = ["ok", 3]' \
  '.stages.plan.agent = "Product Owner"' \
  '.repair.maxAttempts = 4' \
  '.delivery.host = "bitbucket"' \
  '.delivery.targetBranch = ""' \
  'delete .version'; do
  node -e "
const fs = require('fs'); const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const set = (p, v) => { const k = p.split('.').slice(1); let o = c; while (k.length > 1) o = o[k.shift()]; o[k[0]] = v; };
const expr = process.argv[3];
if (expr.startsWith('delete ')) { delete c[expr.slice(8)]; }
else { const [p, v] = expr.split(' = '); set(p, JSON.parse(v)); }
fs.writeFileSync(process.argv[2], JSON.stringify(c));
" "$TMP/good.json" "$CFG" "$BAD"
  expect_exit 2 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/dynamic-solo"
done
printf 'not json' > "$CFG"
expect_exit 2 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/dynamic-solo"
cp "$TMP/good.json" "$CFG"
expect_exit 0 node "$SCRIPTS/validate-harness.mjs" --target "$TMP/dynamic-solo"
echo "dynamic: 12 broken configs exit 2; the restored config passes"

# Local visibility: listed in .git/info/exclude (never .gitignore), reported by validate, and
# refused for a team layout whose claims only work when shared.
mkdir -p "$TMP/local" && git -C "$TMP/local" init -q
node "$SCRIPTS/create-harness.mjs" --target "$TMP/local" --mode dynamic --visibility local >/dev/null
grep -q '^/CLAUDE.md$' "$TMP/local/.git/info/exclude" || { echo "FAIL: harness not excluded"; exit 1; }
grep -q '^/.claude/agents/developer.md$' "$TMP/local/.git/info/exclude" || { echo "FAIL: personas not excluded"; exit 1; }
[ ! -e "$TMP/local/.gitignore" ] || { echo "FAIL: local visibility wrote a .gitignore"; exit 1; }
[ -z "$(git -C "$TMP/local" status --porcelain)" ] || { echo "FAIL: local harness shows in git status"; exit 1; }
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/local" --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{if(JSON.parse(s).visibility!=="local"){console.error("FAIL: visibility not reported");process.exit(1)}})'
expect_exit 2 node "$SCRIPTS/create-harness.mjs" --target "$TMP/local-team" --layout team --visibility local
expect_exit 2 node "$SCRIPTS/create-harness.mjs" --target "$TMP/not-a-repo" --visibility local
echo "local: excluded via .git/info/exclude, invisible to git status; team+local and non-repo exit 2"

# Adapted layouts get dynamic mode too: the workflow reads where state lives from resolution.
cp -R tests/fixtures/foreign-harness "$TMP/foreign-dynamic"
mkdir -p "$TMP/foreign-dynamic/.claude" && cp "$TMP/good.json" "$TMP/foreign-dynamic/.claude/harness-workflow.json"
node "$SCRIPTS/validate-harness.mjs" --target "$TMP/foreign-dynamic" --json > "$TMP/fd.json"
node -e '
const r = require(process.argv[1]);
if (r.layout !== "adapted" || r.workflow.mode !== "dynamic") { console.error("FAIL: adapted+dynamic not reported"); process.exit(1); }
if (!r.resolution.featureTracker.sources.includes(".harness/features.json")) { console.error("FAIL: tracker not resolved for the workflow"); process.exit(1); }
' "$TMP/fd.json"
echo "adapted: dynamic mode resolves the foreign tracker for the workflow"

node tests/workflow-sim.mjs >/dev/null || { node tests/workflow-sim.mjs; exit 1; }
echo "workflow: orchestration simulation passes (stages, ceilings, repair limit, waves, local)"

echo "=== 10/10 PM dynamic workflow mode ==="

# Mode decides how PM work runs, never how the vault scores: the same vault scores the same in
# classic and dynamic, and a classic scaffold carries nothing of dynamic mode.
node "$PM_SCRIPTS/create-vault.mjs" --target "$TMP/pm-classic" --product "CI Product" --agents blind-reviewer >/dev/null
node "$PM_SCRIPTS/create-vault.mjs" --target "$TMP/pm-dynamic" --product "CI Product" --agents blind-reviewer --mode dynamic >/dev/null
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-classic" --json > "$TMP/pc.json" || true
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-dynamic" --json > "$TMP/pd.json" || true
node -e '
const c = require(process.argv[1]), d = require(process.argv[2]);
if (c.overall !== d.overall) { console.error(`FAIL: classic scaffold ${c.overall} vs dynamic ${d.overall}`); process.exit(1); }
if (c.workflow.mode !== "classic" || d.workflow.mode !== "dynamic") { console.error("FAIL: mode not reported"); process.exit(1); }
' "$TMP/pc.json" "$TMP/pd.json"
grep -q '"workflow"' "$TMP/pm-classic/pm-os.config.json" && { echo "FAIL: classic scaffold wrote a workflow key"; exit 1; }
[ ! -e "$TMP/pm-classic/.claude/agents/product-manager.md" ] || { echo "FAIL: classic scaffold wrote a dynamic persona"; exit 1; }
for NAME in product-manager research-analyst lead-engineer customer-voice board-executive competitive-intel; do
  F="$TMP/pm-dynamic/.claude/agents/$NAME.md"
  [ -f "$F" ] || { echo "FAIL: persona $NAME not scaffolded"; exit 1; }
  # The workflow calls each persona by name, so the frontmatter name must match the file.
  grep -q "^name: $NAME$" "$F" || { echo "FAIL: $NAME.md frontmatter name does not match its file"; exit 1; }
done

cp -R tests/fixtures/pm-vault "$TMP/pm-mode"
stamp_focus "$TMP/pm-mode"
node --input-type=module -e "
import { defaultWorkflowConfig } from '$PWD/$PM_SCRIPTS/lib/vault-utils.mjs';
import fs from 'node:fs';
const file = process.argv[1];
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.workflow = defaultWorkflowConfig();
fs.writeFileSync(file, JSON.stringify(config, null, 2));
" "$TMP/pm-mode/pm-os.config.json"
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-mode"
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-mode" --json > "$TMP/pm-mode.json"
node -e '
const r = require(process.argv[1]);
if (r.overall !== 100 || r.workflow.mode !== "dynamic") { console.error(`FAIL: the filled vault in dynamic mode scored ${r.overall} (${r.workflow.mode})`); process.exit(1); }
' "$TMP/pm-mode.json"
echo "pm-dynamic: classic and dynamic score identically; the filled vault stays 100/100 in dynamic mode; classic carries no workflow"

# A 2.x vault upgrades in place: the key is added once, personas carry the vault's own product,
# and re-running changes nothing.
cp -R tests/fixtures/pm-vault "$TMP/pm-upgrade"
stamp_focus "$TMP/pm-upgrade"
node "$PM_SCRIPTS/create-vault.mjs" --target "$TMP/pm-upgrade" --mode dynamic --preset lean >/dev/null
cp "$TMP/pm-upgrade/pm-os.config.json" "$TMP/pm-upgrade.json"
node "$PM_SCRIPTS/create-vault.mjs" --target "$TMP/pm-upgrade" --mode dynamic --preset lean >/dev/null
cmp -s "$TMP/pm-upgrade/pm-os.config.json" "$TMP/pm-upgrade.json" || { echo "FAIL: a second upgrade changed the config"; exit 1; }
grep -q "Northwind" "$TMP/pm-upgrade/.claude/agents/product-manager.md" || { echo "FAIL: upgrade filled a persona with another product"; exit 1; }
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-upgrade"
echo "pm-dynamic: a 2.x vault upgrades in place, idempotently, with its own product name"

# A workflow config the validator cannot trust is a config error (2), never a fallback to defaults.
cp "$TMP/pm-mode/pm-os.config.json" "$TMP/pm-good.json"
for BAD in \
  '.workflow.mode = "turbo"' \
  '.workflow.version = 2' \
  '.workflow.colour = "blue"' \
  '.workflow.pipelines.roadmap = {"enabled":true,"stages":{}}' \
  '.workflow.pipelines.prd.stages.draft.enabled = false' \
  '.workflow.pipelines.prd.stages.discover.agents = 17' \
  '.workflow.pipelines.prd.stages.review.agents = 0' \
  '.workflow.pipelines.prd.stages.publish = {"enabled":true,"agents":1,"skills":[]}' \
  '.workflow.pipelines.prd.stages.draft.agent = "Product Manager"' \
  '.workflow.pipelines.prd.stages.draft.skills = ["ok", 3]' \
  '.workflow.pipelines.prd.stages.review.lenses = []' \
  '.workflow.pipelines.prd.stages.review.lenses = [{"name":"engineer","agent":null},{"name":"engineer","agent":null}]' \
  '.workflow.pipelines.prd.stages.draft.lenses = [{"name":"engineer","agent":null}]' \
  '.workflow.pipelines.prd.stages.review.enabled = false' \
  '.workflow.pipelines.prd.stages.deliver.targets = ["confluence"]' \
  '.workflow.pipelines.prd.stages.deliver.targets = ["slack"]' \
  '.workflow.pipelines.prd-review.stages.deliver.targets = ["jira"]' \
  '.workflow.destinations = {"notion":"x"}' \
  '.workflow.grilling = {"skill":""}' \
  '.workflow.pipelines.prd.enabled = "yes"'; do
  node -e "
const fs = require('fs'); const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const [p, v] = process.argv[3].split(' = ');
const k = p.split('.').slice(1); let o = c; while (k.length > 1) o = o[k.shift()]; o[k[0]] = JSON.parse(v);
fs.writeFileSync(process.argv[2], JSON.stringify(c));
" "$TMP/pm-good.json" "$TMP/pm-mode/pm-os.config.json" "$BAD"
  expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-mode"
done
# Every pipeline off is dynamic mode with nothing to run.
node -e "
const fs = require('fs'); const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
for (const p of Object.values(c.workflow.pipelines)) p.enabled = false;
fs.writeFileSync(process.argv[2], JSON.stringify(c));
" "$TMP/pm-good.json" "$TMP/pm-mode/pm-os.config.json"
expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-mode"
# A target is valid only with its integration on and a destination named.
node -e "
const fs = require('fs'); const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
c.integrations.confluence = true; c.workflow.destinations = { confluence: 'PM/Specs' };
c.workflow.pipelines.prd.stages.deliver.targets = ['confluence'];
fs.writeFileSync(process.argv[2], JSON.stringify(c));
" "$TMP/pm-good.json" "$TMP/pm-mode/pm-os.config.json"
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-mode"
cp "$TMP/pm-good.json" "$TMP/pm-mode/pm-os.config.json"
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-mode"
echo "pm-dynamic: 21 broken workflow configs exit 2; a target with its integration and destination passes"

# Local visibility: listed in .git/info/exclude (never .gitignore), invisible to git status, and
# reported; a directory that is not a repository cannot be local this way.
mkdir -p "$TMP/pm-local" && git -C "$TMP/pm-local" init -q
node "$PM_SCRIPTS/create-vault.mjs" --target "$TMP/pm-local" --product "CI Product" --mode dynamic --visibility local >/dev/null
grep -q '^/ABOUT-ME/$' "$TMP/pm-local/.git/info/exclude" || { echo "FAIL: vault not excluded"; exit 1; }
grep -q '^/.claude/agents/product-manager.md$' "$TMP/pm-local/.git/info/exclude" || { echo "FAIL: personas not excluded"; exit 1; }
[ ! -e "$TMP/pm-local/.gitignore" ] || { echo "FAIL: local visibility wrote a .gitignore"; exit 1; }
[ -z "$(git -C "$TMP/pm-local" status --porcelain)" ] || { echo "FAIL: local vault shows in git status"; git -C "$TMP/pm-local" status --porcelain; exit 1; }
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-local" --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{if(JSON.parse(s).visibility!=="local"){console.error("FAIL: visibility not reported");process.exit(1)}})'
expect_exit 2 node "$PM_SCRIPTS/create-vault.mjs" --target "$TMP/pm-not-a-repo" --visibility local
echo "pm-local: excluded via .git/info/exclude, invisible to git status; a non-repo exits 2"

# /blvck-pm:check scores a discovered reading from a scratch config before the user agrees to
# save it: the reading must work from outside the vault and leave the vault untouched.
cp -R tests/fixtures/pm-vault "$TMP/pm-discover"
stamp_focus "$TMP/pm-discover"
mv "$TMP/pm-discover/ABOUT-ME" "$TMP/pm-discover/00-me"
mv "$TMP/pm-discover/pm-os.config.json" "$TMP/pm-discovered.json"
node -e '
const fs = require("fs");
const file = process.argv[1];
const c = JSON.parse(fs.readFileSync(file, "utf8"));
for (const [role, value] of Object.entries(c.paths)) c.paths[role] = value.replace(/^ABOUT-ME/, "00-me");
fs.writeFileSync(file, JSON.stringify(c, null, 2));
' "$TMP/pm-discovered.json"
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-discover" --json > "$TMP/pm-before.json" || true
expect_exit 0 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-discover" --config "$TMP/pm-discovered.json"
node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-discover" --config "$TMP/pm-discovered.json" --json > "$TMP/pm-after.json"
node -e '
const before = require(process.argv[1]), after = require(process.argv[2]);
if (!(before.overall < 100 && after.overall === 100)) { console.error(`FAIL: discovery should lift ${before.overall} to 100, got ${after.overall}`); process.exit(1); }
' "$TMP/pm-before.json" "$TMP/pm-after.json"
[ ! -e "$TMP/pm-discover/pm-os.config.json" ] || { echo "FAIL: scoring a scratch config wrote into the vault"; exit 1; }
expect_exit 2 node "$PM_SCRIPTS/validate-vault.mjs" --target "$TMP/pm-discover" --config "$TMP/no-such-config.json"
echo "pm-check: a discovered config scores from outside the vault without writing into it; a missing one exits 2"

node tests/pm-workflow-sim.mjs >/dev/null || { node tests/pm-workflow-sim.mjs; exit 1; }
# The simulation has to be able to fail: break a ceiling and the needs-input stop in copies of
# the script, and each copy must be caught.
PM_WF="plugins/blvck-pm/skills/pm-os/workflows/pm-work.js"
sed 's/limiter(stages\[researchStage\]\.agents)/limiter(Infinity)/' "$PM_WF" > "$TMP/mut-ceiling.js"
sed 's/limiter(stages\.review\.agents)/limiter(Infinity)/' "$PM_WF" > "$TMP/mut-review.js"
sed 's/if (doc\.openQuestions\.length) return needsInput/if (false) return needsInput/' "$PM_WF" > "$TMP/mut-ask.js"
for MUT in mut-ceiling mut-review mut-ask; do
  cmp -s "$PM_WF" "$TMP/$MUT.js" && { echo "FAIL: mutation $MUT did not change the script"; exit 1; }
  if PM_WORKFLOW_SCRIPT="$TMP/$MUT.js" node tests/pm-workflow-sim.mjs >/dev/null 2>&1; then
    echo "FAIL: the simulation did not catch $MUT"; exit 1
  fi
done
echo "pm-workflow: orchestration simulation passes and catches a broken ceiling or a skipped stop"

echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "1. Read feature_list.json to see current feature state"
echo "2. Pick ONE unfinished feature to work on"
echo "3. Implement only that feature"
echo "4. Re-run verification before claiming done"
