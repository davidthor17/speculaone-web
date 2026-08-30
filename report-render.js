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
    : `<p class="report-empty-sub">No critical failures recorded during this audit.</p>`;

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
      <button id="downloadPdfBtn" class="btn btn-ghost report-pdf-btn">Download PDF</button>
    </div>

    ${view.score.percent !== null ? `
      <div class="report-score">
        <div class="report-score-num">${view.score.percent}%</div>
        <div class="report-score-label">standards met, verified across ${view.score.itemsGraded} audited touchpoints</div>
      </div>
    ` : ''}

    ${statusBlock}

    ${view.summary ? `
      <div class="report-block">
        <p class="section-eyebrow">Auditor Summary</p>
        <p class="report-summary-text">${escapeHtml(view.summary)}</p>
      </div>
    ` : ''}

    <div class="report-block">
      <p class="section-eyebrow">Critical Failures</p>
      ${failureRows}
    </div>

    <div class="report-block">
      <p class="section-eyebrow">By Section</p>
      <div class="report-sections">${sectionRows}</div>
    </div>

    ${view.disclosure ? `
      <p class="report-basis-note">${escapeHtml(view.disclosure)}</p>
    ` : ''}
  `;

  const pdfBtn = document.getElementById('downloadPdfBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', () => window.print());
}

