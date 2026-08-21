import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(
  'https://zbmhfdoqmzzscdklziss.supabase.co',
  'sb_publishable_s7RALrw2f5eXx5lMKGhqOw_isP5_II-'
);

// Section id -> display label, mirrors the audit console's checklist structure
const SECTION_LABELS = {
  pre: 'Pre-Arrival & Website',
  arrival: 'Arrival & Entrance',
  reception: 'Reception & Check-in',
  room: 'Room Quality',
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
const SECTION_ORDER = Object.keys(SECTION_LABELS);

const root = document.getElementById('report-root');

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

function renderNotFound() {
  root.innerHTML = `
    <div class="report-empty">
      <p class="section-eyebrow">Audit Report</p>
      <h1>This report isn't available.</h1>
      <p class="report-empty-sub">Either the reference is wrong, or this property's audit hasn't been published yet.</p>
      <a href="index.html" class="btn btn-ghost">Back to Specula</a>
    </div>
  `;
}

const PASS_THRESHOLD = 85;
const TIER_META = {
  full: { sealColor: 'var(--report-gold)', ringText: 'SPECULA · CERTIFIED PROPERTY ·', label: 'Full Audit' },
  spot: { sealColor: 'var(--report-silver)', ringText: 'SPECULA · REVIEWED ·', label: 'Spot Audit' },
  desk: { sealColor: null, ringText: '', label: 'Desk Review' },
};

function sealSvg(color, ringText) {
  return `
    <svg viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="94" fill="none" stroke="${color}" stroke-width="1"/>
      <circle cx="100" cy="100" r="80" fill="none" stroke="${color}" stroke-width="1"/>
      <path id="sealTextPathReport" d="M 100,100 m -62,0 a 62,62 0 1,1 124,0 a 62,62 0 1,1 -124,0" fill="none"/>
      <text font-size="11" letter-spacing="3.5" fill="${color}">
        <textPath href="#sealTextPathReport" startOffset="1%">${ringText}</textPath>
      </text>
      <text x="100" y="112" text-anchor="middle" font-size="30" fill="${color}" font-family="Fraunces, Georgia, serif">S</text>
    </svg>
  `;
}

function renderReport(audit, items) {
  const prop = audit.properties;
  const failures = Array.isArray(audit.critical_failures) ? audit.critical_failures : [];
  const tier = audit.tier || 'full';
  const tierMeta = TIER_META[tier] || TIER_META.full;

  // group items by section, take the worst status seen across shifts for each item
  const bySection = {};
  const priority = { missed: 3, partial: 2, na: 1, met: 0 };
  const worstByItem = {};
  items.forEach(row => {
    const cur = worstByItem[row.item_id];
    if (!cur || (priority[row.status] || 0) > (priority[cur.status] || 0)) {
      worstByItem[row.item_id] = row;
    }
  });
  Object.values(worstByItem).forEach(row => {
    bySection[row.section_id] = bySection[row.section_id] || { met: 0, partial: 0, missed: 0, na: 0, total: 0 };
    const s = bySection[row.section_id];
    s.total += 1;
    if (row.status && s[row.status] !== undefined) s[row.status] += 1;
  });

  const totalMet = Object.values(bySection).reduce((a, s) => a + s.met, 0);
  const totalGraded = Object.values(bySection).reduce((a, s) => a + s.met + s.partial + s.missed, 0);
  const scorePct = totalGraded ? Math.round((totalMet / totalGraded) * 100) : null;

  const passed = tier !== 'desk' && failures.length === 0 && scorePct !== null && scorePct >= PASS_THRESHOLD;

  const sealBlock = tier === 'desk'
    ? ''
    : passed
      ? `
        <div class="report-seal-block">
          <div class="report-seal-icon" style="color:${tierMeta.sealColor}">${sealSvg(tierMeta.sealColor, tierMeta.ringText)}</div>
          <div>
            <p class="report-seal-title" style="color:${tierMeta.sealColor}">${tier === 'full' ? 'Certified' : 'Reviewed'} by Specula</p>
            <p class="report-seal-sub">${tierMeta.label} · issued after this stay, not by application.</p>
          </div>
        </div>
      `
      : `
        <div class="report-noseal-block">
          <p class="report-seal-title" style="color:var(--report-dim)">Does not currently meet the Specula standard</p>
          <p class="report-seal-sub">${tierMeta.label} · no seal issued for this audit.</p>
        </div>
      `;

  const sectionRows = SECTION_ORDER
    .filter(id => bySection[id])
    .map(id => {
      const s = bySection[id];
      return `
        <div class="report-section-row">
          <span class="report-section-name">${SECTION_LABELS[id]}</span>
          <span class="report-section-bar">
            <span class="rsb-met" style="width:${s.total ? (s.met / s.total) * 100 : 0}%"></span>
            <span class="rsb-partial" style="width:${s.total ? (s.partial / s.total) * 100 : 0}%"></span>
            <span class="rsb-missed" style="width:${s.total ? (s.missed / s.total) * 100 : 0}%"></span>
          </span>
          <span class="report-section-stat">${s.met}/${s.total}</span>
        </div>
      `;
    }).join('');

  const failureRows = failures.length
    ? failures.map(f => `
        <div class="report-failure">
          <div class="report-failure-label">${escapeHtml(f.label || f.itemId)}</div>
          ${f.note ? `<div class="report-failure-note">${escapeHtml(f.note)}</div>` : ''}
        </div>
      `).join('')
    : `<p class="report-empty-sub">No critical failures recorded during this audit.</p>`;

  root.innerHTML = `
   <div class="report-head-block">
      <p class="section-eyebrow">Audit Report · ${audit.ref}</p>
      <h1>${escapeHtml(prop.name)}</h1>
      <p class="report-sub">${[prop.city, prop.country].filter(Boolean).map(escapeHtml).join(', ')} · ${escapeHtml(prop.category || '')} · Audited ${new Date(audit.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <button id="downloadPdfBtn" class="btn btn-ghost report-pdf-btn">Download PDF</button>
    </div>

    ${scorePct !== null ? `
      <div class="report-score">
        <div class="report-score-num">${scorePct}%</div>
        <div class="report-score-label">standards met, verified across ${totalGraded} audited touchpoints</div>
      </div>
    ` : ''}

    ${sealBlock}

    ${audit.auditor_summary ? `
      <div class="report-block">
        <p class="section-eyebrow">Auditor Summary</p>
        <p class="report-summary-text">${escapeHtml(audit.auditor_summary)}</p>
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
  `;

  const pdfBtn = document.getElementById('downloadPdfBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', () => window.print());
}

async function load() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (!ref) { renderNotFound(); return; }

  const { data: audit, error } = await supabase
    .from('audits')
    .select('id, ref, date, status, tier, auditor_summary, critical_failures, properties(name, city, country, category)')
    .eq('ref', ref)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !audit) { renderNotFound(); return; }

  const { data: items } = await supabase
    .from('audit_items')
    .select('item_id, section_id, status')
    .eq('audit_id', audit.id);

  renderReport(audit, items || []);
}

load();
