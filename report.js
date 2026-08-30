import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { interpretReport } from './report-result.js';
import { renderNotFound, renderUnsupported, renderReport } from './report-render.js';

// This file fetches and paints. Everything that decides what the page should
// say lives in report-result.js, which has no Supabase and no DOM and is
// therefore testable. See that file for the rule this page now follows: when a
// published audit carries a frozen payload, the report renders it and reads
// nothing else.

const supabase = createClient(
  'https://zbmhfdoqmzzscdklziss.supabase.co',
  'sb_publishable_s7RALrw2f5eXx5lMKGhqOw_isP5_II-'
);

const root = document.getElementById('report-root');

async function load() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (!ref) { renderNotFound(root); return; }

  const { data: audit, error } = await supabase
    .from('audits')
    .select('id, ref, date, status, tier, auditor_summary, critical_failures, published_result, properties(name, city, country, category)')
    .eq('ref', ref)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !audit) { renderNotFound(root); return; }

  // Item rows are fetched only for audits published before payloads existed. A
  // payload-backed report must not read them, so it does not ask for them.
  let items = [];
  if (audit.published_result === null || audit.published_result === undefined) {
    const { data } = await supabase
      .from('audit_items')
      .select('item_id, section_id, status')
      .eq('audit_id', audit.id);
    items = data || [];
  }

  const result = interpretReport(audit, items);
  if (result.mode === 'unavailable') {
    if (result.reason === 'not-found') renderNotFound(root);
    else renderUnsupported(root);
    return;
  }
  renderReport(root, result.view);
}

load();
