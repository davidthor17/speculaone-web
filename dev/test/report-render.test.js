// Phase 6.9 — the delivered report, rendered.
//
// The earlier suites prove what the page decides. This one proves what it
// actually writes, by running the real renderer against the real decision
// layer and reading the markup back. Four things matter most:
//
//   Nothing internal reaches the page: no item ids, no auditor notes carried in
//   the intelligence block, no identifiers, no severity word outside the
//   published three.
//
//   Everything published is inert text. A hotel name, a section label or a
//   frozen sentence containing markup renders as characters, never as markup.
//
//   A section with nothing to say does not appear, and the sections that do
//   are numbered without a gap.
//
//   The print path is structurally sound: the stylesheet carries the rules a
//   browser's Save as PDF depends on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  interpretReport, glanceFigures, priorityGroups, prioritiesNote, areasToWatch,
  naSplit, findingLabel, methodologyNotes,
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

// What the audit console's buildPublishedResult() emits, transcribed.
const INTEL = () => ({
  headline: 'Mixed overall performance, with 2 high priority issues to address.',
  summary: {
    overallPerformance: 'Mixed',
    primaryConcern: 'High priority: No hair, stains, or odors',
    operationalPattern: '3 related failures recorded within Room Quality.',
    positiveSignal: 'Consistently strong performance in Pre-Arrival & Website',
  },
  keyMetrics: {
    urgentIssueCount: 2, priorityCount: 5, patternCount: 3, strengthCount: 1,
    notAssessedCount: 0, notAvailableCount: 0,
  },
  priorities: [
    { rank: 1, severity: 'high', title: 'High priority: No hair, stains, or odors', reason: 'Recorded in Room Quality as Missed. Ranked high priority.', findingCount: 1, sectionIds: ['room'], affectedSections: ['Room Quality'] },
    { rank: 2, severity: 'high', title: 'High priority: Emergency exits present and unobstructed', reason: 'Recorded in Safety, Security & Integrity as Missed. Ranked high priority.', findingCount: 1, sectionIds: ['safety'], affectedSections: ['Safety, Security & Integrity'] },
    { rank: 3, severity: 'moderate', title: 'Moderate priority: Exterior clean and well-maintained', reason: 'Recorded in Arrival & Entrance as Missed. Ranked moderate priority.', findingCount: 1, sectionIds: ['arrival'], affectedSections: ['Arrival & Entrance'] },
    { rank: 4, severity: 'moderate', title: 'Moderate priority: All lights and technology functioning', reason: 'Recorded in Room Quality as Missed. Ranked moderate priority.', findingCount: 1, sectionIds: ['room'], affectedSections: ['Room Quality'] },
    { rank: 5, severity: 'low', title: 'Low priority: Noise levels acceptable', reason: 'Recorded in Room Quality as Partial. Ranked low priority.', findingCount: 1, sectionIds: ['room'], affectedSections: ['Room Quality'] },
  ],
  urgentIssueCount: 2,
  improvementCount: 3,
  patterns: [
    { type: 'recurring', severity: 'high', explanation: '3 related failures recorded within Room Quality.', sectionIds: ['room'] },
    { type: 'inconsistent', severity: 'high', explanation: 'Performance varies significantly within Room Quality.', sectionIds: ['room'] },
    { type: 'cross_area', severity: 'high', explanation: 'Condition-related findings appear across 3 areas of the stay.', sectionIds: ['arrival', 'room', 'safety'] },
  ],
  strengths: [
    { sectionId: 'pre', title: 'Consistently strong performance in Pre-Arrival & Website', reason: '4 of 4 assessed items met the standard in Pre-Arrival & Website, with no missed or partial items.', assessedCount: 4 },
  ],
  sectionsToWatch: [
    { sectionId: 'room', sectionLabel: 'Room Quality', severity: 'high', findingCount: 3 },
    { sectionId: 'arrival', sectionLabel: 'Arrival & Entrance', severity: 'moderate', findingCount: 1 },
  ],
});

const v2 = (over = {}) => payload({
  formatVersion: 2,
  score: { percent: 68, itemsMet: 13, itemsGraded: 19 },
  standardMet: false,
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
    'Operational Patterns', 'Section Performance', 'Key Findings', 'Areas to Watch',
    'Methodology and Scope',
  ]);
  assert.deepEqual(numbers(markup), ['01', '02', '03', '04', '05', '06', '07', '08', '09']);
  assert.ok(markup.indexOf('class="rc"') < markup.indexOf('rs-executive'), 'the cover comes first');
  assert.ok(markup.indexOf('class="rf"') > markup.indexOf('rs-methodology'), 'the closing identification comes last');
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
  const exec = markup.slice(markup.indexOf('rs-executive'), markup.indexOf('rs-glance'));
  assert.ok(exec.includes('Mixed overall performance, with 2 high priority issues to address.'));
  assert.ok(exec.includes("Auditor's summary"));
  // The summary lines restate the first priority, pattern and strength, which
  // are shown in full below. Rendering them here would say everything twice.
  assert.equal(exec.includes('Consistently strong performance'), false);
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
  for (const gone of ['Priorities', 'Areas for Attention', 'Operational Patterns', 'Areas to Watch']) {
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

// ── performance at a glance: keyMetrics ────────────────────────────────────

test('keyMetrics reach the page as follow-up figures, never as a second score', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  const glance = markup.slice(markup.indexOf('rs-glance'), markup.indexOf('rs-strengths'));
  assert.match(glance, /<dt>Urgent issues<\/dt><dd>2<\/dd>/);
  assert.match(glance, /<dt>Priorities identified<\/dt><dd>5<\/dd>/);
  assert.ok(glance.includes('68<span class="rg-pct">%</span>'), 'the one published score');
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
  assert.equal(a.markup.includes('<dt>Not applicable</dt>'), false);
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
  const { followUp } = glanceFigures({ total: 0 }, intel);
  assert.deepEqual(followUp.find((f) => f.key === 'urgent'), { key: 'urgent', label: 'Urgent issues', value: '5+' });
  const exact = glanceFigures({ total: 0 }, INTEL()).followUp.find((f) => f.key === 'urgent');
  assert.equal(exact.value, 2, 'an ordinary count is a plain number');
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
  const groups = priorityGroups(INTEL());
  assert.deepEqual(groups.map((g) => [g.label, g.items.map((p) => p.rank)]), [
    ['Urgent issues', [1, 2]],
    ['Improvement areas', [3, 4, 5]],
  ]);
  const { markup } = html(auditRow({ published_result: v2() }));
  assert.ok(markup.indexOf('Urgent issues<span') < markup.indexOf('Improvement areas<span'));
});

test('counts that do not add up to the list show it whole rather than guess a split', () => {
  const groups = priorityGroups({ ...INTEL(), urgentIssueCount: 4, improvementCount: 4 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, null);
  assert.equal(groups[0].items.length, 5);
});

test('a list that is the top of a longer one says so', () => {
  assert.equal(prioritiesNote(INTEL()), null, 'five of five needs no note');
  const more = { ...INTEL(), keyMetrics: { ...INTEL().keyMetrics, priorityCount: 7 } };
  assert.equal(prioritiesNote(more), 'The 5 highest of 7 priorities identified are shown here.');
  const { markup } = html(auditRow({ published_result: v2({ intelligence: more }) }));
  assert.ok(markup.includes('The 5 highest of 7 priorities identified are shown here.'));
});

test('only the published severity vocabulary ever reaches the markup', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  const tones = [...markup.matchAll(/class="report-insight report-insight-([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(tones.length >= 9, 'every strength, priority and pattern carries a tone');
  for (const t of tones) assert.ok(['high', 'moderate', 'low', 'positive', 'pattern'].includes(t), `${t} is not a known tone`);
  for (const internal of ['zero_tolerance', 'critical"', 'major', 'minor']) {
    assert.equal(markup.includes(`report-insight-${internal}`), false);
  }

  // A severity that slipped past validation still cannot become a class.
  const { view } = html(auditRow({ published_result: v2() }));
  view.priorityGroups[0].items[0] = { ...view.priorityGroups[0].items[0], severity: 'x" onmouseover="alert(1)' };
  const root = { innerHTML: '' };
  renderReport(root, view);
  assert.equal(root.innerHTML.includes('onmouseover'), false);
});

// ── patterns and areas to watch ────────────────────────────────────────────

test('patterns render in client vocabulary, never as internal identifiers', () => {
  const { markup } = html(auditRow({ published_result: v2() }));
  for (const label of ['Recurring issue', 'Inconsistent delivery', 'Across multiple areas']) {
    assert.ok(markup.includes(label), `${label} is shown`);
  }
  for (const id of ['recurring<', 'cross_area', 'repeated_failure', 'consistency_gap', 'cross_section_dimension']) {
    assert.equal(markup.includes(id), false, `${id} is never shown`);
  }
  assert.ok(markup.includes('not why they occur'), 'and the section says plainly it claims no cause');
});

test('sectionsToWatch renders as a ranked list of areas, with its published severity', () => {
  assert.deepEqual(areasToWatch(INTEL()), [
    { label: 'Room Quality', severity: 'high', findingCount: 3 },
    { label: 'Arrival & Entrance', severity: 'moderate', findingCount: 1 },
  ]);
  const { markup } = html(auditRow({ published_result: v2() }));
  const watch = markup.slice(markup.indexOf('rs-watch'), markup.indexOf('rs-methodology'));
  assert.ok(watch.indexOf('Room Quality') < watch.indexOf('Arrival &amp; Entrance'), 'in published order');
  assert.ok(watch.includes('High priority · 3 findings'));
  assert.ok(watch.includes('Moderate priority · 1 finding<'), 'singular for one');
  assert.equal(watch.includes('sectionId'), false);
});

// ── findings ───────────────────────────────────────────────────────────────

test('a critical finding stored under its item id is shown in plain words instead', () => {
  assert.equal(findingLabel({ itemId: 'RM-02', label: 'RM-02' }), 'Critical finding');
  assert.equal(findingLabel({ itemId: 'RM-02', label: '  ' }), 'Critical finding');
  assert.equal(findingLabel({ itemId: 'RM-02', label: 'No hair, stains, or odors' }), 'No hair, stains, or odors');
  const { markup } = html(auditRow({
    published_result: v2({ criticalFailures: [{ itemId: 'RM-02', label: 'RM-02', note: null }] }),
  }));
  assert.equal(markup.includes('RM-02'), false, 'no item id reaches the page');
  assert.ok(markup.includes('<p class="report-failure-label">Critical finding</p>'));
});

test('no item id, finding id or internal field reaches any rendered report', () => {
  // Extra fields on a published row are ignored by validation and must be
  // ignored by the page too: the renderer reads named fields, never a spread.
  const leaky = INTEL();
  leaky.priorities[0] = {
    ...leaky.priorities[0],
    note: 'PRIVATE AUDITOR NOTE', findingIds: ['RM-02'], dimensions: ['condition'], itemId: 'RM-02',
  };
  leaky.sectionsToWatch[0] = { ...leaky.sectionsToWatch[0], itemId: 'RM-03', hasPattern: true, score: 41 };
  const { markup } = html(auditRow({ published_result: v2({ intelligence: leaky }) }));
  assert.equal(markup.includes('PRIVATE AUDITOR NOTE'), false);
  assert.equal(/\b[A-Z]{2,5}-\d{2}\b/.test(markup), false, 'no catalogue item id anywhere');
  for (const field of ['findingIds', 'dimensions', 'hasPattern', 'condition']) {
    assert.equal(markup.includes(field), false, `${field} never reaches the page`);
  }
});

// ── every published string is inert ────────────────────────────────────────

test('every newly rendered string is escaped, never interpreted as markup', () => {
  const evil = '<img src=x onerror="window.__x=1"><script>1</script>';
  const intel = {
    headline: evil,
    summary: { overallPerformance: evil },
    keyMetrics: { urgentIssueCount: 1, priorityCount: 1, patternCount: 1, strengthCount: 1, notAssessedCount: 0, notAvailableCount: 0 },
    priorities: [{ rank: 1, severity: 'high', title: evil, reason: evil, findingCount: 1, sectionIds: ['room'], affectedSections: [evil] }],
    urgentIssueCount: 1, improvementCount: 0,
    patterns: [{ type: 'recurring', severity: 'high', explanation: evil, sectionIds: ['room'] }],
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
  assert.equal(t.includes('Priorities'), false);
  assert.equal(t.includes('Areas to Watch'), false);
  assert.equal(t.includes('Operational Patterns'), false);
  assert.ok(markup.includes('Areas in which every assessed item met the standard.'));
});

test('a version 1 report keeps its derived headline and gains no intelligence sections', () => {
  const { markup } = html(auditRow());
  assert.ok(markup.includes('A consistently strong guest experience across this stay.'));
  assert.equal(titles(markup).includes('Areas to Watch'), false);
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
  assert.match(print, /\.rc-mark \{ display: block; \}/, 'the printed cover carries the wordmark');
  assert.match(css.slice(0, css.indexOf('@media print')), /\.rc-mark \{\s*display: none;/, 'which the screen, with its nav, does not repeat');
  assert.equal(/position:\s*(sticky|fixed)/.test(print), false, 'nothing sticky or fixed in print');
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
  assert.match(css, /padding: 72px clamp\(20px, 6vw, 48px\) 96px/, 'side padding scales with the screen');
  assert.match(css, /minmax\(0, 1fr\)/, 'grid tracks may shrink below their content');
  assert.equal(/min-width:\s*(\d{3,})px/.test(css), false, 'no fixed minimum wider than a phone');
});

// ── the data boundary ──────────────────────────────────────────────────────

test('the public query asks for exactly what it always has, and nothing internal', () => {
  const src = read('report.js');
  assert.ok(src.includes(".select('id, ref, date, status, tier, auditor_summary, critical_failures, published_result, properties(name, city, country, category)')"));
  assert.ok(src.includes(".select('item_id, section_id, status')"), 'the legacy fallback is unchanged');
  for (const col of ['auditor_id', 'price_quoted', 'currency', 'opportunity_id', 'na_note', 'na_reason', 'note', 'audit_item_photos', 'public_token', 'snapshot']) {
    assert.equal(new RegExp(`select\\([^)]*\\b${col}\\b`).test(src), false, `${col} is never requested`);
  }
  assert.equal((src.match(/\.from\(/g) || []).length, 2, 'two reads, no new one');
});

test('scope and naSplit are pure restatements of the payload', () => {
  assert.equal(naSplit({ na: 4 }, null), null);
  assert.deepEqual(naSplit({ na: 4 }, { keyMetrics: { notAssessedCount: 1, notAvailableCount: 3 } }), { notAssessed: 1, notAvailable: 3 });
  const notes = methodologyNotes('full', { sectionCount: 13 });
  assert.ok(notes.some((n) => n.text === 'Results were recorded across 13 areas of the guest experience, each shown under Section Performance.'));
  assert.deepEqual(
    methodologyNotes('full').map((n) => n.title),
    ['Assessment type', 'Score', 'Not applicable items', 'The Specula Mark'],
    'without options the notes are what they always were',
  );
});

test('no copy the page writes uses an em dash or a double dash', () => {
  // CLAUDE.md, rule 2. Checked on the fully rendered page, so fixed copy in
  // the renderer is covered as well as copy decided in report-result.js.
  for (const row of [auditRow({ published_result: v2() }), auditRow(), auditRow({ published_result: payload({ auditType: 'desk' }) })]) {
    const { markup } = html(row);
    const text = markup.replace(/<[^>]+>/g, ' ');
    assert.equal(/—|--/.test(text), false);
  }
  const legacy = html(auditRow({ published_result: null }), LEGACY_ITEMS).markup.replace(/<[^>]+>/g, ' ');
  assert.equal(/—|--/.test(legacy), false);
});
