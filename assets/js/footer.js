(function () {
  const windowControls = '<span class="df-controls" aria-hidden="true"><i></i><i></i><i></i></span>';

  const footerMarkup = `
    <footer class="df-footer" aria-label="DebSoc site footer">
      <div class="df-barcode" aria-hidden="true"></div>
      <div class="df-wrap df-main">
        <figure class="df-window df-art">
          <div class="df-titlebar"><span>DebSoc</span>${windowControls}</div>
          <img src="assets/images/site/footer-retro.jpg" alt="Are you debating, son? A retro computer showing the DebSoc crest" width="1080" height="1350" loading="lazy">
        </figure>

        <div class="df-pitch">
          <div>
            <div class="df-headline">Come argue <span>with us.</span></div>
            <div class="df-blurb">Debate, public speaking and Model UN at IIEST Shibpur. Home of BECON.</div>
          </div>
          <a class="df-cta" href="contact.html">Get in touch</a>
        </div>

        <div class="df-windows">
          <div class="df-window" role="navigation" aria-label="Explore">
            <div class="df-titlebar"><span>Explore</span>${windowControls}</div>
            <div class="df-body df-links">
              <a href="about.html">About Us</a>
              <a href="team.html">Team</a>
              <a href="gallery.html">Gallery</a>
              <a href="contact.html">Contact</a>
            </div>
          </div>
          <div class="df-window" role="navigation" aria-label="Events">
            <div class="df-titlebar"><span>Events</span>${windowControls}</div>
            <div class="df-body df-links">
              <a href="events.html">Main Events</a>
              <a href="becon.html">BECON</a>
              <a href="history.html">History</a>
              <a href="tribunal.html">Tribunal</a>
            </div>
          </div>
          <div class="df-window df-find">
            <div class="df-titlebar"><span>Find us</span>${windowControls}</div>
            <div class="df-body">
              <address class="df-address">IIEST Shibpur, Howrah, West Bengal</address>
              <a class="df-mail" href="mailto:debsoc.iiest@gmail.com">debsoc.iiest@gmail.com</a>
              <div class="df-socials">
                <a class="df-social" href="https://www.instagram.com/debsoc_iiests" target="_blank" rel="noopener" aria-label="DebSoc on Instagram">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><path d="M17.5 6.5h.01"></path></svg>
                </a>
                <a class="df-social" href="https://www.linkedin.com/company/debsoc-iiest-shibpur/" target="_blank" rel="noopener" aria-label="DebSoc on LinkedIn">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10v9M6 5.5v.01M11 19v-9M11 14c0-2.4 1.5-4 3.7-4S19 11.6 19 14v5"></path></svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="df-wrap df-bottom">
        <span>&copy; 2026 The Debating Society of IIEST Shibpur</span>
        <a class="df-signin" href="register.html">Register or sign in</a>
      </div>
    </footer>`;

  function installFooter() {
    document.querySelectorAll('footer:not(.modal-footer)').forEach(function (footer) {
      footer.outerHTML = footerMarkup;
    });

    if (!document.querySelector('.df-footer')) {
      document.body.insertAdjacentHTML('beforeend', footerMarkup);
    }
  }

  if (!document.querySelector('link[href$="assets/css/components/footer.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'assets/css/components/footer.css';
    document.head.appendChild(stylesheet);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installFooter);
  } else {
    installFooter();
  }
})();
