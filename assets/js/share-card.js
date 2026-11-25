/* ==========================================================================
   DebSoc: share-an-achievement card (profile page, owner only)
   Purely client side. The card is drawn on a <canvas> in the browser:
   - event, award and date come from the public profile API response (not from
     any input the person can type into), so nothing on the card is free text
   - only images DebSoc already controls go on the card: the person's profile picture
     and the event cover. There is no way to add an arbitrary photo, by design.
   Exposes window.DebSocShareCard.open(data, returnFocusEl) and .close().
   Visual language: the red "collage" entries of becon.html / history.html
   (dot grid paper, black starburst, cream polaroids with a thick bottom lip,
   hard drop shadows, lowercase serif titles, pixel-font meta, Gochi Hand).
   ========================================================================== */
(function () {
  "use strict";

  const W = 1080, PAD = 72, INNER = W - PAD * 2;
  // Post = Instagram feed (4:5). Story = Instagram / WhatsApp story (9:16); the top and bottom
  // ~250px are kept clear of anything important because the apps draw their own bars there.
  const FORMATS = {
    post: { h: 1350, top: 72, bottom: 56, k: 1 },
    story: { h: 1920, top: 250, bottom: 250, k: 1.06 }
  };
  let H = 1350, TOP = 72, BOTTOM = 56, K = 1;      // set per render from the chosen format
  const SIGNER = { name: "Karan", lines: ["Karan,", "Secretary, DebSoc"], image: "assets/images/karan_sign.png" };
  const FRAME = "#fff5ea";
  const LOGO_SRC = "assets/images/brand/debsoc-logo.webp";
  const IIEST_SRC = "assets/images/IIESTLOGO.webp";

  const FONTS = {
    pixel: '"Press", "Courier New", monospace',
    serif: '"Cormorant Garamond", Georgia, serif',
    display: '"Anton", Impact, sans-serif',
    hand: '"Gochi Hand", "Comic Sans MS", cursive'
  };

  const DOT_COLORS = { yellow: "#ffd60a", red: "#ff2a1a", pink: "#ff2e93" };

  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // bg / ink (body) / title / meta / chip (award badge) / chipInk / star / dot (+alpha) / tint (photos) / sign
  const PRESETS = {
    mustard: { label: "Mustard", bg: "#e1ad01", ink: "#111111", title: "#111111", meta: "#111111", chip: "#111111", chipInk: "#e1ad01", star: "#111111", dot: "#2d2d2d", dotA: 0.34, tint: "#a06c00", sign: "#111111" },
    black: { label: "Black", bg: "#0e0e0e", ink: "#ffffff", title: "#ffd60a", meta: "#ffd60a", chip: "#ffd60a", chipInk: "#111111", sign: "#ffd60a", dotA: 0.55, dots: DOT_COLORS },
    white: { label: "White", bg: "#fbfbf7", ink: "#111111", title: "#111111", meta: "#0b6f8a", chip: "#111111", chipInk: "#5fe1ea", star: "#1479c9", dot: "#10a3ba", dotA: 0.55, tint: "#1479c9", sign: "#111111" },
    red: { label: "Collage red", bg: "#d92a1f", ink: "#fff5ea", title: "#fff5ea", meta: "#ffd9d2", chip: "#111111", chipInk: "#fff5ea", star: "#111111", dot: "#000000", dotA: 0.2, tint: "#ff2a1a", sign: "#fff5ea" },
    pink: { label: "Hot pink", bg: "#ff2e93", ink: "#111111", title: "#111111", meta: "#111111", chip: "#111111", chipInk: "#ffd60a", star: "#ffd60a", dot: "#ffffff", dotA: 0.42, tint: "#c4106a", sign: "#111111" },
    navy: { label: "Navy", bg: "#10234a", ink: "#f4efe3", title: "#ffd60a", meta: "#9fd0ff", chip: "#ffd60a", chipInk: "#10234a", star: "#ff4d6d", dot: "#9fd0ff", dotA: 0.35, tint: "#4d7be0", sign: "#ffd60a" },
    green: { label: "Forest", bg: "#0f5a3f", ink: "#f4efe3", title: "#ffe27a", meta: "#9be7c0", chip: "#ffe27a", chipInk: "#0f5a3f", star: "#ffe27a", dot: "#9be7c0", dotA: 0.3, tint: "#2fb37a", sign: "#ffe27a" },
    lilac: { label: "Lilac", bg: "#cdb8ff", ink: "#1d1240", title: "#1d1240", meta: "#4a2fb0", chip: "#1d1240", chipInk: "#cdb8ff", star: "#ff2e93", dot: "#6b4fd6", dotA: 0.35, tint: "#7a55e0", sign: "#1d1240" }
  };

  const HEX = /^#[0-9a-f]{6}$/i;
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const autoText = (bg) => (luminance(bg) > 0.35 ? "#111111" : "#ffffff");

  // preset + optional user colours (validated here, so a tampered value can only fall back to the preset)
  function resolveTheme(opts) {
    const p = PRESETS[opts.theme] || PRESETS.mustard;
    const dc = p.dots ? (p.dots[opts.dot] || p.dots.yellow) : p.dot;
    const t = {
      bg: p.bg, ink: p.ink, title: p.title, meta: p.meta, chip: p.chip, chipInk: p.chipInk, sign: p.sign,
      star: p.dots ? dc : p.star, tint: p.dots ? dc : p.tint, dot: rgba(dc, p.dotA), soft: rgba(p.ink, 0.76)
    };
    const bg = HEX.test(opts.bg || "") ? opts.bg.toLowerCase() : null;
    let text = HEX.test(opts.text || "") ? opts.text.toLowerCase() : null;
    if (bg) { t.bg = bg; if (!text) text = autoText(bg); }
    if (text) {
      t.ink = t.title = t.meta = t.sign = t.chip = text;
      t.chipInk = t.bg;
      t.soft = rgba(text, 0.76);
      if (bg) { t.star = text; t.dot = rgba(text, 0.3); t.tint = text; }
    }
    return t;
  }

  const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const formatDate = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : DATE_FORMAT.format(d);
  };

  /* ---------- fonts ---------- */
  let fontsReady = null;
  function loadFonts() {
    if (!fontsReady) {
      const specs = [
        '16px "Press"', '700 80px "Cormorant Garamond"', 'italic 500 30px "Cormorant Garamond"',
        '48px "Anton"', '60px "Gochi Hand"'
      ];
      const all = document.fonts
        ? Promise.all(specs.map((s) => document.fonts.load(s).catch(() => null)))
        : Promise.resolve();
      fontsReady = Promise.race([all, new Promise((r) => setTimeout(r, 4000))]);
    }
    return fontsReady;
  }

  /* ---------- images ---------- */
  // Only https or same-origin images; the card must never taint the canvas.
  function safeSrc(src) {
    if (typeof src !== "string" || !src.trim()) return null;
    try {
      const u = new URL(src, window.location.href);
      if (/(^|\.)placeholder\.com$/i.test(u.hostname)) return null;
      if (u.origin === window.location.origin || u.protocol === "https:") return u.href;
    } catch { /* fall through */ }
    return null;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      img.onload = () => resolve(img.naturalWidth ? img : null);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // A copy cached earlier without CORS headers can fail the anonymous load, so retry once uncached.
  async function loadRemote(src) {
    const url = safeSrc(src);
    if (!url) return null;
    return (await loadImage(url)) || loadImage(`${url}${url.includes("?") ? "&" : "?"}card=1`);
  }

  /* ---------- drawing primitives ---------- */
  const setSpacing = (ctx, px) => { if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`; };

  function drawImageCover(ctx, img, x, y, w, h) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const s = Math.max(w / iw, h / ih);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  }

  function tint(ctx, color, x, y, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function drawBackground(ctx, theme) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
    const tile = document.createElement("canvas");
    tile.width = tile.height = 14;
    const t = tile.getContext("2d");
    t.fillStyle = theme.dot;
    t.beginPath();
    t.arc(7, 7, 1.8, 0, Math.PI * 2);
    t.fill();
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fillRect(0, 0, W, H);
  }

  // Same 8-point starburst as the collage entries' ::before clip-path.
  const STAR = [[100, 50], [63.9, 55.7], [85.4, 85.4], [55.7, 63.9], [50, 100], [44.3, 63.9], [14.6, 85.4], [36.1, 55.7],
    [0, 50], [36.1, 44.3], [14.6, 14.6], [44.3, 36.1], [50, 0], [55.7, 36.1], [85.4, 14.6], [63.9, 44.3]];
  function drawStar(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    STAR.forEach(([px, py], i) => {
      const fx = x + (px / 100) * size, fy = y + (py / 100) * size;
      if (i) ctx.lineTo(fx, fy); else ctx.moveTo(fx, fy);
    });
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCoverPhoto(ctx, img, x, y, w, h, theme) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(x + 12, y + 12, w, h);
    ctx.fillStyle = "#222";
    ctx.fillRect(x, y, w, h);
    drawImageCover(ctx, img, x, y, w, h);
    tint(ctx, theme.tint, x, y, w, h);
  }

  // Polaroid: photo 1.1:1, thin cream sides, thick bottom lip (6px / 16px in the CSS).
  function polaroidSize(maxW, maxH) {
    const side = 0.05, lip = 0.15, ratio = 1 / 1.1;
    const kw = 1 + side * 2, kh = ratio + side + lip;
    const iw = Math.max(40, Math.min(maxW / kw, maxH / kh));
    return { w: iw * kw, h: iw * kh, iw, ih: iw * ratio, side: iw * side, lip: iw * lip };
  }

  function drawPolaroid(ctx, photo, cx, cy, size, deg, theme) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((deg * Math.PI) / 180);
    const x = -size.w / 2, y = -size.h / 2;
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fillRect(x + 9, y + 9, size.w, size.h);
    ctx.fillStyle = FRAME;
    ctx.fillRect(x, y, size.w, size.h);
    const px = x + size.side, py = y + size.side;
    drawImageCover(ctx, photo.img, px, py, size.iw, size.ih);
    tint(ctx, theme.tint, px, py, size.iw, size.ih);
    if (photo.caption) {
      ctx.fillStyle = "#2a2a2a";
      ctx.font = `${Math.round(size.lip * 0.56)}px ${FONTS.hand}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fitText(ctx, photo.caption, size.iw - 12), 0, py + size.ih + size.lip / 2);
    }
    ctx.restore();
  }

  /* ---------- text helpers ---------- */
  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) out = out.slice(0, -1);
    return `${out.trimEnd()}…`;
  }

  function wrap(ctx, text, maxW) {
    const lines = [];
    let line = "";
    String(text).split(/\s+/).filter(Boolean).forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxW) { line = test; return; }
      if (line) lines.push(line);
      if (ctx.measureText(word).width <= maxW) { line = word; return; }
      let part = "";
      for (const ch of word) {
        if (part && ctx.measureText(part + ch).width > maxW) { lines.push(part); part = ch; } else part += ch;
      }
      line = part;
    });
    if (line) lines.push(line);
    return lines;
  }

  function clampLines(ctx, lines, max, maxW) {
    if (lines.length <= max) return lines;
    const kept = lines.slice(0, max - 1);
    kept.push(fitText(ctx, lines.slice(max - 1).join(" "), maxW));
    return kept;
  }

  function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0] || "Delegate";
  }

  // "BE COLLEGE EX STUDENTS' CLUB" -> "Be College Ex Students' Club" (only when it was shouted)
  function niceTitle(t) {
    const text = String(t || "").trim();
    if (!text) return "DebSoc event";
    const letters = text.replace(/[^a-z]/gi, "");
    if (letters.length > 3 && text === text.toUpperCase()) {
      return text.toLowerCase().replace(/(^|[\s(\-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
    }
    return text;
  }

  function messageFor(d) {
    return {
      greeting: `Dear ${firstName(d.displayName)},`,
      body: `Thank you for being part of ${niceTitle(d.eventTitle)}. Congratulations on your ${d.award}! ` +
        "Keep reading, keep questioning, keep standing up to speak. " +
        "We will be saving you a seat at the next session."
    };
  }

  /* ---------- text block: measured first, so the art gets whatever room is left ---------- */
  function buildText(ctx, d, theme, big, st) {
    const k = (big ? 1.18 : 1) * K;
    const rows = [];

    // 1. the award is the headline: a big sticker above the event name, with a tiny pixel trophy on its corner
    const trophy = sticker(st.award);
    const award = String(d.award || "Recognition").toUpperCase();
    const maxLabel = INNER - 200 - (trophy ? 44 : 0);
    let aSize = Math.round(72 * k);
    setSpacing(ctx, 1);
    ctx.font = `${aSize}px ${FONTS.display}`;
    while (aSize > 38 && ctx.measureText(award).width > maxLabel) {
      aSize -= 2;
      ctx.font = `${aSize}px ${FONTS.display}`;
    }
    setSpacing(ctx, 0);
    const chipH = aSize * 1.15 + 32;
    rows.push({
      h: chipH + 22, gap: 22,
      draw(y) {
        ctx.font = `${aSize}px ${FONTS.display}`;
        setSpacing(ctx, 1);
        const label = fitText(ctx, award, maxLabel);
        const tw = ctx.measureText(label).width;
        ctx.font = `15px ${FONTS.pixel}`;
        const lw = ctx.measureText("AWARD").width;
        const chipW = tw + lw + 84 + (trophy ? 40 : 0);
        ctx.save();
        ctx.translate(PAD + 10 + chipW / 2, y + 11 + chipH / 2);
        ctx.rotate((-1.5 * Math.PI) / 180);
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.fillRect(-chipW / 2 + 9, -chipH / 2 + 9, chipW, chipH);
        ctx.strokeStyle = theme.chip;
        ctx.lineWidth = 3;
        ctx.strokeRect(-chipW / 2 - 9, -chipH / 2 - 9, chipW + 18, chipH + 18);
        ctx.fillStyle = theme.chip;
        ctx.fillRect(-chipW / 2, -chipH / 2, chipW, chipH);
        ctx.fillStyle = theme.chipInk;
        ctx.textBaseline = "middle";
        ctx.fillText("AWARD", -chipW / 2 + 26, 2);
        ctx.font = `${aSize}px ${FONTS.display}`;
        ctx.fillText(label, -chipW / 2 + 26 + lw + 30, 4);
        ctx.restore();
        setSpacing(ctx, 0);
        ctx.textBaseline = "alphabetic";
        if (trophy) drawSticker(ctx, trophy, PAD + 10 + chipW - 6, y + 14);
      }
    });

    // 2. event name
    const title = String(d.eventTitle || "DebSoc event").toLowerCase();
    let tSize = Math.round(76 * k), tLines;
    for (; ; tSize -= 4) {
      ctx.font = `700 ${tSize}px ${FONTS.serif}`;
      tLines = wrap(ctx, title, INNER);
      if (tLines.length <= 2 || tSize <= 50) break;
    }
    tLines = clampLines(ctx, tLines, 2, INNER);
    const tLead = tSize * 0.98;
    rows.push({
      h: tLead * tLines.length, gap: 20,
      draw(y) {
        ctx.font = `700 ${tSize}px ${FONTS.serif}`;
        setSpacing(ctx, -1);
        tLines.forEach((line, i) => {
          const by = y + tSize * 0.8 + i * tLead;
          ctx.fillStyle = "rgba(0,0,0,.22)";
          ctx.fillText(line, PAD + 3, by + 3);
          ctx.fillStyle = theme.title;
          ctx.fillText(line, PAD, by);
        });
        setSpacing(ctx, 0);
      }
    });

    // 3. date and place
    const meta = [formatDate(d.eventDate), d.location].filter(Boolean).join(", ").toUpperCase();
    if (meta) {
      const size = Math.round(16 * k);
      rows.push({
        h: size * 1.5, gap: 28,
        draw(y) {
          ctx.font = `${size}px ${FONTS.pixel}`;
          setSpacing(ctx, 1);
          ctx.fillStyle = theme.meta;
          ctx.fillText(fitText(ctx, meta, INNER), PAD, y + size);
          setSpacing(ctx, 0);
        }
      });
    }

    // 4. the note
    const msg = messageFor(d);
    const gSize = Math.round(36 * k), mSize = Math.round(31 * k), mLead = mSize * 1.32;
    ctx.font = `italic 500 ${mSize}px ${FONTS.serif}`;
    const mLines = clampLines(ctx, wrap(ctx, msg.body, INNER), 5, INNER);
    rows.push({
      h: gSize * 1.2 + mLead * mLines.length, gap: 0,
      draw(y) {
        ctx.fillStyle = theme.ink;
        ctx.font = `${gSize}px ${FONTS.hand}`;
        ctx.fillText(msg.greeting, PAD, y + gSize * 0.9);
        ctx.font = `italic 500 ${mSize}px ${FONTS.serif}`;
        mLines.forEach((line, i) => ctx.fillText(line, PAD, y + gSize * 1.2 + mSize * 0.85 + i * mLead));
      }
    });

    return { rows, height: rows.reduce((sum, r) => sum + r.h + r.gap, 0) };
  }

  function drawRows(rows, y) {
    rows.forEach((r) => { r.draw(y); y += r.h + r.gap; });
  }

  const TOPBAR_SEAL = 92;
  function drawTopBar(ctx, theme) {
    const sy = TOP - 8, cy = sy + TOPBAR_SEAL / 2;
    const sealed = drawSeal(ctx, iiestLogo, PAD + 2, sy, TOPBAR_SEAL, { rot: 3, pad: 0.09 });
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.font = `24px ${FONTS.pixel}`;
    setSpacing(ctx, 2);
    ctx.fillStyle = theme.ink;
    ctx.fillText("IIEST, SHIBPUR", PAD + (sealed ? TOPBAR_SEAL + 28 : 0), cy + 9);
    ctx.font = `14px ${FONTS.pixel}`;
    setSpacing(ctx, 1);
    ctx.fillStyle = theme.soft;
    ctx.textAlign = "right";
    ctx.fillText("VERIFIED ACHIEVEMENT", W - PAD, cy + 7);
    ctx.textAlign = "left";
    setSpacing(ctx, 0);
  }

  /* The signature PNG is turned into an ink mask once (dark pixels -> opaque, light or
     transparent -> clear, trimmed to the strokes) so it can be recoloured for every theme. */
  let signature = null, signatureLoad = null;
  const tintCache = new Map();
  function loadSignature() {
    if (!signatureLoad) {
      signatureLoad = loadImage(SIGNER.image).then((img) => {
        if (!img) return null;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        const id = x.getImageData(0, 0, c.width, c.height), px = id.data;
        let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
        for (let i = 0; i < px.length; i += 4) {
          const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          const a = Math.round((px[i + 3] * (255 - lum)) / 255);
          px[i] = px[i + 1] = px[i + 2] = 0;
          px[i + 3] = a;
          if (a > 40) {
            const p = i / 4, cx = p % c.width, cy = (p / c.width) | 0;
            if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          }
        }
        if (maxX < 0) return null;
        x.putImageData(id, 0, 0);
        const m = 6, w = maxX - minX + 1 + m * 2, h = maxY - minY + 1 + m * 2;
        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        out.getContext("2d").drawImage(c, minX - m, minY - m, w, h, 0, 0, w, h);
        signature = out;
        return out;
      }).catch(() => null);
    }
    return signatureLoad;
  }
  function tintedSignature(color) {
    if (!tintCache.has(color)) {
      const c = document.createElement("canvas");
      c.width = signature.width;
      c.height = signature.height;
      const x = c.getContext("2d");
      x.drawImage(signature, 0, 0);
      x.globalCompositeOperation = "source-in";
      x.fillStyle = color;
      x.fillRect(0, 0, c.width, c.height);
      tintCache.set(color, c);
    }
    return tintCache.get(color);
  }

  /* ---------- tiny pixel stickers + the DebSoc seal ---------- */
  const PIXEL_ART = {
    star: {
      pal: { o: "#111111", y: "#ffd60a", w: "#fffbe0" },
      rows: [".....o.....", "....oyo....", "....oyo....", "oooo" + "yyy" + "oooo", "oywyyyyyyyo", ".oyyyyyyyo.",
        "..oyyyyyo..", "..oyyoyyo..", ".oyyo.oyyo.", ".ooo...ooo."]
    },
    heart: {
      pal: { o: "#111111", p: "#ff2e93", h: "#ff9cc8" },
      rows: ["..ooo.ooo..", ".ohppopppo.", "ohhpppppppo", "opppppppppo", "opppppppppo", ".opppppppo.",
        "..opppppo..", "...opppo...", "....opo....", ".....o....."]
    }
  };
  // pixel art is drawn at a whole-number scale so every "pixel" stays the same size
  const SPRITES = {
    trophy: { src: "assets/images/share/trophy.png", scale: 3 },
    cat: { src: "assets/images/share/cat.png", scale: 3 },
    yay: { src: "assets/images/share/yay.png", height: 92, tilt: -6 },
    star: { art: "star", scale: 5 },
    heart: { art: "heart", scale: 5 }
  };
  const spriteImgs = {}, stickerCache = new Map();
  let spritesLoad = null;

  function pixelCanvas(art) {
    const rows = art.rows, w = Math.max(...rows.map((r) => r.length)), c = document.createElement("canvas");
    c.width = w;
    c.height = rows.length;
    const x = c.getContext("2d");
    rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
      if (art.pal[ch]) { x.fillStyle = art.pal[ch]; x.fillRect(rx, ry, 1, 1); }
    }));
    return c;
  }

  function loadSprites() {
    if (!spritesLoad) {
      spritesLoad = Promise.all(Object.entries(SPRITES).map(async ([name, def]) => {
        spriteImgs[name] = def.art ? pixelCanvas(PIXEL_ART[def.art]) : await loadImage(def.src);
      })).then(() => null);
    }
    return spritesLoad;
  }

  // a die-cut sticker: the sprite with a cream outline, like the polaroid frames
  function sticker(name) {
    const def = SPRITES[name], img = spriteImgs[name];
    if (!def || !img) return null;
    if (stickerCache.has(name)) return stickerCache.get(name);
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const pixel = Boolean(def.scale);
    const h = pixel ? ih * def.scale : def.height;
    const w = Math.round((iw * h) / ih);
    const halo = pixel ? def.scale * 2 : 5;
    const mk = (cw, ch) => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return c; };
    const body = mk(w, h), b = body.getContext("2d");
    b.imageSmoothingEnabled = !pixel;
    b.imageSmoothingQuality = "high";
    b.drawImage(img, 0, 0, w, h);
    const cream = mk(w, h), c = cream.getContext("2d");
    c.drawImage(body, 0, 0);
    c.globalCompositeOperation = "source-in";
    c.fillStyle = FRAME;
    c.fillRect(0, 0, w, h);
    const out = mk(w + halo * 2, h + halo * 2), o = out.getContext("2d");
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      o.drawImage(cream, halo + Math.cos(a) * halo, halo + Math.sin(a) * halo);
    }
    o.drawImage(body, halo, halo);
    const made = { canvas: out, w: out.width, h: out.height, pixel, tilt: def.tilt || 0 };
    stickerCache.set(name, made);
    return made;
  }

  function drawSticker(ctx, s, cx, cy) {
    ctx.save();
    ctx.imageSmoothingEnabled = !s.pixel;
    if (s.tilt) {
      ctx.translate(cx, cy);
      ctx.rotate((s.tilt * Math.PI) / 180);
      ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2);
    } else {
      ctx.drawImage(s.canvas, Math.round(cx - s.w / 2), Math.round(cy - s.h / 2));
    }
    ctx.restore();
  }

  let logo = null, logoLoad = null;
  function loadLogo() {
    if (!logoLoad) logoLoad = loadImage(LOGO_SRC).then((img) => { logo = img; return img; });
    return logoLoad;
  }

  let iiestLogo = null, iiestLoad = null;
  function loadIiest() {
    if (!iiestLoad) iiestLoad = loadImage(IIEST_SRC).then((img) => { iiestLogo = img; return img; });
    return iiestLoad;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // A logo on a cream, slightly tilted seal (like the polaroid frames). With o.multiply the logo's
  // white background becomes the seal's cream; o.crop trims that much off every edge first.
  function drawSeal(ctx, img, x, y, size, o) {
    if (!img) return false;
    const iw = img.naturalWidth, ih = img.naturalHeight, c = o.crop || 0;
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(((o.rot || 0) * Math.PI) / 180);
    const r = size * 0.16, half = size / 2;
    ctx.fillStyle = "rgba(0,0,0,.3)";
    roundRect(ctx, -half + 6, -half + 6, size, size, r);
    ctx.fill();
    ctx.fillStyle = FRAME;
    roundRect(ctx, -half, -half, size, size, r);
    ctx.fill();
    roundRect(ctx, -half, -half, size, size, r);
    ctx.clip();
    if (o.multiply) ctx.globalCompositeOperation = "multiply";
    const pad = size * (o.pad || 0.06);
    ctx.drawImage(img, iw * c, ih * c, iw * (1 - 2 * c), ih * (1 - 2 * c), -half + pad, -half + pad, size - pad * 2, size - pad * 2);
    ctx.restore();
    return true;
  }

  const FOOTER_H = 150, SEAL = 124;
  function drawFooter(ctx, d, theme, st) {
    const top = H - BOTTOM - FOOTER_H;
    ctx.save();
    ctx.strokeStyle = theme.soft;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 9]);
    ctx.beginPath();
    ctx.moveTo(PAD, top);
    ctx.lineTo(W - PAD, top);
    ctx.stroke();
    ctx.restore();

    const l1 = top + FOOTER_H - 26, l2 = top + FOOTER_H;

    // bottom left: the DebSoc seal, then the handle and site
    const sealed = drawSeal(ctx, logo, PAD + 4, l2 - SEAL + 2, SEAL, { crop: 0.0625, multiply: true, rot: -3 });
    const lx = PAD + (sealed ? SEAL + 34 : 0);

    // a tiny pixel sticker sits on the baseline in the middle
    const cute = sticker(st.cute);
    const cuteX = W / 2 + 50;
    if (cute) drawSticker(ctx, cute, cuteX, l2 + 4 - cute.h / 2 + 5);

    ctx.font = `13px ${FONTS.pixel}`;
    setSpacing(ctx, 1);
    ctx.fillStyle = theme.soft;
    ctx.textAlign = "left";
    const maxLeft = Math.max(120, (cute ? cuteX - cute.w / 2 - 18 : W / 2) - lx);
    ctx.fillText(fitText(ctx, `@${d.username || "debsoc"}`.toUpperCase(), maxLeft), lx, l1);
    ctx.fillText("DEBSOCIIESTS.IN", lx, l2);

    // signed off as "Karan, GS" with DEBSOC on the next line
    ctx.textAlign = "right";
    ctx.fillText(SIGNER.lines[0].toUpperCase(), W - PAD, l1);
    ctx.fillText(SIGNER.lines[1].toUpperCase(), W - PAD, l2);
    setSpacing(ctx, 0);
    ctx.textAlign = "left";

    if (signature) {
      // the scan's pen line is thin, so lay it down three times a pixel apart for weight
      const ratio = signature.width / signature.height;
      const sw = Math.min(INNER / 2, 94 * ratio), sh = sw / ratio;
      const ink = tintedSignature(theme.sign), sx = W - PAD - sw, sy = l1 - 30 - sh;
      [[0, 0], [1.4, 0], [0, 1.2]].forEach(([dx, dy]) => ctx.drawImage(ink, sx + dx, sy + dy, sw, sh));
      return;
    }
    // fallback: handwritten name
    ctx.save();
    ctx.translate(W - PAD - 6, top + 74);
    ctx.rotate((-4 * Math.PI) / 180);
    ctx.textAlign = "right";
    ctx.fillStyle = theme.sign;
    ctx.font = `64px ${FONTS.hand}`;
    ctx.fillText(SIGNER.name, 0, 0);
    ctx.restore();
  }

  /* ---------- art layouts ---------- */
  function drawArt(ctx, box, cover, photos, theme) {
    const { x, y, w, h } = box;
    const n = photos.length;
    const starSize = Math.min(200, Math.max(110, h * 0.34));
    drawStar(ctx, x + w - starSize * 0.78, y - starSize * 0.1, starSize, theme.star);

    if (cover && !n) {
      const ch = Math.min(h, w * 0.72), cw = Math.min(w, ch / 0.72);
      drawCoverPhoto(ctx, cover, x + (w - cw) / 2, y + (h - ch) / 2, cw, ch, theme);
    } else if (cover) {
      const cw = w * 0.62, ch = Math.min(cw * 0.8, h * 0.94);
      drawCoverPhoto(ctx, cover, x, y + (h - ch) / 2, cw, ch, theme);
      const p = polaroidSize(w * 0.5, h);
      drawPolaroid(ctx, photos[0], x + w - p.w / 2 - 6, y + h / 2 + 6, p, 3.5, theme);
    } else if (n) {
      const p = polaroidSize(w * 0.72, h);
      drawPolaroid(ctx, photos[0], x + w / 2, y + h / 2, p, -2.5, theme);
    }
  }

  /* ---------- the card ---------- */
  function renderCard(canvas, d, opts) {
    const f = FORMATS[opts.format] || FORMATS.post;
    H = f.h; TOP = f.top; BOTTOM = f.bottom; K = f.k;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";
    ctx.imageSmoothingQuality = "high";
    const theme = resolveTheme(opts);
    const st = opts.stickers || {};
    const hasArt = Boolean(opts.cover || opts.photos.length);

    drawBackground(ctx, theme);
    drawTopBar(ctx, theme);

    const footerTop = H - BOTTOM - FOOTER_H;
    const text = buildText(ctx, d, theme, !hasArt, st);
    const artTop = TOP + 102;

    if (hasArt) {
      const textTop = footerTop - 34 - text.height;
      drawArt(ctx, { x: PAD, y: artTop, w: INNER, h: Math.max(260, textTop - 58 - artTop) },
        opts.cover, opts.photos, theme);
      drawRows(text.rows, textTop);
    } else {
      // text only: centre the block and let a big starburst hold the corner
      const textTop = Math.max(artTop + 60, artTop + (footerTop - artTop - text.height) / 2);
      drawStar(ctx, W - PAD - 230, artTop - 10, 260, theme.star);
      drawRows(text.rows, textTop);
    }
    drawFooter(ctx, d, theme, st);
  }

  /* ---------- modal controller ---------- */
  const $ = (id) => document.getElementById(id);
  const FORMAT_KEY = "debsoc_share_format";
  const readFormat = () => {
    try { const v = localStorage.getItem(FORMAT_KEY); if (FORMATS[v]) return v; } catch { /* private mode */ }
    return "story";
  };
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const pickStickers = (prev) => {
    let next;
    for (let i = 0; i < 8; i++) {
      next = { award: pick(["trophy", "yay"]), cute: pick(["cat", "star", "heart"]) };
      if (!prev || next.award !== prev.award || next.cute !== prev.cute) break;
    }
    return next;
  };

  const state = {
    data: null, theme: "mustard", dot: "yellow", bg: null, text: null,
    usePfp: true, useCover: true, showStickers: true, format: readFormat(), stickers: pickStickers(),
    pfp: null, cover: null, token: 0, rev: 0, blob: null, blobTimer: 0, ready: false,
    canShare: false, canCopy: false
  };
  let bound = false, returnFocus = null, frame = 0, queued = false;

  const setStatus = (msg, isError = false) => {
    const el = $("share-status");
    el.textContent = msg || "";
    el.classList.toggle("err", Boolean(isError));
  };

  function currentPhotos() {
    const list = [];
    if (state.usePfp && state.pfp) list.push({ img: state.pfp, caption: `@${state.data.username}` });
    return list;
  }

  function syncControls() {
    $("share-pfp-row").classList.toggle("hidden", !state.pfp);
    $("share-no-pfp").classList.toggle("hidden", Boolean(state.pfp) || !state.ready);
    $("share-cover-row").classList.toggle("hidden", !state.cover);
    $("share-dots").classList.toggle("hidden", !(PRESETS[state.theme] || {}).dots);
    const t = resolveTheme(state);
    $("share-bg-color").value = t.bg;
    $("share-text-color").value = t.title;
    $("share-colors-reset").classList.toggle("hidden", !state.bg && !state.text);
    $("share-stickers-shuffle").classList.toggle("hidden", !state.showStickers);
    // the quickest route differs by device: native share sheet on phones, copy / download on desktop
    $("share-native").classList.toggle("hidden", !state.canShare);
    $("share-native").classList.toggle("share-go", state.canShare);
    $("share-copy").classList.toggle("hidden", state.canShare || !state.canCopy);
    $("share-download").classList.toggle("share-go", !state.canShare);
    $("share-hint").textContent = state.canShare
      ? "Tap Share, then pick Instagram or WhatsApp."
      : "Download it, or copy it and paste straight into WhatsApp Web or Instagram.";
  }

  function draw() {
    queued = false;
    if (!state.data) return;
    renderCard($("share-canvas"), state.data, {
      theme: state.theme, dot: state.dot, bg: state.bg, text: state.text, format: state.format,
      stickers: state.showStickers ? state.stickers : null,
      cover: state.useCover ? state.cover : null, photos: currentPhotos()
    });
  }

  function canvasBlob() {
    return new Promise((resolve, reject) => {
      try {
        $("share-canvas").toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image."))), "image/png");
      } catch {
        reject(new Error("Could not create the image. Try turning off the cover photo."));
      }
    });
  }

  function flush() {
    if (queued) { cancelAnimationFrame(frame); draw(); }
  }

  // The PNG is prepared in the background after each change, so a tap on Share can open the
  // share sheet at once (browsers only allow it right after a tap).
  function prepareBlob() {
    if (!state.data) return;
    flush();
    const rev = state.rev;
    canvasBlob().then((b) => { if (rev === state.rev) state.blob = b; }).catch(() => {});
  }

  async function getBlob() {
    flush();
    return state.blob || canvasBlob();
  }

  function scheduleRender() {
    syncControls();
    state.rev++;
    state.blob = null;
    clearTimeout(state.blobTimer);
    cancelAnimationFrame(frame);
    queued = true;
    frame = requestAnimationFrame(draw);
    state.blobTimer = setTimeout(prepareBlob, 400);
  }

  const fileName = () => `debsoc-${String(state.data.eventTitle || "award").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "award"}-${state.format}.png`;

  function close() {
    const modal = $("share-modal");
    if (modal.classList.contains("hidden")) return;
    modal.classList.add("hidden");
    document.documentElement.classList.remove("share-open");
    clearTimeout(state.blobTimer);
    state.token++;
    state.data = null;
    state.blob = null;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }

  function bind() {
    if (bound) return;
    bound = true;
    const modal = $("share-modal");
    modal.querySelectorAll("[data-share-close]").forEach((b) => b.addEventListener("click", close));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
    });

    const swatches = $("share-swatches");
    Object.entries(PRESETS).forEach(([id, p]) => {
      const label = document.createElement("label");
      label.className = "sw";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "share-theme";
      input.value = id;
      input.checked = id === state.theme;
      const chip = document.createElement("span");
      chip.className = "sw-chip";
      chip.setAttribute("aria-hidden", "true");
      chip.textContent = "Aa";
      const dc = p.dots ? p.dots.yellow : p.dot;
      chip.style.backgroundColor = p.bg;
      chip.style.backgroundImage = `radial-gradient(${rgba(dc, Math.max(0.6, p.dotA))} 1.2px, transparent 1.4px)`;
      chip.style.color = p.title;
      label.append(input, chip, document.createTextNode(p.label));
      swatches.appendChild(label);
    });
    swatches.addEventListener("change", (e) => {
      if (e.target.name !== "share-theme") return;
      state.theme = e.target.value;
      state.bg = state.text = null;
      scheduleRender();
    });
    $("share-bg-color").addEventListener("input", (e) => { state.bg = e.target.value; scheduleRender(); });
    $("share-text-color").addEventListener("input", (e) => { state.text = e.target.value; scheduleRender(); });
    $("share-colors-reset").addEventListener("click", () => { state.bg = state.text = null; scheduleRender(); });
    modal.querySelectorAll('input[name="share-dot"]').forEach((r) =>
      r.addEventListener("change", () => { state.dot = r.value; scheduleRender(); }));
    modal.querySelectorAll('input[name="share-format"]').forEach((r) =>
      r.addEventListener("change", () => {
        state.format = r.value;
        try { localStorage.setItem(FORMAT_KEY, r.value); } catch { /* optional */ }
        scheduleRender();
      }));
    $("share-use-pfp").addEventListener("change", (e) => { state.usePfp = e.target.checked; scheduleRender(); });
    $("share-use-cover").addEventListener("change", (e) => { state.useCover = e.target.checked; scheduleRender(); });
    $("share-use-stickers").addEventListener("change", (e) => { state.showStickers = e.target.checked; scheduleRender(); });
    $("share-stickers-shuffle").addEventListener("click", () => { state.stickers = pickStickers(state.stickers); scheduleRender(); });

    $("share-download").addEventListener("click", async () => {
      try {
        const blob = await getBlob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        setStatus("Saved. Post it and tag @debsoc_iiests.");
      } catch (err) { setStatus(err.message, true); }
    });

    $("share-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": getBlob() })]);
        setStatus("Copied. Paste it into your story or chat.");
      } catch { setStatus("Could not copy here. Use Download instead.", true); }
    });

    $("share-native").addEventListener("click", async () => {
      try {
        const blob = await getBlob();
        const file = new File([blob], fileName(), { type: "image/png" });
        if (navigator.canShare && !navigator.canShare({ files: [file] })) {
          throw new Error("This browser cannot share the image. Use Download instead.");
        }
        await navigator.share({
          files: [file],
          title: `${state.data.award} at ${state.data.eventTitle}`,
          text: `${state.data.award} at ${state.data.eventTitle}. DebSoc IIEST Shibpur.`
        });
      } catch (err) {
        if (err && err.name !== "AbortError") setStatus(err.message || "Sharing failed. Use Download instead.", true);
      }
    });
  }

  function canShareFiles() {
    try {
      return Boolean(navigator.canShare && navigator.share &&
        navigator.canShare({ files: [new File([""], "card.png", { type: "image/png" })] }));
    } catch { return false; }
  }

  async function open(data, focusBack) {
    bind();
    returnFocus = focusBack || document.activeElement;
    const token = ++state.token;
    Object.assign(state, {
      data, usePfp: true, useCover: true, showStickers: true, stickers: pickStickers(state.stickers),
      pfp: null, cover: null, ready: false, bg: null, text: null, format: readFormat(), blob: null,
      canShare: canShareFiles(),
      canCopy: Boolean(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write)
    });
    $("share-use-pfp").checked = true;
    $("share-use-cover").checked = true;
    $("share-use-stickers").checked = true;
    const formatRadio = $("share-modal").querySelector(`input[name="share-format"][value="${state.format}"]`);
    if (formatRadio) formatRadio.checked = true;
    $("share-modal").classList.remove("hidden");
    document.documentElement.classList.add("share-open");
    $("share-modal").querySelector("[data-share-close]").focus();
    setStatus("");
    syncControls();
    $("share-busy").classList.remove("hidden");

    const [pfp, cover] = await Promise.all([
      loadRemote(data.profileImage), loadRemote(data.coverImage),
      loadFonts(), loadSignature(), loadSprites(), loadLogo(), loadIiest()
    ]);
    if (token !== state.token) return;          // closed or reopened meanwhile
    state.pfp = pfp;
    state.cover = cover;
    state.ready = true;
    $("share-busy").classList.add("hidden");
    const missing = [];
    if (data.profileImage && !pfp) missing.push("your profile picture");
    if (data.coverImage && safeSrc(data.coverImage) && !cover) missing.push("the event cover");
    setStatus(missing.length ? `Could not load ${missing.join(" or ")}; the card works without it.` : "");
    scheduleRender();
  }

  window.DebSocShareCard = { open, close };
})();
