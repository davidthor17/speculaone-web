// The published report reads its payload and nothing else.
//
// These tests exist because the report used to be a live query: it read the
// property row as it stands now, recomputed the score from item rows that stay
// writable after publication, and knew about only 13 of the 15 sections. The
// assertions below are mostly about what the report must NOT do.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  interpretReport, validatePayload, coercePayload, disclosureFor,
  resolveLegacyBasis, recomputeFromItems, worstStatusByItem,
  formatBasisDate, SECTION_LABELS, SECTION_ORDER,
  SUPPORTED_FORMAT_VERSION, PASS_THRESHOLD, AUDIT_TYPE_COPY,
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

// ── 1 to 3: a frozen report does not move ───────────────────────────────────

test('1. changing the property after publication changes nothing', () => {
  const before = interpretReport(auditRow());
  const after = interpretReport(auditRow({
    properties: { name: 'Renamed Hotel', city: 'Akureyri', country: 'Norway', category: '4★' },
  }));
  assert.equal(after.mode, 'payload');
  assert.deepEqual(after.view, before.view);
  assert.equal(after.view.property.name, 'Hotel Borealis');
  assert.equal(after.view.property.category, '5★');
});

test('2. changing audit items after publication changes nothing', () => {
  const row = auditRow();
  const before = interpretReport(row, []);
  const after = interpretReport(row, items([
    ['RM-01', 'room', 'missed'], ['RM-02', 'room', 'missed'], ['RM-03', 'room', 'missed'],
  ]));
  assert.deepEqual(after.view, before.view);
  assert.equal(after.view.score.percent, 92, 'the published score, not a recomputed one');
  assert.equal(after.view.sections.length, 2);
});

test('2b. the live critical_failures column cannot reach a frozen report', () => {
  const after = interpretReport(auditRow({
    critical_failures: [{ itemId: 'RM-99', label: 'Invented after publication', note: 'x' }],
  }));
  assert.deepEqual(after.view.criticalFailures, []);
  assert.equal(after.view.standardMet, true);
});

test('2c. the live auditor_summary cannot reach a frozen report', () => {
  const after = interpretReport(auditRow({ auditor_summary: 'Rewritten later.' }));
  assert.equal(after.view.summary, 'A calm, well run house.');
});

test('3. a new framework version after publication changes nothing', () => {
  // No version is read, stored or rendered. Proven by absence: nothing in the
  // view can carry one.
  const v = interpretReport(auditRow()).view;
  const flat = JSON.stringify(v);
  assert.equal(/frameworkVersion|checklistVersion|1\.3\.0|1\.2\.0/.test(flat), false);
});

// ── 4: the legacy path ──────────────────────────────────────────────────────

test('4. a null payload still recomputes, exactly as it always did', () => {
  const r = interpretReport(
    auditRow({ published_result: null }),
    items([
      ['RM-01', 'room', 'met'], ['RM-02', 'room', 'met'], ['RM-03', 'room', 'missed'],
      ['PRE-01', 'pre', 'met'],
    ]),
  );
  assert.equal(r.mode, 'legacy');
  assert.equal(r.view.score.percent, 75);
  assert.equal(r.view.score.itemsMet, 3);
  assert.equal(r.view.score.itemsGraded, 4);
  assert.equal(r.view.property.name, 'Hotel Borealis', 'the legacy path does read the live property');
  assert.equal(r.view.disclosure, 'This audit was carried out before Specula began recording '
    + 'the property details each assessment was measured against.');
});

test('4b. an undefined payload is treated as absent, not as broken', () => {
  const row = auditRow();
  delete row.published_result;
  assert.equal(interpretReport(row, items([['RM-01', 'room', 'met']])).mode, 'legacy');
});

test('4c. the legacy path reproduces the AHP-2026-8B10 figure', () => {
  const rows = [];
  for (let i = 1; i <= 47; i++) rows.push([`M-${i}`, 'room', 'met']);
  for (let i = 1; i <= 34; i++) rows.push([`P-${i}`, 'room', 'partial']);
  const r = interpretReport(auditRow({ published_result: null, critical_failures: [{ itemId: 'A' }, { itemId: 'B' }] }), items(rows));
  assert.equal(r.view.score.percent, 58);
  assert.equal(r.view.standardMet, false, 'two critical failures, and 58 is below 85');
  assert.equal(r.view.showMark, false);
});

// ── 5 to 7: fail closed, never recompute ────────────────────────────────────

const BROKEN = [
  ['malformed object', { nope: true }],
  ['a string that is not JSON', 'definitely not json'],
  ['an empty string', ''],
  ['an array', []],
  ['a number', 42],
  ['unknown formatVersion 2', payload({ formatVersion: 2 })],
  ['unknown formatVersion 0', payload({ formatVersion: 0 })],
  ['missing formatVersion', payload({ formatVersion: undefined })],
  ['missing property', payload({ property: undefined })],
  ['missing property name', payload({ property: { city: 'Reykjavik' } })],
  ['missing score', payload({ score: undefined })],
  ['non numeric score', payload({ score: { percent: 'ninety', itemsMet: 1, itemsGraded: 2 } })],
  ['missing sections', payload({ sections: undefined })],
  ['a section with no label', payload({ sections: [{ id: 'room', total: 1, met: 1, partial: 0, missed: 0, na: 0 }] })],
  ['a section with no counts', payload({ sections: [{ id: 'room', label: 'Room Quality' }] })],
  ['missing criticalFailures', payload({ criticalFailures: undefined })],
  ['missing standardMet', payload({ standardMet: undefined })],
  ['missing publishedAt', payload({ publishedAt: null })],
  ['unknown auditType', payload({ auditType: 'audit' })],
  ['missing basis', payload({ basis: undefined })],
  ['unknown basis state', payload({ basis: { state: 'thawed' } })],
  ['frozen basis with no date', payload({ basis: { state: 'frozen', recordedOn: null } })],
  ['summary of the wrong type', payload({ summary: 42 })],
];

test('5, 6, 7. a payload that cannot be trusted never falls back to live data', () => {
  const live = items([['RM-01', 'room', 'met'], ['RM-02', 'room', 'met']]);
  for (const [label, broken] of BROKEN) {
    const r = interpretReport(auditRow({ published_result: broken }), live);
    assert.equal(r.mode, 'unavailable', `${label}: must be unavailable`);
    assert.equal(r.reason, 'unsupported-format', `${label}: reason`);
    assert.equal(r.view, undefined, `${label}: no view is produced`);
    assert.ok(r.errors.length > 0, `${label}: reports why`);
  }
});

test('5b. an unavailable report exposes no score at all', () => {
  const r = interpretReport(auditRow({ published_result: { nope: true } }), items([['RM-01', 'room', 'met']]));
  assert.equal(JSON.stringify(r).includes('percent'), false);
});

test('a missing audit row is not-found, which is not the same as unsupported', () => {
  const r = interpretReport(null);
  assert.equal(r.mode, 'unavailable');
  assert.equal(r.reason, 'not-found');
});

// ── 8: all fifteen sections ─────────────────────────────────────────────────

test('8. the section map knows all fifteen sections', () => {
  assert.equal(SECTION_ORDER.length, 15);
  for (const id of ['facilities', 'safety']) {
    assert.ok(SECTION_LABELS[id], `${id} has a label`);
  }
});

test('8b. the legacy path now renders facilities and safety instead of dropping them', () => {
  const r = interpretReport(auditRow({ published_result: null }), items([
    ['FAC-01', 'facilities', 'met'],
    ['SAF-01', 'safety', 'missed'],
    ['RM-01', 'room', 'met'],
  ]));
  const ids = r.view.sections.map((s) => s.id);
  assert.deepEqual(ids, ['room', 'facilities', 'safety'], 'in checklist order');
  assert.equal(r.view.sections.find((s) => s.id === 'safety').label, 'Safety, Security & Integrity');
  // And the totals still include them, as they always did.
  assert.equal(r.view.score.itemsGraded, 3);
});

test('8c. a payload renders every section it carries, whatever the reader knows', () => {
  const r = interpretReport(auditRow({
    published_result: payload({
      sections: SECTION_ORDER.map((id) => ({
        id, label: SECTION_LABELS[id], total: 2, met: 2, partial: 0, missed: 0, na: 0,
      })).concat([{ id: 'future', label: 'A Section Added Later', total: 1, met: 1, partial: 0, missed: 0, na: 0 }]),
    }),
  }));
  assert.equal(r.view.sections.length, 16, 'including one the reader has never heard of');
  assert.equal(r.view.sections[15].label, 'A Section Added Later');
});

// ── 9 to 11: the Mark hierarchy ─────────────────────────────────────────────

test('9. a passing Full Audit carries the Specula Mark', () => {
  const r = interpretReport(auditRow({ published_result: payload({ auditType: 'full', standardMet: true }) }));
  assert.equal(r.view.showMark, true);
  assert.equal(r.view.statusTitle, 'Certified by Specula');
  assert.equal(r.view.auditTypeLabel, 'Full Audit');
});

test('9b. a failing Full Audit carries no Mark and says so without the retired word', () => {
  const r = interpretReport(auditRow({ published_result: payload({ auditType: 'full', standardMet: false }) }));
  assert.equal(r.view.showMark, false);
  assert.equal(r.view.statusTitle, 'Does not currently meet the Specula standard');
  assert.equal(r.view.statusSub, 'Full Audit · the Specula Mark is not awarded for this audit.');
});

test('10. a passing Spot Audit is Reviewed by Specula and carries NO Mark', () => {
  const r = interpretReport(auditRow({ published_result: payload({ auditType: 'spot', standardMet: true }) }));
  assert.equal(r.view.showMark, false, 'the Mark is reserved for Full Audits');
  assert.equal(r.view.statusTitle, 'Reviewed by Specula');
  assert.equal(r.view.auditTypeLabel, 'Spot Audit');
});

test('10b. a failing Spot Audit claims no status', () => {
  const r = interpretReport(auditRow({ published_result: payload({ auditType: 'spot', standardMet: false }) }));
  assert.equal(r.view.showMark, false);
  assert.equal(r.view.statusSub, 'Spot Audit · this audit does not carry a status.');
});

test('11. a Desk Review carries no Mark and no status, however it scored', () => {
  for (const standardMet of [true, false]) {
    const r = interpretReport(auditRow({ published_result: payload({ auditType: 'desk', standardMet }) }));
    assert.equal(r.view.showMark, false);
    assert.equal(r.view.statusTitle, null);
    assert.equal(r.view.statusSub, null);
  }
});

test('11b. no audit type other than full may ever show the Mark', () => {
  for (const [type, meta] of Object.entries(AUDIT_TYPE_COPY)) {
    assert.equal(meta.mark, type === 'full', `${type}`);
  }
});

test('11c. the Mark never appears on the legacy path for spot or desk either', () => {
  const rows = [];
  for (let i = 1; i <= 20; i++) rows.push([`M-${i}`, 'room', 'met']);
  for (const tier of ['spot', 'desk']) {
    const r = interpretReport(auditRow({ published_result: null, tier }), items(rows));
    assert.equal(r.view.score.percent, 100);
    assert.equal(r.view.showMark, false, `${tier} must never show the Mark`);
  }
  const full = interpretReport(auditRow({ published_result: null, tier: 'full' }), items(rows));
  assert.equal(full.view.showMark, true);
});

// ── 12: frozen critical failures ────────────────────────────────────────────

test('12. critical failure labels and notes come from the payload', () => {
  const r = interpretReport(auditRow({
    published_result: payload({
      standardMet: false,
      criticalFailures: [
        { itemId: 'RM-02', label: 'No hair, stains, or odors', note: 'Bathroom, room 402.' },
        { itemId: 'SAF-01', label: 'Fire exits unobstructed', note: null },
      ],
    }),
    critical_failures: [],
  }));
  assert.equal(r.view.criticalFailures.length, 2);
  assert.equal(r.view.criticalFailures[0].label, 'No hair, stains, or odors');
  assert.equal(r.view.criticalFailures[0].note, 'Bathroom, room 402.');
  assert.equal(r.view.criticalFailures[1].note, null);
});

// ── disclosure ──────────────────────────────────────────────────────────────

test('the frozen disclosure names a date and never a version', () => {
  const line = disclosureFor({ state: 'frozen', recordedOn: '2026-09-12T08:14:00.000Z' });
  assert.equal(line, 'Assessed against this property as recorded on 12 September 2026.');
  assert.equal(/version|1\.3|snapshot|frozen/i.test(line), false);
});

test('a frozen basis with an unreadable date degrades to incomplete, never to a guess', () => {
  assert.equal(
    disclosureFor({ state: 'frozen', recordedOn: 'not-a-date' }),
    'The recorded property details for this assessment are incomplete.',
  );
});

test('the three disclosure states are distinct and none of them alarms', () => {
  const lines = [
    disclosureFor({ state: 'frozen', recordedOn: '2026-09-12T08:14:00.000Z' }),
    disclosureFor({ state: 'legacy', recordedOn: null }),
    disclosureFor({ state: 'incomplete', recordedOn: null }),
  ];
  assert.equal(new Set(lines).size, 3);
  for (const line of lines) {
    assert.equal(/error|invalid|corrupt|fail|warning|unavailable/i.test(line), false, line);
    assert.equal(line.includes('—'), false, 'no em dashes in public copy');
    assert.equal(line.includes('–'), false, 'no en dashes in public copy');
  }
});

test('the score and the Mark are shown in every disclosure state', () => {
  for (const basis of [
    { state: 'frozen', recordedOn: '2026-09-12T08:14:00.000Z' },
    { state: 'legacy', recordedOn: null },
    { state: 'incomplete', recordedOn: null },
  ]) {
    const r = interpretReport(auditRow({ published_result: payload({ basis, standardMet: true }) }));
    assert.equal(r.mode, 'payload');
    assert.equal(r.view.score.percent, 92, `${basis.state}: the score is shown`);
    assert.equal(r.view.showMark, true, `${basis.state}: the Mark is shown`);
    assert.ok(r.view.disclosure, `${basis.state}: and so is the disclosure`);
  }
});

test('a legacy row with a recorded lock date reports frozen', () => {
  // The narrow window: frozen after the snapshot columns existed, published
  // before payloads did.
  assert.deepEqual(
    resolveLegacyBasis({ snapshot_locked_at: '2026-09-12T08:14:00.000Z' }),
    { state: 'frozen', recordedOn: '2026-09-12T08:14:00.000Z' },
  );
  assert.deepEqual(resolveLegacyBasis({}), { state: 'legacy', recordedOn: null });
});

// ── the plumbing ────────────────────────────────────────────────────────────

test('coercePayload separates absent from broken', () => {
  assert.deepEqual(coercePayload(null), { present: false, payload: null });
  assert.deepEqual(coercePayload(undefined), { present: false, payload: null });
  assert.equal(coercePayload('{"a":1}').present, true);
  assert.deepEqual(coercePayload('{"a":1}').payload, { a: 1 });
  assert.deepEqual(coercePayload('{oops'), { present: true, payload: null },
    'unparseable is present and broken, never absent');
});

test('a payload handed over as a JSON string still renders', () => {
  const r = interpretReport(auditRow({ published_result: JSON.stringify(payload()) }));
  assert.equal(r.mode, 'payload');
  assert.equal(r.view.score.percent, 92);
});

test('worst status wins across shifts on the legacy path too', () => {
  const worst = worstStatusByItem(items([
    ['RM-01', 'room', 'met'], ['RM-01', 'room', 'missed'], ['RM-02', 'room', 'partial'],
  ]));
  assert.equal(worst.get('RM-01').status, 'missed');
  assert.equal(worst.get('RM-02').status, 'partial');
});

test('N/A leaves the legacy denominator', () => {
  const { score } = recomputeFromItems(items([
    ['A', 'room', 'met'], ['B', 'room', 'na'], ['C', 'room', 'missed'],
  ]));
  assert.equal(score.itemsGraded, 2);
  assert.equal(score.percent, 50);
});

test('nothing graded scores null rather than zero', () => {
  assert.equal(recomputeFromItems([]).score.percent, null);
  const r = interpretReport(auditRow({ published_result: null }), []);
  assert.equal(r.view.score.percent, null);
  assert.equal(r.view.standardMet, false);
});

test('formatBasisDate refuses to invent a date', () => {
  assert.equal(formatBasisDate(null), null);
  assert.equal(formatBasisDate(''), null);
  assert.equal(formatBasisDate('nonsense'), null);
  assert.equal(formatBasisDate('2026-09-12T08:14:00.000Z'), '12 September 2026');
});

test('the supported version and threshold are what the console believes', () => {
  assert.equal(SUPPORTED_FORMAT_VERSION, 1);
  assert.equal(PASS_THRESHOLD, 85);
});

test('validatePayload accepts a well formed payload and reports every fault otherwise', () => {
  assert.deepEqual(validatePayload(payload()), []);
  const errors = validatePayload({ formatVersion: 7, auditType: 'x' });
  assert.ok(errors.length >= 4);
});
