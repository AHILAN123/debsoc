/* ==========================================================================
   DebSoc admin dashboard (lightweight CMS)
   Auth, CSRF flow and existing API endpoints are unchanged.
   ========================================================================== */
const API_BASE = "/api";
// For Vercel deployment with same-origin API routing:
// const API_BASE = "/api";
localStorage.removeItem("debsoc_token");
const apiFetch = (url, options = {}) => window.DebSoc.apiFetch(url, options);

/* ---------- Small helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (v) => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { dateStyle: "medium" }); };
const fmtDT = (v) => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); };
// datetime-local needs LOCAL time (toISOString() is UTC and shifted saved times by the timezone offset)
const toLocalInput = (v) => {
  const d = new Date(v);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const nowLocalInput = () => toLocalInput(new Date());
const toISO = (localValue) => new Date(localValue).toISOString();
// Cloudinary delivery-time thumbnail; other hosts pass through untouched
const thumb = (url, w = 320, h = 240) =>
  typeof url === "string" && url.includes("res.cloudinary.com") && url.includes("/upload/")
    ? url.replace("/upload/", `/upload/c_fill,w_${w},h_${h},q_auto,f_auto/`)
    : url;

let toastTimer;
function toast(msg, type = "ok") {
  if (!msg) return; // silent (e.g. editor cancelled)
  const el = $("#toast");
  el.textContent = msg;
  el.className = type === "error" ? "err" : "ok";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

async function api(path, { method = "GET", json, form } = {}) {
  const headers = {};
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  else if (form) body = form; // browser sets the multipart boundary
  const res = await apiFetch(`${API_BASE}${path}`, { method, headers, body });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ---------- State ---------- */
const state = {
  events: [],
  history: [],
  codes: [],
  media: { items: [], cursor: null, total: 0, loaded: false },
  ready: { events: false, history: false, codes: false },
  sessionCodes: []
};
let evCover, evRte, histCover, histGallery, histRte;

/* ==========================================================================
   Rich text: stored as light Markdown in the existing `description` string.
   Plain existing descriptions still render fine. HTML is escaped first, so
   the output is safe to inject. renderRichText is self-contained: copy it
   into the public event/archive pages to render formatted descriptions.
   ========================================================================== */
function renderRichText(src = "") {
  const inline = (t) => esc(t)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  let html = "", para = [], list = [];
  const flushP = () => { if (para.length) { html += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
  const flushL = () => { if (list.length) { html += `<ul>${list.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`; list = []; } };
  for (const raw of String(src).replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushP(); flushL(); }
    else if ((m = line.match(/^#{1,3}\s+(.*)/))) { flushP(); flushL(); html += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = line.match(/^[-*]\s+(.*)/))) { flushP(); list.push(m[1]); }
    else if ((m = line.match(/^>\s?(.*)/))) { flushP(); flushL(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
    else { flushL(); para.push(line); }
  }
  flushP(); flushL();
  return html;
}

function createRichEditor(root, { onChange = () => {}, placeholder = "" } = {}) {
  root.innerHTML = `
    <div class="rte">
      <div class="rte-bar" role="toolbar" aria-label="Formatting">
        <button type="button" data-c="bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button type="button" data-c="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button type="button" data-c="heading" title="Heading">Heading</button>
        <button type="button" data-c="list" title="Bulleted list">List</button>
        <button type="button" data-c="quote" title="Quote">Quote</button>
        <button type="button" data-c="link" title="Link">Link</button>
        <span class="sp"></span>
        <button type="button" data-c="toggle" aria-pressed="false">Preview</button>
      </div>
      <textarea rows="7" placeholder="${esc(placeholder)}"></textarea>
      <div class="rte-view rt hidden"></div>
    </div>`;
  const ta = $("textarea", root), view = $(".rte-view", root), bar = $(".rte-bar", root);
  const fire = () => onChange(ta.value);

  const wrap = (before, after, ph) => {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || ph;
    ta.value = value.slice(0, s) + before + sel + after + value.slice(e);
    ta.focus();
    ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    fire();
  };
  const prefix = (p) => {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    let end = value.indexOf("\n", e);
    if (end === -1) end = value.length;
    const lines = value.slice(start, end).split("\n");
    const all = lines.every((l) => l.startsWith(p));
    const out = lines.map((l) => (all ? l.slice(p.length) : p + l.replace(/^(#{1,3}\s+|[-*]\s+|>\s?)/, ""))).join("\n");
    ta.value = value.slice(0, start) + out + value.slice(end);
    ta.focus();
    ta.setSelectionRange(start, start + out.length);
    fire();
  };
  const commands = {
    bold: () => wrap("**", "**", "bold text"),
    italic: () => wrap("*", "*", "italic text"),
    heading: () => prefix("## "),
    list: () => prefix("- "),
    quote: () => prefix("> "),
    link: () => {
      const url = (prompt("Link URL (must start with https://)") || "").trim();
      if (!url) return;
      if (!/^https?:\/\/\S+$/i.test(url) || /[)\s]/.test(url)) return toast("Enter a valid http(s) link without spaces or parentheses.", "error");
      wrap("[", `](${url})`, "link text");
    },
    toggle: (btn) => {
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = on ? "Edit" : "Preview";
      ta.classList.toggle("hidden", on);
      view.classList.toggle("hidden", !on);
      $$("button:not([data-c=toggle])", bar).forEach((b) => (b.disabled = on));
      if (on) view.innerHTML = ta.value.trim() ? renderRichText(ta.value) : '<span class="rt-empty">Nothing to preview yet.</span>';
    }
  };
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-c]");
    if (btn) commands[btn.dataset.c](btn);
  });
  ta.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); commands.bold(); }
    if (k === "i") { e.preventDefault(); commands.italic(); }
  });
  ta.addEventListener("input", fire);
  return {
    get: () => ta.value,
    set: (v) => {
      ta.value = v || "";
      const t = $("[data-c=toggle]", bar);
      if (t.getAttribute("aria-pressed") === "true") commands.toggle(t); // back to edit mode
      fire();
    }
  };
}

/* ==========================================================================
   Media library (Cloudinary via /admin/media*)
   ========================================================================== */
async function uploadFiles(files) {
  const okTypes = ["image/jpeg", "image/png", "image/webp"];
  if (files.length > 10) throw new Error("Upload up to 10 images at a time.");
  const bad = files.find((f) => !okTypes.includes(f.type));
  if (bad) throw new Error(`${bad.name}: only JPEG, PNG, and WebP images are allowed.`);
  const big = files.find((f) => f.size > 5 * 1024 * 1024);
  if (big) throw new Error(`${big.name} is larger than 5MB.`);

  // Client-side photo editor (crop, rotate, filters) before the upload. Cancel aborts silently.
  if (window.DebSocEditor) {
    const edited = await window.DebSocEditor.edit(files);
    if (edited === null) throw new Error("");
    files = edited;
    const tooBig = files.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) throw new Error(`${tooBig.name} is larger than 5MB.`);
  }

  const form = new FormData();
  files.forEach((f) => form.append("images", f));
  const data = await api("/admin/media/upload", { method: "POST", form });
  state.media.items = [...data.media, ...state.media.items.filter((o) => !data.media.some((n) => n.publicId === o.publicId))];
  state.media.total += data.media.length;
  renderMedia();
  renderPicker();
  renderOverview();
  return data.media;
}

async function loadMedia(reset = true) {
  const q = new URLSearchParams({ limit: "30" });
  if (!reset && state.media.cursor) q.set("cursor", state.media.cursor);
  const d = await api(`/admin/media?${q}`);
  const existing = state.media.items;
  state.media.items = reset ? d.items : existing.concat(d.items.filter((n) => !existing.some((o) => o.publicId === n.publicId)));
  state.media.cursor = d.nextCursor;
  state.media.total = d.total;
  state.media.loaded = true;
  renderMedia();
  renderPicker();
  renderOverview();
}

const mediaInfo = (m) => `${m.width || "?"}×${m.height || "?"}, ${Math.max(1, Math.round((m.bytes || 0) / 1024))} KB`;

function renderMedia() {
  const grid = $("#media-grid");
  $("#media-count").textContent = state.media.loaded
    ? `${state.media.total} image${state.media.total === 1 ? "" : "s"} uploaded through the dashboard. JPEG, PNG or WebP, up to 5 MB each.`
    : "Loading media…";
  $("#media-more").classList.toggle("hidden", !state.media.cursor);
  if (state.media.loaded && !state.media.items.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">No images yet. Drop files above to upload your first one.</div>`;
    return;
  }
  grid.innerHTML = state.media.items.map((m) => `
    <div class="mi">
      <img src="${esc(thumb(m.url))}" alt="" loading="lazy">
      <div class="info">${esc(mediaInfo(m))}</div>
      <div class="acts">
        <button type="button" data-action="copy-url" data-url="${esc(m.url)}">Copy URL</button>
        <button type="button" class="del" data-action="delete-media" data-pid="${esc(m.publicId)}">Delete</button>
      </div>
    </div>`).join("");
}

async function deleteMedia(publicId) {
  if (!confirm("Delete this image from the media library?")) return;
  try {
    try {
      await api("/admin/media", { method: "DELETE", json: { publicId } });
    } catch (err) {
      if (err.status !== 409) throw err;
      const where = (err.data?.usage || []).map((u) => `• ${u.type}: ${u.title}`).join("\n");
      if (!confirm(`This image is still used by:\n${where}\n\nDelete anyway? Those pages will show a broken image.`)) return;
      await api("/admin/media", { method: "DELETE", json: { publicId, force: true } });
    }
    state.media.items = state.media.items.filter((m) => m.publicId !== publicId);
    state.media.total = Math.max(0, state.media.total - 1);
    renderMedia(); renderPicker(); renderOverview();
    toast("Image deleted.");
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------- Media picker dialog (reused by every image field) ---------- */
const picker = { selected: [], multiple: false, resolve: null, result: null };

function openPicker({ multiple = false } = {}) {
  return new Promise((resolve) => {
    picker.resolve = resolve;
    picker.multiple = multiple;
    picker.selected = [];
    picker.result = null;
    $("#picker").showModal();
    renderPicker();
    if (!state.media.loaded) loadMedia(true).catch((e) => toast(e.message, "error"));
  });
}

function renderPicker() {
  const grid = $("#picker-grid");
  if (!grid) return;
  $("#picker-more").classList.toggle("hidden", !state.media.cursor);
  $("#picker-count").textContent = picker.selected.length
    ? `${picker.selected.length} selected`
    : picker.multiple ? "Choose images from the media library" : "Choose an image from the media library";
  $("#picker-use").disabled = picker.selected.length === 0;
  if (!state.media.items.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${state.media.loaded ? "The library is empty. Upload images from the Media tab or the field itself." : "Loading…"}</div>`;
    return;
  }
  grid.innerHTML = state.media.items.map((m) => `
    <div class="mi pick ${picker.selected.includes(m.url) ? "sel" : ""}" data-url="${esc(m.url)}">
      <img src="${esc(thumb(m.url))}" alt="" loading="lazy"><div class="info">${esc(mediaInfo(m))}</div>
    </div>`).join("");
}

/* ==========================================================================
   Image field: drag/drop upload, library, URL, preview, replace, remove, reorder
   ========================================================================== */
function pickFiles(multiple, cb) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  input.multiple = multiple;
  input.onchange = () => input.files.length && cb([...input.files]);
  input.click();
}

function createImageField(root, { multiple = false, max = 1, onChange = () => {} } = {}) {
  let urls = [];
  let dragIdx = null;
  root.innerHTML = `
    <div class="dz" tabindex="0" role="button">Drop ${multiple ? "images" : "an image"} here, or click to upload</div>
    <div class="imgtools">
      <button type="button" class="btn sm" data-f="library">Media library</button>
      <input type="url" placeholder="or paste an image URL" aria-label="Image URL">
      <button type="button" class="btn sm" data-f="url">Add</button>
    </div>
    <div class="thumbs"></div>`;
  const dz = $(".dz", root), grid = $(".thumbs", root), urlIn = $("input[type=url]", root);
  const idleText = dz.textContent;

  const emit = () => { render(); onChange(urls.slice()); };
  const add = (list) => {
    const clean = list.filter(Boolean);
    if (!multiple) urls = clean.slice(0, 1); // single image fields replace
    else {
      const room = max - urls.length;
      if (clean.length > room) toast(`This field holds up to ${max} images.`, "error");
      urls = urls.concat(clean.slice(0, Math.max(room, 0)));
    }
    emit();
  };
  const upload = async (files, replaceIndex = null) => {
    if (!files.length) return;
    dz.classList.add("busy");
    dz.textContent = "Uploading…";
    try {
      const media = await uploadFiles(replaceIndex !== null || !multiple ? files.slice(0, 1) : files);
      if (replaceIndex !== null) { urls[replaceIndex] = media[0].url; emit(); }
      else add(media.map((m) => m.url));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      dz.classList.remove("busy");
      dz.textContent = idleText;
    }
  };
  const move = (from, to) => {
    if (from === to || to < 0 || to >= urls.length) return;
    urls.splice(to, 0, urls.splice(from, 1)[0]);
    emit();
  };

  function render() {
    grid.innerHTML = urls.map((u, i) => `
      <div class="th" draggable="${multiple}" data-i="${i}">
        <img src="${esc(thumb(u, 240, 180))}" alt="Image ${i + 1}" draggable="false" loading="lazy">
        ${multiple ? `<span class="ix">${i + 1}</span>` : ""}
        <div class="ctl">
          ${multiple ? `<button type="button" data-a="left" aria-label="Move earlier" ${i === 0 ? "disabled" : ""}>◀</button>
          <button type="button" data-a="right" aria-label="Move later" ${i === urls.length - 1 ? "disabled" : ""}>▶</button>` : ""}
          <button type="button" data-a="replace" title="Replace with a new upload" aria-label="Replace">↻</button>
          <button type="button" class="rm" data-a="remove" aria-label="Remove">✕</button>
        </div>
      </div>`).join("");
  }

  dz.addEventListener("click", () => pickFiles(multiple, (f) => upload(f)));
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickFiles(multiple, (f) => upload(f)); } });
  dz.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); dz.classList.add("over"); } });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("over");
    if (e.dataTransfer.files.length) upload([...e.dataTransfer.files]);
  });

  root.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-f]");
    if (f?.dataset.f === "library") {
      const picked = await openPicker({ multiple });
      if (picked.length) add(picked);
    } else if (f?.dataset.f === "url") {
      const v = urlIn.value.trim();
      if (!/^https?:\/\/\S+$/i.test(v)) return toast("Enter a valid http(s) image URL.", "error");
      urlIn.value = "";
      add([v]);
    }
    const a = e.target.closest("[data-a]");
    if (!a) return;
    const i = +a.closest(".th").dataset.i;
    if (a.dataset.a === "remove") { urls.splice(i, 1); emit(); }
    if (a.dataset.a === "left") move(i, i - 1);
    if (a.dataset.a === "right") move(i, i + 1);
    if (a.dataset.a === "replace") pickFiles(false, (files) => upload(files, i));
  });
  urlIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("[data-f=url]", root).click(); } });

  // Drag-to-reorder (mouse); the arrow buttons cover touch
  grid.addEventListener("dragstart", (e) => {
    const th = e.target.closest(".th");
    if (!th || !multiple) return;
    dragIdx = +th.dataset.i;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragIdx));
    th.classList.add("drag");
  });
  grid.addEventListener("dragend", () => { dragIdx = null; $$(".drag,.target", grid).forEach((n) => n.classList.remove("drag", "target")); });
  grid.addEventListener("dragover", (e) => {
    const th = e.target.closest(".th");
    if (dragIdx === null || !th) return;
    e.preventDefault();
    $$(".target", grid).forEach((n) => n.classList.remove("target"));
    th.classList.add("target");
  });
  grid.addEventListener("drop", (e) => {
    const th = e.target.closest(".th");
    if (dragIdx === null || !th) return;
    e.preventDefault();
    move(dragIdx, +th.dataset.i);
    dragIdx = null;
  });

  render();
  return {
    get: () => urls.slice(),
    set: (list) => { urls = (list || []).filter(Boolean); emit(); }
  };
}

/* ==========================================================================
   Live preview (shared by event + archive editors)
   ========================================================================== */
function paintPreview(el, d) {
  el.innerHTML = `
    ${d.cover ? `<img class="pv-cover" src="${esc(thumb(d.cover, 800, 450))}" alt="">` : `<div class="pv-cover ph">No cover image</div>`}
    <span class="pill blue">${esc(d.type)}</span>
    <h4>${esc(d.title || "Untitled")}</h4>
    <div class="meta">${esc(d.meta.filter(Boolean).join(", "))}</div>
    ${d.warn ? `<div class="warn">${esc(d.warn)}</div>` : ""}
    <div class="rt">${d.body.trim() ? renderRichText(d.body) : '<span class="rt-empty">The description will appear here.</span>'}</div>
    ${d.gallery?.length ? `<div class="strip">${d.gallery.slice(0, 4).map((u) => `<img src="${esc(thumb(u, 200, 200))}" alt="">`).join("")}</div>` : ""}`;
}

/* ==========================================================================
   Events
   ========================================================================== */
async function loadAllEvents() {
  const d = await api("/admin/events");
  state.events = Array.isArray(d) ? d : [];
  state.ready.events = true;
  renderEvents();
  refreshCodeTargetOptions();
  refreshLinkSelect();
  renderOverview();
}

function renderEvents() {
  const list = $("#events-list");
  const q = $("#ev-search").value.trim().toLowerCase();
  const f = $("#ev-filter").value;
  const now = Date.now();
  const rows = state.events.filter((ev) => {
    if (q && !`${ev.title} ${ev.location}`.toLowerCase().includes(q)) return false;
    const past = new Date(ev.eventDate) < now;
    return f === "all" || (f === "past" ? past : !past);
  });
  if (!state.events.length) { list.innerHTML = `<div class="empty">No active events yet. Use “New event” to publish the first one.</div>`; return; }
  if (!rows.length) { list.innerHTML = `<div class="empty">No events match this search.</div>`; return; }

  list.innerHTML = rows.map((ev) => {
    const open = new Date(ev.registrationDeadline) > now;
    const past = new Date(ev.eventDate) < now;
    const regs = ev._count?.participants ?? 0;
    return `
      <div class="item">
        <img class="thumb" src="${esc(thumb(ev.coverImage, 128, 96))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div>
          <div class="t">${esc(ev.title)}</div>
          <div class="m"><span class="pill blue">${esc(ev.eventType || "MAIN")}</span>${esc(fmtDT(ev.eventDate))}, ${esc(ev.location || "IIEST")}</div>
          <div class="m">${open ? `<span class="pill open">Registration open</span>closes ${esc(fmtDT(ev.registrationDeadline))}` : `<span class="pill">Registration closed</span>`}${past ? `<span class="pill">Past</span>` : ""}${regs} registered</div>
        </div>
        <div class="acts">
          <button class="btn sm" data-action="edit-event" data-id="${esc(ev.id)}">Edit</button>
          <button class="btn sm" data-action="archive-event" data-id="${esc(ev.id)}">Archive</button>
          <button class="btn sm danger" data-action="delete-event" data-id="${esc(ev.id)}">Delete</button>
        </div>
      </div>`;
  }).join("");
}

function updateEventPreview() {
  if (!evCover) return;
  const date = $("#ev-date").value, deadline = $("#ev-deadline").value;
  paintPreview($("#ev-preview"), {
    cover: evCover.get()[0],
    type: $("#ev-type").value,
    title: $("#ev-title").value.trim(),
    meta: [date && fmtDT(date), $("#ev-location").value.trim(), deadline && `Register by ${fmtDT(deadline)}`],
    warn: date && deadline && new Date(deadline) > new Date(date) ? "The registration deadline is after the event date." : "",
    body: evRte.get()
  });
}

function resetEventForm() {
  $("#event-edit-id").value = "";
  $("#form-heading").textContent = "Create new event";
  $("#save-event-btn").textContent = "Save event";
  $("#event-editor-form").reset();
  evCover.set([]);
  evRte.set("");
  updateEventPreview();
}

function openEventForm(ev = null) {
  resetEventForm();
  if (ev) {
    $("#event-edit-id").value = ev.id;
    $("#form-heading").textContent = `Edit: ${ev.title}`;
    $("#ev-title").value = ev.title;
    $("#ev-type").value = ev.eventType || "MAIN";
    $("#ev-date").value = toLocalInput(ev.eventDate);
    $("#ev-deadline").value = toLocalInput(ev.registrationDeadline);
    $("#ev-location").value = ev.location || "";
    evCover.set(ev.coverImage ? [ev.coverImage] : []);
    evRte.set(ev.description || "");
    $("#save-event-btn").textContent = "Update event";
  }
  $("#event-editor-form").classList.remove("hidden");
  $("#event-editor-form").scrollIntoView({ behavior: "smooth", block: "start" });
  updateEventPreview();
}

async function handleEventSubmit(e) {
  e.preventDefault();
  const editId = $("#event-edit-id").value;
  const title = $("#ev-title").value.trim();
  const description = evRte.get().trim();
  const location = $("#ev-location").value.trim();
  if (!title || !description || !location || !$("#ev-date").value || !$("#ev-deadline").value) {
    return toast("Title, date, deadline, venue and description are required.", "error");
  }
  const payload = {
    title,
    eventType: $("#ev-type").value,
    description,
    eventDate: toISO($("#ev-date").value),
    registrationDeadline: toISO($("#ev-deadline").value),
    location,
    coverImage: evCover.get()[0] || undefined
  };
  const btn = $("#save-event-btn");
  btn.disabled = true;
  try {
    await api(editId ? `/admin/events/${editId}` : "/admin/events", { method: editId ? "PUT" : "POST", json: payload });
    toast(editId ? "Event updated." : "Event published.");
    $("#event-editor-form").classList.add("hidden");
    resetEventForm();
    await loadAllEvents();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function archiveEvent(id) {
  if (!confirm("Archive this event to the permanent history records?")) return;
  try {
    await api(`/admin/events/${id}/archive`, { method: "POST" });
    toast("Event moved to Archives.");
    await Promise.all([loadAllEvents(), loadAllHistory(), loadCodes()]);
  } catch (err) { toast(err.message, "error"); }
}

async function deleteEvent(id) {
  if (!confirm("Permanently delete this event? Registrations and any award codes minted for it are removed too.")) return;
  try {
    await api(`/admin/events/${id}`, { method: "DELETE" });
    toast("Event deleted.");
    await Promise.all([loadAllEvents(), loadCodes()]);
  } catch (err) { toast(err.message, "error"); }
}

/* ==========================================================================
   Archives (history)
   ========================================================================== */
async function loadAllHistory() {
  const d = await api("/admin/history");
  state.history = Array.isArray(d) ? d : [];
  state.ready.history = true;
  renderHistory();
  refreshCodeTargetOptions();
  renderOverview();
}

function renderHistory() {
  const list = $("#history-list");
  const q = $("#hist-search").value.trim().toLowerCase();
  const rows = state.history.filter((h) => !q || `${h.title} ${h.location}`.toLowerCase().includes(q));
  if (!state.history.length) { list.innerHTML = `<div class="empty">No archived events yet. Archive a finished event, or add one manually.</div>`; return; }
  if (!rows.length) { list.innerHTML = `<div class="empty">No archives match this search.</div>`; return; }

  list.innerHTML = rows.map((h) => {
    const claimed = (h.achievements || []).length;
    const total = Number.isInteger(h.awardCount) ? h.awardCount : claimed;
    const awardees = claimed
      ? h.achievements.map((a) => `<span class="pill">${esc(a.position)}: ${esc(a.user?.displayName || "Claimed")}</span>`).join("")
      : "";
    return `
      <div class="item">
        <img class="thumb" src="${esc(thumb(h.coverImage, 128, 96))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div>
          <div class="t">${esc(h.title)}</div>
          <div class="m"><span class="pill blue">${esc(h.eventType || "MAIN")}</span>${esc(fmtDate(h.eventDate))}, ${esc(h.location || "")}, ${claimed} of ${total} awards claimed, ${(h.images || []).length} gallery images</div>
          ${awardees ? `<div class="m" style="margin-top:6px">${awardees}</div>` : ""}
        </div>
        <div class="acts">
          <button class="btn sm" data-action="edit-history" data-id="${esc(h.id)}">Edit</button>
          <button class="btn sm danger" data-action="delete-history" data-id="${esc(h.id)}">Delete</button>
        </div>
      </div>`;
  }).join("");
}

function refreshLinkSelect(current = null) {
  const sel = $("#hist-event-id");
  if (!sel) return;
  const keep = current ?? sel.value;
  sel.innerHTML = `<option value="">None</option>` +
    state.events.map((ev) => `<option value="${esc(ev.id)}">${esc(ev.title)}</option>`).join("");
  if (keep && !state.events.some((ev) => ev.id === keep)) {
    sel.insertAdjacentHTML("beforeend", `<option value="${esc(keep)}">Linked event (no longer active)</option>`);
  }
  sel.value = keep || "";
}

function updateHistoryPreview() {
  if (!histCover) return;
  const date = $("#hist-date").value, awards = $("#hist-award-count").value;
  paintPreview($("#hist-preview"), {
    cover: histCover.get()[0],
    type: $("#hist-type").value,
    title: $("#hist-title").value.trim(),
    meta: [date && fmtDate(date), $("#hist-location").value.trim(), awards !== "" && `${awards} awards`],
    body: histRte.get(),
    gallery: histGallery.get()
  });
}

function resetHistoryForm() {
  $("#hist-edit-id").value = "";
  $("#hist-form-heading").textContent = "Add historical archive";
  $("#save-history-btn").textContent = "Save archive entry";
  $("#history-editor-form").reset();
  refreshLinkSelect("");
  histCover.set([]);
  histGallery.set([]);
  histRte.set("");
  $("#hist-archived-at").value = nowLocalInput();
  updateHistoryPreview();
}

function openHistoryForm(h = null) {
  resetHistoryForm();
  if (h) {
    $("#hist-edit-id").value = h.id;
    $("#hist-form-heading").textContent = `Edit archive: ${h.title}`;
    $("#save-history-btn").textContent = "Update archive entry";
    $("#hist-title").value = h.title;
    $("#hist-type").value = h.eventType || "MAIN";
    refreshLinkSelect(h.eventId || "");
    $("#hist-date").value = toLocalInput(h.eventDate);
    $("#hist-archived-at").value = toLocalInput(h.archivedAt);
    $("#hist-award-count").value = Number.isInteger(h.awardCount) ? h.awardCount : (h.achievements || []).length;
    $("#hist-location").value = h.location || "";
    histCover.set(h.coverImage ? [h.coverImage] : []);
    histGallery.set(Array.isArray(h.images) ? h.images : []);
    histRte.set(h.description || "");
  }
  $("#history-editor-form").classList.remove("hidden");
  $("#history-editor-form").scrollIntoView({ behavior: "smooth", block: "start" });
  updateHistoryPreview();
}

async function handleHistorySubmit(e) {
  e.preventDefault();
  const editId = $("#hist-edit-id").value;
  const title = $("#hist-title").value.trim();
  const description = histRte.get().trim();
  const location = $("#hist-location").value.trim();
  const awardRaw = $("#hist-award-count").value;
  const cover = histCover.get()[0];
  if (!title || !description || !location || !$("#hist-date").value || !$("#hist-archived-at").value) {
    return toast("Title, dates, venue and recap are required.", "error");
  }
  if (!cover) return toast("Add a cover image.", "error");
  const awardCount = Number(awardRaw);
  if (awardRaw === "" || !Number.isInteger(awardCount) || awardCount < 0 || awardCount > 500) {
    return toast("Number of awards must be a whole number between 0 and 500.", "error");
  }
  const payload = {
    title,
    eventType: $("#hist-type").value,
    description,
    eventDate: toISO($("#hist-date").value),
    location,
    coverImage: cover,
    images: histGallery.get(),
    eventId: $("#hist-event-id").value || null,
    archivedAt: toISO($("#hist-archived-at").value),
    awardCount
  };
  const btn = $("#save-history-btn");
  btn.disabled = true;
  try {
    await api(editId ? `/admin/history/${editId}` : "/admin/history", { method: editId ? "PUT" : "POST", json: payload });
    toast(editId ? "Archive updated." : "Archive created.");
    $("#history-editor-form").classList.add("hidden");
    resetHistoryForm();
    await loadAllHistory();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function deleteHistory(id) {
  if (!confirm("Permanently remove this archive? Claimed awards and codes linked to it are removed too.")) return;
  try {
    await api(`/admin/history/${id}`, { method: "DELETE" });
    toast("Archive deleted.");
    await Promise.all([loadAllHistory(), loadCodes()]);
  } catch (err) { toast(err.message, "error"); }
}

/* ==========================================================================
   Awards (existing SHA-256 token system, unchanged)
   ========================================================================== */
let awardTitles = [];

function refreshCodeTargetOptions() {
  const opts = `<optgroup label="Active events">${state.events.map((ev) => `<option value="event:${esc(ev.id)}">${esc(ev.title)}</option>`).join("")}</optgroup>` +
    `<optgroup label="Archives">${state.history.map((h) => `<option value="history:${esc(h.id)}">${esc(h.title)}</option>`).join("")}</optgroup>`;
  const mint = $("#code-target-select"), filter = $("#codes-filter-target");
  const m = mint.value, f = filter.value;
  mint.innerHTML = `<option value="">Choose event or archive</option>${opts}`;
  filter.innerHTML = `<option value="">All events and archives</option>${opts}`;
  mint.value = m;
  filter.value = f;
}

async function loadCodes() {
  const d = await api("/admin/codes");
  state.codes = Array.isArray(d) ? d : [];
  state.ready.codes = true;
  renderCodes();
  renderOverview();
}

const codeTarget = (c) => (c.eventId ? `event:${c.eventId}` : c.historyId ? `history:${c.historyId}` : "");
const codeTargetTitle = (c) => c.event?.title || c.history?.title || "Unassigned";

function renderCodes() {
  const target = $("#codes-filter-target").value;
  const status = $("#codes-filter-status").value;
  const scoped = state.codes.filter((c) => !target || codeTarget(c) === target);
  const rows = scoped.filter((c) => status === "all" || (status === "redeemed" ? c.isRedeemed : !c.isRedeemed));
  const claimed = scoped.filter((c) => c.isRedeemed).length;
  $("#codes-summary").innerHTML =
    `<span><b>${scoped.length}</b> minted</span><span><b>${claimed}</b> claimed</span><span><b>${scoped.length - claimed}</b> unclaimed</span>`;
  const list = $("#codes-list");
  if (!rows.length) { list.innerHTML = `<div class="empty">${state.codes.length ? "No codes match these filters." : "No codes minted yet. Pick an event or archive and add award titles."}</div>`; return; }
  list.innerHTML = rows.map((c) => {
    const u = c.achievement?.user;
    return `
      <div class="item nothumb">
        <div>
          <div class="t">${esc(c.positionTitle)}</div>
          <div class="m">${esc(codeTargetTitle(c))}, ${c.isRedeemed
            ? `claimed by ${esc(u?.displayName || "a user")}${u?.username ? ` (@${esc(u.username)})` : ""} on ${esc(fmtDate(c.redeemedAt))}`
            : `minted ${esc(fmtDate(c.createdAt))}`}</div>
        </div>
        <div class="acts">
          <span class="pill ${c.isRedeemed ? "open" : ""}">${c.isRedeemed ? "Claimed" : "Unclaimed"}</span>
          ${c.isRedeemed ? "" : `<button class="btn sm danger" data-action="revoke-code" data-id="${esc(c.id)}">Revoke</button>`}
        </div>
      </div>`;
  }).join("");
}

function renderChips() {
  const box = $("#code-chips"), input = $("#code-title-input");
  $$(".chip", box).forEach((c) => c.remove());
  awardTitles.forEach((t, i) => {
    input.insertAdjacentHTML("beforebegin", `<span class="chip">${esc(t)}<button type="button" data-chip="${i}" aria-label="Remove ${esc(t)}">✕</button></span>`);
  });
}
function addAwardTitles(raw) {
  raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((t) => awardTitles.push(t));
  renderChips();
}

async function handleMintCodes() {
  const target = $("#code-target-select").value;
  const input = $("#code-title-input");
  if (input.value.trim()) { addAwardTitles(input.value); input.value = ""; }
  if (!target) return toast("Choose an event or archive first.", "error");
  if (!awardTitles.length) return toast("Add at least one award title.", "error");

  const btn = $("#mint-codes-btn");
  btn.disabled = true;
  btn.textContent = "Minting tokens…";
  try {
    const json = target.startsWith("event:")
      ? { eventId: target.slice(6), titles: awardTitles }
      : { historyId: target.slice(8), titles: awardTitles };
    const data = await api("/admin/mint-codes", { method: "POST", json });
    const label = $("#code-target-select").selectedOptions[0]?.textContent || "";
    state.sessionCodes = data.codes.map((c) => ({ ...c, target: label })).concat(state.sessionCodes);
    awardTitles = [];
    renderChips();
    renderSessionCodes();
    toast("Winner codes generated.");
    loadCodes().catch(() => {});
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate secret tokens";
  }
}

function renderSessionCodes() {
  const box = $("#codes-output-list");
  const has = state.sessionCodes.length > 0;
  $("#copy-codes-btn").classList.toggle("hidden", !has);
  $("#download-codes-btn").classList.toggle("hidden", !has);
  box.innerHTML = has
    ? state.sessionCodes.map((c) => `
        <div class="code"><div><div>${esc(c.positionTitle)}</div><div class="hint" style="margin:0">${esc(c.target)}</div></div>
          <div style="display:flex;gap:8px;align-items:center"><code>${esc(c.rawToken)}</code>
          <button class="btn sm" data-action="copy-code" data-code="${esc(c.rawToken)}">Copy</button></div></div>`).join("")
    : `<div class="empty">No tokens generated in this session.</div>`;
}
const sessionCodesText = () => state.sessionCodes.map((c) => `${c.target}, ${c.positionTitle}: ${c.rawToken}`).join("\n");

async function revokeCode(id) {
  if (!confirm("Revoke this unclaimed code? The token will stop working.")) return;
  try {
    await api(`/admin/codes/${id}`, { method: "DELETE" });
    toast("Code revoked.");
    await loadCodes();
  } catch (err) { toast(err.message, "error"); }
}

/* ==========================================================================
   Overview (all numbers come from the loaded API data)
   ========================================================================== */
function renderOverview() {
  if (!$("#stats")) return;
  const { events, history, codes, ready, media } = state;
  const now = Date.now();
  const v = (flag, val) => (flag ? val : "–");
  const regs = events.reduce((n, e) => n + (e._count?.participants || 0), 0);
  const upcoming = events.filter((e) => new Date(e.eventDate) > now).length;
  const claimed = codes.filter((c) => c.isRedeemed).length;
  const stat = (val, label, cls = "") => `<div class="stat ${cls}"><b>${esc(val)}</b><span>${esc(label)}</span></div>`;
  $("#stats").innerHTML =
    stat(v(ready.events, regs), "Registrations across active events", "lead") +
    stat(v(ready.events, events.length), ready.events ? `Active events, ${upcoming} upcoming` : "Active events") +
    stat(v(ready.history, history.length), "Archived events") +
    stat(v(ready.codes, `${claimed} / ${codes.length}`), "Award codes claimed") +
    stat(v(media.loaded, media.total), "Media files");

  const closing = events.filter((e) => new Date(e.registrationDeadline) > now)
    .sort((a, b) => new Date(a.registrationDeadline) - new Date(b.registrationDeadline)).slice(0, 4);
  $("#ov-closing").innerHTML = closing.length ? closing.map((e) => `
    <div class="item nothumb"><div><div class="t">${esc(e.title)}</div>
      <div class="m">closes ${esc(fmtDT(e.registrationDeadline))}, ${e._count?.participants ?? 0} registered</div></div>
      <div class="acts"><button class="btn sm" data-action="edit-event" data-id="${esc(e.id)}">Edit</button></div></div>`).join("")
    : `<div class="empty">${ready.events ? "No events with open registration." : "Loading…"}</div>`;

  $("#ov-archives").innerHTML = history.length ? history.slice(0, 4).map((h) => `
    <div class="item nothumb"><div><div class="t">${esc(h.title)}</div>
      <div class="m">${esc(fmtDate(h.eventDate))}, ${(h.achievements || []).length} awards claimed</div></div>
      <div class="acts"><button class="btn sm" data-action="edit-history" data-id="${esc(h.id)}">Edit</button></div></div>`).join("")
    : `<div class="empty">${ready.history ? "Nothing archived yet." : "Loading…"}</div>`;

  const pending = new Map();
  codes.filter((c) => !c.isRedeemed).forEach((c) => {
    const k = codeTarget(c);
    pending.set(k, { title: codeTargetTitle(c), n: (pending.get(k)?.n || 0) + 1 });
  });
  const top = [...pending.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  $("#ov-pending").innerHTML = top.length ? top.map(([k, p]) => `
    <div class="item nothumb"><div><div class="t">${esc(p.title)}</div><div class="m">${p.n} unclaimed</div></div>
      <div class="acts"><button class="btn sm" data-action="goto-codes" data-target="${esc(k)}">View</button></div></div>`).join("")
    : `<div class="empty">${ready.codes ? "Every minted code has been claimed." : "Loading…"}</div>`;
}

/* ==========================================================================
   Role delegation (kept from the previous dashboard; binds only if the form exists)
   ========================================================================== */
async function handleRoleDelegation(e) {
  e.preventDefault();
  const userId = $("#target-user-email").value.trim();
  const role = $("#target-user-role").value;
  try {
    await api(`/admin/users/${encodeURIComponent(userId)}/role`, { method: "PATCH", json: { role } });
    toast(`Role updated to ${role} for ${userId}`);
    $("#role-delegation-form").reset();
  } catch (err) { toast(err.message, "error"); }
}

/* ==========================================================================
   Tabs, auth guard, init
   ========================================================================== */
const TABS = ["overview", "events", "archives", "awards", "media"];
function showTab(name) {
  if (!TABS.includes(name)) name = "overview";
  $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
  $$(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  if (location.hash !== `#${name}`) window.history.replaceState(null, "", `#${name}`);
}

// 1. Guard Dashboard: Allow Only Verified Admins
function verifyAdminAccess() {
  const userRaw = localStorage.getItem("debsoc_user");
  if (!userRaw) { redirectToLogin("Authentication required."); return false; }
  try {
    const user = JSON.parse(userRaw);
    if (user.role !== "ADMIN") {
      alert("Access Denied: Administrator clearance required.");
      window.location.href = "../events.html";
      return false;
    }
    return true;
  } catch (err) {
    redirectToLogin("Invalid session state.");
    return false;
  }
}
function redirectToLogin(msg) {
  alert(msg);
  window.location.href = "../register.html";
}

function initDashboard() {
  // Logout
  $("#admin-logout-btn").addEventListener("click", async () => {
    await apiFetch(`${API_BASE}/auth/logout`, { method: "POST" });
    localStorage.removeItem("debsoc_user");
    window.location.href = "../register.html";
  });

  // Editors
  evCover = createImageField($("#ev-cover"), { onChange: updateEventPreview });
  evRte = createRichEditor($("#ev-rte"), { onChange: updateEventPreview, placeholder: "Asian Parliamentary, 3v3 format, open to all first-year scholars…" });
  histCover = createImageField($("#hist-cover"), { onChange: updateHistoryPreview });
  histGallery = createImageField($("#hist-gallery"), { multiple: true, max: 12, onChange: updateHistoryPreview });
  histRte = createRichEditor($("#hist-rte"), { onChange: updateHistoryPreview, placeholder: "Flagship MUN, 3-day tournament concluded with over 200 delegates…" });

  const evForm = $("#event-editor-form"), hForm = $("#history-editor-form");
  $("#toggle-event-form-btn").addEventListener("click", () => openEventForm());
  $("#close-event-form-btn").addEventListener("click", () => evForm.classList.add("hidden"));
  $("#toggle-history-form-btn").addEventListener("click", () => openHistoryForm());
  $("#close-history-form-btn").addEventListener("click", () => hForm.classList.add("hidden"));
  evForm.addEventListener("submit", handleEventSubmit);
  hForm.addEventListener("submit", handleHistorySubmit);
  ["#ev-title", "#ev-type", "#ev-date", "#ev-deadline", "#ev-location"].forEach((s) => $(s).addEventListener("input", updateEventPreview));
  ["#hist-title", "#hist-type", "#hist-date", "#hist-location", "#hist-award-count"].forEach((s) => $(s).addEventListener("input", updateHistoryPreview));
  updateEventPreview();
  updateHistoryPreview();

  $("#ev-search").addEventListener("input", renderEvents);
  $("#ev-filter").addEventListener("change", renderEvents);
  $("#hist-search").addEventListener("input", renderHistory);
  $("#codes-filter-target").addEventListener("change", renderCodes);
  $("#codes-filter-status").addEventListener("change", renderCodes);

  // Awards
  $("#mint-codes-btn").addEventListener("click", handleMintCodes);
  const titleInput = $("#code-title-input");
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addAwardTitles(titleInput.value); titleInput.value = ""; }
    else if (e.key === "Backspace" && !titleInput.value && awardTitles.length) { awardTitles.pop(); renderChips(); }
  });
  titleInput.addEventListener("input", () => { if (titleInput.value.includes(",")) { addAwardTitles(titleInput.value); titleInput.value = ""; } });
  titleInput.addEventListener("blur", () => { if (titleInput.value.trim()) { addAwardTitles(titleInput.value); titleInput.value = ""; } });
  $("#code-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-chip]");
    if (b) { awardTitles.splice(+b.dataset.chip, 1); renderChips(); } else titleInput.focus();
  });
  $("#copy-codes-btn").addEventListener("click", async () => { await copyText(sessionCodesText()); toast("All codes copied."); });
  $("#download-codes-btn").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([sessionCodesText()], { type: "text/plain" }));
    a.download = "debsoc-award-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Media tab
  const dz = $("#media-dz");
  const uploadToLibrary = async (files) => {
    dz.classList.add("busy");
    const prev = dz.textContent;
    dz.textContent = "Uploading…";
    try { const m = await uploadFiles(files); toast(`${m.length} image${m.length === 1 ? "" : "s"} uploaded.`); }
    catch (err) { toast(err.message, "error"); }
    finally { dz.classList.remove("busy"); dz.textContent = prev; }
  };
  dz.addEventListener("click", () => pickFiles(true, uploadToLibrary));
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickFiles(true, uploadToLibrary); } });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files.length) uploadToLibrary([...e.dataTransfer.files]); });
  $("#media-more").addEventListener("click", () => loadMedia(false).catch((e) => toast(e.message, "error")));
  $("#picker-more").addEventListener("click", () => loadMedia(false).catch((e) => toast(e.message, "error")));

  // Picker dialog
  const dlg = $("#picker");
  $("#picker-cancel").addEventListener("click", () => dlg.close());
  $("#picker-use").addEventListener("click", () => { picker.result = picker.selected.slice(); dlg.close(); });
  dlg.addEventListener("close", () => { picker.resolve?.(picker.result || []); picker.resolve = null; picker.result = null; });
  $("#picker-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".mi.pick");
    if (!card) return;
    const url = card.dataset.url;
    if (picker.multiple) picker.selected = picker.selected.includes(url) ? picker.selected.filter((u) => u !== url) : [...picker.selected, url];
    else picker.selected = [url];
    renderPicker();
  });

  const roleForm = $("#role-delegation-form");
  if (roleForm) roleForm.addEventListener("submit", handleRoleDelegation);

  // Don't let a missed drop navigate the browser to the dropped file
  ["dragover", "drop"].forEach((t) => window.addEventListener(t, (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }));

  // One delegated click handler for tabs and row actions
  document.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) return showTab(tab.dataset.tab);
    const go = e.target.closest("[data-goto]");
    if (go) return showTab(go.dataset.goto);
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const { action, id } = el.dataset;
    const findEv = () => state.events.find((x) => x.id === id);
    const findH = () => state.history.find((x) => x.id === id);
    const actions = {
      "new-event": () => { showTab("events"); openEventForm(); },
      "new-archive": () => { showTab("archives"); openHistoryForm(); },
      "edit-event": () => { const ev = findEv(); if (ev) { showTab("events"); openEventForm(ev); } },
      "archive-event": () => archiveEvent(id),
      "delete-event": () => deleteEvent(id),
      "edit-history": () => { const h = findH(); if (h) { showTab("archives"); openHistoryForm(h); } },
      "delete-history": () => deleteHistory(id),
      "revoke-code": () => revokeCode(id),
      "copy-code": async () => { await copyText(el.dataset.code); toast("Code copied."); },
      "copy-url": async () => { await copyText(el.dataset.url); toast("Image URL copied."); },
      "delete-media": () => deleteMedia(el.dataset.pid),
      "goto-codes": () => {
        showTab("awards");
        $("#codes-filter-target").value = el.dataset.target;
        $("#codes-filter-status").value = "pending";
        renderCodes();
      }
    };
    actions[action]?.();
  });

  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1) || "overview");
  renderMedia();
  renderSessionCodes();
  renderChips();

  // Initial data loads (existing endpoints + the new codes/media listings)
  const loaders = [["events", loadAllEvents], ["archives", loadAllHistory], ["award codes", loadCodes], ["media", () => loadMedia(true)]];
  Promise.allSettled(loaders.map(([, fn]) => fn())).then((results) => {
    results.forEach((r, i) => { if (r.status === "rejected") toast(`Could not load ${loaders[i][0]}: ${r.reason.message}`, "error"); });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (!verifyAdminAccess()) return;
  initDashboard();
  // Confirm the cookie is still valid and still belongs to an admin (localStorage can be stale).
  window.DebSoc.getSession().then((user) => {
    if (!user) redirectToLogin("Session expired, log in again.");
    else if (user.role !== "ADMIN") {
      alert("Access Denied: Administrator clearance required.");
      window.location.href = "../events.html";
    }
  });
});