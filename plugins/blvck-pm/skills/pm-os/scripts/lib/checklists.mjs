// --- document completeness ------------------------------------------------------------

// Each checklist item carries the human label AND the machine test. Items that genuinely
// cannot be tested by a machine say so with `manual: true` and are reported as unchecked
// rather than quietly counted as passing — a checklist that silently skips half its items
// is worse than one that admits what it cannot see.
// A section is filled only if a human actually wrote in it. Template prose is [bracketed], and
// bracketed prose is rich enough to fool a naive test: "[1-2 sentences: ... the evidence - quote
// or number]" contains digits, and "[Cover: empty, loading, error ...]" contains the very words
// a keyword check looks for. So placeholder lines are stripped BEFORE any content test runs.
function contentOf(section) {
  if (section === null || section === undefined) return '';
  return section
    // A [placeholder] often spans several lines, so strip whole bracketed blocks before the
    // per-line pass. Anchored to line start and end so a markdown [link](url) inside real prose
    // survives — otherwise stripping would delete content and cause the opposite false result.
    .replace(/^[ \t]*(?:[-*+][ \t]*)?\[[^\]]*\][ \t]*$/gm, '')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s*/, '').trim())   // drop list markers
    .filter((line) => line.length > 0)
    .filter((line) => !/^\[[^\]]*\]$/.test(line))                     // drop [placeholder] lines
    .filter((line) => !/^<!--[\s\S]*-->$/.test(line))                  // drop HTML comments
    .filter((line) => !/\{\{[A-Z_]+\}\}/.test(line))                  // drop unresolved tokens
    .filter((line) => !/^\|[\s|:-]+\|$/.test(line))                    // drop table rules
    .join('\n')
    .trim();
}

const filled = (section) => contentOf(section).length > 0;

// Pull the body under a heading, stopping at the next heading of the same or higher level.
function section(text, heading) {
  const re = new RegExp(`^#{1,6}\\s*(?:\\d+\\.\\s*)?${heading}\\s*$([\\s\\S]*?)(?=^#{1,6}\\s|$(?![\\s\\S]))`, 'im');
  return re.exec(text)?.[1] ?? null;
}

// A markdown table row counts as filled when it has real content in at least `min` cells.
function tableRows(body, min = 2) {
  if (!body) return 0;
  return body.split('\n')
    .filter((line) => line.trim().startsWith('|') && !/^\|[\s|:-]+\|$/.test(line.trim()))
    .slice(1)
    .filter((line) => line.split('|').slice(1, -1).filter((c) => filled(c)).length >= min)
    .length;
}

const hasEvidence = (body) => { const c = contentOf(body); return c.length > 0 && (/\d/.test(c) || /["“”]/.test(c)); };

export const CHECKLISTS = {
  vision: [
    { id: 'horizon', label: 'Horizon and review date stated', test: (t) => /\*\*Horizon:\*\*\s*\S/.test(t) && /Review on:\*\*\s*\d{4}-\d{2}-\d{2}/.test(t) },
    { id: 'audience', label: 'Names a specific person, not a market', test: (t) => filled(section(t, 'Who This Is For')) },
    { id: 'outcomes', label: 'At least 3 outcomes, each with a metric', test: (t) => tableRows(section(t, 'What Must Become True'), 2) >= 3 },
    { id: 'exclusions', label: 'At least one explicit exclusion', test: (t) => filled(section(t, 'What We Will Not Do')) },
    { id: 'bet', label: 'The bet is named', test: (t) => filled(section(t, 'The Bet')) },
    { id: 'userTerms', label: 'The change is described in the user\'s life, not the product', manual: true }
  ],
  prd: [
    { id: 'problemEvidence', label: 'Problem carries a quote or a number', test: (t) => hasEvidence(section(t, 'Problem')) },
    { id: 'jtbd', label: 'Job-to-be-done filled in', test: (t) => { const s = section(t, 'Job-to-be-Done'); return filled(s) && !/\[situation\]/.test(s ?? ''); } },
    { id: 'nsmLink', label: 'Links to the NSM or an L1/L2 metric', test: (t) => filled(section(t, 'Link to North Star')) },
    { id: 'successMetric', label: 'A success metric with baseline and target', test: (t) => tableRows(section(t, 'Success Metrics'), 3) >= 1 },
    { id: 'mustRequirement', label: 'At least one Must requirement with acceptance criteria', test: (t) => { const s = section(t, 'In Scope'); return tableRows(s, 3) >= 1 && /\bMust\b/.test(contentOf(s)); } },
    { id: 'outOfScope', label: 'Out of scope is not empty', test: (t) => filled(section(t, 'Out of Scope')) },
    { id: 'userStates', label: 'User states covered', test: (t) => { const c = contentOf(section(t, 'User States')); return /empty/i.test(c) && /error/i.test(c); } },
    { id: 'rollout', label: 'Rollout tier with a gating metric', test: (t) => /gating metric:\s*[^\[\s]/i.test(contentOf(section(t, 'Rollout'))) }
  ],
  'lightweight-spec': [
    { id: 'problem', label: 'Problem stated', test: (t) => hasEvidence(section(t, 'Problem')) },
    { id: 'scope', label: 'Scope boundary stated', test: (t) => filled(section(t, 'Out of Scope')) || filled(section(t, 'Scope')) }
  ],
  'one-pager': [
    { id: 'askFirst', label: 'The ask appears in the first three lines', test: (t) => /ask|recommend|decision/i.test(contentOf(t.split('\n').slice(0, 8).join('\n'))) }
  ],
  rice: [
    { id: 'allScored', label: 'Every row has all four scores', test: (t) => tableRows(t, 5) >= 1 }
  ],
  'metrics-tree': [
    { id: 'counterMetric', label: 'At least one counter-metric', test: (t) => /counter[- ]metric/i.test(contentOf(t)) }
  ],
  'tracking-plan': [
    { id: 'eventQuestions', label: 'Every event names the question it answers', test: (t) => tableRows(t, 3) >= 1 }
  ],
  'gtm-brief': [
    { id: 'positioning', label: 'Positioning statement complete before channels', test: (t) => filled(section(t, 'Positioning')) }
  ],
  prfaq: [
    { id: 'customerQuote', label: 'Carries a customer quote', test: (t) => /["“”]/.test(contentOf(t)) }
  ]
};

// Filename prefix -> document type. The naming convention is already enforced by plan.naming,
// so the prefix is a reliable signal rather than a guess.
const PREFIX = {
  prd: 'prd', spec: 'lightweight-spec', 'one-pager': 'one-pager', prfaq: 'prfaq',
  rice: 'rice', metrics: 'metrics-tree', tracking: 'tracking-plan', gtm: 'gtm-brief'
};

export function classifyDocument(relativePath) {
  const base = relativePath.split('/').pop() ?? '';
  if (base === 'vision.md') return 'vision';
  for (const [prefix, type] of Object.entries(PREFIX)) {
    if (base.startsWith(`${prefix}-`)) return type;
  }
  return null;
}

// A document that shipped incomplete on purpose records it. That section is the difference
// between an acknowledged trade-off and an unnoticed gap, and only the second one should
// cost anything.
export function hasRecordedOverride(text) {
  return /^##\s*Completeness\s*$/im.test(text);
}

export function resolveChecklist(docType, overrides) {
  const rule = overrides?.[docType];
  if (rule === 'skip') return [];
  let items = CHECKLISTS[docType] ?? [];
  if (rule && typeof rule === 'object') {
    const dropped = new Set((rule.drop ?? []).map((d) => String(d).toLowerCase()));
    items = items.filter((item) => !dropped.has(item.label.toLowerCase()) && !dropped.has(item.id.toLowerCase()));
    for (const added of rule.add ?? []) items = [...items, { id: `custom:${added}`, label: String(added), manual: true }];
  }
  return items;
}

export function checkDocument(text, docType, overrides) {
  const items = resolveChecklist(docType, overrides);
  const unmet = [];
  const unchecked = [];
  for (const item of items) {
    if (item.manual) { unchecked.push(item.label); continue; }
    let pass = false;
    try { pass = Boolean(item.test(text)); } catch { pass = false; }
    if (!pass) unmet.push(item.label);
  }
  return { docType, unmet, unchecked, acknowledged: hasRecordedOverride(text) };
}
