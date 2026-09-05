(function () {
  const links = [
    { label: 'Home', href: 'index.html' },
    { label: 'About Us', href: 'aboutus.html' },
    { label: 'Gallery', href: 'gallery.html' },
    { label: 'Tribunal', href: 'new.html' },
    { label: 'Team', href: 'teampage.html' },
    { label: 'Contact', href: 'contactpage.html' }
  ];
  const eventLinks = [
    { label: 'Main Events', href: 'events.html' },
    { label: 'BECON #1.0', href: 'becon.html' }
  ];
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  function linkMarkup(link, mobile) {
    const current = link.href === currentPage ? ' aria-current="page"' : '';
    return `<a href="${link.href}"${current}>${link.label}</a>`;
  }

  function installNavigation() {
    document.querySelectorAll('nav').forEach(function (nav) {
      if (!nav.closest('.retro-footer')) nav.remove();
    });

    const mobileLinks = links.map(function (link) { return linkMarkup(link, true); }).join('');
    const eventDesktop = eventLinks.map(function (link) {
      return `<a href="${link.href}">${link.label}</a>`;
    }).join('');
    const eventMobile = eventLinks.map(function (link) { return linkMarkup(link, true); }).join('');

    const markup = `
      <nav class="site-nav" aria-label="Main navigation">
        <div class="site-nav-inner">
          <div class="site-nav-links">
            <a class="site-nav-link" href="index.html"${currentPage === 'index.html' ? ' aria-current="page"' : ''}>Home</a>
            <a class="site-nav-link" href="aboutus.html"${currentPage === 'aboutus.html' ? ' aria-current="page"' : ''}>About Us</a>
            <div class="site-nav-events">
              <button class="site-nav-trigger" type="button" aria-expanded="false" aria-controls="site-nav-events-menu">Events <span class="site-nav-caret" aria-hidden="true"></span></button>
              <div class="site-nav-dropdown" id="site-nav-events-menu">${eventDesktop}</div>
            </div>
            <a class="site-nav-link" href="gallery.html">Gallery</a>
            <a class="site-nav-link" href="new.html"${currentPage === 'new.html' || currentPage === 'tribunal.html' ? ' aria-current="page"' : ''}>Tribunal</a>
            <a class="site-nav-link" href="teampage.html"${currentPage === 'teampage.html' ? ' aria-current="page"' : ''}>Team</a>
            <a class="site-nav-link" href="contactpage.html"${currentPage === 'contactpage.html' ? ' aria-current="page"' : ''}>Contact</a>
          </div>
          <button class="site-nav-menu-button" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="site-nav-mobile"><span></span></button>
        </div>
        <div class="site-nav-mobile" id="site-nav-mobile">
          ${mobileLinks}
          <div class="site-nav-mobile-section">Events</div>
          ${eventMobile}
        </div>
      </nav>`;

    document.body.insertAdjacentHTML('afterbegin', markup);
    const nav = document.querySelector('.site-nav');
    const menuButton = nav.querySelector('.site-nav-menu-button');
    const mobileMenu = nav.querySelector('.site-nav-mobile');
    const eventButton = nav.querySelector('.site-nav-trigger');
    const eventWrap = nav.querySelector('.site-nav-events');

    menuButton.addEventListener('click', function () {
      const open = menuButton.classList.toggle('is-open');
      mobileMenu.classList.toggle('is-open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    });
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menuButton.classList.remove('is-open');
        mobileMenu.classList.remove('is-open');
        menuButton.setAttribute('aria-expanded', 'false');
      });
    });
    eventButton.addEventListener('click', function () {
      const open = eventWrap.classList.toggle('is-open');
      eventButton.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (event) {
      if (!eventWrap.contains(event.target)) {
        eventWrap.classList.remove('is-open');
        eventButton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (!document.querySelector('link[href$="nav.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'nav.css';
    document.head.appendChild(stylesheet);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installNavigation);
  } else {
    installNavigation();
  }
})();
