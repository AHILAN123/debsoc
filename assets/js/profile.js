const API_BASE = "/api";
// For Vercel deployment with same-origin API routing:
// const API_BASE = "/api";
localStorage.removeItem("debsoc_token");

const apiFetch = (url, options = {}) => window.DebSoc.apiFetch(url, options);

const escapeHTML = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const initials = (name) => String(name || "DebSoc")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0])
  .join("")
  .toUpperCase();

const formatDate = (value) => value
  ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  : "Date unavailable";

const setStatus = (message) => {
  const status = document.getElementById("profile-status");
  status.textContent = message;
  status.classList.remove("hidden");
  document.getElementById("profile-content").classList.add("hidden");
};

const setupProfileNavigation = () => {
  const myProfileLink = document.getElementById("my-profile-link");
  const showMine = (viewer) => {
    if (viewer?.username) {
      myProfileLink.href = `profile.html?u=${encodeURIComponent(viewer.username)}`;
      myProfileLink.classList.remove("hidden");
    } else {
      myProfileLink.classList.add("hidden");
    }
  };
  // Stored user paints first; the server-verified session then confirms or removes it.
  showMine(window.DebSoc.getStoredUser());
  window.DebSoc.getSession().then((viewer) => {
    showMine(viewer);
    if (!viewer && window.DebSoc.sessionExpired()) {
      const notice = document.getElementById("session-notice");
      if (notice) notice.classList.remove("hidden");
    }
  });

  const searchInput = document.getElementById("profile-search-input");
  const suggestions = document.getElementById("member-suggest");
  let suggestTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(suggestTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) return;
    suggestTimer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/users?q=${encodeURIComponent(q)}&limit=8`);
        if (!response.ok) return;
        const { users } = await response.json();
        suggestions.innerHTML = (users || [])
          .map((user) => `<option value="${escapeHTML(user.username)}">${escapeHTML(user.displayName)}</option>`)
          .join("");
      } catch { /* suggestions are optional */ }
    }, 250);
  });

  document.getElementById("profile-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = searchInput.value.trim();
    if (!username) return;
    try {
      const response = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}`);
      if (response.ok) {
        window.location.href = `profile.html?u=${encodeURIComponent(username)}`;
        return;
      }
    } catch { /* fall through to the directory search */ }
    window.location.href = `members.html?q=${encodeURIComponent(username)}`;
  });
};

const THEME_KEY = "debsoc_profile_theme";

const setupThemeToggle = () => {
  const toggle = document.getElementById("theme-toggle");
  const root = document.documentElement;
  const render = () => toggle.setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
  render();
  toggle.addEventListener("click", () => {
    const dark = root.dataset.theme !== "dark";
    if (dark) root.dataset.theme = "dark";
    else delete root.dataset.theme;
    try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch {}
    render();
  });
};

const setEditStatus = (message, isError = false) => {
  const status = document.getElementById("profile-edit-status");
  status.textContent = message;
  status.className = isError ? "err" : "ok";
};

const FIELD_IDS = {
  displayName: "edit-display-name",
  spotifyLink: "edit-spotify-link",
  bio: "edit-bio",
  socialLinks: "edit-social-links",
  profileImage: "edit-profile-image-file",
  bannerImage: "edit-banner-image-file"
};

const SERVER_FIELD_MESSAGES = {
  displayName: "Display name must be 2 to 100 characters.",
  spotifyLink: "Enter a full Spotify link starting with https://",
  bio: "Biography is too long (2000 characters max).",
  socialLinks: "Each social link needs a name and a full https:// link (20 max)."
};

const clearFieldErrors = () => {
  document.querySelectorAll("#profile-edit-form .ferr").forEach((el) => el.remove());
  document.querySelectorAll("#profile-edit-form [aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
};

const setFieldError = (key, message) => {
  const input = document.getElementById(FIELD_IDS[key]);
  if (!input) return false;
  input.setAttribute("aria-invalid", "true");
  const error = document.createElement("span");
  error.className = "ferr";
  error.setAttribute("role", "alert");
  error.textContent = message;
  input.insertAdjacentElement("afterend", error);
  return true;
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const parseSocialLines = (text) => text
  .split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf("|");
    return separator < 0
      ? { label: "Link", url: line }
      : { label: line.slice(0, separator).trim(), url: line.slice(separator + 1).trim() };
  });

// Returns { fieldKey: message } for everything wrong, so every problem shows next to its own field.
const validateEditForm = (socialLinks) => {
  const errors = {};
  const name = document.getElementById("edit-display-name").value.trim();
  if (name.length < 2 || name.length > 100) errors.displayName = SERVER_FIELD_MESSAGES.displayName;

  const spotify = document.getElementById("edit-spotify-link").value.trim();
  if (spotify && !isHttpUrl(spotify)) errors.spotifyLink = SERVER_FIELD_MESSAGES.spotifyLink;

  if (document.getElementById("edit-bio").value.trim().length > 2000) errors.bio = SERVER_FIELD_MESSAGES.bio;

  if (socialLinks.length > 20) {
    errors.socialLinks = "You can add at most 20 links.";
  } else {
    const bad = socialLinks.findIndex(({ label, url }) =>
      !label || label.length > 40 || !isHttpUrl(url));
    if (bad >= 0) {
      errors.socialLinks = `Line ${bad + 1}: use "Name | https://link" (name up to 40 characters, link must start with http:// or https://).`;
    }
  }

  [["profileImage", "Profile image"], ["bannerImage", "Banner image"]].forEach(([key, label]) => {
    const file = document.getElementById(FIELD_IDS[key])?.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) errors[key] = `${label} must be JPEG, PNG or WebP.`;
    else if (file.size > 5 * 1024 * 1024) errors[key] = `${label} must be 5MB or smaller.`;
  });
  return errors;
};

const isSessionError = (response, data) =>
  response.status === 401 || (response.status === 403 && /expired/i.test(data?.error || ""));

const handleSessionExpired = () => {
  window.DebSoc.clearSession();
  const notice = document.getElementById("session-notice");
  if (notice) notice.classList.remove("hidden");
  const error = new Error("Session expired, log in again.");
  error.sessionExpired = true;
  return error;
};

const setRedeemStatus = (message, isError = false) => {
  const status = document.getElementById("redeem-status");
  status.textContent = message;
  status.className = isError ? "err" : "ok";
};

const fillEditForm = (profile) => {
  document.getElementById("edit-display-name").value = profile.displayName || "";
  document.getElementById("edit-spotify-link").value = profile.spotifyLink || "";
  document.getElementById("edit-bio").value = profile.bio || "";
  document.getElementById("edit-social-links").value = (Array.isArray(profile.socialLinks) ? profile.socialLinks : [])
    .map(({ label, url }) => `${label || "Link"} | ${url || ""}`).join("\n");
};

// Share card: owner only. Everything on the card comes from the profile API response;
// the card is drawn in the browser (assets/js/share-card.js) and nothing is sent back.
let shareProfile = null;
const enableShareButtons = (profile) => {
  shareProfile = profile;
  if (!window.DebSocShareCard) return;
  const list = document.getElementById("achievement-list");
  list.querySelectorAll(".award-row[data-index]").forEach((row) => {
    if (row.querySelector(".share-btn")) return;
    const achievement = profile.achievements[Number(row.dataset.index)];
    if (!achievement) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn share-btn";
    button.dataset.shareIndex = row.dataset.index;
    button.textContent = "Share";
    button.setAttribute("aria-label", `Share ${achievement.position || "achievement"}`);
    row.appendChild(button);
  });
  // Fetch the card's logos, stickers and fonts in the background now, so the dialog opens
  // instantly and a flaky connection does not catch it mid-download.
  if (profile.achievements.length && window.DebSocShareCard.preload) {
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 1200)))(() => window.DebSocShareCard.preload().catch(() => {}));
  }
  if (list.dataset.shareBound === "true") return;
  list.dataset.shareBound = "true";
  list.addEventListener("click", (event) => {
    const button = event.target.closest(".share-btn");
    if (!button || !shareProfile) return;
    const achievement = shareProfile.achievements[Number(button.dataset.shareIndex)];
    if (!achievement) return;
    const source = achievement.event || achievement.history || {};
    window.DebSocShareCard.open({
      award: achievement.position || "Recognition",
      eventTitle: source.title || "DebSoc event",
      eventDate: source.eventDate || achievement.awardedAt,
      location: source.location || "IIEST Shibpur",
      coverImage: source.coverImage || "",
      displayName: shareProfile.displayName,
      username: shareProfile.username,
      profileImage: shareProfile.profileImage || ""
    }, button);
  });
};

const setupSelfEditing = (profile, viewer) => {
  // viewer comes from the server-verified session (/api/auth/me), not raw localStorage.
  if (!viewer || String(viewer.username).toLowerCase() !== String(profile.username).toLowerCase()) return;

  const editButton = document.getElementById("edit-profile-btn");
  const editForm = document.getElementById("profile-edit-form");
  const redeemSection = document.getElementById("redeem-section");
  const redeemForm = document.getElementById("redeem-form");
  editButton.classList.remove("hidden");
  redeemSection.classList.remove("hidden");
  // Visibility only; the admin API still enforces the role server-side.
  if (viewer.role === "ADMIN") document.getElementById("admin-dashboard-link").classList.remove("hidden");
  fillEditForm(profile);
  enableShareButtons(profile);
  if (editButton.dataset.bound === "true") return;
  editButton.dataset.bound = "true";
  editButton.addEventListener("click", () => editForm.classList.toggle("hidden"));
  document.getElementById("cancel-profile-edit").addEventListener("click", () => editForm.classList.add("hidden"));
  redeemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const codeInput = document.getElementById("redeem-code");
    const code = codeInput.value.trim();
    try {
      const response = await apiFetch(`${API_BASE}/achievements/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not redeem code.");
      setRedeemStatus("Achievement unlocked successfully.");
      codeInput.value = "";
      await loadProfile();
    } catch (error) {
      setRedeemStatus(error.message, true);
    }
  });
  const bannerImageInput = document.getElementById("edit-banner-image-file");
  const bannerEditorModal = document.getElementById("banner-editor-modal");
  const bannerEditorImage = document.getElementById("banner-editor-image");

  let bannerCropper = null;
  let croppedBannerBlob = null;

  bannerImageInput?.addEventListener("change", () => {
    const file = bannerImageInput.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setEditStatus("Banner image must be 5MB or smaller.", true);
      bannerImageInput.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      bannerEditorImage.src = reader.result;

      bannerEditorModal.classList.remove("hidden");
      bannerEditorModal.classList.add("flex");

      if (bannerCropper) {
        bannerCropper.destroy();
      }

      bannerCropper = new Cropper(bannerEditorImage, {
        aspectRatio: 1600 / 500,
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 1,
        responsive: true,
        background: false
      });
    };

    reader.readAsDataURL(file);
  });
  document.getElementById("banner-editor-cancel")?.addEventListener("click", () => {
    bannerCropper?.destroy();
    bannerCropper = null;
    croppedBannerBlob = null;

    bannerEditorModal.classList.add("hidden");
    bannerEditorModal.classList.remove("flex");

    bannerImageInput.value = "";
  });

  document.getElementById("banner-zoom-in")?.addEventListener("click", () => {
    bannerCropper?.zoom(0.1);
  });

  document.getElementById("banner-zoom-out")?.addEventListener("click", () => {
    bannerCropper?.zoom(-0.1);
  });

  document.getElementById("banner-reset")?.addEventListener("click", () => {
    bannerCropper?.reset();
  });

  document.getElementById("banner-editor-apply")?.addEventListener("click", () => {
    if (!bannerCropper) return;

    bannerCropper.getCroppedCanvas({
      width: 1600,
      height: 500,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high"
    }).toBlob((blob) => {
      croppedBannerBlob = blob;

      bannerEditorModal.classList.add("hidden");
      bannerEditorModal.classList.remove("flex");

      bannerCropper.destroy();
      bannerCropper = null;

      setEditStatus("Banner crop applied.");
    }, "image/webp", 0.9);
  });
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors();
    const statusEl = document.getElementById("profile-edit-status");
    statusEl.textContent = "";
    statusEl.classList.add("hidden");

    const socialLinks = parseSocialLines(document.getElementById("edit-social-links").value);
    const problems = validateEditForm(socialLinks);
    const problemKeys = Object.keys(problems);
    if (problemKeys.length) {
      problemKeys.forEach((key) => setFieldError(key, problems[key]));
      setEditStatus("Fix the highlighted fields and save again.", true);
      document.getElementById(FIELD_IDS[problemKeys[0]])?.focus();
      return;
    }

    const saveButton = editForm.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    try {
      const response = await apiFetch(`${API_BASE}/users/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: document.getElementById("edit-display-name").value.trim(),
          spotifyLink: document.getElementById("edit-spotify-link").value.trim() || null,
          bio: document.getElementById("edit-bio").value.trim() || null,
          socialLinks
        })
      });
      const data = await response.json().catch(() => ({}));
      if (isSessionError(response, data)) throw handleSessionExpired();
      if (!response.ok) {
        if (Array.isArray(data.errors) && data.errors.length) {
          const error = new Error("Fix the highlighted fields and save again.");
          error.fieldErrors = {};
          data.errors.forEach((item) => {
            const key = String(item.path || item.param || "").split(/[.\[]/)[0];
            if (FIELD_IDS[key]) error.fieldErrors[key] = SERVER_FIELD_MESSAGES[key] || item.msg || "Invalid value.";
          });
          throw error;
        }
        throw new Error(data.error || "Profile update failed.");
      }
      localStorage.setItem("debsoc_user", JSON.stringify(data.user));

      const profileImageInput = document.getElementById("edit-profile-image-file");
      const profileImageFile = profileImageInput?.files?.[0];
      if (profileImageFile) {
        const formData = new FormData();
        formData.append("profileImage", profileImageFile);
        const uploadResponse = await apiFetch(`${API_BASE}/users/me/profile-image`, { method: "POST", body: formData });
        const uploadData = await uploadResponse.json().catch(() => ({}));
        if (isSessionError(uploadResponse, uploadData)) throw handleSessionExpired();
        if (!uploadResponse.ok) {
          const error = new Error(uploadData.error || "Profile image upload failed.");
          error.fieldErrors = { profileImage: error.message };
          throw error;
        }
        localStorage.setItem("debsoc_user", JSON.stringify(uploadData.user));
        profileImageInput.value = "";
      }

      const bannerImageInput = document.getElementById("edit-banner-image-file");
      if (bannerImageInput?.files?.[0]) {
        if (!croppedBannerBlob) {
          const error = new Error("Apply the banner crop before saving.");
          error.fieldErrors = { bannerImage: "Choose the banner again and press Apply in the crop window." };
          throw error;
        }
        const formData = new FormData();
        formData.append("bannerImage", croppedBannerBlob, "banner.webp");
        const uploadResponse = await apiFetch(`${API_BASE}/users/me/banner-image`, { method: "POST", body: formData });
        const uploadData = await uploadResponse.json().catch(() => ({}));
        if (isSessionError(uploadResponse, uploadData)) throw handleSessionExpired();
        if (!uploadResponse.ok) {
          const error = new Error(uploadData.error || "Banner image upload failed.");
          error.fieldErrors = { bannerImage: error.message };
          throw error;
        }
        localStorage.setItem("debsoc_user", JSON.stringify(uploadData.user));
        bannerImageInput.value = "";
        croppedBannerBlob = null;
      }

      setEditStatus("Profile updated.");
      editForm.classList.add("hidden");
      await loadProfile();
    } catch (error) {
      if (error.fieldErrors) {
        Object.entries(error.fieldErrors).forEach(([key, message]) => setFieldError(key, message));
        const first = Object.keys(error.fieldErrors)[0];
        document.getElementById(FIELD_IDS[first])?.focus();
      }
      setEditStatus(error.message, true);
    } finally {
      saveButton.disabled = false;
    }
  });
};

const loadProfile = async () => {
  const username = new URLSearchParams(window.location.search).get("u");
  if (!username) {
    setStatus("No username was provided.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}`);
    const profile = await response.json();
    if (!response.ok) throw new Error(profile.error || "Profile could not be loaded.");

    document.title = `${profile.displayName} | DebSoc IIEST Shibpur`;
    document.getElementById("profile-status").classList.add("hidden");
    document.getElementById("profile-content").classList.remove("hidden");
    document.getElementById("profile-name").textContent = profile.displayName;
    document.getElementById("profile-username").textContent = `@${profile.username}`;
    document.getElementById("profile-role").textContent = profile.role === "USER" ? "DebSoc member" : profile.role;
    document.getElementById("profile-bio").textContent = profile.bio || "No biography has been added yet.";
    document.getElementById("achievement-count").textContent = profile.achievements.length;
    document.getElementById("registration-count").textContent = profile._count.registrations;

    const avatar = document.getElementById("profile-avatar");
    if (profile.profileImage) {
      avatar.className = "avatar -mt-14 rounded-full";
      avatar.innerHTML = `<img class="h-full w-full rounded-full object-cover" src="${escapeHTML(profile.profileImage)}" alt="${escapeHTML(profile.displayName)}">`;
    } else {
      avatar.textContent = initials(profile.displayName);
    }

    if (profile.bannerImage) {
      document.getElementById("profile-banner").style.backgroundImage = `url("${profile.bannerImage.replaceAll('"', '')}")`;
    }

    if (profile.spotifyLink) {
      const spotify = document.getElementById("spotify-link");
      spotify.href = profile.spotifyLink;
      spotify.classList.remove("hidden");
    }

    const socialLinks = document.getElementById("social-links");
    const links = Array.isArray(profile.socialLinks) ? profile.socialLinks : [];
    socialLinks.innerHTML = links.map(({ label, url }) => {
      const safeUrl = typeof url === "string" && /^https?:\/\//i.test(url) ? url : "";
      if (!safeUrl) return "";
      const safeLabel = escapeHTML(label || "Link");
      return `<a class="rounded border border-[#e8b84b]/60 px-3 py-2 text-xs text-[#e8b84b] hover:bg-white/10" href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
    }).join("");
    window.DebSoc.getSession().then((viewer) => setupSelfEditing(profile, viewer));

    const list = document.getElementById("achievement-list");
    list.innerHTML = profile.achievements.length
      ? profile.achievements.map((achievement, index) => {
        const source = achievement.event || achievement.history;
        return `<article class="award-row rounded-r-lg bg-white p-4 shadow-sm" data-index="${index}">
            <p class="font-serif-title text-lg text-[#6b0f1a]">${escapeHTML(achievement.position)}</p>
            <p class="mt-1 text-sm text-[#5c3a30]">${escapeHTML(source?.title || "DebSoc achievement")}</p>
            <p class="mt-2 font-mono text-[11px] uppercase tracking-wider text-[#9a6f22]">Awarded ${formatDate(achievement.awardedAt)}</p>
          </article>`;
      }).join("")
      : `<p class="rounded-lg bg-white p-5 text-sm text-[#5c3a30]">No verified achievements yet.</p>`;
  } catch (error) {
    setStatus(error.message);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  setupThemeToggle();
  setupProfileNavigation();
  loadProfile();
});
