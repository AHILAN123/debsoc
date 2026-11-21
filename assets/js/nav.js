(function () {
const links = [
  { label: 'Home', href: 'index.html' },
  { label: 'About Us', href: 'about.html' },
  { label: 'Tribunal', href: 'tribunal.html' },
  { label: 'Team', href: 'team.html' },
  { label: 'Contact', href: 'contact.html' }
];

const eventLinks = [
  { label: 'Main Events', href: 'events.html' },
  { label: 'BECON', href: 'becon.html' }
];

  // Vercel cleanUrls serves /about for about.html, so normalise back to the filename.
  const lastSegment = window.location.pathname.split('/').pop() || 'index';
  const currentPage = lastSegment.endsWith('.html') ? lastSegment : `${lastSegment}.html`;

  localStorage.removeItem("debsoc_token");

  const API_BASE = "/api";

  let csrfToken;


  function linkMarkup(link, mobile) {

    const current =
      link.href === currentPage
        ? ' aria-current="page"'
        : '';

    return `<a href="${link.href}"${current}>${link.label}</a>`;
  }


  /*
   * Same API helper used by the working page.
   *
   * - Sends the HttpOnly session cookie
   * - Fetches CSRF token for POST/PATCH/DELETE requests
   */
  async function apiFetch(url, options = {}) {

    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});

    if (
      method !== "GET" &&
      method !== "HEAD" &&
      method !== "OPTIONS"
    ) {

      if (!csrfToken) {

        const csrfResponse = await fetch(
          `${API_BASE}/csrf-token`,
          {
            credentials: "include"
          }
        );

        if (csrfResponse.ok) {

          const csrfData = await csrfResponse.json();

          csrfToken = csrfData.csrfToken;
        }
      }

      if (csrfToken) {
        headers.set("X-CSRF-Token", csrfToken);
      }
    }

    return fetch(url, {
      ...options,
      credentials: "include",
      headers
    });
  }


  /*
   * Authentication state
   *
   * This intentionally follows the working page:
   * localStorage.debsoc_user controls what the navbar displays.
   */
  function syncNavAuth() {

    const desktopNav =
      document.getElementById("nav-auth-container");

    const mobileNav =
      document.getElementById("mobile-auth-container");

    if (!desktopNav && !mobileNav) return;

    const userRaw =
      localStorage.getItem("debsoc_user");


    /*
     * LOGGED IN
     */
    if (userRaw) {

      try {

        const user = JSON.parse(userRaw);

        const username =
          user.username ||
          user.displayName ||
          "User";

        const profileUrl =
          `profile.html?u=${encodeURIComponent(
            user.username || username
          )}`;


        /*
         * Desktop auth area
         *
         * Uses existing nav classes so the visual system
         * remains the same as your original nav.js.
         */
        if (desktopNav) {

          desktopNav.innerHTML = `
            <div class="site-nav-auth">

              <a
                href="${profileUrl}"
                class="site-nav-link"
                title="Your profile"
              >
                @${username}
              </a>

              <button
                type="button"
                class="site-nav-link site-nav-logout"
              >
                Sign Out
              </button>

            </div>
          `;

          const logoutButton =
            desktopNav.querySelector('.site-nav-logout');

          if (logoutButton) {
            logoutButton.addEventListener(
              'click',
              handleLogout
            );
          }
        }


        /*
         * Mobile auth area
         */
        if (mobileNav) {

          mobileNav.innerHTML = `
            <div class="site-nav-mobile-auth">

              <a
                href="${profileUrl}"
                class="site-nav-link"
              >
                My Profile
              </a>

              <button
                type="button"
                class="site-nav-link site-nav-logout"
              >
                Sign Out
              </button>

            </div>
          `;

          const logoutButton =
            mobileNav.querySelector('.site-nav-logout');

          if (logoutButton) {
            logoutButton.addEventListener(
              'click',
              handleLogout
            );
          }
        }

        return;

      } catch (error) {

        console.error(
          'Invalid stored user session:',
          error
        );

        localStorage.removeItem("debsoc_user");
      }
    }


    /*
     * LOGGED OUT
     *
     * These are the normal defaults.
     */
    if (desktopNav) {

      desktopNav.innerHTML = `
        <a
          href="register.html"
          class="site-nav-link"
        >
          Register / Sign In
        </a>
      `;
    }

    if (mobileNav) {

      mobileNav.innerHTML = `
        <a
          href="register.html"
          class="site-nav-link"
        >
          Register / Sign In
        </a>
      `;
    }
  }


  /*
   * Logout exactly like the working page.
   */
  async function handleLogout() {

    try {

      await apiFetch(
        `${API_BASE}/auth/logout`,
        {
          method: "POST"
        }
      );

    } catch (error) {

      console.error(
        "Logout request failed:",
        error
      );

    } finally {

      localStorage.removeItem("debsoc_user");

      window.location.reload();
    }
  }


  /*
   * Expose logout globally too.
   * Useful if another page already calls handleLogout().
   */
  window.handleLogout = handleLogout;


  function installNavigation() {

    /*
     * Remove old navigation elements.
     */
    document.querySelectorAll('nav').forEach(function (nav) {

      if (!nav.closest('.df-footer')) {
        nav.remove();
      }

    });


    const mobileLinks =
      links
        .map(function (link) {
          return linkMarkup(link, true);
        })
        .join('');


    const eventDesktop =
      eventLinks
        .map(function (link) {

          const current =
            link.href === currentPage
              ? ' aria-current="page"'
              : '';

          return `
            <a href="${link.href}"${current}>
              ${link.label}
            </a>
          `;
        })
        .join('');


    const eventMobile =
      eventLinks
        .map(function (link) {
          return linkMarkup(link, true);
        })
        .join('');

    const isEventsPage =
      eventLinks.some(function (link) {
        return link.href === currentPage;
      });


    const markup = `
      <nav
        class="site-nav"
        aria-label="Main navigation"
      >

        <div class="site-nav-inner">

          <div class="site-nav-links">

            <a
              class="site-nav-link"
              href="index.html"
              ${currentPage === 'index.html'
                ? 'aria-current="page"'
                : ''}
            >
              Home
            </a>

            <a
              class="site-nav-link"
              href="about.html"
              ${currentPage === 'about.html'
                ? 'aria-current="page"'
                : ''}
            >
              About Us
            </a>

            <div class="site-nav-events${isEventsPage ? ' is-current' : ''}">

              <button
                class="site-nav-trigger"
                type="button"
                aria-expanded="false"
                aria-controls="site-nav-events-menu"
                ${isEventsPage ? 'aria-current="page"' : ''}
              >
                Events
                <span
                  class="site-nav-caret"
                  aria-hidden="true"
                ></span>
              </button>

              <div
                class="site-nav-dropdown"
                id="site-nav-events-menu"
              >
                ${eventDesktop}
              </div>

            </div>

            <a
              class="site-nav-link"
              href="tribunal.html"
              ${currentPage === 'tribunal.html'
                ? 'aria-current="page"'
                : ''}
            >
              Tribunal
            </a>

            <a
              class="site-nav-link"
              href="team.html"
              ${currentPage === 'team.html'
                ? 'aria-current="page"'
                : ''}
            >
              Team
            </a>

            <a
              class="site-nav-link"
              href="contact.html"
              ${currentPage === 'contact.html'
                ? 'aria-current="page"'
                : ''}
            >
              Contact
            </a>

          </div>


          <!-- AUTH AREA -->
          <div
            id="nav-auth-container"
            class="site-nav-auth-container"
          >
            <a
              class="site-nav-link"
              href="register.html"
            >
              Register / Sign In
            </a>
          </div>


          <button
            class="site-nav-menu-button"
            type="button"
            aria-label="Open navigation menu"
            aria-expanded="false"
            aria-controls="site-nav-mobile"
          >
            <span></span>
          </button>

        </div>


        <!-- MOBILE -->
        <div
          class="site-nav-mobile"
          id="site-nav-mobile"
        >

          ${mobileLinks}

          <div class="site-nav-mobile-section">
            Events
          </div>

          ${eventMobile}

          <div
            id="mobile-auth-container"
            class="site-nav-mobile-auth-container"
          >
            <a
              class="site-nav-link"
              href="register.html"
            >
              Register / Sign In
            </a>
          </div>

        </div>

      </nav>
    `;


    document.body.insertAdjacentHTML(
      'afterbegin',
      markup
    );


    const nav =
      document.querySelector('.site-nav');

    const menuButton =
      nav.querySelector('.site-nav-menu-button');

    const mobileMenu =
      nav.querySelector('.site-nav-mobile');

    const eventButton =
      nav.querySelector('.site-nav-trigger');

    const eventWrap =
      nav.querySelector('.site-nav-events');


    /*
     * MOBILE MENU
     */
    menuButton.addEventListener(
      'click',
      function () {

        const open =
          menuButton.classList.toggle('is-open');

        mobileMenu.classList.toggle(
          'is-open',
          open
        );

        menuButton.setAttribute(
          'aria-expanded',
          String(open)
        );

        menuButton.setAttribute(
          'aria-label',
          open
            ? 'Close navigation menu'
            : 'Open navigation menu'
        );

      }
    );


    mobileMenu
      .querySelectorAll('a')
      .forEach(function (link) {

        link.addEventListener(
          'click',
          function () {

            menuButton.classList.remove(
              'is-open'
            );

            mobileMenu.classList.remove(
              'is-open'
            );

            menuButton.setAttribute(
              'aria-expanded',
              'false'
            );

          }
        );

      });


    /*
     * EVENTS DROPDOWN
     */
    eventButton.addEventListener(
      'click',
      function (event) {

        event.stopPropagation();

        const open =
          eventWrap.classList.toggle(
            'is-open'
          );

        eventButton.setAttribute(
          'aria-expanded',
          String(open)
        );

      }
    );


    /*
     * CLOSE EVENTS DROPDOWN WHEN
     * CLICKING OUTSIDE
     */
    document.addEventListener(
      'click',
      function (event) {

        if (
          !eventWrap.contains(event.target)
        ) {

          eventWrap.classList.remove(
            'is-open'
          );

          eventButton.setAttribute(
            'aria-expanded',
            'false'
          );

        }

      }
    );

    document.addEventListener(
      'keydown',
      function (event) {
        if (event.key !== 'Escape') return;

        eventWrap.classList.remove('is-open');
        eventButton.setAttribute('aria-expanded', 'false');
        mobileMenu.classList.remove('is-open');
        menuButton.classList.remove('is-open');
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.setAttribute('aria-label', 'Open navigation menu');
      }
    );


    /*
     * Finally sync authentication state
     * after the navbar has been inserted.
     */
    syncNavAuth();
  }


  /*
   * Keep loading assets/css/components/nav.css exactly as before.
   */
  if (
    !document.querySelector(
      'link[href$="assets/css/components/nav.css"]'
    )
  ) {

    const stylesheet =
      document.createElement('link');

    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'assets/css/components/nav.css';

    document.head.appendChild(
      stylesheet
    );
  }


  if (
    document.readyState === 'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      installNavigation
    );

  } else {

    installNavigation();

  }

})();