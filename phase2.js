// Specula One — Phase 2 reveal interactions
// Same restrained IntersectionObserver pattern as the live site's script.js.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const revealSelector = '.phil-item, .services-visual, .reveal, .seal-big';

if (!reduceMotion) {
  const revealTargets = document.querySelectorAll(revealSelector);
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  revealTargets.forEach(el => revealObserver.observe(el));
} else {
  document.querySelectorAll(revealSelector).forEach(el => el.classList.add('in-view'));
}

// Only one service row open at a time — reads as considered, not accordion-clutter.
const serviceRows = document.querySelectorAll('.service-row');
serviceRows.forEach(row => {
  row.addEventListener('toggle', () => {
    if (row.open) {
      serviceRows.forEach(other => { if (other !== row) other.open = false; });
    }
  });
});
