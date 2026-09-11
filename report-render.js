// Painting. Takes a decided view from report-result.js and writes markup.
//
// Separated from report.js so the real renderer can be exercised without a
// Supabase client and without the network: report.js fetches, report-result.js
// decides, this paints. Nothing here decides anything, which is why it can be
// trusted to render a frozen payload without quietly consulting live data.
//
// Phase 6.9. The page is laid out as a document rather than a stack of panels:
// a cover, then numbered sections, then a closing identification. Sections are
// numbered as they are rendered, so an audit with nothing to say in one of them
// simply has one fewer, never an empty heading.
//
// Phase 7.1. The first real v2 report named the same two areas in five places
// and printed missed standards as if they were compliments. Areas to Watch is
// now a marker on the Section Performance rows, patterns are de-duplicated in
// report-result.js, and a standard is only ever shown quoted and labelled as one.

// Supabase-sourced text is rendered via innerHTML below, so it has to be
// escaped here rather than trusted as markup.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function renderNotFound(root) {
  root.innerHTML = `
    <div class="report-empty">
      <p class="section-eyebrow">Audit Report</p>
      <h1>This report isn't available.</h1>
      <p class="report-empty-sub">Either the reference is wrong, or this property's audit hasn't been published yet.</p>
      <a href="index.html" class="btn btn-ghost">Back to Specula</a>
    </div>
  `;
}

// A published audit whose stored report cannot be read. The page shows nothing
// rather than recomputing a figure from today's data and presenting it as the
// one that was published.
export function renderUnsupported(root) {
  root.innerHTML = `
    <div class="report-empty">
      <p class="section-eyebrow">Audit Report</p>
      <h1>This report can't be displayed right now.</h1>
      <p class="report-empty-sub">The stored report for this audit could not be read. Please contact Specula and we'll put it right.</p>
      <a href="index.html" class="btn btn-ghost">Back to Specula</a>
    </div>
  `;
}

// The Specula Mark. Full Audits only, and only when the standard is met, which
// report-result.js decides rather than this file.
const MARK_RING_TEXT = '· CERTIFIED BY SPECULA ';

function markSvg(color, ringText) {
  return `
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="94" fill="none" stroke="${color}" stroke-width="1"/>
      <circle cx="100" cy="100" r="80" fill="none" stroke="${color}" stroke-width="1"/>
      <path id="markTextPathReport" d="M 100,100 m -62,0 a 62,62 0 1,1 124,0 a 62,62 0 1,1 -124,0" fill="none"/>
      <text font-size="11" letter-spacing="3.5" fill="${color}">
        <textPath href="#markTextPathReport" startOffset="1%">${ringText.repeat(2)}</textPath>
      </text>
      <text x="100" y="112" text-anchor="middle" font-size="30" fill="${color}" font-family="Fraunces, Georgia, serif">S</text>
    </svg>
  `;
}

function formatAuditedOn(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// The published severity vocabulary. A class name is only ever built from this
// list, so a value the reader did not expect cannot reach the markup as one.
const SEVERITY_WORD = { high: 'High', moderate: 'Moderate', low: 'Low' };
const severityKey = (s) => (Object.prototype.hasOwnProperty.call(SEVERITY_WORD, s) ? s : 'low');

/**
 * One published judgment: an optional kicker, a title, and the sentence
 * explaining it. The kicker carries the severity, so neither the frozen title
 * nor its reason has to repeat it.
 */
function insight(tone, title, text, kicker = null) {
  return `
    <article class="report-insight report-insight-${tone}">
      ${kicker ? `<p class="report-insight-kicker">${escapeHtml(kicker)}</p>` : ''}
      <h3 class="report-insight-title">${escapeHtml(title)}</h3>
      <p class="report-insight-text">${escapeHtml(text)}</p>
    </article>
  `;
}

const lead = (text) => `<p class="rs-lead">${escapeHtml(text)}</p>`;

// ── the sections ───────────────────────────────────────────────────────────
//
// Each builder returns its body, or '' when the payload has nothing for it.

function executiveBody(view) {
  return `
    <p class="rx-headline">${escapeHtml(view.headline)}</p>
    ${view.summary ? `
      <div class="rx-summary">
        <p class="rx-summary-label">Auditor's summary</p>
        <p class="report-summary-text">${escapeHtml(view.summary)}</p>
      </div>
    ` : ''}
  `;
}

function statusBlock(view) {
  // A Full Audit that meets the standard carries the Mark. A Spot Audit that
  // meets it says so in words and carries none; a Desk Review says nothing.
  if (!view.statusTitle) return '';
  if (view.showMark) {
    return `
      <div class="rg-status">
        <div class="report-mark-icon">${markSvg('var(--report-gold)', MARK_RING_TEXT)}</div>
        <div>
          <p class="rg-status-title rg-status-gold">${escapeHtml(view.statusTitle)}</p>
          <p class="rg-status-sub">${escapeHtml(view.statusSub)}</p>
        </div>
      </div>
    `;
  }
  return `
    <div class="rg-status">
      <div>
        <p class="rg-status-title${view.standardMet ? ' rg-status-silver' : ''}">${escapeHtml(view.statusTitle)}</p>
        <p class="rg-status-sub">${escapeHtml(view.statusSub)}</p>
      </div>
    </div>
  `;
}

function figureRow(caption, list) {
  if (!list.length) return '';
  return `
    <div class="rg-figures">
      <p class="rg-caption">${escapeHtml(caption)}</p>
      <dl class="rg-grid">
        ${list.map((f) => `
          <div class="rg-fig"><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>
        `).join('')}
      </dl>
    </div>
  `;
}

function glanceBody(view) {
  const score = view.score && view.score.percent !== null && view.score.percent !== undefined ? `
    <div class="rg-score">
      <p class="rg-num">${escapeHtml(view.score.percent)}<span class="rg-pct">%</span></p>
      <p class="rg-label">standards met, verified across ${escapeHtml(view.score.itemsGraded)} audited touchpoints</p>
    </div>
  ` : '';
  const status = statusBlock(view);
  const items = figureRow('Items assessed', view.figures.items);
  const followUp = figureRow('Follow-up', view.figures.followUp);
  if (!score && !status && !items && !followUp) return '';
  return `
    ${score || status ? `<div class="rg-result">${score}${status}</div>` : ''}
    ${items}
    ${followUp}
  `;
}

function strengthsBody(view) {
  const intel = view.intelligence;
  if (intel && intel.strengths.length) {
    return `<div class="ri-list">${intel.strengths.map((s) => insight('positive', s.title, s.reason)).join('')}</div>`;
  }
  // Without published intelligence, the section-level stand-in: sections in
  // which everything assessed met the standard.
  if (view.strengths.length) {
    return `
      ${lead('Areas in which every assessed item met the standard.')}
      <ul class="report-list report-list-positive">
        ${view.strengths.map((s) => `<li>${escapeHtml(s.label)}</li>`).join('')}
      </ul>
    `;
  }
  return '';
}

function prioritiesSection(view) {
  if (view.priorityGroups.length) {
    const groups = view.priorityGroups.map((g) => `
      <div class="rp-group">
        ${g.label ? `<p class="rp-group-label">${escapeHtml(g.label)}<span class="rp-count">${g.items.length}</span></p>` : ''}
        <div class="ri-list">
          ${g.items.map((p) => {
            const key = severityKey(p.severity);
            return insight(key, p.title, p.reason, `${SEVERITY_WORD[key]} priority`);
          }).join('')}
        </div>
      </div>
    `).join('');
    return {
      title: 'Priorities',
      body: `${groups}${view.prioritiesNote ? `<p class="rp-note">${escapeHtml(view.prioritiesNote)}</p>` : ''}`,
    };
  }
  if (view.attention.length) {
    return {
      title: 'Areas for Attention',
      body: `
        ${lead('Areas in which at least one assessed item was missed.')}
        <ul class="report-list report-list-attention">
          ${view.attention.map((s) => `<li>${escapeHtml(s.label)}</li>`).join('')}
        </ul>
      `,
    };
  }
  return { title: '', body: '' };
}

function patternsBody(view) {
  if (!view.patterns.length) return '';
  return `
    ${lead('Where findings connect across the stay. A pattern describes where findings recur, not why they occur.')}
    <div class="ri-list">
      ${view.patterns.map((p) => insight('pattern', p.title, p.text)).join('')}
    </div>
  `;
}

function sectionsBody(view) {
  if (!view.sections.length) return '';
  const watchOf = (s) => view.watch.find((w) => (w.sectionId && w.sectionId === s.id) || w.label === s.label) || null;
  const anyWatch = view.sections.some(watchOf);
  const rows = view.sections.map((s) => {
    const pct = (n) => (s.total ? (n / s.total) * 100 : 0);
    const summary = `${s.met} met, ${s.partial} partial, ${s.missed} missed, of ${s.total} items`;
    const w = watchOf(s);
    const key = w ? severityKey(w.severity) : null;
    const marker = w ? `
      <span class="report-section-watch report-section-watch-${key}">
        <span class="rw-sev rw-sev-${key}" aria-hidden="true"></span>Watch<span class="sr-only">, ${SEVERITY_WORD[key].toLowerCase()} priority</span>
      </span>
    ` : '';
    return `
      <div class="report-section-row${w ? ' report-section-row-watch' : ''}">
        <span class="report-section-name">${escapeHtml(s.label)}${marker}</span>
        <span class="report-section-bar" role="img" aria-label="${escapeHtml(summary)}">
          <span class="rsb-met" style="width:${pct(s.met)}%"></span>
          <span class="rsb-partial" style="width:${pct(s.partial)}%"></span>
          <span class="rsb-missed" style="width:${pct(s.missed)}%"></span>
        </span>
        <span class="report-section-stat">${escapeHtml(s.met)} / ${escapeHtml(s.total)}</span>
      </div>
    `;
  }).join('');
  const leadText = anyWatch
    ? 'Each area assessed, in the order of the guest journey. The figure is items met out of items recorded. Areas marked Watch are where findings concentrated.'
    : 'Each area assessed, in the order of the guest journey. The figure is items met out of items recorded.';
  return `
    ${lead(leadText)}
    <ul class="rl-legend" aria-hidden="true">
      <li><span class="rl-swatch rsb-met"></span>Met</li>
      <li><span class="rl-swatch rsb-partial"></span>Partial</li>
      <li><span class="rl-swatch rsb-missed"></span>Missed</li>
      <li><span class="rl-swatch rl-swatch-na"></span>Not applicable</li>
    </ul>
    <div class="report-sections">${rows}</div>
  `;
}

function findingsBody(view) {
  if (!view.findings.length) {
    return '<p class="rs-empty">No critical findings recorded during this audit.</p>';
  }
  return `
    ${lead('Recorded by the auditor as critical during the stay, each shown against the standard it concerns.')}
    ${view.findings.map((f) => `
      <div class="report-failure">
        <p class="report-failure-kicker">Critical finding</p>
        <p class="report-failure-label">${f.standard ? `Standard: ${escapeHtml(f.standard)}` : 'The standard concerned was not named in this record.'}</p>
        ${f.note ? `<p class="report-failure-note">${escapeHtml(f.note)}</p>` : ''}
      </div>
    `).join('')}
  `;
}

function methodologyBody(view) {
  return `
    <dl class="rm">
      ${view.methodology.map((m) => `
        <div class="rm-item"><dt>${escapeHtml(m.title)}</dt><dd>${escapeHtml(m.text)}</dd></div>
      `).join('')}
    </dl>
  `;
}

// ── the document ───────────────────────────────────────────────────────────

export function renderReport(root, view) {
  const auditedOn = formatAuditedOn(view.auditedOn);
  const name = view.property && view.property.name ? view.property.name : '';
  const place = [view.property.city, view.property.country].filter(Boolean).join(', ');
  const placeLine = [place, view.property.category].filter(Boolean).join(' · ');
  const meta = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;

  const cover = `
    <header class="rc">
      <p class="rc-mark" aria-hidden="true">SPECULA</p>
      <p class="section-eyebrow rc-eyebrow">Hotel Audit Report</p>
      <h1 class="rc-title">${escapeHtml(name)}</h1>
      ${placeLine ? `<p class="rc-place">${escapeHtml(placeLine)}</p>` : ''}
      <dl class="rc-meta">
        ${auditedOn ? meta('Audited', auditedOn) : ''}
        ${view.auditTypeLabel ? meta('Assessment', view.auditTypeLabel) : ''}
        ${view.ref ? meta('Reference', view.ref) : ''}
      </dl>
      <p class="rc-note">${view.auditType === 'desk' ? 'Independent hotel assessment.' : 'Independent, unannounced hotel assessment.'}</p>
      <button type="button" id="downloadPdfBtn" class="btn btn-ghost report-pdf-btn">Print or save as PDF</button>
    </header>
  `;

  const priorities = prioritiesSection(view);
  const sections = [
    ['executive', 'Executive Summary', executiveBody(view)],
    ['glance', 'Performance at a Glance', glanceBody(view)],
    ['strengths', 'Key Strengths', strengthsBody(view)],
    ['priorities', priorities.title, priorities.body],
    ['patterns', 'Operational Patterns', patternsBody(view)],
    ['sections', 'Section Performance', sectionsBody(view)],
    ['findings', 'Key Findings', findingsBody(view)],
    ['methodology', 'Methodology and Scope', methodologyBody(view)],
  ].filter(([, title, body]) => title && body.trim());

  const numbered = sections.map(([key, title, body], i) => `
    <section class="rs rs-${key}" aria-labelledby="rs-${key}">
      <header class="rs-head">
        <span class="rs-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <h2 class="rs-title" id="rs-${key}">${escapeHtml(title)}</h2>
      </header>
      ${body}
    </section>
  `).join('');

  const closing = `
    <footer class="rf">
      <p class="rf-mark">SPECULA</p>
      <p class="rf-line">Independent hotel assessment.${view.ref ? ` Report ${escapeHtml(view.ref)}` : ''}${auditedOn ? `, audited ${escapeHtml(auditedOn)}` : ''}${view.ref || auditedOn ? '.' : ''}</p>
      ${view.disclosure ? `<p class="report-basis-note">${escapeHtml(view.disclosure)}</p>` : ''}
    </footer>
  `;

  root.innerHTML = `${cover}${numbered}${closing}`;

  // The title becomes the default file name when the report is saved as a PDF,
  // so it names the property rather than the page template.
  if (name && typeof document !== 'undefined') {
    document.title = `${name} · Audit Report · Specula`;
  }

  const pdfBtn = typeof document !== 'undefined' ? document.getElementById('downloadPdfBtn') : null;
  if (pdfBtn) pdfBtn.addEventListener('click', () => window.print());
}
