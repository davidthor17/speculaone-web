import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { interpretReport, reportRequest, envelopeToReport } from './report-result.js';
import { renderNotFound, renderUnsupported, renderReport } from './report-render.js';

// This file fetches and paints. Everything that decides what the page should
// say lives in report-result.js, which has no Supabase and no DOM and is
// therefore testable. See that file for the rule this page now follows: when a
// published audit carries a frozen payload, the report renders it and reads
// nothing else.
//
// Phase 7.2. The page reads no table. It makes one call to the report function
// with the identifier in its own URL (?token=, or ?ref= for every link issued
// before it), and the function returns one published report or nothing. An
// unknown identifier and an unpublished audit look the same from here.

const supabase = createClient(
  'https://zbmhfdoqmzzscdklziss.supabase.co',
  'sb_publishable_s7RALrw2f5eXx5lMKGhqOw_isP5_II-'
);

const root = document.getElementById('report-root');

async function load() {
  const request = reportRequest(window.location.search);
  if (!request) { renderNotFound(root); return; }

  const { data, error } = await supabase.rpc('get_public_report', request);
  if (error) { renderNotFound(root); return; }

  const { auditRow, items } = envelopeToReport(data);
  const result = interpretReport(auditRow, items);
  if (result.mode === 'unavailable') {
    if (result.reason === 'not-found') renderNotFound(root);
    else renderUnsupported(root);
    return;
  }
  renderReport(root, result.view);
}

load();
