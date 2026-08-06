import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Same project as the audit console — safe to expose, access governed by RLS.
const supabase = createClient(
  'https://zbmhfdoqmzzscdklziss.supabase.co',
  'sb_publishable_s7RALrw2f5eXx5lMKGhqOw_isP5_II-'
);

// Reveal sections as they enter the viewport
const revealTargets = document.querySelectorAll('.process, .packages, .why, .seal-section, .owners');
revealTargets.forEach(el => el.classList.add('reveal'));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

revealTargets.forEach(el => revealObserver.observe(el));

// Stamp the seal onto the field-report card once it's in view
const reportCard = document.getElementById('report-card');
if (reportCard) {
  const stampObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setTimeout(() => reportCard.classList.add('stamped'), 500);
        stampObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  stampObserver.observe(reportCard);
}

// Request form — writes straight to the leads table in Supabase
const ownersForm = document.getElementById('ownersForm');
const ownersNote = document.getElementById('ownersNote');
if (ownersForm) {
  ownersForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const [propertyInput, emailInput] = ownersForm.querySelectorAll('input');
    const submitBtn = ownersForm.querySelector('button');
    submitBtn.disabled = true;
    ownersNote.textContent = 'Sending…';

    const { error } = await supabase.from('leads').insert({
      property_name: propertyInput.value,
      email: emailInput.value,
    });

    submitBtn.disabled = false;
    if (error) {
      ownersNote.textContent = "Something went wrong — email us directly instead.";
      ownersNote.style.color = '#E05555';
    } else {
      ownersNote.textContent = 'Request received. We reply within two business days.';
      ownersNote.style.color = '';
      ownersForm.reset();
    }
  });
}
