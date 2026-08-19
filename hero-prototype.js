// Specula One — Hero / Portal Prototype (Phase 1)
// Restrained mouse-driven parallax on the portal photograph:
// the frame tilts very slightly, the photo drifts opposite the cursor,
// and a soft light layer shifts with it — depth and lighting response,
// without ever animating the architecture itself.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const portalWrap = document.getElementById('portalWrap');
const portalFrame = document.getElementById('portalFrame');
const portalPhoto = document.getElementById('portalPhoto');
const portalGlow = document.getElementById('portalGlow');

if (portalWrap && portalFrame && portalPhoto && portalGlow && !reduceMotion) {
  let targetX = 0, targetY = 0;   // -1..1, pointer position relative to portal center
  let currentX = 0, currentY = 0; // eased toward target each frame
  let rafId = null;

  function onPointerMove(e) {
    const rect = portalFrame.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    targetX = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
    targetY = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function onPointerLeave() {
    targetX = 0;
    targetY = 0;
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function tick() {
    // gentle easing toward target — weighted, unhurried motion
    currentX += (targetX - currentX) * 0.055;
    currentY += (targetY - currentY) * 0.055;

    // the frame tilts a couple of degrees — reads as depth, not a UI card
    portalFrame.style.transform = `rotateY(${currentX * 2.5}deg) rotateX(${currentY * -1.8}deg)`;

    // the photo drifts slightly opposite the cursor within its frame,
    // as if the viewer is looking through the opening, not at a picture of it
    portalPhoto.style.transform = `scale(1.08) translate(${currentX * -10}px, ${currentY * -6}px)`;

    // light shifts subtly with the cursor
    portalGlow.style.transform = `translate(${currentX * 16}px, ${currentY * 10}px)`;

    if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  window.addEventListener('mousemove', onPointerMove);
  portalWrap.addEventListener('mouseleave', onPointerLeave);
}

// Scroll cue click — smooth-scrolls to whatever section follows the hero.
const scrollCue = document.querySelector('.scroll-cue');
if (scrollCue) {
  scrollCue.addEventListener('click', () => {
    const next = document.querySelector('.hero').nextElementSibling;
    if (next) next.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  });
}
