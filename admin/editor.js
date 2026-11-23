/* ==========================================================================
   DebSoc admin: client-side photo editor (Instagram-style)
   Purely client side. Exposes window.DebSocEditor.edit(files) -> Promise<File[]|null>
   - resolves with the edited (or skipped, original) files in order
   - resolves null when the user cancels
   No network, no backend. Uses canvas only (no blob: URLs, CSP friendly).
   ========================================================================== */
(function () {
  "use strict";

  const ASPECTS = [
    { id: "orig", label: "Original", r: null },
    { id: "1:1", label: "1:1", r: 1 },
    { id: "4:5", label: "4:5", r: 4 / 5 },
    { id: "16:9", label: "16:9", r: 16 / 9 },
    { id: "3:2", label: "3:2", r: 3 / 2 }
  ];

  // b/c/s/w/f/v: brightness, contrast, saturation, warmth, fade, vignette (-100..100, v 0..100)
  const FILTERS = [
    { id: "normal", label: "Normal", p: {} },
    { id: "clarendon", label: "Clarendon", p: { c: 20, s: 25, b: 5 } },
    { id: "gingham", label: "Gingham", p: { b: 6, s: -15, f: 18, w: 6 } },
    { id: "juno", label: "Juno", p: { c: 12, s: 30, w: 14 } },
    { id: "lark", label: "Lark", p: { b: 12, c: -6, s: 12, w: -6 } },
    { id: "reyes", label: "Reyes", p: { b: 10, c: -12, s: -20, f: 24, w: 10 } },
    { id: "valencia", label: "Valencia", p: { b: 6, c: 8, s: 8, w: 22, f: 10 } },
    { id: "moon", label: "Moon", p: { s: -100, c: 8, b: 4 } },
    { id: "inkwell", label: "Inkwell", p: { s: -100, c: 25, b: -4, v: 25 } },
    { id: "slumber", label: "Slumber", p: { s: -25, b: 4, w: 16, f: 20, v: 20 } }
  ];

  const ADJUST = [
    { k: "b", label: "Brightness", min: -100, max: 100 },
    { k: "c", label: "Contrast", min: -100, max: 100 },
    { k: "s", label: "Saturation", min: -100, max: 100 },
    { k: "w", label: "Warmth", min: -100, max: 100 },
    { k: "f", label: "Fade", min: 0, max: 100 },
    { k: "v", label: "Vignette", min: 0, max: 100 }
  ];

  const MAX_BASE = 2400;   // working image long edge
  const MAX_OUT = 2048;    // exported long edge
  const MAX_BYTES = 5 * 1024 * 1024;

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- decoding (no blob: URLs; CSP only allows data:/https:) ---------- */
  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => viaDataUrl(file));
    }
    return viaDataUrl(file);
  }
  function viaDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      fr.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not decode ${file.name}.`));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  const srcSize = (s) => ({ w: s.naturalWidth || s.width, h: s.naturalHeight || s.height });

  /* ---------- pixel pipeline (works on Safari, which lacks ctx.filter) ---------- */
  function adjustPixels(img, p) {
    const b = (p.b || 0) / 100, c = (p.c || 0) / 100, s = (p.s || 0) / 100;
    const w = (p.w || 0) / 100, f = (p.f || 0) / 100, v = (p.v || 0) / 100;
    if (!b && !c && !s && !w && !f && !v) return;
    const d = img.data, W = img.width, H = img.height;
    const cf = 1 + c;                 // contrast factor
    const sf = 1 + s;                 // saturation factor
    const cx = W / 2, cy = H / 2, maxD = Math.sqrt(cx * cx + cy * cy);
    for (let i = 0, px = 0; i < d.length; i += 4, px++) {
      let r = d[i], g = d[i + 1], bl = d[i + 2];
      // brightness
      r += b * 255; g += b * 255; bl += b * 255;
      // contrast
      r = (r - 128) * cf + 128; g = (g - 128) * cf + 128; bl = (bl - 128) * cf + 128;
      // saturation
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = l + (r - l) * sf; g = l + (g - l) * sf; bl = l + (bl - l) * sf;
      // warmth
      r += w * 40; bl -= w * 40; g += w * 8;
      // fade (lift blacks, soften)
      if (f) { r = r * (1 - f * 0.25) + f * 48; g = g * (1 - f * 0.25) + f * 48; bl = bl * (1 - f * 0.25) + f * 52; }
      // vignette
      if (v) {
        const x = (px % W) - cx, y = ((px / W) | 0) - cy;
        const k = 1 - v * 0.75 * Math.pow(Math.sqrt(x * x + y * y) / maxD, 2);
        r *= k; g *= k; bl *= k;
      }
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
    }
  }

  /* ---------- one editing session for a single image ---------- */
  function Session(source) {
    const { w, h } = srcSize(source);
    const scale = Math.min(1, MAX_BASE / Math.max(w, h));
    this.source = source;
    this.sw = Math.max(1, Math.round(w * scale));
    this.sh = Math.max(1, Math.round(h * scale));
    this.rot = 0;           // quarter turns
    this.flip = false;
    this.aspect = "orig";
    this.zoom = 1;
    this.cx = 0.5;          // crop centre as fraction of the oriented base
    this.cy = 0.5;
    this.filter = "normal";
    this.adj = { b: 0, c: 0, s: 0, w: 0, f: 0, v: 0 };
    this.buildBase();
  }
  Session.prototype.buildBase = function () {
    const swap = this.rot % 2 === 1;
    const bw = swap ? this.sh : this.sw, bh = swap ? this.sw : this.sh;
    const cv = document.createElement("canvas");
    cv.width = bw; cv.height = bh;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.translate(bw / 2, bh / 2);
    ctx.rotate((this.rot * Math.PI) / 2);
    if (this.flip) ctx.scale(-1, 1);
    ctx.drawImage(this.source, -this.sw / 2, -this.sh / 2, this.sw, this.sh);
    this.base = cv;
    this.bw = bw; this.bh = bh;
  };
  Session.prototype.ratio = function () {
    const a = ASPECTS.find((x) => x.id === this.aspect);
    return a && a.r ? a.r : this.bw / this.bh;
  };
  // crop rectangle in base pixels
  Session.prototype.rect = function () {
    const A = this.ratio();
    let fw = this.bw, fh = fw / A;               // largest A-shaped frame inside base
    if (fh > this.bh) { fh = this.bh; fw = fh * A; }
    const cw = fw / this.zoom, ch = fh / this.zoom;
    const x = clamp(this.cx * this.bw - cw / 2, 0, this.bw - cw);
    const y = clamp(this.cy * this.bh - ch / 2, 0, this.bh - ch);
    this.cx = (x + cw / 2) / this.bw;
    this.cy = (y + ch / 2) / this.bh;
    return { x, y, w: cw, h: ch };
  };
  Session.prototype.params = function () {
    const f = FILTERS.find((x) => x.id === this.filter) || FILTERS[0];
    const out = {};
    ["b", "c", "s", "w", "f", "v"].forEach((k) => { out[k] = clamp((f.p[k] || 0) + (this.adj[k] || 0), k === "f" || k === "v" ? 0 : -100, 100); });
    return out;
  };
  Session.prototype.isDefault = function () {
    return this.rot === 0 && !this.flip && this.aspect === "orig" && this.zoom === 1 &&
      this.filter === "normal" && Object.values(this.adj).every((v) => !v);
  };
  Session.prototype.render = function (canvas, outW) {
    const r = this.rect();
    const ow = Math.max(1, Math.round(outW));
    const oh = Math.max(1, Math.round(outW * (r.h / r.w)));
    canvas.width = ow; canvas.height = oh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.base, r.x, r.y, r.w, r.h, 0, 0, ow, oh);
    const p = this.params();
    if (Object.values(p).some(Boolean)) {
      const id = ctx.getImageData(0, 0, ow, oh);
      adjustPixels(id, p);
      ctx.putImageData(id, 0, 0);
    }
  };
  Session.prototype.exportFile = function (name, type) {
    const r = this.rect();
    const ow = Math.min(Math.round(r.w), MAX_OUT, Math.round(MAX_OUT * (r.w / r.h)));
    const cv = document.createElement("canvas");
    this.render(cv, Math.max(16, Math.min(ow, r.w)));
    const outType = type === "image/png" || type === "image/webp" ? type : "image/jpeg";
    const stem = name.replace(/\.[^.]+$/, "");
    const ext = outType === "image/png" ? "png" : outType === "image/webp" ? "webp" : "jpg";
    const toBlob = (t, q) => new Promise((res) => cv.toBlob(res, t, q));
    return (async () => {
      let blob = await toBlob(outType, 0.92);
      if (!blob || (blob.size > MAX_BYTES && outType === "image/png")) {
        blob = await toBlob("image/jpeg", 0.88);
        return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
      }
      if (blob.size > MAX_BYTES) blob = await toBlob(outType, 0.78);
      if (!blob) throw new Error("Could not export the edited image.");
      return new File([blob], `${stem}.${ext}`, { type: outType });
    })();
  };

  /* ---------- UI ---------- */
  function openUI(files) {
    return new Promise((resolve) => {
      const root = el("div", "ie");
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-label", "Edit photo");
      root.innerHTML = `
        <div class="ie-top">
          <button type="button" class="ie-link" data-k="cancel">Cancel</button>
          <div class="ie-title"><span data-k="title">Edit</span></div>
          <div class="ie-right">
            <button type="button" class="ie-link ie-dim" data-k="skip">Skip</button>
            <button type="button" class="ie-link ie-go" data-k="done">Done</button>
          </div>
        </div>
        <div class="ie-stagewrap" data-k="wrap">
          <div class="ie-stage" data-k="stage"><canvas data-k="canvas"></canvas><div class="ie-grid" aria-hidden="true"></div></div>
          <div class="ie-busy hidden" data-k="busy">Loading…</div>
        </div>
        <div class="ie-panel">
          <div class="ie-pane" data-pane="filters"><div class="ie-strip" data-k="filters"></div></div>
          <div class="ie-pane hidden" data-pane="adjust">
            <div class="ie-sliders" data-k="adjust"></div>
          </div>
          <div class="ie-pane hidden" data-pane="crop">
            <div class="ie-strip ie-chips" data-k="aspects"></div>
            <div class="ie-zoomrow">
              <button type="button" class="ie-ico" data-k="rotl" aria-label="Rotate left">&#8634;</button>
              <button type="button" class="ie-ico" data-k="rotr" aria-label="Rotate right">&#8635;</button>
              <button type="button" class="ie-ico" data-k="flip" aria-label="Flip horizontally">&#8646;</button>
              <input type="range" min="100" max="400" value="100" data-k="zoom" aria-label="Zoom">
            </div>
            <p class="ie-hint">Drag to move. Pinch or use the slider to zoom.</p>
          </div>
          <div class="ie-tabs" role="tablist">
            <button type="button" role="tab" data-tab="filters" aria-selected="true">Filters</button>
            <button type="button" role="tab" data-tab="adjust" aria-selected="false">Adjust</button>
            <button type="button" role="tab" data-tab="crop" aria-selected="false">Crop</button>
          </div>
        </div>`;
      const q = (k) => root.querySelector(`[data-k="${k}"]`);
      const wrap = q("wrap"), stage = q("stage"), canvas = q("canvas"), busy = q("busy");
      const filtersEl = q("filters"), adjustEl = q("adjust"), aspectsEl = q("aspects");
      const zoomEl = q("zoom"), titleEl = q("title"), doneBtn = q("done"), skipBtn = q("skip");

      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.appendChild(root);

      const results = [];
      let idx = 0, sess = null, raf = 0, dead = false;
      let thumbBase = null;

      const finish = (val) => {
        if (dead) return;
        dead = true;
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("resize", layout);
        document.body.style.overflow = prevOverflow;
        root.remove();
        resolve(val);
      };

      function layout() {
        if (!sess) return;
        const aw = wrap.clientWidth - 16, ah = wrap.clientHeight - 16;
        const A = sess.ratio();
        let w = aw, h = w / A;
        if (h > ah) { h = ah; w = h * A; }
        stage.style.width = Math.max(40, Math.floor(w)) + "px";
        stage.style.height = Math.max(40, Math.floor(h)) + "px";
        draw();
      }
      function draw() {
        if (!sess) return;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const w = Math.min(1100, Math.round(stage.clientWidth * dpr));
          sess.render(canvas, w);
        });
      }

      /* filters strip */
      function buildFilters() {
        filtersEl.innerHTML = "";
        // small thumbnail source: centre-square of the oriented base
        const t = document.createElement("canvas");
        const s = Math.min(sess.bw, sess.bh);
        t.width = t.height = 88;
        t.getContext("2d").drawImage(sess.base, (sess.bw - s) / 2, (sess.bh - s) / 2, s, s, 0, 0, 88, 88);
        thumbBase = t;
        FILTERS.forEach((f) => {
          const b = el("button", "ie-filter");
          b.type = "button";
          b.dataset.f = f.id;
          const c = document.createElement("canvas");
          c.width = c.height = 88;
          const cctx = c.getContext("2d", { willReadFrequently: true });
          cctx.drawImage(thumbBase, 0, 0);
          const id = cctx.getImageData(0, 0, 88, 88);
          adjustPixels(id, f.p);
          cctx.putImageData(id, 0, 0);
          b.appendChild(c);
          b.appendChild(el("span", "", f.label));
          b.setAttribute("aria-pressed", String(sess.filter === f.id));
          filtersEl.appendChild(b);
        });
      }
      filtersEl.addEventListener("click", (e) => {
        const b = e.target.closest(".ie-filter");
        if (!b || !sess) return;
        sess.filter = b.dataset.f;
        filtersEl.querySelectorAll(".ie-filter").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        draw();
      });

      /* adjust sliders */
      function buildAdjust() {
        adjustEl.innerHTML = "";
        ADJUST.forEach((a) => {
          const row = el("label", "ie-slider");
          row.innerHTML = `<span>${a.label}</span><input type="range" min="${a.min}" max="${a.max}" value="${sess.adj[a.k] || 0}" data-a="${a.k}"><output>${sess.adj[a.k] || 0}</output>`;
          adjustEl.appendChild(row);
        });
        const reset = el("button", "ie-link ie-dim", "Reset adjustments");
        reset.type = "button";
        reset.dataset.reset = "1";
        adjustEl.appendChild(reset);
      }
      adjustEl.addEventListener("input", (e) => {
        const r = e.target.closest("input[data-a]");
        if (!r || !sess) return;
        sess.adj[r.dataset.a] = +r.value;
        r.nextElementSibling.textContent = r.value;
        draw();
      });
      adjustEl.addEventListener("click", (e) => {
        if (!e.target.closest("[data-reset]") || !sess) return;
        Object.keys(sess.adj).forEach((k) => (sess.adj[k] = 0));
        buildAdjust();
        draw();
      });

      /* crop controls */
      function buildAspects() {
        aspectsEl.innerHTML = "";
        ASPECTS.forEach((a) => {
          const b = el("button", "ie-chip", a.label);
          b.type = "button";
          b.dataset.r = a.id;
          b.setAttribute("aria-pressed", String(sess.aspect === a.id));
          aspectsEl.appendChild(b);
        });
        zoomEl.value = String(Math.round(sess.zoom * 100));
      }
      aspectsEl.addEventListener("click", (e) => {
        const b = e.target.closest(".ie-chip");
        if (!b || !sess) return;
        sess.aspect = b.dataset.r;
        sess.zoom = 1; sess.cx = sess.cy = 0.5;
        zoomEl.value = "100";
        aspectsEl.querySelectorAll(".ie-chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        layout();
      });
      zoomEl.addEventListener("input", () => { if (sess) { sess.zoom = +zoomEl.value / 100; draw(); } });
      const reorient = (fn) => {
        if (!sess) return;
        fn();
        sess.zoom = 1; sess.cx = sess.cy = 0.5;
        zoomEl.value = "100";
        sess.buildBase();
        buildFilters();
        layout();
      };
      q("rotl").addEventListener("click", () => reorient(() => { sess.rot = (sess.rot + 3) % 4; }));
      q("rotr").addEventListener("click", () => reorient(() => { sess.rot = (sess.rot + 1) % 4; }));
      q("flip").addEventListener("click", () => reorient(() => {
        // flipping after an odd rotation mirrors the other axis; keep it visually horizontal
        sess.flip = !sess.flip;
        if (sess.rot % 2 === 1) sess.rot = (sess.rot + 2) % 4;
      }));

      /* tabs */
      root.querySelector(".ie-tabs").addEventListener("click", (e) => {
        const t = e.target.closest("[data-tab]");
        if (!t) return;
        root.querySelectorAll(".ie-tabs [data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === t)));
        root.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== t.dataset.tab));
        stage.classList.toggle("show-grid", t.dataset.tab === "crop");
        layout();
      });

      /* pan + pinch on the stage */
      const pts = new Map();
      let lastDist = 0;
      stage.addEventListener("pointerdown", (e) => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        lastDist = 0;
        stage.classList.add("grab");
      });
      stage.addEventListener("pointermove", (e) => {
        if (!pts.has(e.pointerId) || !sess) return;
        const prev = pts.get(e.pointerId);
        const cur = { x: e.clientX, y: e.clientY };
        if (pts.size === 1) {
          const r = sess.rect();
          const k = r.w / stage.clientWidth;
          sess.cx -= ((cur.x - prev.x) * k) / sess.bw;
          sess.cy -= ((cur.y - prev.y) * k) / sess.bh;
          draw();
        }
        pts.set(e.pointerId, cur);
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (lastDist) { sess.zoom = clamp(sess.zoom * (d / lastDist), 1, 4); zoomEl.value = String(Math.round(sess.zoom * 100)); draw(); }
          lastDist = d;
        }
      });
      const up = (e) => { pts.delete(e.pointerId); lastDist = 0; if (!pts.size) stage.classList.remove("grab"); };
      stage.addEventListener("pointerup", up);
      stage.addEventListener("pointercancel", up);
      stage.addEventListener("wheel", (e) => {
        if (!sess) return;
        e.preventDefault();
        sess.zoom = clamp(sess.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 1, 4);
        zoomEl.value = String(Math.round(sess.zoom * 100));
        draw();
      }, { passive: false });

      /* flow across multiple files */
      async function load(i) {
        busy.classList.remove("hidden");
        busy.textContent = "Loading…";
        sess = null;
        try {
          const src = await decode(files[i]);
          sess = new Session(src);
        } catch (err) {
          // undecodable: keep the original and move on
          results[i] = files[i];
          return next(true);
        }
        busy.classList.add("hidden");
        titleEl.textContent = files.length > 1 ? `Edit ${i + 1} of ${files.length}` : "Edit";
        doneBtn.textContent = i === files.length - 1 ? "Done" : "Next";
        buildFilters(); buildAdjust(); buildAspects();
        layout();
      }
      async function next(skipped) {
        idx++;
        if (idx >= files.length) return finish(results);
        await load(idx);
      }
      async function commit(useOriginal) {
        if (!sess) return;
        if (useOriginal || sess.isDefault()) results[idx] = files[idx];
        else {
          busy.classList.remove("hidden");
          busy.textContent = "Saving edits…";
          try { results[idx] = await sess.exportFile(files[idx].name, files[idx].type); }
          catch { results[idx] = files[idx]; }
        }
        next();
      }
      doneBtn.addEventListener("click", () => commit(false));
      skipBtn.addEventListener("click", () => commit(true));
      q("cancel").addEventListener("click", () => finish(null));
      function onKey(e) {
        if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); finish(null); }
      }
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("resize", layout);

      load(0);
    });
  }

  window.DebSocEditor = {
    /** Edit one or more image Files. Resolves File[] (same order) or null if cancelled. */
    edit(files) {
      if (!files || !files.length) return Promise.resolve(files || []);
      return openUI(files);
    }
  };
})();
