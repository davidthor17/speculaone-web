// Painting. Takes a decided view from report-result.js and writes markup.
//
// Separated from report.js so the real renderer can be exercised without a
// Supabase client and without the network: report.js fetches, report-result.js
// decides, this paints. Nothing here decides anything, which is why it can be
// trusted to render a frozen payload without quietly consulting live data.

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
    <svg viewBox="0 0 200 200">
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

export function renderReport(root, view) {
  // A Full Audit that meets the standard carries the Mark. A Spot Audit that
  // meets it says so in words and carries none; a Desk Review says nothing.
  const statusBlock = !view.statusTitle
    ? ''
    : view.showMark
      ? `
        <div class="report-mark-block">
          <div class="report-mark-icon" style="color:var(--report-gold)">${markSvg('var(--report-gold)', MARK_RING_TEXT)}</div>
          <div>
            <p class="report-mark-title" style="color:var(--report-gold)">${escapeHtml(view.statusTitle)}</p>
            <p class="report-mark-sub">${escapeHtml(view.statusSub)}</p>
          </div>
        </div>
      `
      : `
        <div class="report-nomark-block">
          <p class="report-mark-title" style="color:${view.standardMet ? 'var(--report-silver)' : 'var(--report-dim)'}">${escapeHtml(view.statusTitle)}</p>
          <p class="report-mark-sub">${escapeHtml(view.statusSub)}</p>
        </div>
      `;

  // Every section the audit recorded, with the label it was published under.
  const sectionRows = view.sections.map(s => `
    <div class="report-section-row">
      <span class="report-section-name">${escapeHtml(s.label)}</span>
      <span class="report-section-bar">
        <span class="rsb-met" style="width:${s.total ? (s.met / s.total) * 100 : 0}%"></span>
        <span class="rsb-partial" style="width:${s.total ? (s.partial / s.total) * 100 : 0}%"></span>
        <span class="rsb-missed" style="width:${s.total ? (s.missed / s.total) * 100 : 0}%"></span>
      </span>
      <span class="report-section-stat">${s.met}/${s.total}</span>
    </div>
  `).join('');

  const failureRows = view.criticalFailures.length
    ? view.criticalFailures.map(f => `
        <div class="report-failure">
          <div class="report-failure-label">${escapeHtml(f.label || f.itemId)}</div>
          ${f.note ? `<div class="report-failure-note">${escapeHtml(f.note)}</div>` : ''}
        </div>
      `).join('')
    : `<p class="report-empty-sub">No critical findings recorded during this audit.</p>`;

  // Sections assessed cleanly enough, and sections worth a second look. Both
  // are supplementary reads on the same section data above, so neither
  // renders at all when there is nothing genuine to say.
  const strengthsBlock = view.strengths.length ? `
    <div class="report-block">
      <p class="section-eyebrow">Key Strengths</p>
      <ul class="report-list report-list-positive">
        ${view.strengths.map(s => `<li>${escapeHtml(s.label)}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const attentionBlock = view.attention.length ? `
    <div class="report-block">
      <p class="section-eyebrow">Areas for Attention</p>
      <ul class="report-list report-list-attention">
        ${view.attention.map(s => `<li>${escapeHtml(s.label)}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  // Met, partial, missed, not applicable. Plain counts, restrained, never a
  // dashboard. Deliberately no separate "total" figure here: the score line
  // above already states the audited touchpoint count, and a second, larger
  // total that also counts not-applicable items would read as inconsistent
  // with it rather than as a breakdown of it.
  const t = view.totals;
  const glanceBlock = t.total ? `
    <div class="report-glance">
      <div class="report-glance-item"><span class="report-glance-num">${t.met}</span><span class="report-glance-label">Met</span></div>
      <div class="report-glance-item"><span class="report-glance-num">${t.partial}</span><span class="report-glance-label">Partial</span></div>
      <div class="report-glance-item"><span class="report-glance-num">${t.missed}</span><span class="report-glance-label">Missed</span></div>
      <div class="report-glance-item"><span class="report-glance-num">${t.na}</span><span class="report-glance-label">Not applicable</span></div>
    </div>
  ` : '';

  const methodologyBlock = `
    <div class="report-block report-methodology">
      <p class="section-eyebrow">Methodology</p>
      ${view.methodology.map(m => `
        <div class="report-methodology-item">
          <p class="report-methodology-title">${escapeHtml(m.title)}</p>
          <p class="report-methodology-text">${escapeHtml(m.text)}</p>
        </div>
      `).join('')}
    </div>
  `;

  const auditedOn = formatAuditedOn(view.auditedOn);
  const place = [view.property.city, view.property.country].filter(Boolean).map(escapeHtml).join(', ');
  const subLine = [
    place,
    escapeHtml(view.property.category || ''),
    auditedOn ? `Audited ${auditedOn}` : '',
  ].filter(Boolean).join(' · ');

  root.innerHTML = `
   <div class="report-head-block">
      <p class="section-eyebrow">Audit Report · ${escapeHtml(view.ref)}</p>
      <h1>${escapeHtml(view.property.name)}</h1>
      <p class="report-sub">${subLine}</p>
      <p class="report-unannounced">Independent, unannounced hotel assessment.</p>
      <button id="downloadPdfBtn" class="btn btn-ghost report-pdf-btn">Download PDF</button>
    </div>

    <div class="report-block report-executive">
      <p class="section-eyebrow">Executive Summary</p>
      <p class="report-headline">${escapeHtml(view.headline)}</p>
      ${view.summary ? `<p class="report-summary-text">${escapeHtml(view.summary)}</p>` : ''}
    </div>

    ${view.score.percent !== null ? `
      <div class="report-score">
        <div class="report-score-num">${view.score.percent}%</div>
        <div class="report-score-label">standards met, verified across ${view.score.itemsGraded} audited touchpoints</div>
      </div>
    ` : ''}

    ${glanceBlock}

    ${statusBlock}

    ${strengthsBlock}

    <div class="report-block">
      <p class="section-eyebrow">Key Findings</p>
      ${failureRows}
    </div>

    ${attentionBlock}

    <div class="report-block">
      <p class="section-eyebrow">Section Performance</p>
      <div class="report-sections">${sectionRows}</div>
    </div>

    ${methodologyBlock}

    ${view.disclosure ? `
      <p class="report-basis-note">${escapeHtml(view.disclosure)}</p>
    ` : ''}
  `;

  const pdfBtn = document.getElementById('downloadPdfBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', () => window.print());
}

