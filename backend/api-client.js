// api-client.js
// Include this script in gallery.html, events.html, and tribunal.html
// to load content dynamically from the backend.

const API_BASE = 'https://debsoc-4zhu.onrender.com/api';

console.log("API connected to:", API_BASE);

// ════════════════════════════════════════════════════════
//  GALLERY
// ════════════════════════════════════════════════════════
async function loadGalleryFromAPI() {
  const grid = document.getElementById('gallery-grid');
  const paginationContainer = document.getElementById('gallery-pagination');
  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  const page = parseInt(params.get('page')) || 1;

  try {
    const res = await fetch(`${API_BASE}/gallery?page=${page}`);
    if (!res.ok) throw new Error("Failed to fetch gallery");

    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      grid.innerHTML = `
        <div class="col-span-3 text-center py-20 text-gray-500">
          No gallery photos yet. Check back soon!
        </div>`;
      return;
    }

    grid.innerHTML = data.items.map(img => `
      <img src="${API_BASE}${img.url}"
           alt="${img.caption || 'Gallery photo'}"
           class="gallery-img"
           loading="lazy">
    `).join('');

    if (paginationContainer && data.totalPages > 1) {
      let paginationHTML = '<div class="flex gap-3 justify-center mt-10 flex-wrap">';
      for (let i = 1; i <= data.totalPages; i++) {
        const isActive = i === page;
        paginationHTML += `
          <a href="?page=${i}"
             class="px-5 py-2 rounded-full text-sm font-semibold transition"
             style="${isActive
               ? 'background:#800020;color:white;'
               : 'background:white;border:2px solid #800020;color:#800020;'}">
            Page ${i}
          </a>`;
      }
      paginationHTML += '</div>';
      paginationContainer.innerHTML = paginationHTML;
    }
  } catch (err) {
    console.error('Gallery load error:', err);
  }
}

// ════════════════════════════════════════════════════════
//  TRIBUNALS
// ════════════════════════════════════════════════════════
async function loadTribunalsFromAPI() {
  const container = document.getElementById('tribunals-grid');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/tribunals`);
    if (!res.ok) throw new Error("Failed to fetch tribunals");

    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      container.innerHTML = `
        <div class="col-span-3 text-center py-20 text-gray-500">
          No tribunal issues published yet. Check back soon!
        </div>`;
      return;
    }

    container.innerHTML = data.items.map(t => `
      <div>
        <a href="${API_BASE}${t.pdfUrl}" target="_blank">
          ${t.coverUrl
            ? `<img src="${API_BASE}${t.coverUrl}"
                    class="h-64 w-full object-cover rounded-xl shadow-md mb-6 hover:scale-105 transition"
                    alt="${t.title}" loading="lazy">`
            : `<div class="h-64 w-full rounded-xl shadow-md mb-6 hover:scale-105 transition flex items-center justify-center text-5xl"
                    style="background:linear-gradient(135deg,#5c0017,#800020);">📰</div>`
          }
        </a>
        <a href="${API_BASE}${t.pdfUrl}"
           target="_blank"
           class="inline-block px-6 py-3 rounded-lg text-sm font-medium hover:scale-105 transition"
           style="background:#DAA520;color:#800020;">
          View — ${t.title}
        </a>
      </div>
    `).join('');
  } catch (err) {
    console.error('Tribunals load error:', err);
  }
}

// ════════════════════════════════════════════════════════
//  EVENTS
// ════════════════════════════════════════════════════════
async function loadEventsFromAPI() {
  const container = document.getElementById('events-blocks');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error("Failed to fetch events");

    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-20 text-gray-500">
          Events coming soon. Stay tuned!
        </div>`;
      return;
    }

    container.innerHTML = data.items.map(e => `
      <div class="event-block rounded-2xl overflow-hidden shadow-md mb-8"
           style="border:1px solid rgba(128,0,32,0.15);">

        <div class="px-8 py-5" style="background:linear-gradient(135deg,#5c0017,#800020);">
          <h2 class="font-display text-2xl text-white">${e.name}</h2>
        </div>

        <div class="px-8 py-6" style="background:#FAF7F2;">
          <div class="flex flex-wrap gap-6 mb-4">
            ${e.event_date ? `
              <div class="flex items-center gap-2 text-sm text-gray-600">
                <span>📅</span>
                <span><strong>${formatDate(e.event_date)}</strong></span>
              </div>` : ''}
            ${e.event_time ? `
              <div class="flex items-center gap-2 text-sm text-gray-600">
                <span>🕐</span>
                <span><strong>${formatTime(e.event_time)}</strong></span>
              </div>` : ''}
            ${e.venue ? `
              <div class="flex items-center gap-2 text-sm text-gray-600">
                <span>📍</span>
                <span><strong>${e.venue}</strong></span>
              </div>` : ''}
          </div>

          ${e.description ? `
            <p class="text-gray-600 mb-5 text-sm leading-relaxed">${e.description}</p>
          ` : ''}

          <div class="flex flex-wrap gap-6 items-start">
            ${e.photoUrl ? `
              <img src="${API_BASE}${e.photoUrl}"
                   alt="${e.name}"
                   class="rounded-xl object-cover shadow"
                   style="height:200px;max-width:320px;width:100%;"
                   loading="lazy">
            ` : ''}
            ${e.pdfUrl ? `
              <a href="${API_BASE}${e.pdfUrl}"
                 target="_blank"
                 class="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition hover:scale-105 self-center"
                 style="background:#DAA520;color:#800020;">
                📄 View Brochure / Document
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Events load error:', err);
    container.innerHTML = `<div class="text-center py-20 text-gray-500">Failed to load events.</div>`;
  }
}

// ── UTILS ──
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return dateStr; }
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2,'0')} ${ampm}`;
  } catch { return timeStr; }
}

// ── AUTO INIT ──
document.addEventListener('DOMContentLoaded', () => {
  loadGalleryFromAPI();
  loadTribunalsFromAPI();
  loadEventsFromAPI();
});