#!/usr/bin/env node
// Adapted from harness-creator (walkinglabs/learn-harness-engineering, MIT).
// Additions: auto-detects solo vs team layout; team runs extra hygiene findings
// (dangling dependencies, duplicate slugs, stale claims).
import path from 'node:path';
import {
  formatScoreReport,
  formatTeamFindings,
  loadHarnessFilesAuto,
  parseArgs,
  scoreHarness,
  teamFindings
} from './lib/harness-utils.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node scripts/validate-harness.mjs [--target DIR] [--layout solo|team] [--json] [--min-score N] [--stale-days N]

Scores a project harness across five subsystems:
  instructions, state, verification, scope, lifecycle

Layout is auto-detected (features/*/status.json => team). Team layout adds
hygiene findings: dangling dependency IDs, duplicate slugs, stale claims,
in-progress features with no owner.

Exit code is 0 when the harness scores at least --min-score (default 70)
and, in team layout, has no dangling dependencies or duplicate slugs.`);
  process.exit(0);
}

const target = path.resolve(args.target || args._[0] || process.cwd());
const minScore = Number(args.minScore || 70);
const { layout, files } = await loadHarnessFilesAuto(target, args.layout);
const result = scoreHarness(files, { layout });
result.layout = layout;

let findings = null;
if (layout === 'team') {
  findings = await teamFindings(target, { staleDays: Number(args.staleDays || 14) });
  result.teamFindings = findings;
}

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Layout: ${layout}`);
  console.log(formatScoreReport(result, target));
  if (findings) {
    console.log(formatTeamFindings(findings));
  }
}

const blockingFindings = findings
  ? findings.danglingDependencies.length + findings.duplicateSlugs.length + findings.invalidStatusFiles.length
  : 0;
if (result.overall < minScore || blockingFindings > 0) {
  process.exitCode = 1;
}
