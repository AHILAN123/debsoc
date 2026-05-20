// =============================================
//  main.js — Debating Society IIEST Shibpur
// =============================================

// ----- Mobile Menu -----
const menu = document.getElementById("mobile-menu");
const button = document.getElementById("hamburger-btn");

function toggleMobileMenu() {
  menu.classList.toggle("hidden");
}

document.addEventListener("click", function(event) {

  const isClickInsideMenu = menu.contains(event.target);
  const isClickOnButton = button.contains(event.target);

  if (!isClickInsideMenu && !isClickOnButton) {
    menu.classList.add("hidden");
  }

});

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
