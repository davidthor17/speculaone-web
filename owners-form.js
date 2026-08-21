// Specula One — Owners lead-capture form
// Ported verbatim from script.js (the live site) so prototype behavior
// matches production exactly: same Supabase project, same table, same
// field mapping, same success/error copy.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(
  'https://zbmhfdoqmzzscdklziss.supabase.co',
  'sb_publishable_s7RALrw2f5eXx5lMKGhqOw_isP5_II-'
);

const ownersForm = document.getElementById('ownersForm');
const ownersNote = document.getElementById('ownersNote');
if (ownersForm) {
  ownersForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const [propertyInput, emailInput] = ownersForm.querySelectorAll('input');
    const focusAreaSelect = ownersForm.querySelector('#focusArea');
    const packageSelect = ownersForm.querySelector('#packageSelect');
    const submitBtn = ownersForm.querySelector('button');
    submitBtn.disabled = true;
    ownersNote.textContent = 'Sending…';
    const { error } = await supabase.from('leads').insert({
      property_name: propertyInput.value,
      email: emailInput.value,
      focus_area: focusAreaSelect ? focusAreaSelect.value || null : null,
      package: packageSelect ? packageSelect.value || null : null,
    });

    submitBtn.disabled = false;
    if (error) {
      ownersNote.textContent = "Something went wrong. Please email us directly instead.";
      ownersNote.style.color = '#E05555';
      if (typeof window.plausible === 'function') window.plausible('Lead Submission Failed');
    } else {
      ownersNote.textContent = 'Request received. We reply within two business days.';
      ownersNote.style.color = '';
      ownersForm.reset();
      if (typeof window.plausible === 'function') window.plausible('Lead Submitted');
    }
  });
}

// Delegated listener for package CTAs (.pkg-cta, data-package="…") so the
// analytics call lives in one place instead of duplicated inline handlers.
document.addEventListener('click', (e) => {
  const cta = e.target.closest('.pkg-cta');
  if (!cta) return;
  const pkg = cta.dataset.package;
  const packageSelect = document.getElementById('packageSelect');
  if (packageSelect && pkg) packageSelect.value = pkg;
  if (typeof window.plausible === 'function') window.plausible('Package Interest');
});
