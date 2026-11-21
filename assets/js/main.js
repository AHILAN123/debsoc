// =============================================
//  assets/js/main.js — Debating Society IIEST Shibpur
// =============================================

// ----- Mobile Menu -----
const menu = document.getElementById("mobile-menu");
const button = document.getElementById("hamburger-btn");
const API_BASE = "/api";
// For Vercel deployment with same-origin API routing:
// const API_BASE = "/api";
// --- Session Helpers ---
localStorage.removeItem("debsoc_token");
const getAuthToken = () => null;
const getAuthUser = () => {
  const user = localStorage.getItem("debsoc_user");
  return user ? JSON.parse(user) : null;
};
const isAuthenticated = () => !!getAuthUser();

const logoutUser = async () => {
  await apiFetch(`${API_BASE}/auth/logout`, { method: "POST" });
  localStorage.removeItem("debsoc_user");
  window.location.reload();
};

const apiFetch = (url, options = {}) => window.DebSoc.apiFetch(url, options);

// --- Auth API Calls ---
const loginUser = async (email, password) => {
  const res = await apiFetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");

  localStorage.setItem("debsoc_user", JSON.stringify(data.user));
  return data;
};

const registerUser = async (displayName, username, email, password) => {
  const res = await apiFetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: displayName.trim(),
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Registration failed");
  return data;
};

// --- Event API Calls ---
const fetchEvents = async () => {
  const res = await apiFetch(`${API_BASE}/events`);
  if (!res.ok) throw new Error("Failed to load events");
  return await res.json();
};

const registerForEvent = async (eventId) => {
  if (!isAuthenticated()) throw new Error("Please log in to register for this debate.");

  const res = await apiFetch(`${API_BASE}/events/${eventId}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    }
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Event registration failed");
  return data;
};

// --- Achievement / Winner Code API Calls ---
const redeemWinnerCode = async (code) => {
  if (!isAuthenticated()) throw new Error("Please log in to redeem an award.");

  const res = await apiFetch(`${API_BASE}/achievements/redeem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: code.trim() })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Redemption failed");
  return data;
};

function toggleMobileMenu() {
  if (!menu) return;
  menu.classList.toggle("hidden");
}

document.addEventListener("click", function(event) {
  if (!menu || !button) return;

  const isClickInsideMenu = menu.contains(event.target);
  const isClickOnButton = button.contains(event.target);

  if (!isClickInsideMenu && !isClickOnButton) {
    menu.classList.add("hidden");
  }
});

window.getAuthToken = getAuthToken;
window.getAuthUser = getAuthUser;
window.isAuthenticated = isAuthenticated;
window.logoutUser = logoutUser;
window.loginUser = loginUser;
window.registerUser = registerUser;
window.fetchEvents = fetchEvents;
window.registerForEvent = registerForEvent;
window.redeemWinnerCode = redeemWinnerCode;

// ----- About Us scroll / navigate -----
function handleAboutClick() {

  const section = document.getElementById("about-section");

  if (section) {
    section.scrollIntoView({
      behavior: "smooth"
    });
  } else {
    window.location.href = "index.html#about-section";
  }

}

function scrollToAbout() {
  const aboutSection = document.getElementById('about-section');
  if (aboutSection) {
    aboutSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// On homepage load: if URL has #about-section hash, scroll to it
document.addEventListener('DOMContentLoaded', function () {
  if (window.location.hash === '#about-section') {
    setTimeout(scrollToAbout, 100);
  }
});

// ----- Contact Form -----
function handleSubmit(event) {
  event.preventDefault();
  alert('Thank you for your message! We will get back to you soon.');
  event.target.reset();
}

// ----- Universal Carousel -----
function initCarousel(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const items = container.querySelectorAll('.carousel-item');
  let current = 0;

  function updateCarousel() {
    items.forEach((item, index) => {
      item.classList.remove('left', 'center', 'right');
      if (index === current) {
        item.classList.add('center');
      } else if (index === (current - 1 + items.length) % items.length) {
        item.classList.add('left');
      } else if (index === (current + 1) % items.length) {
        item.classList.add('right');
      }
    });
  }

  function autoSlide() {
    current = (current + 1) % items.length;
    updateCarousel();
  }

  updateCarousel();
  setInterval(autoSlide, 3000);
}

document.addEventListener('DOMContentLoaded', function () {
  initCarousel('.hero-carousel');
  initCarousel('.about-carousel');
});

// ----- Gallery Pagination -----
function changePage(pageNum) {
  document.querySelectorAll('.gallery-img').forEach(img => {
    if (img.dataset.page == pageNum) {
      img.classList.remove('hidden');
    } else {
      img.classList.add('hidden');
    }
  });

  // Re-trigger zoom animation
  const grid = document.getElementById('gallery-grid');
  if (grid) {
    grid.classList.remove('gallery-zoom');
    void grid.offsetWidth; // reflow
    grid.classList.add('gallery-zoom');
  }
}
