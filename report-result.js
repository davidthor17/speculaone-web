// How a published audit becomes a report.
//
// Everything here is pure: no DOM, no Supabase, no network, no clock. report.js
// fetches and paints; this decides what the page should say. That split exists
// so the rules below can be tested, which they could not be while they lived
// inside a module that imports Supabase from a CDN at load time.
//
// The important rule, and the reason this file exists:
//
//   A published audit carries a frozen payload. When it is there and valid, the
//   report renders it and reads nothing else. Not the property row, not the
//   item rows, not the clock. A published report is a document, not a view.
//
// When the payload is absent, the audit was published before payloads existed
// and the old recomputing path still runs, because those reports must not
// change. When the payload is present but cannot be trusted, the report shows
// nothing at all rather than quietly recomputing a different number and
// presenting it as the published one.

// Version 1 is every report published before Phase 6.8 and keeps its original
// meaning forever. Version 2 is version 1 plus an optional `intelligence`
// block. Anything else fails closed, exactly as an unknown version always has:
// a report this reader cannot fully understand is not a report it may guess at.
export const SUPPORTED_FORMAT_VERSIONS = [1, 2];
export const PASS_THRESHOLD = 85;

// The public vocabularies the payload speaks. Written out here as well as in
// the console, on purpose: the two implementations are checked against each
// other by fixtures rather than shared by an import, because a reader that
// trusts what it is given is how a malformed payload becomes a wrong public
// claim.
//
// Three levels of priority, and deliberately not the word "critical". This page
// already reserves that for a failure the auditor flagged by hand, under Key
// Findings, and a framework severity is a different judgment about a different
// thing. One word for both would let a report say "no critical findings
// recorded" directly above a list of critical findings.
export const PUBLIC_SEVERITIES = ['high', 'moderate', 'low'];
export const PUBLIC_PATTERN_TYPES = ['recurring', 'inconsistent', 'cross_area'];

// What each pattern type is called on the page. The payload carries the token,
// never the wording, so this copy can be improved without touching a single
// published document.
export const PATTERN_TYPE_LABEL = {
  recurring: 'Recurring issue',
  inconsistent: 'Inconsistent delivery',
  cross_area: 'Across multiple areas',
};

export const INTELLIGENCE_LIMITS = {
  priorities: 5, patterns: 5, strengths: 3, sectionsToWatch: 5,
};

// Full Audits alone carry the Specula Mark. A Spot Audit that meets the
// standard is "Reviewed by Specula" and shows no Mark; a Desk Review carries no
// status at all. The report used to draw the Mark in silver for a passing Spot
// Audit, which said the opposite.
export const AUDIT_TYPE_COPY = {
  full: { label: 'Full Audit', mark: true,  metTitle: 'Certified by Specula' },
  spot: { label: 'Spot Audit', mark: false, metTitle: 'Reviewed by Specula' },
  desk: { label: 'Desk Review', mark: false, metTitle: null },
};

// The complete checklist, so the legacy path stops dropping the two sections it
// never knew about. Payload-backed reports do not consult this at all: their
// labels travel with them, so renaming a section here cannot rewrite a report
// published before the rename.
export const SECTION_LABELS = {
  pre: 'Pre-Arrival & Website',
  arrival: 'Arrival & Entrance',
  reception: 'Reception & Check-in',
  room: 'Room Quality',
  facilities: 'Facilities',
  safety: 'Safety, Security & Integrity',
  bathroom: 'Bathroom',
  breakfast: 'Breakfast',
  lunch: 'Lunch & All-Day Dining',
  restaurant: 'Restaurant & Dinner',
  fbservice: 'F&B Service',
  pool: 'Pool',
  spa: 'Spa & Wellness',
  housekeeping: 'Housekeeping',
  departure: 'Departure',
};
export const SECTION_ORDER = Object.keys(SECTION_LABELS);

const STATUS_RANK = { met: 0, na: 1, partial: 2, missed: 3 };
const GRADED = ['met', 'partial', 'missed'];
const AUDIT_TYPES = ['full', 'spot', 'desk'];
const BASIS_STATES = ['frozen', 'legacy', 'incomplete'];

// ── Disclosure ──────────────────────────────────────────────────────────────
//
// One muted line. It explains where the result came from; it is not a warning
// about the property and must never read as one. The score and the Mark are
// shown in every state, because withholding either would penalise a hotel for a
// gap in Specula's own record keeping.

export const DISCLOSURE = {
  frozen: (on) => `Assessed against this property as recorded on ${on}.`,
  legacy: () => 'This audit was carried out before Specula began recording the property '
    + 'details each assessment was measured against.',
  incomplete: () => 'The recorded property details for this assessment are incomplete.',
};

export function formatBasisDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The disclosure line for a resolved basis, or null when there is nothing to say. */
export function disclosureFor(basis) {
  if (!basis || !basis.state) return null;
  if (basis.state === 'frozen') {
    const on = formatBasisDate(basis.recordedOn);
    // A frozen basis with an unreadable date is not a frozen claim we can make.
    return on ? DISCLOSURE.frozen(on) : DISCLOSURE.incomplete();
  }
  if (basis.state === 'incomplete') return DISCLOSURE.incomplete();
  return DISCLOSURE.legacy();
}

/**
 * Where a report with no payload gets its basis from.
 *
 * Rule 2 covers a narrow window: an audit frozen after the snapshot columns
 * existed but published before payloads did. Everything else is legacy, which
 * is the honest answer for every audit published before this work.
 */
export function resolveLegacyBasis(auditRow = {}) {
  if (auditRow.snapshot_locked_at) {
    return { state: 'frozen', recordedOn: auditRow.snapshot_locked_at };
  }
  return { state: 'legacy', recordedOn: null };
}

// ── Validation ──────────────────────────────────────────────────────────────
//
// Written out here rather than shared with the console, on purpose. This reader
// lives in a different repository and is served to the public; it must decide
// for itself whether what it was handed is renderable. A reader that trusts its
// input is how a malformed payload becomes a confidently wrong public claim.

export function validatePayload(payload) {
  const errors = [];
  const bad = (m) => errors.push(m);

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['payload is not an object'];
  }
  if (!SUPPORTED_FORMAT_VERSIONS.includes(payload.formatVersion)) {
    bad(`unsupported formatVersion: ${JSON.stringify(payload.formatVersion)}`);
  }
  if (!AUDIT_TYPES.includes(payload.auditType)) bad('unknown auditType');
  if (typeof payload.publishedAt !== 'string' || !payload.publishedAt) bad('publishedAt missing');
  if (typeof payload.standardMet !== 'boolean') bad('standardMet missing');

  if (!payload.property || typeof payload.property !== 'object') bad('property missing');
  else if (!payload.property.name) bad('property.name missing');

  const s = payload.score;
  if (!s || typeof s !== 'object') bad('score missing');
  else {
    if (s.percent !== null && !Number.isFinite(s.percent)) bad('score.percent invalid');
    if (!Number.isFinite(s.itemsMet)) bad('score.itemsMet invalid');
    if (!Number.isFinite(s.itemsGraded)) bad('score.itemsGraded invalid');
  }

  if (!Array.isArray(payload.sections)) bad('sections missing');
  else {
    payload.sections.forEach((sec, i) => {
      if (!sec || typeof sec !== 'object') { bad(`sections[${i}] invalid`); return; }
      if (!sec.id) bad(`sections[${i}].id missing`);
      if (!sec.label) bad(`sections[${i}].label missing`);
      for (const k of ['total', 'met', 'partial', 'missed', 'na']) {
        if (!Number.isFinite(sec[k])) bad(`sections[${i}].${k} invalid`);
      }
    });
  }

  if (!Array.isArray(payload.criticalFailures)) bad('criticalFailures missing');
  if (payload.summary !== null && typeof payload.summary !== 'string') bad('summary invalid');

  const b = payload.basis;
  if (!b || typeof b !== 'object') bad('basis missing');
  else if (!BASIS_STATES.includes(b.state)) bad('unknown basis.state');
  else if (b.state === 'frozen' && !b.recordedOn) bad('frozen basis has no date');

  return errors;
}

// ── The intelligence block (version 2) ──────────────────────────────────────
//
// Phase 6.8. Deliberately validated apart from the payload above, because the
// two must fail differently. The base fields are load-bearing: without them
// there is no report, so they fail closed and the page says it cannot show one.
// This block is an enhancement to a report that is already renderable, so a
// block that cannot be trusted is dropped and the base report is shown instead.
// Taking a whole published report offline because a supplementary list was
// malformed would be a worse outcome than the one being avoided.
//
// Nothing here recomputes anything. A section this reader would have called a
// strength on its own is not compared against the published one, and the
// published one always wins: it was decided by the audit console, at
// publication, from data this repository has never had access to.

/** @returns {string[]} every problem found, empty when the block can be trusted */
export function validateIntelligence(intel) {
  const errors = [];
  const bad = (m) => errors.push(m);

  if (!intel || typeof intel !== 'object' || Array.isArray(intel)) return ['intelligence is not an object'];
  if (typeof intel.headline !== 'string' || !intel.headline) bad('headline missing');
  if (!intel.summary || typeof intel.summary !== 'object') bad('summary missing');
  else if (typeof intel.summary.overallPerformance !== 'string') bad('summary.overallPerformance invalid');

  const km = intel.keyMetrics;
  if (!km || typeof km !== 'object') bad('keyMetrics missing');
  else {
    for (const k of ['urgentIssueCount', 'priorityCount', 'patternCount', 'strengthCount']) {
      if (!Number.isFinite(km[k])) bad(`keyMetrics.${k} invalid`);
    }
    // Neither is part of the contract. coverage is a fact about the assessment
    // rather than the hotel; overallScore is the framework's weighted result,
    // which is not the figure this page prints and would contradict it.
    if ('coverage' in km) bad('keyMetrics.coverage is not part of this contract');
    if ('overallScore' in km) bad('keyMetrics.overallScore is not part of this contract');
  }

  const list = (key, check) => {
    if (!Array.isArray(intel[key])) { bad(`${key} missing`); return; }
    if (intel[key].length > INTELLIGENCE_LIMITS[key]) bad(`${key} is longer than the contract allows`);
    intel[key].forEach((row, i) => {
      if (!row || typeof row !== 'object') { bad(`${key}[${i}] invalid`); return; }
      const problem = check(row);
      if (problem) bad(`${key}[${i}].${problem}`);
    });
  };

  list('priorities', (p) => {
    if (!PUBLIC_SEVERITIES.includes(p.severity)) return 'severity unknown';
    if (!p.title) return 'title missing';
    if (!p.reason) return 'reason missing';
    return null;
  });
  list('patterns', (p) => {
    if (!PUBLIC_PATTERN_TYPES.includes(p.type)) return 'type unknown';
    if (!PUBLIC_SEVERITIES.includes(p.severity)) return 'severity unknown';
    if (!p.explanation) return 'explanation missing';
    return null;
  });
  list('strengths', (s) => {
    if (!s.title) return 'title missing';
    if (!s.reason) return 'reason missing';
    return null;
  });
  list('sectionsToWatch', (s) => {
    if (!s.sectionLabel) return 'sectionLabel missing';
    if (!PUBLIC_SEVERITIES.includes(s.severity)) return 'severity unknown';
    return null;
  });

  return errors;
}

/**
 * The block this payload may be rendered with, or null.
 *
 * Null for a version 1 document, which has none and never will; null for a
 * version 2 document that carries none, which is a complete document in its own
 * right; and null for a block that does not validate, which is the degrade.
 */
export function readIntelligence(payload) {
  if (!payload || payload.formatVersion !== 2) return null;
  if (!('intelligence' in payload)) return null;
  return validateIntelligence(payload.intelligence).length ? null : payload.intelligence;
}

/**
 * jsonb usually arrives parsed. A string is tolerated because a client or a
 * proxy may hand one over, but anything that will not parse is a broken payload
 * and fails closed rather than being treated as absent.
 */
export function coercePayload(raw) {
  if (raw === null || raw === undefined) return { present: false, payload: null };
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return { present: true, payload: null };
    try {
      return { present: true, payload: JSON.parse(trimmed) };
    } catch (e) {
      return { present: true, payload: null };
    }
  }
  return { present: true, payload: raw };
}

// ── The legacy recompute path ───────────────────────────────────────────────
//
// Reached only when no payload was written, which today means exactly the
// audits published before this work. Their numbers must not move, so this is
// the old arithmetic unchanged. The one correction is the section map above,
// which now knows all fifteen.

export function worstStatusByItem(items = []) {
  const worst = new Map();
  for (const row of items) {
    if (!row || !row.item_id || !row.status) continue;
    const current = worst.get(row.item_id);
    if (current === undefined || (STATUS_RANK[row.status] ?? 0) > (STATUS_RANK[current.status] ?? 0)) {
      worst.set(row.item_id, row);
    }
  }
  return worst;
}

export function recomputeFromItems(items = []) {
  const bySection = new Map();
  for (const row of worstStatusByItem(items).values()) {
    const id = row.section_id || 'unknown';
    if (!bySection.has(id)) {
      bySection.set(id, { id, label: SECTION_LABELS[id] || id, total: 0, met: 0, partial: 0, missed: 0, na: 0 });
    }
    const s = bySection.get(id);
    s.total += 1;
    if (s[row.status] !== undefined) s[row.status] += 1;
  }

  const sections = [...bySection.values()].sort(
    (a, b) => (SECTION_ORDER.indexOf(a.id) + 1 || 999) - (SECTION_ORDER.indexOf(b.id) + 1 || 999),
  );
  const itemsMet = sections.reduce((a, s) => a + s.met, 0);
  const itemsGraded = sections.reduce((a, s) => a + s.met + s.partial + s.missed, 0);

  return {
    sections,
    score: { percent: itemsGraded ? Math.round((itemsMet / itemsGraded) * 100) : null, itemsMet, itemsGraded },
  };
}

// ── Premium client report additions ─────────────────────────────────────────
//
// Phase 6.7B. Everything below is derived only from what interpretReport()
// already read: score, sections, criticalFailures, standardMet. Nothing here
// adds a Supabase column, widens the query in report.js, or invents a fact
// the payload does not already state. This repository has no access to the
// severity, dimension or pattern data the audit console's own intelligence
// layer computes internally: that data is deliberately not part of
// published_result, so nothing resembling a real severity ranking or a
// cross-section pattern is attempted here. What is built instead are the
// same two ideas at the grain the public payload actually supports: which
// sections were assessed cleanly enough to call a strength, and which
// carried a missed item and so are worth a second look.

const STRENGTH_MIN_SAMPLE = 3;

/** Strong / Good / Mixed / Requires attention, or null when nothing is scored yet. */
export function performanceBand(percent) {
  if (percent === null || percent === undefined) return null;
  if (percent >= 90) return 'strong';
  if (percent >= 75) return 'good';
  if (percent >= 50) return 'mixed';
  return 'attention';
}

const BAND_LABEL = {
  strong: 'Strong', good: 'Good', mixed: 'Mixed', attention: 'Requires attention',
};

/**
 * One deterministic sentence, never a paragraph. A critical failure always
 * outranks the score, the same principle the audit console applies
 * internally: a high score must never read as an unqualified pass when a
 * critical failure is sitting underneath it.
 */
export function buildHeadline({ percent, standardMet, criticalFailureCount = 0, isDesk = false }) {
  const band = performanceBand(percent);
  if (band === null) return 'This assessment has not yet been scored.';
  const label = BAND_LABEL[band];
  if (criticalFailureCount > 0) {
    const n = criticalFailureCount;
    return `${label} overall performance, with ${n} critical finding${n === 1 ? '' : 's'} requiring attention.`;
  }
  if (isDesk) return `${label} overall performance.`;
  if (band === 'strong' && standardMet) return 'A consistently strong guest experience across this stay.';
  if (standardMet) return `${label} overall performance, meeting the Specula standard.`;
  return `${label} overall performance.`;
}

/** Assessed items and their outcomes, summed across every published section. */
export function performanceTotals(sections = []) {
  return sections.reduce((acc, s) => ({
    total: acc.total + (s.total || 0),
    met: acc.met + (s.met || 0),
    partial: acc.partial + (s.partial || 0),
    missed: acc.missed + (s.missed || 0),
    na: acc.na + (s.na || 0),
  }), { total: 0, met: 0, partial: 0, missed: 0, na: 0 });
}

/**
 * Sections assessed cleanly enough to call a strength: every item in the
 * section met the standard, on a sample large enough to mean something.
 * Three items is the floor, the same threshold the audit console itself
 * uses for the equivalent, finer grained judgment on individual items.
 */
export function strongSections(sections = [], { minSample = STRENGTH_MIN_SAMPLE } = {}) {
  return sections
    .filter((s) => (s.total || 0) >= minSample && s.met === s.total)
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/** Sections carrying at least one missed item, most affected first. */
export function attentionSections(sections = []) {
  return sections
    .filter((s) => (s.missed || 0) > 0)
    .sort((a, b) => b.missed - a.missed || a.label.localeCompare(b.label));
}

/** Concise, client facing methodology notes. No internal vocabulary. */
export function methodologyNotes(auditType) {
  const meta = AUDIT_TYPE_COPY[auditType];
  const notes = [
    {
      title: 'Assessment type',
      text: meta
        ? `This was a ${meta.label}, an independent, unannounced hotel assessment.`
        : 'An independent, unannounced hotel assessment.',
    },
    {
      title: 'Score',
      text: 'The score reflects the quality of what was assessed during the stay. It is not a claim that every aspect of the property was reviewed.',
    },
    {
      title: 'Not applicable items',
      text: 'Some items do not apply to every property, or were not experienced during this particular stay. These are excluded from the score rather than counted against it.',
    },
  ];
  if (auditType !== 'desk') {
    notes.push({
      title: 'The Specula Mark',
      text: 'The Specula Mark is awarded only to a Full Audit that meets the required standard. It is earned through performance, never purchased.',
    });
  }
  return notes;
}

// ── The view ────────────────────────────────────────────────────────────────

function markFor(auditType, standardMet) {
  const meta = AUDIT_TYPE_COPY[auditType] || AUDIT_TYPE_COPY.full;
  return {
    auditTypeLabel: meta.label,
    // Full Audits only, and only when the standard is met.
    showMark: Boolean(meta.mark && standardMet),
    // A Desk Review issues no status either way, so it says nothing.
    statusTitle: auditType === 'desk'
      ? null
      : (standardMet ? meta.metTitle : 'Does not currently meet the Specula standard'),
    statusSub: auditType === 'desk'
      ? null
      : (standardMet
        ? `${meta.label} · issued after this stay, not by application.`
        : (auditType === 'full'
          ? `${meta.label} · the Specula Mark is not awarded for this audit.`
          : `${meta.label} · this audit does not carry a status.`)),
  };
}

function view(source, parts) {
  const { auditType, standardMet } = parts;
  const sections = parts.sections || [];
  const criticalFailures = parts.criticalFailures || [];
  // Phase 6.8. When the payload carries the audit console's own reading of
  // this audit, that reading is the published one and it wins outright. The
  // headline and the two section-level lists below were built here only
  // because, until now, this repository had nothing better to build them from.
  // Showing both would put a coarse stand-in beside the real thing and invite
  // the reader to notice they disagree.
  const intelligence = parts.intelligence || null;
  return {
    source,
    ref: parts.ref || null,
    auditedOn: parts.auditedOn || null,
    auditType,
    property: parts.property,
    score: parts.score,
    standardMet,
    sections,
    criticalFailures,
    summary: parts.summary || null,
    disclosure: disclosureFor(parts.basis),
    headline: (intelligence && intelligence.headline) || buildHeadline({
      percent: parts.score ? parts.score.percent : null,
      standardMet,
      criticalFailureCount: criticalFailures.length,
      isDesk: auditType === 'desk',
    }),
    totals: performanceTotals(sections),
    strengths: intelligence ? [] : strongSections(sections),
    attention: intelligence ? [] : attentionSections(sections),
    intelligence,
    methodology: methodologyNotes(auditType),
    ...markFor(auditType, standardMet),
  };
}

/**
 * What the page should render for this audit.
 *
 * @returns {{mode: 'payload'|'legacy'|'unavailable', view?: object, reason?: string, errors?: string[]}}
 */
export function interpretReport(auditRow, items = []) {
  if (!auditRow) return { mode: 'unavailable', reason: 'not-found', errors: ['no audit row'] };

  const { present, payload } = coercePayload(auditRow.published_result);

  // No payload was ever written. This audit predates published results and its
  // report must keep rendering exactly as it always has.
  if (!present) {
    const { sections, score } = recomputeFromItems(items);
    const auditType = auditRow.tier || 'full';
    const failures = Array.isArray(auditRow.critical_failures) ? auditRow.critical_failures : [];
    const standardMet = auditType !== 'desk'
      && failures.length === 0
      && score.percent !== null
      && score.percent >= PASS_THRESHOLD;

    return {
      mode: 'legacy',
      view: view('legacy', {
        ref: auditRow.ref,
        auditedOn: auditRow.date,
        auditType,
        property: auditRow.properties || {},
        score,
        standardMet,
        sections,
        criticalFailures: failures.map((f) => ({
          itemId: f.itemId || null, label: f.label || f.itemId || null, note: f.note || null,
        })),
        summary: auditRow.auditor_summary || null,
        basis: resolveLegacyBasis(auditRow),
      }),
    };
  }

  // A payload exists. From here the live data is not consulted, whatever
  // happens: if the payload cannot be rendered the report says so rather than
  // recomputing a number that was never the published one.
  const errors = validatePayload(payload);
  if (errors.length) return { mode: 'unavailable', reason: 'unsupported-format', errors };

  return {
    mode: 'payload',
    view: view('payload', {
      ref: auditRow.ref,
      auditedOn: payload.auditedOn,
      auditType: payload.auditType,
      property: payload.property,
      score: payload.score,
      standardMet: payload.standardMet,
      sections: payload.sections,
      criticalFailures: payload.criticalFailures,
      summary: payload.summary || null,
      basis: payload.basis,
      intelligence: readIntelligence(payload),
    }),
  };
}
