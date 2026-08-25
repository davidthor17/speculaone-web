// Specula One — mobile navigation overlay
// Open/close, focus management and background inertness for the Option C menu.

const trigger = document.getElementById('menuTrigger');
const closeBtn = document.getElementById('menuClose');
const menu = document.getElementById('mobileMenu');
const menuLinks = menu ? menu.querySelectorAll('.mobile-menu-links a') : [];
const header = document.querySelector('.nav');
const main = document.querySelector('main');
const footer = document.querySelector('.footer-light');
const backgroundEls = [header, main, footer].filter(Boolean);

function onKeydown(e) {
  if (e.key === 'Escape') closeMenu();
}

function openMenu() {
  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');
  trigger.setAttribute('aria-expanded', 'true');
  document.body.classList.add('menu-open');
  backgroundEls.forEach((el) => el.setAttribute('inert', ''));
  closeBtn.focus();
  document.addEventListener('keydown', onKeydown);
}

function closeMenu() {
  menu.classList.remove('is-open');
  menu.setAttribute('aria-hidden', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
  backgroundEls.forEach((el) => el.removeAttribute('inert'));
  document.removeEventListener('keydown', onKeydown);
  trigger.focus();
}

if (trigger && menu && closeBtn) {
  trigger.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', closeMenu);
  menuLinks.forEach((link) => link.addEventListener('click', closeMenu));
}
