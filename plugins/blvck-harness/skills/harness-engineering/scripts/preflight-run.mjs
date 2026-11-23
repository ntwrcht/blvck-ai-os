#!/usr/bin/env node
// Finds what would stop a /blvck-harness:run before it starts, so the user clears it up front
// instead of finding the run stuck halfway. Each finding names the action the user must take.
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  GATE_HOOK_SETTINGS,
  HarnessMapError,
  exists,
  hasGateHooks,
  parseArgs,
  readLocalExclude,
  readText,
  readWorkflowConfig
} from './lib/harness-utils.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node scripts/preflight-run.mjs [--target DIR] [--verify CMD] [--skip-verify] [--no-fetch] [--json]

Checks what would block a /blvck-harness:run before it starts:
  must fix   the baseline verification fails; guarded mode's gates are not installed
  warnings   uncommitted changes, a branch behind the target, a hook that blocks git push,
             a host CLI that is not signed in, a verification script that leaves its worktree

Exit codes:
  0  nothing must be fixed (warnings may remain)
  1  at least one must-fix finding
  2  misconfigured (bad flag, not a git repository, invalid workflow config)`);
  process.exit(0);
}

function run(command, commandArgs, cwd, timeout = 60_000) {
  const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0, out: `${result.stdout || ''}${result.stderr || ''}`.trim(), missing: result.error?.code === 'ENOENT' };
}

async function readSettings(file) {
  if (!await exists(file)) return null;
  try {
    return JSON.parse(await readText(file));
  } catch {
    return null;
  }
}

// A PreToolUse hook that mentions git push, directly or in the script it runs, will refuse the
// push at delivery. git-guardrails is the common one.
async function pushBlockingHooks(root) {
  const files = [path.join(root, '.claude', 'settings.json'), path.join(root, GATE_HOOK_SETTINGS), path.join(os.homedir(), '.claude', 'settings.json')];
  const found = [];
  for (const file of files) {
    const settings = await readSettings(file);
    for (const group of settings?.hooks?.PreToolUse || []) {
      for (const hook of group.hooks || []) {
        const command = typeof hook.command === 'string' ? hook.command : '';
        if (!command || command.includes('blvck-harness/gate.mjs')) continue;
        let text = command;
        const scriptPath = command.match(/(\S+\.(?:sh|mjs|js|py|ts))/)?.[1]?.replace(/^["']|["']$/g, '').replace('$CLAUDE_PROJECT_DIR', root).replace(/^~/, os.homedir());
        if (scriptPath && await exists(path.resolve(root, scriptPath))) text += await readText(path.resolve(root, scriptPath));
        if (/git[^\n]{0,40}push|guardrail/i.test(text)) found.push({ file, command });
      }
    }
  }
  return found;
}

try {
  const target = path.resolve(typeof args.target === 'string' ? args.target : process.cwd());
  const root = run('git', ['rev-parse', '--show-toplevel'], target);
  if (!root.ok) throw new HarnessMapError(`${target} is not inside a git repository`);
  const repo = root.out;
  const config = await readWorkflowConfig(repo);
  const verify = typeof args.verify === 'string' ? args.verify : './init.sh';
  const mustFix = [];
  const warnings = [];
  const passed = [];

  if (config.mode === 'guarded') {
    const gitDir = run('git', ['rev-parse', '--absolute-git-dir'], repo).out;
    const settings = await readSettings(path.join(repo, GATE_HOOK_SETTINGS));
    if (!await exists(path.join(gitDir, 'blvck-harness', 'gate.mjs')) || !hasGateHooks(settings)) {
      mustFix.push({ id: 'gates', problem: `Guarded mode is on but its gates are not installed (the script in .git/blvck-harness/ or the hooks in ${GATE_HOOK_SETTINGS}).`, action: 'Run /blvck-harness:setup, which installs them, then start the run again.' });
    } else {
      passed.push('gates');
    }
  }

  if (!args.skipVerify) {
    const baseline = run('bash', ['-c', verify], repo, 14 * 60 * 1000);
    if (baseline.ok) {
      passed.push('baseline');
    } else {
      mustFix.push({
        id: 'baseline',
        problem: `Verification \`${verify}\` already fails before any work starts, so no run can prove its feature works. Last output:\n${baseline.out.split('\n').slice(-15).join('\n')}`,
        action: 'Make it pass first: start the service or database it needs, set the missing env or access, or fix the failing check. Then run the preflight again.'
      });
    }
  }

  const dirty = run('git', ['status', '--porcelain'], repo).out;
  if (dirty) {
    warnings.push({ id: 'uncommitted', problem: `There are uncommitted changes:\n${dirty.split('\n').slice(0, 10).join('\n')}`, action: config.mode === 'dynamic' ? 'Commit what the feature needs. Worktrees start from commits, so the workflow cannot see these changes.' : 'Commit or stash them, so the feature branch holds only this feature.' });
  } else {
    passed.push('uncommitted');
  }

  const targetBranch = config.delivery?.targetBranch;
  if (targetBranch) {
    if (!args.noFetch) run('git', ['fetch', '--quiet', 'origin', targetBranch], repo);
    const behind = run('git', ['rev-list', '--count', `HEAD..origin/${targetBranch}`], repo);
    if (behind.ok && Number(behind.out) > 0) {
      warnings.push({ id: 'behind', problem: `This checkout is ${behind.out} commit(s) behind origin/${targetBranch}. Long runs on a stale base end in merge conflicts or a review that rejects stale code.`, action: `Pull or rebase onto origin/${targetBranch} before starting.` });
    } else if (behind.ok) {
      passed.push('behind');
    }
  }

  const host = config.delivery?.host;
  if (host && host !== 'none') {
    const hooks = await pushBlockingHooks(repo);
    if (hooks.length) {
      warnings.push({ id: 'push-hook', problem: `A hook refuses git push (${hooks.map((hook) => path.relative(repo, hook.file) || hook.file).join(', ')}), so the run cannot push the branch or open the ${host === 'gitlab' ? 'MR' : 'PR'}.`, action: 'Plan to push the feature branch yourself when the run ends. Do not remove the guardrail for the run.' });
    } else {
      passed.push('push-hook');
    }
    const cli = host === 'gitlab' ? 'glab' : 'gh';
    const auth = run(cli, ['auth', 'status'], repo);
    if (!auth.ok) {
      warnings.push({ id: 'auth', problem: auth.missing ? `\`${cli}\` is not installed.` : `\`${cli}\` is not signed in.`, action: auth.missing ? `Install ${cli}, or open the ${host === 'gitlab' ? 'MR' : 'PR'} by hand from the link the run reports.` : `Run \`${cli} auth login\` before starting.` });
    } else {
      passed.push('auth');
    }
  }

  // Dynamic runs verify inside worktrees. A script that changes to its own folder checks the main
  // checkout there instead, so a failing worktree can pass, or a passing one can fail.
  if (config.mode === 'dynamic' && await readLocalExclude(repo) && await exists(path.join(repo, 'init.sh'))) {
    const init = await readText(path.join(repo, 'init.sh'));
    if (/cd\s+["']?\$\(\s*dirname\s+["']?\$(0|\{?BASH_SOURCE)/.test(init)) {
      warnings.push({ id: 'verify-cwd', problem: 'init.sh changes to its own folder, and a local harness runs it from the main checkout, so worktree verification checks the main checkout instead of the task.', action: 'Remove the `cd "$(dirname "$0")"` line so init.sh checks the directory it is run from.' });
    } else {
      passed.push('verify-cwd');
    }
  }

  const result = { mode: config.mode, ok: mustFix.length === 0, mustFix, warnings, passed };
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const section = (title, items) => items.length ? `${title}\n${items.map((item, index) => `${index + 1}. ${item.problem}\n   You: ${item.action}`).join('\n')}\n` : '';
    console.log(`Preflight (${config.mode} mode): ${mustFix.length} must fix, ${warnings.length} warning(s), ${passed.length} passed`);
    process.stdout.write(section('\nMust fix before the run:', mustFix));
    process.stdout.write(section('\nWarnings:', warnings));
  }
  if (mustFix.length) process.exitCode = 1;
} catch (error) {
  if (error instanceof HarnessMapError) {
    console.error(`Error: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
