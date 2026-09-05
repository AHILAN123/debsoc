(function () {
  const footerMarkup = `
    <footer class="retro-footer" aria-label="DebSoc site footer">
      <div class="retro-footer-inner">
        <div class="retro-footer-grid">
          <div class="retro-footer-image-wrap">
            <img class="retro-footer-image" src="footer.jpg" alt="Are you debating? DebSoc IIEST Shibpur retro computer graphic">
          </div>
          <section class="retro-footer-description">
            <p class="retro-footer-desc">A community dedicated to technical precision and humanistic inquiry. Through debate and formal discourse, we equip scholars to defend ideas with clarity and conviction.</p>
          </section>
          <nav aria-label="Footer navigation">
            <h2 class="retro-footer-title">Quick Links</h2>
            <ul class="retro-footer-links">
              <li><a href="index.html">Home</a></li>
              <li><a href="aboutus.html">About Us</a></li>
              <li><a href="events.html">Events</a></li>
              <li><a href="gallery.html">Gallery</a></li>
              <li><a href="tribunal.html">Tribunal</a></li>
              <li><a href="contactpage.html">Contact</a></li>
            </ul>
          </nav>
          <section>
            <h2 class="retro-footer-title">Connect</h2>
            <div class="retro-footer-socials">
              <a class="retro-footer-social" href="https://www.instagram.com/debsoc_iiests" target="_blank" rel="noopener" aria-label="DebSoc on Instagram">IG</a>
              <a class="retro-footer-social" href="https://www.linkedin.com/company/debsoc-iiest-shibpur/" target="_blank" rel="noopener" aria-label="DebSoc on LinkedIn">in</a>
            </div>
          </section>
        </div>
        <div class="retro-footer-bottom">
          <span>(c) 2026 The Debating Society of IIEST Shibpur</span>
          <span class="retro-footer-status">STATUS: ONLINE // DIPLOMACY - DEBATE - DISCOURSE</span>
        </div>
      </div>
    </footer>`;

  function installFooter() {
    document.querySelectorAll('footer:not(.modal-footer)').forEach(function (footer) {
      footer.outerHTML = footerMarkup;
    });

    if (!document.querySelector('.retro-footer')) {
      document.body.insertAdjacentHTML('beforeend', footerMarkup);
    }
  }

  if (!document.querySelector('link[href$="footer.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'footer.css';
    document.head.appendChild(stylesheet);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installFooter);
  } else {
    installFooter();
  }
})();
