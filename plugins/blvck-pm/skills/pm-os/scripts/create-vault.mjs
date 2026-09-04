#!/usr/bin/env node
// Scaffolds a PM vault without a human in the loop.
//
// This script exists so the vault can be TESTED. /blvck-pm:setup is an interview, which means
// that until now no vault could be produced without a person — which is why setup wrote the
// identity file under the wrong name for two releases and nothing caught it. The interview
// stays the way humans should create a vault; this is how CI creates one.
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  DEFAULT_PATHS,
  OPTIONAL_OUTPUT_DIRS,
  REQUIRED_OUTPUT_DIRS,
  VaultConfigError,
  copyTemplate,
  exists,
  parseArgs,
  writeText
} from './lib/vault-utils.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node scripts/create-vault.mjs [--target DIR] [--product NAME] [--slug SLUG] [--language en] [--agents a,b] [--force]

Scaffolds a PM vault:
  ABOUT-ME/            CLAUDE.md, anti-style.md, pm-principles.md, current-focus.md
  PROJECTS/<slug>/     CLAUDE.md, vision.md, roadmap.json, roadmap.md
  TEMPLATES/           the working set of document templates
  CLAUDE-OUTPUTS/      ${REQUIRED_OUTPUT_DIRS.join(', ')} (+ ${OPTIONAL_OUTPUT_DIRS.join(', ')})
  .claude/agents/      the chosen archetypes
  pm-os.config.json    machine-readable config (paths, language, roster)
  pm-os.config.md      the human-readable copy

Existing files are skipped unless --force. Placeholders left by this script are the ones a
human must answer; validate-vault.mjs reports them as unresolved rather than pretending
the vault is finished.`);
  process.exit(0);
}

try {
  const target = path.resolve(args.target || args._[0] || process.cwd());
  const product = typeof args.product === 'string' ? args.product : 'Example Product';
  const slug = typeof args.slug === 'string' ? args.slug : product.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const language = typeof args.language === 'string' ? args.language : 'en';
  const force = Boolean(args.force);
  const agents = typeof args.agents === 'string'
    ? args.agents.split(',').map((a) => a.trim()).filter(Boolean)
    : [];

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new VaultConfigError(`--slug must be lowercase alphanumeric with dashes (got ${JSON.stringify(slug)})`);
  }

  const paths = {};
  for (const [role, value] of Object.entries(DEFAULT_PATHS)) {
    paths[role] = value.replaceAll('{{PRODUCT_SLUG}}', slug);
  }

  // {{PRODUCT}} and {{PRODUCT_NAME}} are both in use across templates and agent archetypes.
  // Filling only one leaves the other as an unresolved placeholder, which the validator then
  // reports as an unfinished vault — correct behaviour, wrong cause.
  const replacements = {
    PRODUCT_NAME: product,
    PRODUCT: product,
    PRODUCT_SLUG: slug,
    LANGUAGE: language,
    VAULT_ROOT: target,
    AGENT_ROSTER: agents.length ? agents.map((a) => `- ${a}`).join('\n') : '- (none yet — run /blvck-pm:setup to pick a team)',
    DATE: new Date().toISOString().slice(0, 10)
  };

  await mkdir(target, { recursive: true });

  const written = [];
  const record = (result) => { written.push(result); return result; };

  // Source name != destination name for the identity file, and that is deliberate: every
  // workflow and every agent reads ABOUT-ME/CLAUDE.md. Getting this wrong is the exact defect
  // that shipped in 1.0.0 and 1.1.0.
  record(await copyTemplate('about-me.md', path.join(target, paths.identityFile), replacements, { force }));
  record(await copyTemplate('anti-style.md', path.join(target, paths.antiStyle), replacements, { force }));
  record(await copyTemplate('pm-principles.md', path.join(target, paths.principles), replacements, { force }));
  record(await copyTemplate('current-focus.md', path.join(target, paths.currentFocus), replacements, { force }));
  record(await copyTemplate('product-claude.md', path.join(target, paths.productContext), replacements, { force }));
  record(await copyTemplate('vision.md', path.join(target, paths.vision), replacements, { force }));
  record(await copyTemplate('roadmap.json', path.join(target, paths.roadmap), replacements, { force }));

  const docTemplates = ['prd', 'lightweight-spec', 'one-pager', 'prfaq', 'rice', 'metrics-tree',
    'jtbd-interview', 'research-synthesis', 'competitor-teardown', 'weekly-update',
    'launch-checklist', 'decision-log', 'gtm-brief', 'tracking-plan', 'funnel-analysis'];
  for (const name of docTemplates) {
    record(await copyTemplate(`${name}.md`, path.join(target, paths.templates, `${name}.md`), replacements, { force }));
  }

  for (const dir of [...REQUIRED_OUTPUT_DIRS, ...OPTIONAL_OUTPUT_DIRS]) {
    const full = path.join(target, paths.outputs, dir);
    await mkdir(full, { recursive: true });
    const keep = path.join(full, '.gitkeep');
    if (force || !await exists(keep)) await writeFile(keep, '');
  }

  for (const agent of agents) {
    record(await copyTemplate(path.join('agents', `${agent}.md`), path.join(target, paths.agents, `${agent}.md`), replacements, { force }));
  }

  const config = {
    version: 1,
    product: slug,
    productName: product,
    language,
    paths,
    completeness: {},
    integrations: { jira: false, confluence: false, drive: false, bigquery: false },
    agents
  };
  const configPath = path.join(target, 'pm-os.config.json');
  if (force || !await exists(configPath)) {
    await writeText(configPath, JSON.stringify(config, null, 2) + '\n');
    written.push({ path: configPath, status: 'written' });
  } else {
    written.push({ path: configPath, status: 'skipped' });
  }
  record(await copyTemplate('pm-config.md', path.join(target, 'pm-os.config.md'), replacements, { force }));

  const writtenCount = written.filter((w) => w.status === 'written').length;
  const skipped = written.filter((w) => w.status === 'skipped');
  console.log(`Vault scaffolded at ${target}`);
  console.log(`  ${writtenCount} files written, ${skipped.length} skipped (already present)`);
  for (const item of skipped) console.log(`  skipped: ${path.relative(target, item.path)}`);
  console.log('');
  console.log('Next: run /blvck-pm:setup to fill it in, or validate-vault.mjs to see what is unanswered.');
} catch (error) {
  if (error instanceof VaultConfigError) {
    console.error(`Error: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
