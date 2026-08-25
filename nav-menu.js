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

function injectContactEmail() {
  const email = 'contact@speculaone.com';

  if (footer && !footer.querySelector('[data-specula-contact]')) {
    const contact = document.createElement('p');
    contact.dataset.speculaContact = 'true';

    const link = document.createElement('a');
    link.href = `mailto:${email}`;
    link.textContent = email;
    contact.appendChild(link);
    footer.appendChild(contact);
  }

  const footnote = document.querySelector('.owners-footnote');
  if (footnote && !footnote.querySelector('a')) {
    footnote.textContent = 'We will respond directly to your inquiry. You can also reach us at ';
    const link = document.createElement('a');
    link.href = `mailto:${email}`;
    link.textContent = email;
    footnote.appendChild(link);
    footnote.append('.');
  }
}

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

injectContactEmail();

if (trigger && menu && closeBtn) {
  trigger.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', closeMenu);
  menuLinks.forEach((link) => link.addEventListener('click', closeMenu));
}
