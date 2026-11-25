/* ==========================================================================
   DebSoc: share-an-achievement card (profile page, owner only)
   Purely client side. The card is drawn on a <canvas> in the browser:
   - event, award and date come from the public profile API response (not from
     any input the person can type into), so nothing on the card is free text
   - the optional event photo stays on the device (FileReader -> canvas) and is
     never uploaded; it goes through the shared photo editor (filters, crop)
   Exposes window.DebSocShareCard.open(data, returnFocusEl).
   Visual language: the red "collage" entries of becon.html / history.html
   (dot grid paper, black starburst, cream polaroids with a thick bottom lip,
   hard drop shadows, lowercase serif titles, pixel-font meta, Gochi Hand).
   ========================================================================== */
(function () {
  "use strict";

  const W = 1080, H = 1350, PAD = 72, INNER = W - PAD * 2;
  const SIGNER = { name: "Karan", role: "Karan, GS, DebSoc IIEST Shibpur", image: "assets/images/karan_sign.png" };
  const FRAME = "#fff5ea";
  const MAX_UPLOAD = 15 * 1024 * 1024;
  const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

  const THEMES = {
    mustard: () => ({
      bg: "#e1ad01", dot: "rgba(45,45,45,.34)", ink: "#111", soft: "rgba(17,17,17,.74)",
      title: "#111", meta: "#111", awardBg: "#111", awardInk: "#e1ad01", star: "#111",
      tint: "#a06c00", sign: "#111"
    }),
    black: (dot) => {
      const c = DOT_COLORS[dot] || DOT_COLORS.yellow;
      return {
        bg: "#0e0e0e", dot: rgba(c, 0.55), ink: "#fff", soft: "rgba(255,255,255,.78)",
        title: "#ffd60a", meta: "#ffd60a", awardBg: "#ffd60a", awardInk: "#111", star: c,
        tint: c, sign: "#ffd60a"
      };
    },
    white: () => ({
      bg: "#fbfbf7", dot: "rgba(16,163,186,.55)", ink: "#111", soft: "rgba(17,17,17,.74)",
      title: "#111", meta: "#0b6f8a", awardBg: "#111", awardInk: "#5fe1ea", star: "#1479c9",
      tint: "#1479c9", sign: "#111"
    })
  };

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

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Could not read that photo."));
      fr.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not open that photo."));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
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

  function messageFor(d) {
    return {
      greeting: `Dear ${firstName(d.displayName)},`,
      body: `Thank you for being part of ${d.eventTitle}. Congratulations on your ${d.award}: ` +
        "you earned it on the floor, one point at a time. Keep reading, keep questioning, " +
        "keep standing up to speak. We will be saving you a seat at the next session."
    };
  }

  /* ---------- text block: measured first, so the art gets whatever room is left ---------- */
  function buildText(ctx, d, theme, big) {
    const k = big ? 1.22 : 1;
    const rows = [];

    const meta = [formatDate(d.eventDate), d.location].filter(Boolean).join(", ").toUpperCase();
    if (meta) {
      const size = Math.round(15 * k);
      rows.push({
        h: size * 1.6, gap: 18,
        draw(y) {
          ctx.font = `${size}px ${FONTS.pixel}`;
          setSpacing(ctx, 1);
          ctx.fillStyle = theme.meta;
          ctx.fillText(fitText(ctx, meta, INNER), PAD, y + size);
          setSpacing(ctx, 0);
        }
      });
    }

    const title = String(d.eventTitle || "DebSoc event").toLowerCase();
    let tSize = Math.round(86 * k), tLines;
    for (; ; tSize -= 4) {
      ctx.font = `700 ${tSize}px ${FONTS.serif}`;
      tLines = wrap(ctx, title, INNER);
      if (tLines.length <= 2 || tSize <= 56) break;
    }
    tLines = clampLines(ctx, tLines, 2, INNER);
    const tLead = tSize * 0.98;
    rows.push({
      h: tLead * tLines.length, gap: 26,
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

    const award = String(d.award || "Recognition").toUpperCase();
    let aSize = Math.round(46 * k);
    ctx.font = `${aSize}px ${FONTS.display}`;
    while (aSize > 30 && ctx.measureText(award).width > INNER - 150) {
      aSize -= 2;
      ctx.font = `${aSize}px ${FONTS.display}`;
    }
    const chipH = aSize * 1.2 + 26;
    rows.push({
      h: chipH, gap: 28,
      draw(y) {
        ctx.font = `${aSize}px ${FONTS.display}`;
        setSpacing(ctx, 1);
        const label = fitText(ctx, award, INNER - 150);
        const tw = ctx.measureText(label).width;
        ctx.font = `13px ${FONTS.pixel}`;
        const lw = ctx.measureText("AWARD").width;
        const chipW = tw + lw + 72;
        ctx.save();
        ctx.translate(PAD + chipW / 2, y + chipH / 2);
        ctx.rotate((-1.5 * Math.PI) / 180);
        ctx.fillStyle = "rgba(0,0,0,.28)";
        ctx.fillRect(-chipW / 2 + 7, -chipH / 2 + 7, chipW, chipH);
        ctx.fillStyle = theme.awardBg;
        ctx.fillRect(-chipW / 2, -chipH / 2, chipW, chipH);
        ctx.fillStyle = theme.awardInk;
        ctx.textBaseline = "middle";
        ctx.fillText("AWARD", -chipW / 2 + 22, 1);
        ctx.font = `${aSize}px ${FONTS.display}`;
        ctx.fillText(label, -chipW / 2 + 22 + lw + 28, 2);
        ctx.restore();
        setSpacing(ctx, 0);
        ctx.textBaseline = "alphabetic";
      }
    });

    const msg = messageFor(d);
    const gSize = Math.round(36 * k), mSize = Math.round(32 * k), mLead = mSize * 1.3;
    ctx.font = `italic 500 ${mSize}px ${FONTS.serif}`;
    const mLines = clampLines(ctx, wrap(ctx, msg.body, INNER), 6, INNER);
    rows.push({
      h: gSize * 1.25 + mLead * mLines.length, gap: 0,
      draw(y) {
        ctx.fillStyle = theme.ink;
        ctx.font = `${gSize}px ${FONTS.hand}`;
        ctx.fillText(msg.greeting, PAD, y + gSize * 0.9);
        ctx.font = `italic 500 ${mSize}px ${FONTS.serif}`;
        mLines.forEach((line, i) => ctx.fillText(line, PAD, y + gSize * 1.25 + mSize * 0.85 + i * mLead));
      }
    });

    return { rows, height: rows.reduce((sum, r) => sum + r.h + r.gap, 0) };
  }

  function drawRows(rows, y) {
    rows.forEach((r) => { r.draw(y); y += r.h + r.gap; });
  }

  function drawTopBar(ctx, theme) {
    ctx.font = `14px ${FONTS.pixel}`;
    setSpacing(ctx, 1);
    ctx.fillStyle = theme.soft;
    ctx.textAlign = "left";
    ctx.fillText("DEBSOC IIEST SHIBPUR", PAD, PAD + 14);
    ctx.textAlign = "right";
    ctx.fillText("VERIFIED ACHIEVEMENT", W - PAD, PAD + 14);
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

  const FOOTER_H = 118;
  function drawFooter(ctx, d, theme) {
    const top = H - PAD - FOOTER_H;
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

    ctx.font = `13px ${FONTS.pixel}`;
    setSpacing(ctx, 1);
    ctx.fillStyle = theme.soft;
    ctx.fillText(fitText(ctx, `@${d.username || "debsoc"}`.toUpperCase(), INNER / 2 - 20), PAD, top + 58);
    ctx.fillText("DEBSOCIIESTS.IN", PAD, top + 88);

    // signature, right aligned: the real one when it loaded, a handwritten fallback otherwise
    ctx.textAlign = "right";
    ctx.fillText(SIGNER.role.toUpperCase(), W - PAD, top + FOOTER_H);
    setSpacing(ctx, 0);
    ctx.textAlign = "left";
    if (signature) {
      // the scan's pen line is thin, so lay it down three times a pixel apart for weight
      const ratio = signature.width / signature.height;
      const sw = Math.min(INNER / 2, 136 * ratio), sh = sw / ratio;
      const ink = tintedSignature(theme.sign), sx = W - PAD - sw, sy = top + FOOTER_H - 24 - sh;
      [[0, 0], [1.4, 0], [0, 1.2]].forEach(([dx, dy]) => ctx.drawImage(ink, sx + dx, sy + dy, sw, sh));
      return;
    }
    ctx.textAlign = "right";
    ctx.save();
    ctx.translate(W - PAD - 6, top + 58);
    ctx.rotate((-4 * Math.PI) / 180);
    ctx.fillStyle = theme.sign;
    ctx.font = `66px ${FONTS.hand}`;
    ctx.fillText(SIGNER.name, 0, 0);
    const sw = ctx.measureText(SIGNER.name).width;
    ctx.strokeStyle = theme.sign;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-sw - 10, 12);
    ctx.bezierCurveTo(-sw * 0.6, 3, -sw * 0.3, 18, 12, 4);
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = "left";
  }

  /* ---------- art layouts ---------- */
  function drawArt(ctx, box, cover, photos, arrange, theme) {
    const { x, y, w, h } = box;
    const n = photos.length;
    const starSize = Math.min(210, Math.max(110, h * 0.36));
    drawStar(ctx, x + w - starSize * 0.78, y - starSize * 0.22, starSize, theme.star);

    if (cover && !n) {
      let cw = w, ch = cw * 0.62;
      if (ch > h) { ch = h; cw = ch / 0.62; }
      drawCoverPhoto(ctx, cover, x + (w - cw) / 2, y + (h - ch) / 2, cw, ch, theme);
    } else if (cover && n === 1) {
      const cw = w * 0.64, ch = Math.min(cw * 0.75, h * 0.86);
      drawCoverPhoto(ctx, cover, x, y + (h - ch) / 2, cw, ch, theme);
      const p = polaroidSize(w * 0.44, h * 0.94);
      drawPolaroid(ctx, photos[0], x + w - p.w / 2 - 6, y + h / 2 + 6, p, 3.5, theme);
    } else if (cover && n === 2 && arrange === "stacked") {
      const cw = w * 0.6, ch = Math.min(cw * 0.75, h * 0.8);
      drawCoverPhoto(ctx, cover, x, y + (h - ch) / 2, cw, ch, theme);
      const p = polaroidSize(w * 0.36, h * 0.53);
      const cx = x + w - p.w / 2 - 14;
      drawPolaroid(ctx, photos[0], cx - 12, y + p.h / 2 + 2, p, -4, theme);
      drawPolaroid(ctx, photos[1], cx + 4, y + h - p.h / 2 - 2, p, 3, theme);
    } else if (cover && n === 2) {
      drawCoverPhoto(ctx, cover, x, y, w, h * 0.56, theme);
      const p = polaroidSize(w * 0.36, h * 0.6);
      const cy = y + h - p.h / 2 - 6;
      drawPolaroid(ctx, photos[0], x + w * 0.3, cy, p, -4, theme);
      drawPolaroid(ctx, photos[1], x + w * 0.7, cy + 6, p, 3, theme);
    } else if (n === 1) {
      const p = polaroidSize(w * 0.62, h);
      drawPolaroid(ctx, photos[0], x + w / 2, y + h / 2, p, -2.5, theme);
    } else if (n === 2 && arrange === "stacked") {
      const p = polaroidSize(w * 0.5, h * 0.66);
      drawPolaroid(ctx, photos[0], x + w * 0.36, y + p.h / 2 + 4, p, -4, theme);
      drawPolaroid(ctx, photos[1], x + w * 0.64, y + h - p.h / 2 - 4, p, 3, theme);
    } else if (n === 2) {
      const p = polaroidSize(w * 0.46, h);
      drawPolaroid(ctx, photos[0], x + w * 0.27, y + h / 2, p, -4, theme);
      drawPolaroid(ctx, photos[1], x + w * 0.73, y + h / 2 + 10, p, 3, theme);
    }
  }

  /* ---------- the card ---------- */
  function renderCard(canvas, d, opts) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";
    ctx.imageSmoothingQuality = "high";
    const theme = (THEMES[opts.theme] || THEMES.mustard)(opts.dot);
    const hasArt = Boolean(opts.cover || opts.photos.length);

    drawBackground(ctx, theme);
    drawTopBar(ctx, theme);

    const footerTop = H - PAD - FOOTER_H;
    const text = buildText(ctx, d, theme, !hasArt);
    const artTop = PAD + 58;

    if (hasArt) {
      const textTop = footerTop - 40 - text.height;
      drawArt(ctx, { x: PAD, y: artTop, w: INNER, h: Math.max(220, textTop - 44 - artTop) },
        opts.cover, opts.photos, opts.arrange, theme);
      drawRows(text.rows, textTop);
    } else {
      // text only: centre the block and let a big starburst hold the corner
      const textTop = Math.max(artTop + 60, artTop + (footerTop - artTop - text.height) / 2);
      drawStar(ctx, W - PAD - 230, artTop - 10, 260, theme.star);
      drawRows(text.rows, textTop);
    }
    drawFooter(ctx, d, theme);
  }

  /* ---------- modal controller ---------- */
  const $ = (id) => document.getElementById(id);
  const state = {
    data: null, theme: "mustard", dot: "yellow", arrange: "side",
    usePfp: true, useCover: true, pfp: null, cover: null, upload: null, token: 0
  };
  let bound = false, returnFocus = null, frame = 0;

  const setStatus = (msg, isError = false) => {
    const el = $("share-status");
    el.textContent = msg || "";
    el.classList.toggle("err", Boolean(isError));
  };

  function currentPhotos() {
    const list = [];
    if (state.usePfp && state.pfp) list.push({ img: state.pfp, caption: `@${state.data.username}` });
    if (state.upload) list.push({ img: state.upload.img, caption: "on the floor" });
    return list;
  }

  function syncControls() {
    const photos = currentPhotos();
    $("share-pfp-row").classList.toggle("hidden", !state.pfp);
    $("share-no-pfp").classList.toggle("hidden", Boolean(state.pfp) || !state.ready);
    $("share-cover-row").classList.toggle("hidden", !state.cover);
    $("share-layout-row").classList.toggle("hidden", photos.length !== 2);
    $("share-dots").classList.toggle("hidden", state.theme !== "black");
    $("share-photo-add").textContent = state.upload ? "Replace photo" : "Add my event photo";
    $("share-photo-edit").classList.toggle("hidden", !state.upload);
    $("share-photo-remove").classList.toggle("hidden", !state.upload);
  }

  function scheduleRender() {
    syncControls();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!state.data) return;
      renderCard($("share-canvas"), state.data, {
        theme: state.theme, dot: state.dot, arrange: state.arrange,
        cover: state.useCover ? state.cover : null, photos: currentPhotos()
      });
    });
  }

  async function takeUpload(file, original) {
    if (!OK_TYPES.includes(file.type)) throw new Error("Use a JPEG, PNG or WebP photo.");
    if (file.size > MAX_UPLOAD) throw new Error("That photo is over 15MB.");
    let edited = file;
    if (window.DebSocEditor) {
      const out = await window.DebSocEditor.edit([file]);
      if (out === null) return;               // cancelled: keep whatever was there
      edited = out[0] || file;
    }
    const img = await fileToImage(edited);
    state.upload = { original: original || file, img };
    setStatus("Photo added. It stays on your device.");
    scheduleRender();
  }

  function cardBlob() {
    return new Promise((resolve, reject) => {
      try {
        $("share-canvas").toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image."))), "image/png");
      } catch {
        reject(new Error("Could not create the image. Try removing the cover photo."));
      }
    });
  }

  const fileName = () => `debsoc-${String(state.data.eventTitle || "award").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "award"}.png`;

  function close() {
    const modal = $("share-modal");
    if (modal.classList.contains("hidden")) return;
    modal.classList.add("hidden");
    document.documentElement.classList.remove("share-open");
    state.token++;
    state.data = null;
    state.upload = null;
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

    modal.querySelectorAll('input[name="share-theme"]').forEach((r) =>
      r.addEventListener("change", () => { state.theme = r.value; scheduleRender(); }));
    modal.querySelectorAll('input[name="share-dot"]').forEach((r) =>
      r.addEventListener("change", () => { state.dot = r.value; scheduleRender(); }));
    modal.querySelectorAll('input[name="share-arrange"]').forEach((r) =>
      r.addEventListener("change", () => { state.arrange = r.value; scheduleRender(); }));
    $("share-use-pfp").addEventListener("change", (e) => { state.usePfp = e.target.checked; scheduleRender(); });
    $("share-use-cover").addEventListener("change", (e) => { state.useCover = e.target.checked; scheduleRender(); });

    const input = $("share-photo-input");
    $("share-photo-add").addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      try { await takeUpload(file); } catch (err) { setStatus(err.message, true); }
    });
    $("share-photo-edit").addEventListener("click", async () => {
      if (!state.upload) return;
      try { await takeUpload(state.upload.original, state.upload.original); } catch (err) { setStatus(err.message, true); }
    });
    $("share-photo-remove").addEventListener("click", () => {
      state.upload = null;
      setStatus("");
      scheduleRender();
    });

    $("share-download").addEventListener("click", async () => {
      try {
        const blob = await cardBlob();
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

    $("share-native").addEventListener("click", async () => {
      try {
        const blob = await cardBlob();
        const file = new File([blob], fileName(), { type: "image/png" });
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
      data, usePfp: true, useCover: true, pfp: null, cover: null, upload: null, ready: false
    });
    $("share-use-pfp").checked = true;
    $("share-use-cover").checked = true;
    $("share-native").classList.toggle("hidden", !canShareFiles());
    $("share-modal").classList.remove("hidden");
    document.documentElement.classList.add("share-open");
    $("share-modal").querySelector("[data-share-close]").focus();
    setStatus("");
    syncControls();
    $("share-busy").classList.remove("hidden");

    const [pfp, cover] = await Promise.all([
      loadRemote(data.profileImage), loadRemote(data.coverImage), loadFonts(), loadSignature()
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

  window.DebSocShareCard = { open, close, render: renderCard, ready: () => Promise.all([loadFonts(), loadSignature()]) };
})();
