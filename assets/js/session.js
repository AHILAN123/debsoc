/*
 * Shared client helpers (load in <head>, before any page script):
 *  - "Waking the server" notice when an /api request takes longer than 3s
 *  - throwaway /api/health ping on page load so a sleeping API starts waking early
 *  - apiFetch with CSRF token handling (one automatic retry on "Invalid CSRF")
 *  - getSession(): verifies the login cookie via /api/auth/me instead of trusting localStorage
 *
 * Everything lives on window.DebSoc; no other globals are created.
 */
(function () {
  if (window.DebSoc) return;

  var API = "/api";
  var SLOW_MS = 3000;
  var USER_KEY = "debsoc_user";
  var nativeFetch = window.fetch.bind(window);
  // Site root, derived from this script's URL, so links work from /admin/ too.
  var SITE_ROOT = (document.currentScript && document.currentScript.src || "").replace(/assets\/js\/session\.js.*$/, "");

  /* ---------- notices ---------- */
  function makeBox(id, bottom) {
    var el = document.getElementById(id);
    if (el) return el;
    el = document.createElement("div");
    el.id = id;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.style.cssText =
      "position:fixed;left:50%;bottom:" + bottom + "px;transform:translateX(-50%);z-index:99999;" +
      "max-width:min(92vw,520px);padding:10px 16px;background:#000;color:#ffdf5e;" +
      "border:2px solid #f1efe8;box-shadow:5px 5px 0 #c4231a;" +
      "font:600 13px/1.4 'Courier New',monospace;text-align:center;display:none";
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  var slowCount = 0;
  function showWake() {
    var el = makeBox("debsoc-wake-notice", 20);
    el.textContent = "Waking the server, this can take up to a minute…";
    el.style.display = "block";
  }
  function hideWake() {
    var el = document.getElementById("debsoc-wake-notice");
    if (el) el.style.display = "none";
  }

  var noticeTimer = null;
  function notify(text, href, linkText) {
    var el = makeBox("debsoc-notice", 80);
    el.textContent = text;
    if (href) {
      el.appendChild(document.createTextNode(" "));
      var a = document.createElement("a");
      a.href = href;
      a.textContent = linkText || "Log in";
      a.style.cssText = "color:#fff;text-decoration:underline";
      el.appendChild(a);
    }
    el.style.display = "block";
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { el.style.display = "none"; }, 8000);
  }

  /* ---------- slow-request tracking (wraps fetch for /api calls only) ---------- */
  function isApiUrl(url) {
    try {
      var u = new URL(url, window.location.href);
      return u.pathname === API || u.pathname.indexOf(API + "/") === 0;
    } catch (e) {
      return false;
    }
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var promise = nativeFetch(input, init);
    if (!isApiUrl(url)) return promise;

    var timer = setTimeout(function () {
      timer = null;
      slowCount++;
      showWake();
    }, SLOW_MS);
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (timer !== null) {
        clearTimeout(timer);
      } else {
        slowCount = Math.max(0, slowCount - 1);
      }
      if (slowCount === 0) hideWake();
    }
    promise.then(finish, finish);
    return promise;
  };

  /* ---------- throwaway wake-up ping ---------- */
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    try {
      window.fetch(API + "/health", { cache: "no-store" }).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  /* ---------- CSRF-aware apiFetch ---------- */
  var csrfToken = null;
  var csrfPending = null;

  function loadCsrf() {
    if (csrfPending) return csrfPending;
    csrfPending = window.fetch(API + "/csrf-token", { credentials: "include" })
      .then(function (res) {
        if (!res.ok) throw new Error("Could not start a secure session. Please try again.");
        return res.json();
      })
      .then(function (data) {
        csrfToken = data.csrfToken;
        csrfPending = null;
        return csrfToken;
      }, function (err) {
        csrfPending = null;
        throw err;
      });
    return csrfPending;
  }

  function apiFetch(url, options) {
    options = options || {};
    var method = String(options.method || "GET").toUpperCase();
    var unsafe = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

    function attempt(retried) {
      var headers = new Headers(options.headers || {});
      var ready = unsafe && !csrfToken ? loadCsrf() : Promise.resolve();
      return ready.then(function () {
        if (unsafe) headers.set("X-CSRF-Token", csrfToken);
        return window.fetch(url, Object.assign({}, options, { credentials: "include", headers: headers }));
      }).then(function (res) {
        if (!unsafe || retried || res.status !== 403) return res;
        return res.clone().json().then(
          function (body) { return !!(body && /csrf/i.test(body.error || "")); },
          function () { return false; }
        ).then(function (isCsrf) {
          if (!isCsrf) return res;
          csrfToken = null; // cookie and cached token drifted apart: fetch a fresh pair once
          return attempt(true);
        });
      });
    }
    return attempt(false);
  }

  /* ---------- session ---------- */
  function readStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch (e) {
      try { localStorage.removeItem(USER_KEY); } catch (_) { /* ignore */ }
      return null;
    }
  }

  var sessionPromise = null;
  var expired = false;

  function clearSession() {
    try { localStorage.removeItem(USER_KEY); } catch (e) { /* ignore */ }
  }

  function getSession() {
    if (sessionPromise) return sessionPromise;
    var stored = readStoredUser();
    if (!stored) {
      sessionPromise = Promise.resolve(null);
      return sessionPromise;
    }
    sessionPromise = window.fetch(API + "/auth/me", { credentials: "include", cache: "no-store" })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          expired = true;
          clearSession();
          notify("Session expired, log in again.", SITE_ROOT + "register.html", "Log in");
          return null;
        }
        if (!res.ok) return stored; // server trouble: keep the optimistic state
        return res.json().then(function (data) {
          if (data && data.user) {
            try {
              localStorage.setItem(USER_KEY, JSON.stringify(Object.assign({}, stored, data.user)));
            } catch (e) { /* ignore */ }
            return readStoredUser();
          }
          return stored;
        });
      })
      .catch(function () { return stored; }); // offline / API asleep: do not log the user out
    return sessionPromise;
  }

  window.DebSoc = {
    apiFetch: apiFetch,
    getSession: getSession,
    getStoredUser: readStoredUser,
    clearSession: clearSession,
    sessionExpired: function () { return expired; },
    notify: notify
  };
})();
