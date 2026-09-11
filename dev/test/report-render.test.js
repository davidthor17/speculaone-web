// Phase 6.9 and 7.1 — the delivered report, rendered.
//
// The earlier suites prove what the page decides. This one proves what it
// actually writes, by running the real renderer against the real decision
// layer and reading the markup back. What matters most:
//
//   A finding can never be read backwards. A catalogue label names the
//   standard, so it is shown quoted and introduced as a standard, never as a
//   sentence of its own (Phase 7.1: the first real report printed a missed
//   "No hair, stains, or odors" as though it were a compliment).
//
//   The same area is not repeated in five places. Recurring patterns are
//   dropped, inconsistent ones merged, and Areas to Watch is a marker on the
//   Section Performance rows rather than a list of its own.
//
//   Nothing internal reaches the page, and everything published is inert text.
//
//   A section with nothing to say does not appear, and the print path carries
//   the rules a browser's Save as PDF depends on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  interpretReport, glanceFigures, priorityGroups, prioritiesNote, sectionWatch,
  naSplit, presentFinding, methodologyNotes, displayPatterns, quotedStandard, buildHeadline,
} from '../../report-result.js';
import { renderReport } from '../../report-render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// The renderer touches the document only to set the title and wire the print
// button. A stand-in with exactly those two is all it needs.
globalThis.document = { title: '', getElementById: () => null };

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
    { id: 'arrival', label: 'Arrival & Entrance', total: 9, met: 7, partial: 2, missed: 0, na: 0 },
    { id: 'reception', label: 'Reception & Check-in', total: 8, met: 3, partial: 2, missed: 3, na: 0 },
    { id: 'room', label: 'Room Quality', total: 7, met: 4, partial: 1, missed: 2, na: 0 },
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

/**
 * What the audit console's buildPublishedResult() emits for the Phase 7.0
 * production audit's grades, transcribed from a replay through the Phase 7.1
 * writer rather than imported. Trimmed to what these tests need.
 */
const INTEL = () => ({
  headline: 'Good overall performance but below the Specula standard, with one high-priority issue requiring resolution.',
  summary: {
    overallPerformance: 'Good',
    primaryConcern: 'Standard not met: “No hair, stains, or odors”',
    operationalPattern: '3 related failures recorded within Room Quality.',
    positiveSignal: 'Pre-Arrival & Website',
  },
  keyMetrics: {
    urgentIssueCount: 1, priorityCount: 5, patternCount: 5, strengthCount: 1,
    notAssessedCount: 0, notAvailableCount: 0,
  },
  priorities: [
    { rank: 1, severity: 'high', title: 'Standard not met: “No hair, stains, or odors”', reason: 'Room Quality. A serious shortfall against the standard.', findingCount: 1, sectionIds: ['room'], affectedSections: ['Room Quality'] },
    { rank: 2, severity: 'moderate', title: 'Standard not met: “Wait time under 3 minutes”', reason: 'Reception & Check-in. A significant shortfall against the standard.', findingCount: 1, sectionIds: ['reception'], affectedSections: ['Reception & Check-in'] },
    { rank: 3, severity: 'moderate', title: 'Standard not met: “Noise levels acceptable”', reason: 'Room Quality. A significant shortfall against the standard.', findingCount: 1, sectionIds: ['room'], affectedSections: ['Room Quality'] },
    { rank: 4, severity: 'low', title: 'Four standards not fully met in Reception & Check-in', reason: '“Guest addressed by name”, “Staff knowledgeable: local tips and amenities”, “Total check-in time reasonable” and one more. Each a minor shortfall against the standard.', findingCount: 4, sectionIds: ['reception'], affectedSections: ['Reception & Check-in'] },
    { rank: 5, severity: 'low', title: 'Two standards not fully met in Arrival & Entrance', reason: '“Guest greeted within 30 seconds” and “Cushions fluffed, no visible dust”. Each a minor shortfall against the standard.', findingCount: 2, sectionIds: ['arrival'], affectedSections: ['Arrival & Entrance'] },
  ],
  urgentIssueCount: 1,
  improvementCount: 4,
  patterns: [
    { type: 'recurring', severity: 'high', explanation: '3 related failures recorded within Room Quality.', sectionIds: ['room'] },
    { type: 'inconsistent', severity: 'high', explanation: 'Performance varies significantly within Room Quality, suggesting an inconsistent guest experience rather than a uniformly weak one.', sectionIds: ['room'] },
    { type: 'cross_area', severity: 'high', explanation: 'Findings about the physical condition of the property were recorded in Arrival & Entrance, Room Quality, Bathroom and Housekeeping.', sectionIds: ['arrival', 'bathroom', 'housekeeping', 'room'] },
    { type: 'recurring', severity: 'moderate', explanation: '5 related failures recorded within Reception & Check-in.', sectionIds: ['reception'] },
    { type: 'inconsistent', severity: 'moderate', explanation: 'Performance varies significantly within Reception & Check-in, suggesting an inconsistent guest experience rather than a uniformly weak one.', sectionIds: ['reception'] },
  ],
  strengths: [
    { sectionId: 'pre', title: 'Pre-Arrival & Website', reason: 'All 10 standards assessed here were met.', assessedCount: 10 },
    { sectionId: 'departure', title: 'Departure', reason: 'Every assessed standard was met, across 5 touchpoints.', assessedCount: 5 },
    { sectionId: 'facilities', title: 'Facilities', reason: 'The standard was met on all 4 touchpoints assessed.', assessedCount: 4 },
  ],
  sectionsToWatch: [
    { sectionId: 'room', sectionLabel: 'Room Quality', severity: 'high', findingCount: 3 },
    { sectionId: 'reception', sectionLabel: 'Reception & Check-in', severity: 'moderate', findingCount: 5 },
    { sectionId: 'arrival', sectionLabel: 'Arrival & Entrance', severity: 'low', findingCount: 2 },
  ],
});

const v2 = (over = {}) => payload({
  formatVersion: 2,
  score: { percent: 76, itemsMet: 41, itemsGraded: 54 },
  standardMet: false,
  criticalFailures: [{ itemId: 'RM-02', label: 'No hair, stains, or odors', note: null }],
  intelligence: INTEL(),
  ...over,
});

function html(row, items = []) {
  const result = interpretReport(row, items);
  assert.notEqual(result.mode, 'unavailable', 'fixture must render');
  const root = { innerHTML: '' };
  renderReport(root, result.view);
  return { markup: root.innerHTML, view: result.view };
}

/** Section titles, in the order they were rendered. */
const titles = (markup) => [...markup.matchAll(/<h2 class="rs-title"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
const numbers = (markup) => [...markup.matchAll(/<span class="rs-num"[^>]*>(\d+)<\/span>/g)].map((m) => m[1]);
const between = (markup, a, b) => markup.slice(markup.indexOf(a), b ? markup.indexOf(b) : undefined);
const text = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const LEGACY_ITEMS = [
  { item_id: 'RM-01', section_id: 'room', status: 'met' },
  { item_id: 'RM-02', section_id: 'room', status: 'met' },
  { item_id: 'RM-03', section_id: 'room', status: 'met' },
  { item_id: 'SP-01', section_id: 'spa', status: 'missed' },
];

// ── information architecture ───────────────────────────────────────────────

test('a full version 2 report renders every section, in the delivered order', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  assert.deepEqual(titles(markup), [
    'Executive Summary', 'Performance at a Glance', 'Key Strengths', 'Priorities',
    'Operational Patterns', 'Section Performance', 'Key Findings', 'Methodology and Scope',
  ]);
  assert.deepEqual(numbers(markup), ['01', '02', '03', '04', '05', '06', '07', '08']);
  assert.ok(markup.indexOf('class="rc"') < markup.indexOf('rs-executive'), 'the cover comes first');
  assert.ok(markup.indexOf('class="rf"') > markup.indexOf('rs-methodology'), 'the closing identification comes last');
});

test('Areas to Watch is no longer a list of its own', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  assert.equal(titles(markup).includes('Areas to Watch'), false);
  assert.equal(markup.includes('rs-watch'), false);
});

test('the cover names the property, place, date, audit type and reference, and no database id', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  const cover = markup.slice(0, markup.indexOf('</header>'));
  for (const s of ['Hotel Borealis', 'Reykjavik, Iceland · 5★', '12 September 2026', 'Full Audit', 'AHP-2026-TEST', 'Hotel Audit Report']) {
    assert.ok(cover.includes(s), `cover shows ${s}`);
  }
  assert.equal(markup.includes('a1'), false, 'the audit row id never reaches the page');
  assert.ok(markup.includes('Print or save as PDF'), 'the button says what it does');
});

test('the headline is the executive summary, and the auditor summary is labelled as theirs', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  const exec = between(markup, 'rs-executive', 'rs-glance');
  assert.ok(exec.includes('Good overall performance but below the Specula standard, with one high-priority issue requiring resolution.'));
  assert.ok(exec.includes("Auditor's summary"));
  // The summary lines restate the first priority, pattern and strength, which
  // are shown in full below. Rendering them here would say everything twice.
  assert.equal(exec.includes('Standard not met'), false);
});

test('an empty section is never rendered, and the numbering closes the gap', () => {
  const clean = v2({
    intelligence: {
      ...INTEL(),
      keyMetrics: { ...INTEL().keyMetrics, urgentIssueCount: 0, priorityCount: 0, patternCount: 0 },
      priorities: [], urgentIssueCount: 0, improvementCount: 0, patterns: [], sectionsToWatch: [],
    },
  });
  const { markup } = html(auditRow({ published_result: clean }));
  const t = titles(markup);
  for (const gone of ['Priorities', 'Areas for Attention', 'Operational Patterns']) {
    assert.equal(t.includes(gone), false, `${gone} is omitted when there is nothing in it`);
  }
  assert.deepEqual(numbers(markup), t.map((_, i) => String(i + 1).padStart(2, '0')));
});

test('no rendered report ever shows undefined, null, NaN or an empty heading', () => {
  const cases = [
    auditRow({ published_result: v2() }),
    auditRow({ published_result: v2({ intelligence: { ...INTEL(), priorities: [], urgentIssueCount: 0, improvementCount: 0, patterns: [], strengths: [], sectionsToWatch: [] } }) }),
    auditRow({ published_result: payload({ formatVersion: 2 }) }),
    auditRow({ published_result: v2({ intelligence: { nope: true } }) }),
    auditRow(),
    auditRow({ published_result: payload({ auditType: 'desk', summary: null }) }),
    auditRow({ published_result: payload({ score: { percent: null, itemsMet: 0, itemsGraded: 0 }, sections: [] }) }),
  ];
  for (const row of cases) {
    const { markup } = html(row);
    assert.equal(/\bundefined\b|\bNaN\b|>null</.test(markup), false, 'no placeholder leaks into the page');
    assert.equal(/<h2 class="rs-title"[^>]*><\/h2>/.test(markup), false, 'no untitled section');
  }
  const legacy = html(auditRow({ published_result: null }), LEGACY_ITEMS).markup;
  assert.equal(/\bundefined\b|\bNaN\b|>null</.test(legacy), false);
});

// ── findings read as findings ──────────────────────────────────────────────

test('a critical finding is shown against its standard, never as a bare sentence', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  const findings = between(markup, 'rs-findings', 'rs-methodology');
  assert.ok(findings.includes('<p class="report-failure-kicker">Critical finding</p>'));
  assert.ok(findings.includes('<p class="report-failure-label">Standard: “No hair, stains, or odors”</p>'));
  assert.equal(/<p class="report-failure-label">No hair/.test(findings), false, 'the standard is never printed as if it were the finding');
});

test('a missed priority reads as not met, with its severity said once', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  const prio = between(markup, 'rs-priorities', 'rs-patterns');
  const first = prio.slice(prio.indexOf('<article'), prio.indexOf('</article>'));
  assert.ok(first.includes('<p class="report-insight-kicker">High priority</p>'));
  assert.ok(first.includes('Standard not met: “No hair, stains, or odors”'));
  assert.ok(first.includes('Room Quality. A serious shortfall against the standard.'));
  assert.equal((text(first).match(/priority/gi) || []).length, 1, 'the word priority appears once per item');
});

test('a partly met standard reads as partly met, and a met one never appears', () => {
  const intel = INTEL();
  intel.priorities[4] = { ...intel.priorities[4], findingCount: 1, title: 'Standard partly met: “Strong water pressure, stable temperature”', reason: 'Bathroom. A minor shortfall against the standard.' };
  const { markup } = html(auditRow({ published_result: v2({ intelligence: intel }) }));
  assert.ok(markup.includes('Standard partly met: “Strong water pressure, stable temperature”'));
  assert.equal(markup.includes('Standard met'), false, 'a met standard is never listed as a priority or a finding');
});

test('a standard stored under its item id is never shown, and the page says so plainly', () => {
  assert.deepEqual(presentFinding({ itemId: 'RM-02', label: 'RM-02' }), { standard: null, note: null });
  assert.deepEqual(presentFinding({ itemId: 'RM-02', label: '  ' }), { standard: null, note: null });
  assert.deepEqual(presentFinding({ itemId: 'RM-02', label: 'No hair, stains, or odors', note: 'Room 402.' }), { standard: '“No hair, stains, or odors”', note: 'Room 402.' });
  const { markup } = html(auditRow({ published_result: v2({ criticalFailures: [{ itemId: 'RM-02', label: 'RM-02', note: null }] }) }));
  assert.equal(markup.includes('RM-02'), false, 'no item id reaches the page');
  assert.ok(markup.includes('The standard concerned was not named in this record.'));
});

test('a standard carrying an em dash is shown with a colon instead', () => {
  assert.equal(quotedStandard('Menu not generic — not hotel safe food'), '“Menu not generic: not hotel safe food”');
  const { markup } = html(auditRow({ published_result: null, critical_failures: [{ itemId: 'X', label: 'Menu not generic — not hotel safe food' }] }), LEGACY_ITEMS);
  assert.ok(markup.includes('Standard: “Menu not generic: not hotel safe food”'));
  assert.equal(/—/.test(text(markup)), false);
});

// ── performance at a glance: keyMetrics ────────────────────────────────────

test('keyMetrics reach the page as follow-up figures, never as a second score', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  const glance = between(markup, 'rs-glance', 'rs-strengths');
  assert.match(glance, /<dt>Urgent issue<\/dt><dd>1<\/dd>/);
  assert.match(glance, /<dt>Priorities identified<\/dt><dd>5<\/dd>/);
  assert.ok(glance.includes('76<span class="rg-pct">%</span>'), 'the one published score');
  assert.equal((glance.match(/%/g) || []).length, 1, 'and only that one percentage');
  for (const hidden of ['patternCount', 'strengthCount', 'overallScore', 'coverage']) {
    assert.equal(markup.includes(hidden), false);
  }
});

test('not assessed and not available are split only when they agree with the section rows', () => {
  const agree = v2({
    sections: [{ id: 'spa', label: 'Spa & Wellness', total: 11, met: 2, partial: 1, missed: 0, na: 8 }],
    intelligence: { ...INTEL(), keyMetrics: { ...INTEL().keyMetrics, notAssessedCount: 3, notAvailableCount: 5 } },
  });
  const a = html(auditRow({ published_result: agree }));
  assert.match(a.markup, /<dt>Not assessed<\/dt><dd>3<\/dd>/);
  assert.match(a.markup, /<dt>Not available<\/dt><dd>5<\/dd>/);
  assert.ok(a.view.methodology.some((m) => m.title === 'Not assessed and not available'));

  const disagree = v2({
    sections: [{ id: 'spa', label: 'Spa & Wellness', total: 11, met: 2, partial: 1, missed: 0, na: 8 }],
    intelligence: { ...INTEL(), keyMetrics: { ...INTEL().keyMetrics, notAssessedCount: 3, notAvailableCount: 4 } },
  });
  const d = html(auditRow({ published_result: disagree }));
  assert.match(d.markup, /<dt>Not applicable<\/dt><dd>8<\/dd>/, 'one honest figure rather than two that contradict it');
  assert.equal(d.markup.includes('Not assessed'), false);
});

test('an urgent count that may be cut off by the top five is stated as a floor', () => {
  const intel = { ...INTEL(), urgentIssueCount: 5, improvementCount: 0, keyMetrics: { ...INTEL().keyMetrics, urgentIssueCount: 5, priorityCount: 8 } };
  assert.deepEqual(glanceFigures({ total: 0 }, intel).followUp.find((f) => f.key === 'urgent'), { key: 'urgent', label: 'Urgent issues', value: '5+' });
  assert.equal(glanceFigures({ total: 0 }, INTEL()).followUp.find((f) => f.key === 'urgent').value, 1);
});

test('reports without intelligence show no follow-up figures at all', () => {
  for (const row of [auditRow(), auditRow({ published_result: payload({ formatVersion: 2 }) })]) {
    const { markup } = html(row);
    assert.equal(markup.includes('Follow-up'), false);
    assert.equal(markup.includes('Urgent issue'), false);
  }
});

// ── priorities ─────────────────────────────────────────────────────────────

test('priorities are split into urgent issues and improvement areas, in rank order', () => {
  assert.deepEqual(priorityGroups(INTEL()).map((g) => [g.label, g.items.map((p) => p.rank)]), [
    ['Urgent issues', [1]],
    ['Improvement areas', [2, 3, 4, 5]],
  ]);
  const { markup } = html(auditRow({ published_result: v2() }));
  assert.ok(markup.indexOf('Urgent issues<span') < markup.indexOf('Improvement areas<span'));
});

test('counts that do not add up to the list show it whole rather than guess a split', () => {
  const groups = priorityGroups({ ...INTEL(), urgentIssueCount: 4, improvementCount: 4 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, null);
});

test('a list that is the top of a longer one says so', () => {
  assert.equal(prioritiesNote(INTEL()), null, 'five of five needs no note');
  const more = { ...INTEL(), keyMetrics: { ...INTEL().keyMetrics, priorityCount: 8 } };
  assert.equal(prioritiesNote(more), 'The 5 highest of 8 priorities identified are shown here.');
});

test('only the published severity vocabulary ever reaches the markup', () => {
  const { markup, view } = html(auditRow({ published_result: v2() }));
  const tones = [...markup.matchAll(/class="report-insight report-insight-([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(tones.length >= 8, 'every strength, priority and pattern carries a tone');
  for (const t of tones) assert.ok(['high', 'moderate', 'low', 'positive', 'pattern'].includes(t), `${t} is not a known tone`);
  const kickers = [...markup.matchAll(/<p class="report-insight-kicker">([^<]*)<\/p>/g)].map((m) => m[1]);
  for (const k of kickers) assert.ok(['High priority', 'Moderate priority', 'Low priority'].includes(k), `${k} is not published vocabulary`);

  // A severity that slipped past validation still cannot become a class.
  view.priorityGroups[0].items[0] = { ...view.priorityGroups[0].items[0], severity: 'x" onmouseover="alert(1)' };
  const root = { innerHTML: '' };
  renderReport(root, view);
  assert.equal(root.innerHTML.includes('onmouseover'), false);
});

// ── patterns and areas to watch ────────────────────────────────────────────

test('recurring patterns are dropped, because they restate the section rows and priorities', () => {
  const shown = displayPatterns(INTEL(), payload().sections);
  assert.equal(shown.some((p) => /related failures/.test(p.text)), false);
  const { markup } = html(auditRow({ published_result: v2() }));
  assert.equal(markup.includes('Recurring issue'), false);
  assert.equal(markup.includes('related failures'), false);
});

test('inconsistent delivery is said once, naming every area, in journey order', () => {
  const shown = displayPatterns(INTEL(), payload().sections);
  const mixed = shown.filter((p) => p.key === 'inconsistent');
  assert.equal(mixed.length, 1, 'two inconsistent patterns become one line');
  assert.equal(mixed[0].text, 'Results in Reception & Check-in and Room Quality were mixed rather than uniformly weak, with standards met alongside those that were not.');
});

test('the cross-area pattern is kept as published, first', () => {
  const shown = displayPatterns(INTEL(), payload().sections);
  assert.equal(shown[0].key, 'cross_area');
  assert.equal(shown[0].text, INTEL().patterns[2].explanation);
  assert.equal(displayPatterns({ ...INTEL(), patterns: [INTEL().patterns[0]] }, payload().sections).length, 0,
    'an audit whose only pattern is recurring shows no patterns section at all');
  assert.equal(displayPatterns(null).length, 0);
});

test('patterns render in client vocabulary, and claim no cause', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  for (const label of ['Inconsistent delivery', 'Across multiple areas']) assert.ok(markup.includes(label));
  for (const id of ['cross_area', 'repeated_failure', 'consistency_gap', 'cross_section_dimension', 'Condition-related']) {
    assert.equal(markup.includes(id), false, `${id} is never shown`);
  }
  assert.ok(markup.includes('not why they occur'));
});

test('areas to watch are marked on their own section rows, with their published severity', () => {
  assert.deepEqual(sectionWatch(INTEL()).map((w) => [w.sectionId, w.severity]), [['room', 'high'], ['reception', 'moderate'], ['arrival', 'low']]);
  const { markup } = html(auditRow({ published_result: v2() }));
  const perf = between(markup, 'rs-sections', 'rs-findings');
  const row = (label) => perf.slice(perf.indexOf(label) - 120, perf.indexOf(label) + 400);
  assert.ok(row('Room Quality').includes('report-section-watch-high'));
  assert.ok(row('Reception &amp; Check-in').includes('report-section-watch-moderate'));
  assert.equal(row('Safety, Security &amp; Integrity').includes('report-section-watch'), false, 'an area with nothing to watch carries no marker');
  assert.ok(perf.includes('Areas marked Watch are where findings concentrated.'));
  assert.ok(perf.includes('<span class="sr-only">, high priority</span>'), 'the severity is spoken, not only coloured');
});

test('no area name is repeated across more than four places on the page', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  // Phase 7.0 printed Room Quality in five sections: priorities, two patterns,
  // areas to watch, section performance. Count the sections it appears in now.
  const sectionsWith = (name) => [...markup.matchAll(/<section class="rs rs-([a-z]+)"[\s\S]*?<\/section>/g)]
    .filter((m) => m[0].includes(name)).map((m) => m[1]);
  assert.ok(sectionsWith('Room Quality').length <= 3, `Room Quality appears in ${sectionsWith('Room Quality').join(', ')}`);
});

// ── strengths ──────────────────────────────────────────────────────────────

test('strengths render as distinct lines, never the same sentence three times', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  const s = between(markup, 'rs-strengths', 'rs-priorities');
  const reasons = [...s.matchAll(/<p class="report-insight-text">([^<]*)<\/p>/g)].map((m) => m[1].replace(/\d+/g, 'N'));
  assert.equal(reasons.length, 3);
  assert.equal(new Set(reasons).size, 3);
  assert.equal(/consistently strong performance/i.test(s), false);
});

// ── safety of the markup ───────────────────────────────────────────────────

test('no item id, finding id or internal field reaches any rendered report', () => {
  const leaky = INTEL();
  leaky.priorities[0] = { ...leaky.priorities[0], note: 'PRIVATE AUDITOR NOTE', findingIds: ['RM-02'], dimensions: ['condition'], itemId: 'RM-02' };
  leaky.sectionsToWatch[0] = { ...leaky.sectionsToWatch[0], itemId: 'RM-03', hasPattern: true, score: 41 };
  const { markup } = html(auditRow({ published_result: v2({ intelligence: leaky }) }));
  assert.equal(markup.includes('PRIVATE AUDITOR NOTE'), false);
  assert.equal(/\b[A-Z]{2,5}-\d{2}\b/.test(markup), false, 'no catalogue item id anywhere');
  for (const field of ['findingIds', 'dimensions', 'hasPattern']) assert.equal(markup.includes(field), false);
});

test('every newly rendered string is escaped, never interpreted as markup', () => {
  const evil = '<img src=x onerror="window.__x=1"><script>1</script>';
  const intel = {
    headline: evil,
    summary: { overallPerformance: evil },
    keyMetrics: { urgentIssueCount: 1, priorityCount: 1, patternCount: 1, strengthCount: 1, notAssessedCount: 0, notAvailableCount: 0 },
    priorities: [{ rank: 1, severity: 'high', title: evil, reason: evil, findingCount: 1, sectionIds: ['room'], affectedSections: [evil] }],
    urgentIssueCount: 1, improvementCount: 0,
    patterns: [
      { type: 'cross_area', severity: 'high', explanation: evil, sectionIds: ['room', 'arrival'] },
      { type: 'inconsistent', severity: 'high', explanation: evil, sectionIds: ['room'] },
    ],
    strengths: [{ sectionId: 'pre', title: evil, reason: evil, assessedCount: 4 }],
    sectionsToWatch: [{ sectionId: 'room', sectionLabel: evil, severity: 'high', findingCount: 1 }],
  };
  const row = auditRow({
    ref: evil,
    published_result: v2({
      property: { name: evil, city: evil, country: evil, category: evil },
      summary: evil,
      sections: [{ id: 'room', label: evil, total: 1, met: 0, partial: 0, missed: 1, na: 0 }],
      criticalFailures: [{ itemId: 'x', label: evil, note: evil }],
      intelligence: intel,
    }),
  });
  const { markup } = html(row);
  assert.equal(/<img|<script|onerror="/i.test(markup), false, 'no injected element or handler');
  assert.ok(markup.includes('&lt;img src=x onerror=&quot;'), 'the text is kept, as text');
});

test('the document title names the property, so a saved PDF is named after it', () => {
  html(auditRow({ published_result: v2() }));
  assert.equal(document.title, 'Hotel Borealis · Audit Report · Specula');
});

// ── legacy and version 1 ───────────────────────────────────────────────────

test('the legacy report still renders coherently, with its section-level stand-ins', () => {
  const { markup } = html(auditRow({ published_result: null }), LEGACY_ITEMS);
  const t = titles(markup);
  assert.ok(t.includes('Key Strengths'));
  assert.ok(t.includes('Areas for Attention'), 'the stand-in keeps its own honest heading');
  for (const gone of ['Priorities', 'Operational Patterns']) assert.equal(t.includes(gone), false);
  assert.equal(markup.includes('report-section-watch'), false, 'no watch markers without published intelligence');
});

test('a version 1 report keeps its derived headline, now in the same tone as version 2', () => {
  assert.ok(html(auditRow()).markup.includes('A consistently strong guest experience across this stay.'));
  assert.equal(buildHeadline({ percent: 81, standardMet: false, criticalFailureCount: 0 }), 'Good overall performance but below the Specula standard.');
  assert.equal(buildHeadline({ percent: 58, standardMet: false, criticalFailureCount: 2 }), 'Mixed overall performance, with two critical findings requiring attention.');
});

test('a Desk Review is not described as unannounced anywhere', () => {
  const { markup } = html(auditRow({ published_result: payload({ auditType: 'desk' }) }));
  assert.equal(/unannounced/i.test(markup), false);
  assert.ok(methodologyNotes('desk')[0].text.includes('an independent hotel assessment'));
});

// ── print and screen structure ─────────────────────────────────────────────

test('the print stylesheet carries what Save as PDF depends on', () => {
  const css = read('report.css');
  const print = css.slice(css.indexOf('@media print'));
  assert.ok(css.includes('@page'), 'page margins are set');
  assert.match(print, /\.nav, \.footer, \.skip-link, \.report-pdf-btn \{ display: none !important; \}/, 'no screen chrome in print');
  assert.match(print, /--report-bg: #FFFFFF/, 'ink on paper, through the tokens');
  assert.match(print, /print-color-adjust: exact/, 'result colours survive printing');
  assert.match(print, /break-inside: avoid/, 'no judgment is cut in half');
  assert.match(print, /\.rs-head[^{]*\{\s*break-after: avoid/, 'no heading is stranded at a page foot');
  assert.match(print, /\.rc-mark \{ display: block;/, 'the printed cover carries the wordmark');
  assert.match(css.slice(0, css.indexOf('@media print')), /\.rc-mark \{\s*display: none;/, 'which the screen, with its nav, does not repeat');
  assert.equal(/position:\s*(sticky|fixed)/.test(print), false, 'nothing sticky or fixed in print');
});

test('print keeps the closing block with the report and lets the figures flow', () => {
  const print = read('report.css').slice(read('report.css').indexOf('@media print'));
  assert.match(print, /\.rf \{ break-before: avoid;/, 'the closing block is never alone on a final page');
  assert.match(print, /\.rs-methodology \.rm-item:last-child \{ break-after: avoid;/);
  const keep = print.slice(print.indexOf('/* And no single judgment'), print.indexOf('/* The closing block'));
  assert.match(keep, /\.rg-grid/, 'each figure row stays whole');
  assert.equal(/\.rg-figures[,\s]/.test(keep), false, 'but the two rows are no longer held together, which blanked a third of page one');
});

test('report.html no longer forces every printed colour to one grey', () => {
  const page = read('report.html');
  assert.equal(page.includes('.report-main * { color: #111 !important; }'), false);
  assert.equal(/@media print/.test(page), false, 'print rules live in report.css, in one place');
});

test('the stylesheet steps down for small screens without a horizontal scroll source', () => {
  const css = read('report.css');
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /padding: 72px clamp\(20px, 6vw, 48px\) 96px/);
  assert.match(css, /minmax\(0, 1fr\)/);
  assert.equal(/min-width:\s*(\d{3,})px/.test(css), false, 'no fixed minimum wider than a phone');
});

// ── the data boundary ──────────────────────────────────────────────────────

test('the public page makes one request, to the report function, and reads no table', () => {
  // Phase 7.2. Direct anon SELECT on audits, audit_items and properties is
  // revoked, so a table read here would take every report offline.
  const src = read('report.js');
  assert.equal((src.match(/\.from\(/g) || []).length, 0, 'no direct table read');
  assert.equal(/\.select\(/.test(src), false, 'no column list: the function decides the shape');
  assert.equal((src.match(/\.rpc\(/g) || []).length, 1, 'exactly one request');
  assert.ok(src.includes(".rpc('get_public_report', request)"));
  for (const col of ['auditor_id', 'price_quoted', 'currency', 'opportunity_id', 'na_note', 'na_reason', 'audit_item_photos', 'public_token', 'snapshot']) {
    assert.equal(src.includes(col), false, `${col} is never named`);
  }
});

test('scope and naSplit are pure restatements of the payload', () => {
  assert.equal(naSplit({ na: 4 }, null), null);
  assert.deepEqual(naSplit({ na: 4 }, { keyMetrics: { notAssessedCount: 1, notAvailableCount: 3 } }), { notAssessed: 1, notAvailable: 3 });
  assert.ok(methodologyNotes('full', { sectionCount: 13 }).some((n) => n.text === 'Results were recorded across 13 areas of the guest experience, each shown under Section Performance.'));
  assert.deepEqual(methodologyNotes('full').map((n) => n.title), ['Assessment type', 'Score', 'Not applicable items', 'The Specula Mark']);
});

test('no copy the page writes uses an em dash or a double dash', () => {
  // CLAUDE.md, rule 2. Checked on the fully rendered page.
  for (const row of [auditRow({ published_result: v2() }), auditRow(), auditRow({ published_result: payload({ auditType: 'desk' }) })]) {
    assert.equal(/—|--/.test(text(html(row).markup)), false);
  }
  assert.equal(/—|--/.test(text(html(auditRow({ published_result: null }), LEGACY_ITEMS).markup)), false);
});
