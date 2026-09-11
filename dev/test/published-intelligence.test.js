// Phase 6.8 — the published intelligence contract, from the reader's side.
//
// The audit console decides what a published report may say. This repository
// decides whether to believe it, and these tests are that half of the bargain.
// Four rules, in order of how much damage getting them wrong would do:
//
//   A version 1 report renders exactly as it always has. Every report published
//   before this work is one, and none of them may move.
//
//   An unknown version still fails closed. Widening the accepted set by one is
//   the moment that guarantee is easiest to lose by accident.
//
//   A block that cannot be trusted is dropped, and the report underneath it
//   still renders. The base fields are load-bearing and fail closed; this block
//   is an enhancement, and taking a whole published report offline because a
//   supplementary list was malformed would be the worse outcome.
//
//   Nothing internal is ever rendered, because nothing internal is carried.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  interpretReport, validatePayload, buildHeadline,
  validateIntelligence, readIntelligence, PATTERN_TYPE_LABEL,
  PUBLIC_SEVERITIES, PUBLIC_PATTERN_TYPES, INTELLIGENCE_LIMITS,
} from '../../report-result.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const payload = (over = {}) => ({
  formatVersion: 1,
  publishedAt: '2026-09-14T10:22:41.108Z',
  auditedOn: '2026-09-12',
  auditType: 'full',
  property: { name: 'Hotel Borealis', city: 'Reykjavik', country: 'Iceland', category: '5★' },
  score: { percent: 92, itemsMet: 110, itemsGraded: 120 },
  standardMet: true,
  summary: 'A calm, well run house.',
  sections: [
    { id: 'room', label: 'Room Quality', total: 9, met: 8, partial: 1, missed: 0, na: 0 },
    { id: 'safety', label: 'Safety, Security & Integrity', total: 3, met: 3, partial: 0, missed: 0, na: 0 },
  ],
  criticalFailures: [],
  basis: { state: 'frozen', recordedOn: '2026-09-12T08:14:00.000Z' },
  ...over,
});

const auditRow = (over = {}) => ({
  id: 'a1', ref: 'AHP-2026-TEST', date: '2026-09-12', status: 'published', tier: 'full',
  auditor_summary: 'A calm, well run house.',
  critical_failures: [],
  properties: { name: 'Hotel Borealis', city: 'Reykjavik', country: 'Iceland', category: '5★' },
  published_result: payload(),
  ...over,
});

const items = (rows) => rows.map(([item_id, section_id, status]) => ({ item_id, section_id, status }));

/**
 * A hand-copied literal of what the audit console's buildPublishedResult()
 * actually emits, transcribed rather than imported.
 *
 * That is the point. The two repositories implement this contract twice, on
 * purpose, and a fixture written out here is what catches the day one of them
 * drifts from the other. If this stops matching what the console produces, one
 * of the two is wrong and this suite should be what says so.
 */
const INTEL = () => ({
  headline: 'Mixed overall performance, with one high-priority issue requiring resolution.',
  summary: {
    overallPerformance: 'Mixed',
    primaryConcern: 'Standard not met: “No hair, stains, or odors”',
    operationalPattern: '3 related failures recorded within Room Quality.',
    positiveSignal: 'Pre-Arrival & Website',
  },
  keyMetrics: {
    urgentIssueCount: 2,
    priorityCount: 5,
    patternCount: 3,
    strengthCount: 1,
    notAssessedCount: 0,
    notAvailableCount: 0,
  },
  priorities: [
    {
      rank: 1,
      severity: 'high',
      title: 'Standard not met: “No hair, stains, or odors”',
      reason: 'Room Quality. A serious shortfall against the standard.',
      findingCount: 1,
      sectionIds: ['room'],
      affectedSections: ['Room Quality'],
    },
    {
      rank: 2,
      severity: 'moderate',
      title: 'Standard not met: “Noise levels acceptable”',
      reason: 'Room Quality. A significant shortfall against the standard.',
      findingCount: 1,
      sectionIds: ['room'],
      affectedSections: ['Room Quality'],
    },
  ],
  urgentIssueCount: 1,
  improvementCount: 1,
  patterns: [
    {
      type: 'recurring',
      severity: 'high',
      explanation: '3 related failures recorded within Room Quality.',
      sectionIds: ['room'],
    },
    {
      type: 'cross_area',
      severity: 'high',
      explanation: 'Findings about the physical condition of the property were recorded in Arrival & Entrance, Room Quality and Safety, Security & Integrity.',
      sectionIds: ['arrival', 'room', 'safety'],
    },
  ],
  strengths: [
    {
      sectionId: 'pre',
      title: 'Pre-Arrival & Website',
      reason: 'All 4 standards assessed here were met.',
      assessedCount: 4,
    },
  ],
  sectionsToWatch: [
    { sectionId: 'room', sectionLabel: 'Room Quality', severity: 'high', findingCount: 3 },
  ],
});

// The score travels with the block, because the console builds both from one
// audit and bands the headline on this very figure. A fixture that paired a
// 92% score with a "Mixed" headline would be testing something the writer
// cannot produce.
const v2 = (over = {}) => payload({
  formatVersion: 2,
  score: { percent: 68, itemsMet: 13, itemsGraded: 19 },
  standardMet: false,
  intelligence: INTEL(),
  ...over,
});

// ── A. version 1 compatibility ─────────────────────────────────────────────

test('A: a version 1 payload renders exactly as it did before any of this', () => {
  const r = interpretReport(auditRow());
  assert.equal(r.mode, 'payload');
  assert.equal(r.view.intelligence, null, 'version 1 never carries a block');
  assert.deepEqual(r.view.strengths.map((s) => s.id), ['safety'],
    'and still shows the section level stand-ins it always showed');
  assert.equal(
    r.view.headline,
    buildHeadline({ percent: 92, standardMet: true, criticalFailureCount: 0, isDesk: false }),
    'with a headline derived here, not read from a block it does not have',
  );
});

test('A: a version 1 payload carrying a block ignores it rather than rendering it', () => {
  // Not something the console can produce, and not a reason to refuse the
  // report either. The base document is renderable, so it renders, and the
  // block a version 1 reader was never promised is simply not shown.
  const r = interpretReport(auditRow({ published_result: payload({ intelligence: INTEL() }) }));
  assert.equal(r.mode, 'payload');
  assert.equal(r.view.intelligence, null);
});

// ── B. a valid version 2 payload ───────────────────────────────────────────

test('B: a version 2 payload is accepted and its block reaches the view', () => {
  assert.deepEqual(validatePayload(v2()), []);
  const r = interpretReport(auditRow({ published_result: v2() }));
  assert.equal(r.mode, 'payload');
  assert.equal(r.view.intelligence.priorities.length, 2);
  assert.equal(r.view.intelligence.patterns.length, 2);
  assert.equal(r.view.intelligence.strengths.length, 1);
  assert.equal(r.view.intelligence.sectionsToWatch.length, 1);
});

test('B: a version 2 payload with no block at all is a complete report', () => {
  const p = payload({ formatVersion: 2 });
  assert.deepEqual(validatePayload(p), []);
  const r = interpretReport(auditRow({ published_result: p }));
  assert.equal(r.mode, 'payload');
  assert.equal(r.view.intelligence, null);
  assert.ok(r.view.headline, 'and still gets a headline, derived the version 1 way');
});

test('B: the published headline wins over the one this repository would derive', () => {
  const r = interpretReport(auditRow({ published_result: v2() }));
  assert.equal(r.view.headline, INTEL().headline);
  assert.notEqual(
    r.view.headline,
    buildHeadline({ percent: 92, standardMet: true, criticalFailureCount: 0, isDesk: false }),
    'the two genuinely differ, which is what makes this test prove anything',
  );
});

test('B: the coarse section stand-ins step aside for the real thing', () => {
  const r = interpretReport(auditRow({ published_result: v2() }));
  assert.deepEqual(r.view.strengths, [], 'no section level strength list beside a published one');
  assert.deepEqual(r.view.attention, [], 'and no section level attention list either');
  assert.ok(r.view.intelligence.strengths.length > 0, 'the published one is what is shown');
});

// ── C. a malformed block degrades, it does not take the page down ──────────

test('C: a malformed block is dropped and the base report still renders', () => {
  const broken = [
    ['not an object', 'nope'],
    ['an array', []],
    ['no headline', { ...INTEL(), headline: '' }],
    ['no summary', { ...INTEL(), summary: undefined }],
    ['priorities not an array', { ...INTEL(), priorities: 'many' }],
    ['an internal severity leaked through', {
      ...INTEL(), priorities: [{ ...INTEL().priorities[0], severity: 'zero_tolerance' }],
    }],
    ['an internal pattern type leaked through', {
      ...INTEL(), patterns: [{ ...INTEL().patterns[0], type: 'repeated_failure' }],
    }],
    ['more priorities than the contract allows', {
      ...INTEL(), priorities: Array.from({ length: 6 }, () => INTEL().priorities[0]),
    }],
    ['a priority with no reason', { ...INTEL(), priorities: [{ ...INTEL().priorities[0], reason: '' }] }],
    ['a pattern with no explanation', { ...INTEL(), patterns: [{ ...INTEL().patterns[0], explanation: '' }] }],
  ];
  for (const [label, intel] of broken) {
    assert.ok(validateIntelligence(intel).length > 0, `${label}: is reported as a problem`);
    const r = interpretReport(auditRow({ published_result: v2({ intelligence: intel }) }));
    assert.equal(r.mode, 'payload', `${label}: the report itself is still fine`);
    assert.equal(r.view.intelligence, null, `${label}: the block is dropped`);
    assert.equal(r.view.score.percent, 68, `${label}: and the published score is untouched`);
  }
});

test('C: a dropped block never causes a fallback to live data', () => {
  const live = items([['RM-01', 'room', 'missed'], ['RM-02', 'room', 'missed']]);
  const r = interpretReport(auditRow({ published_result: v2({ intelligence: { nope: true } }) }), live);
  assert.equal(r.view.score.percent, 68, 'the published figure, never one recomputed from today');
  assert.deepEqual(r.view.sections.map((s) => s.id), ['room', 'safety']);
});

test('C: dropping a block puts the version 1 stand-ins back rather than showing nothing', () => {
  const r = interpretReport(auditRow({ published_result: v2({ intelligence: { nope: true } }) }));
  assert.deepEqual(r.view.strengths.map((s) => s.id), ['safety']);
  assert.ok(r.view.headline, 'and the report still has a headline of its own');
});

// ── D. unknown versions still fail closed ─────────────────────────────────

test('D: an unknown version fails closed, block or no block', () => {
  for (const version of [0, 3, 99, '2', null, undefined]) {
    const r = interpretReport(auditRow({ published_result: v2({ formatVersion: version }) }));
    assert.equal(r.mode, 'unavailable', `formatVersion ${JSON.stringify(version)} must fail closed`);
    assert.equal(r.reason, 'unsupported-format');
    assert.equal(r.view, undefined, 'and produces no view a page could render');
  }
});

test('D: readIntelligence returns a block only for a version that has one', () => {
  assert.equal(readIntelligence(v2({ formatVersion: 3 })), null);
  assert.equal(readIntelligence(payload({ intelligence: INTEL() })), null, 'version 1 included');
  assert.equal(readIntelligence(payload({ formatVersion: 2 })), null, 'no block is not a broken block');
  assert.equal(readIntelligence(null), null);
  assert.deepEqual(readIntelligence(v2()), INTEL());
});

// ── F. nothing internal is rendered, because nothing internal is carried ───

test('F: no view built from a published block exposes internal audit machinery', () => {
  const r = interpretReport(auditRow({ published_result: v2() }));
  const flat = JSON.stringify(r.view).toLowerCase();
  for (const leak of [
    'zero_tolerance', 'weightclass', 'defaultseverity', 'derivedseverity',
    'escalated', 'evidence', 'decisionsummary', 'findingids', 'relatedpatternids',
    'coverage', 'repeated_failure', 'consistency_gap', 'cross_section_dimension',
    'auditor_id', 'opportunit',
  ]) {
    assert.equal(flat.includes(leak), false, `${leak} must not reach the rendered view`);
  }
});

// ── the contract's own vocabulary ─────────────────────────────────────────

test('every pattern type the contract allows has client facing wording', () => {
  for (const type of PUBLIC_PATTERN_TYPES) {
    assert.ok(PATTERN_TYPE_LABEL[type], `${type} has no label`);
    assert.equal(/_/.test(PATTERN_TYPE_LABEL[type]), false, `${type} label leaks an identifier`);
  }
  assert.deepEqual(PUBLIC_SEVERITIES, ['high', 'moderate', 'low']);
  assert.deepEqual(INTELLIGENCE_LIMITS, { priorities: 5, patterns: 5, strengths: 3, sectionsToWatch: 5 });
});

test('no copy in a published block reaches the page with an em dash or a double dash', () => {
  // CLAUDE.md, rule 2: permanent, no exceptions for report copy. This block is
  // written in the other repository, so this is the only place it gets checked
  // against the rule on the way in.
  const intel = INTEL();
  const strings = [
    intel.headline,
    ...Object.values(intel.summary),
    ...intel.priorities.flatMap((p) => [p.title, p.reason]),
    ...intel.patterns.map((p) => p.explanation),
    ...intel.strengths.flatMap((s) => [s.title, s.reason]),
    ...intel.sectionsToWatch.map((s) => s.sectionLabel),
    ...Object.values(PATTERN_TYPE_LABEL),
  ];
  for (const s of strings) {
    assert.equal(/—|--/.test(s), false, `"${s}" contains an em dash or double dash`);
  }
});
