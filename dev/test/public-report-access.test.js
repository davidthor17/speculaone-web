// Phase 7.2 — the public request.
//
// The page used to read audits, audit_items and properties directly, which
// meant anon could also list them. It now makes one call to
// public.get_public_report and renders what comes back. What matters here:
//
//   Every link ever issued keeps working: ?ref= as before, ?token= from now on.
//
//   The function's envelope renders exactly the report the old row did, for a
//   payload-backed audit and for the legacy one alike.
//
//   Nothing the page cannot use is carried into it, and a report with a frozen
//   payload never reads item rows, whatever the envelope holds.

import test from 'node:test';
import assert from 'node:assert/strict';

import { reportRequest, envelopeToReport, interpretReport } from '../../report-result.js';

// Made up. Real tokens are access credentials and never belong in a test.
const TOKEN = '3f2a9c1e-7b4d-4e8a-9c0f-1d2e3f4a5b6c';

const payload = () => ({
  formatVersion: 1,
  publishedAt: '2026-09-14T10:22:41.108Z',
  auditedOn: '2026-09-12',
  auditType: 'full',
  property: { name: 'Hotel Borealis', city: 'Reykjavik', country: 'Iceland', category: '5★' },
  score: { percent: 92, itemsMet: 110, itemsGraded: 120 },
  standardMet: true,
  summary: 'A calm, well run house.',
  sections: [
    { id: 'arrival', label: 'Arrival & Entrance', total: 9, met: 7, partial: 2, missed: 0, na: 0 },
    { id: 'room', label: 'Room Quality', total: 7, met: 4, partial: 1, missed: 2, na: 0 },
  ],
  criticalFailures: [],
  basis: { state: 'frozen', recordedOn: '2026-09-12T08:14:00.000Z' },
});

const ITEMS = [
  { item_id: 'ARR-01', section_id: 'arrival', status: 'met' },
  { item_id: 'ARR-02', section_id: 'arrival', status: 'partial' },
  { item_id: 'RM-02', section_id: 'room', status: 'missed' },
  { item_id: 'RM-03', section_id: 'room', status: 'met' },
];
const PROPERTY = { name: 'Hotel Legacy', city: 'Akureyri', country: 'Iceland', category: '4★' };
const FAILURES = [{ itemId: 'RM-02', label: 'No hair, stains, or odors', note: null }];

// ── the URL ─────────────────────────────────────────────────────────────────

test('a token link asks for that token', () => {
  assert.deepEqual(reportRequest(`?token=${TOKEN}`), { p_token: TOKEN });
  assert.deepEqual(reportRequest(`?token=${TOKEN.toUpperCase()}`), { p_token: TOKEN.toUpperCase() });
});

test('a ref link asks for that ref, exactly as written', () => {
  assert.deepEqual(reportRequest('?ref=AHP-2026-8B10'), { p_ref: 'AHP-2026-8B10' });
  assert.deepEqual(reportRequest('?ref=ahp-2026-8b10'), { p_ref: 'ahp-2026-8b10' }, 'no case folding: the match is exact');
});

test('a token wins over a ref, and a malformed token never falls back to the ref', () => {
  assert.deepEqual(reportRequest(`?ref=AHP-2026-8B10&token=${TOKEN}`), { p_token: TOKEN });
  assert.equal(reportRequest('?token=not-a-token&ref=AHP-2026-8B10'), null);
  assert.equal(reportRequest(`?token=${TOKEN}x`), null);
  assert.equal(reportRequest('?token='), null);
});

test('a page with no identifier asks for nothing', () => {
  for (const search of ['', '?', '?ref=', '?case=A', undefined, null]) {
    assert.equal(reportRequest(search), null, String(search));
  }
});

// ── the envelope ────────────────────────────────────────────────────────────

test('no envelope is a report that does not exist, never a broken page', () => {
  for (const nothing of [null, undefined, [], 'x', 3]) {
    const { auditRow, items } = envelopeToReport(nothing);
    assert.equal(auditRow, null);
    assert.deepEqual(items, []);
    assert.equal(interpretReport(auditRow, items).reason, 'not-found');
  }
});

test('a payload-backed envelope renders exactly the report the old row did', () => {
  const oldRow = {
    id: '00000000-0000-0000-0000-000000000001', ref: 'AHP-2026-D699', date: '2026-09-12', status: 'published',
    tier: 'full', auditor_summary: 'Raw summary.', critical_failures: [], published_result: payload(), properties: PROPERTY,
  };
  const { auditRow, items } = envelopeToReport({
    ref: 'AHP-2026-D699', date: '2026-09-12', tier: 'full', published_result: payload(),
    auditor_summary: null, critical_failures: null, properties: null, items: null,
  });
  const before = interpretReport(oldRow, []);
  const after = interpretReport(auditRow, items);
  assert.equal(after.mode, 'payload');
  assert.deepEqual(after, before);
});

test('the legacy envelope renders exactly the report the old row and item query did', () => {
  const oldRow = {
    id: '00000000-0000-0000-0000-000000000002', ref: 'AHP-2026-8B10', date: '2026-08-20', status: 'published',
    tier: 'full', auditor_summary: 'Legacy summary.', critical_failures: FAILURES, published_result: null, properties: PROPERTY,
  };
  const { auditRow, items } = envelopeToReport({
    ref: 'AHP-2026-8B10', date: '2026-08-20', tier: 'full', published_result: null,
    auditor_summary: 'Legacy summary.', critical_failures: FAILURES, properties: PROPERTY, items: ITEMS,
  });
  const before = interpretReport(oldRow, ITEMS);
  const after = interpretReport(auditRow, items);
  assert.equal(after.mode, 'legacy');
  assert.deepEqual(after, before);
  assert.equal(after.view.property.name, 'Hotel Legacy');
});

test('a payload-backed report never reads item rows, even if an envelope carried some', () => {
  const { items } = envelopeToReport({ ref: 'AHP-2026-D699', published_result: payload(), items: ITEMS });
  assert.deepEqual(items, []);
});

test('a legacy envelope without items is an empty audit, not a crash', () => {
  const { auditRow, items } = envelopeToReport({ ref: 'AHP-2026-8B10', published_result: null });
  assert.deepEqual(items, []);
  assert.equal(interpretReport(auditRow, items).mode, 'legacy');
});

test('the row handed to the page carries no internal id and no token', () => {
  const { auditRow } = envelopeToReport({
    ref: 'AHP-2026-D699', published_result: payload(),
    id: 'leaked', property_id: 'leaked', public_token: TOKEN, auditor_id: 'leaked',
  });
  assert.deepEqual(Object.keys(auditRow).sort(),
    ['auditor_summary', 'critical_failures', 'date', 'properties', 'published_result', 'ref', 'tier']);
});
