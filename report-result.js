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

export const SUPPORTED_FORMAT_VERSION = 1;
export const PASS_THRESHOLD = 85;

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
  if (payload.formatVersion !== SUPPORTED_FORMAT_VERSION) {
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
  return {
    source,
    ref: parts.ref || null,
    auditedOn: parts.auditedOn || null,
    auditType,
    property: parts.property,
    score: parts.score,
    standardMet,
    sections: parts.sections,
    criticalFailures: parts.criticalFailures,
    summary: parts.summary || null,
    disclosure: disclosureFor(parts.basis),
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
    }),
  };
}
