#!/usr/bin/env node
// Adapted from harness-creator (walkinglabs/learn-harness-engineering, MIT).
// Additions: auto-detects solo vs team layout; team runs extra hygiene findings
// (dangling dependencies, duplicate slugs, stale claims); an optional user map
// (.harness-map.json) scores a harness that keeps its own file names.
import path from 'node:path';
import {
  HarnessMapError,
  MAP_FILENAME,
  formatScoreReport,
  formatTeamFindings,
  loadHarnessFilesAuto,
  parseArgs,
  scoreHarness,
  teamFindings
} from './lib/harness-utils.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node scripts/validate-harness.mjs [--target DIR] [--layout solo|team] [--map FILE] [--json] [--min-score N] [--stale-days N]

Scores a project harness across five subsystems:
  instructions, state, verification, scope, lifecycle

Layout is auto-detected (features/*/status.json => team). Team layout adds
hygiene findings: dangling dependency IDs, duplicate slugs, stale claims,
in-progress features with no owner.

A repo that keeps its own file names can declare where its harness lives in
${MAP_FILENAME} (or --map FILE); the same checks then score it, and the report
marks the layout "adapted" and names the file behind each concept.

Exit codes:
  0  scored at least --min-score (default 70), no blocking findings
  1  scored below the bar, or has blocking findings, or nothing scoreable
  2  this command was misconfigured (bad flag, unreadable or invalid map)`);
  process.exit(0);
}

// `--flag` with nothing after it parses as boolean true. A flag that needs a value and did
// not get one is a usage error — better named than fed to path.resolve, which throws a
// stack trace a caller cannot tell apart from a scoring failure.
function flagValue(name) {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HarnessMapError(`--${name} needs a value`);
  return value;
}

// Config errors exit 2, distinct from a weak harness at 1. CI cannot tell "your map is
// broken" from "your repo is failing" if both come back as 1, and a broken map that reads
// as a failing repo is exactly the silent misdirection this whole feature exists to remove.
try {
  const target = path.resolve(flagValue('target') || args._[0] || process.cwd());
  const minScore = Number(args.minScore ?? 70);
  if (Number.isNaN(minScore)) throw new HarnessMapError(`--min-score must be a number (got ${JSON.stringify(args.minScore)})`);

  const { layout, baseLayout, files, resolution, routingNeedles, mapErrors, map, vocabulary } =
    await loadHarnessFilesAuto(target, { layout: flagValue('layout'), mapPath: flagValue('map') });

  const result = scoreHarness(files, { routingNeedles, vocabulary });
  result.layout = layout;
  result.baseLayout = baseLayout;
  result.map = map;
  result.resolution = resolution;
  result.mapErrors = mapErrors;

  // "We could not find your harness" and "your harness is bad" are different claims, and the
  // Math.max(1,...) floor cannot tell them apart — it reports 20/100 for an empty directory.
  // A boolean carries the distinction without widening `overall` from a number to a maybe-null.
  const unresolved = Object.entries(resolution).filter(([, entry]) => entry.via === 'unresolved');
  result.unresolvedConcepts = unresolved.map(([concept]) => concept);
  result.unscored = unresolved.length === Object.keys(resolution).length;

  let findings = null;
  if (layout === 'team') {
    findings = await teamFindings(target, { staleDays: Number(args.staleDays || 14) });
    result.teamFindings = findings;
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatScoreReport(result, target));
    if (findings) {
      console.log(formatTeamFindings(findings));
    }
  }

  const blockingFindings = findings
    ? findings.danglingDependencies.length + findings.duplicateSlugs.length + findings.invalidStatusFiles.length
    : 0;
  // A map error is a broken assertion the user wrote, so it fails the run on its own rather
  // than quietly costing a few points: declaring a tracker that is not there should never
  // pass just because the rest of the harness carried the score over the bar.
  if (result.unscored || result.overall < minScore || blockingFindings > 0 || mapErrors.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof HarnessMapError) {
    console.error(`Error: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
