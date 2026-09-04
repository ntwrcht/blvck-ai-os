#!/usr/bin/env node
// Structural validation of a PM vault. Mechanical checks only.
//
// The division of labour is the point: this script answers "does the PRD have a success
// metric", and /blvck-pm:validate answers "is it a good one". Putting judgment in here would
// make the score non-reproducible, which is the whole reason the script exists.
import path from 'node:path';
import {
  CONFIG_JSON,
  VaultConfigError,
  exists,
  formatVaultReport,
  listFiles,
  loadConfig,
  loadRoadmap,
  parseArgs,
  scoreVault
} from './lib/vault-utils.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node scripts/validate-vault.mjs [--target DIR] [--json] [--min-score N]

Scores a PM vault across five modules:
  identity, product, plan, roadmap, config

Paths resolve through ${CONFIG_JSON} when present, then pm-os.config.md, then defaults.
A declared path that escapes the vault is a config error, not a low score.

Exit codes:
  0  scored at least --min-score (default 70)
  1  scored below the bar, or nothing scoreable
  2  this command was misconfigured (bad flag, invalid or unsafe config)`);
  process.exit(0);
}

function flagValue(name) {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new VaultConfigError(`--${name} needs a value`);
  return value;
}

try {
  const target = path.resolve(flagValue('target') || args._[0] || process.cwd());
  const minScore = Number(args.minScore ?? 70);
  if (Number.isNaN(minScore)) {
    throw new VaultConfigError(`--min-score must be a number (got ${JSON.stringify(args.minScore)})`);
  }

  const config = await loadConfig(target);
  const roadmap = await loadRoadmap(target, config.paths);
  const files = await listFiles(target);
  const result = await scoreVault(target, { config, roadmap, files });

  result.config = { source: config.source, language: config.language, paths: config.paths, declared: config.declared };
  result.roadmap = { present: roadmap.present, errors: roadmap.errors, count: roadmap.items.length };

  // A path the user declared is an assertion. If it is not there, the run fails on its own
  // rather than costing a few points — otherwise a typo'd config reads as a passing vault,
  // which is the failure this resolution ladder exists to remove.
  const missingDeclared = [];
  for (const [role, value] of Object.entries(config.declared)) {
    if (!(await exists(path.join(target, value)))) missingDeclared.push(`${role}: "${value}" does not exist`);
  }
  result.missingDeclaredPaths = missingDeclared;

  // An unresolved {{PLACEHOLDER}} is an unkept promise in the same class as a declared path
  // that is not there, so it blocks independently of the score. Without this a vault fresh out
  // of create-vault.mjs passes at 72/100 with every interview answer still missing — a scaffold
  // reading as a finished vault, which is the failure this script exists to catch.
  const unresolved = result.modules.config.checks.find((c) => c.id === 'config.noPlaceholders');
  result.unresolvedPlaceholders = unresolved?.pass ? [] : (unresolved?.detail ?? []);

  // A malformed roadmap blocks on its own too. An item marked "measured" while carrying no
  // result claims an outcome finished with the number unknown — the precise failure the
  // lifecycle exists to prevent — and the surrounding vault will happily carry it over the
  // score bar. Found by the fixture, not by reading the code: it scored 96/100 and exited 0.

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatVaultReport(result, target, config, roadmap));
    if (missingDeclared.length) {
      console.log('Config errors (a declared path is an assertion; these are broken):');
      for (const message of missingDeclared) console.log(`  - ${message}`);
      console.log('');
    }
    if (roadmap.errors.length) {
      console.log('Roadmap errors (these block regardless of score):');
      for (const message of roadmap.errors) console.log(`  - ${message}`);
      console.log('');
    }
    if (result.unresolvedPlaceholders.length) {
      console.log(`Unfinished: ${result.unresolvedPlaceholders.length} file(s) still carry {{PLACEHOLDERS}}.`);
      console.log('Run /blvck-pm:setup to answer them. A scaffold is not a vault.');
      console.log('');
    }
  }

  if (result.unscored || result.overall < minScore || missingDeclared.length > 0
      || result.unresolvedPlaceholders.length > 0 || roadmap.errors.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof VaultConfigError) {
    console.error(`Error: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
