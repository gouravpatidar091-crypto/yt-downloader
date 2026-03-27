/* ═══════════════════════════════════════════════════
   YTGrab — script.js
   ═══════════════════════════════════════════════════ */

(function () {
  "use strict";

  // ── DOM refs ────────────────────────────────────────
  const urlInput    = document.getElementById("urlInput");
  const fetchBtn    = document.getElementById("fetchBtn");
  const clearBtn    = document.getElementById("clearBtn");
  const errorMsg    = document.getElementById("errorMsg");
  const searchCard  = document.getElementById("searchCard");
  const resultCard  = document.getElementById("resultCard");
  const thumbnail   = document.getElementById("thumbnail");
  const videoTitle  = document.getElementById("videoTitle");
  const videoAuthor = document.getElementById("videoAuthor");
  const videoDuration = document.getElementById("videoDuration");
  const videoViews  = document.getElementById("videoViews");
  const copyBtn     = document.getElementById("copyBtn");
  const previewBtn  = document.getElementById("previewBtn");
  const previewWrap = document.getElementById("previewWrap");
  const previewFrame = document.getElementById("previewFrame");
  const closePreview = document.getElementById("closePreview");
  const formatsList = document.getElementById("formatsList");
  const filterTabs  = document.getElementById("filterTabs");
  const newSearchBtn = document.getElementById("newSearchBtn");
  const themeToggle = document.getElementById("themeToggle");

  // ── State ───────────────────────────────────────────
  let currentVideoData = null;
  let currentFilter    = "all";
  let copyTimeout      = null;

  // ── Dark mode ───────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem("ytgrab-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ytgrab-theme", theme);
  }

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  initTheme();

  // ── Input helpers ────────────────────────────────────
  urlInput.addEventListener("input", () => {
    clearBtn.hidden = urlInput.value.trim() === "";
    hideError();
  });

  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") fetchVideo();
  });

  clearBtn.addEventListener("click", () => {
    urlInput.value = "";
    clearBtn.hidden = true;
    urlInput.focus();
    hideError();
  });

  // ── Fetch video ──────────────────────────────────────
  fetchBtn.addEventListener("click", fetchVideo);

  async function fetchVideo() {
    const url = urlInput.value.trim();
    if (!url) {
      showError("Please paste a YouTube URL first.");
      urlInput.focus();
      return;
    }

    if (!isYouTubeUrl(url)) {
      showError("That doesn't look like a YouTube URL. Try https://youtube.com/watch?v=...");
      return;
    }

    setLoading(true);
    hideError();
    hideResult();

    try {
      const data = await apiFetch(`/api/info?url=${encodeURIComponent(url)}`);
      currentVideoData = data;
      renderResult(data);
    } catch (err) {
      showError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render result ────────────────────────────────────
  function renderResult(data) {
    thumbnail.src     = data.thumbnail;
    thumbnail.alt     = data.title;
    videoTitle.textContent  = data.title;
    videoAuthor.textContent = data.author;
    videoDuration.textContent = data.duration ? formatDuration(data.duration) : "";
    videoViews.textContent    = data.viewCount
      ? formatNumber(data.viewCount) + " views"
      : "";

    previewFrame.src = "";
    previewWrap.hidden = true;

    renderFormats(data.formats, currentFilter);

    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderFormats(formats, filter) {
    let list = formats;

    if (filter === "video") {
      list = formats.filter((f) => f.hasVideo);
    } else if (filter === "audio") {
      list = formats.filter((f) => !f.hasVideo);
    }

    if (list.length === 0) {
      formatsList.innerHTML =
        `<li style="padding:16px;text-align:center;color:var(--text-3);font-size:.875rem;">
           No formats found for this filter.
         </li>`;
      return;
    }

    formatsList.innerHTML = list
      .map((f, i) => buildFormatItem(f, i))
      .join("");

    // Attach download handlers
    formatsList.querySelectorAll(".dl-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const itag  = btn.dataset.itag;
        const title = currentVideoData?.title || "video";
        const url   = urlInput.value.trim();
        triggerDownload(url, itag, title);
      });
    });
  }

  function buildFormatItem(f, index) {
    const isVideo = f.hasVideo;
    const badgeClass = isVideo ? "badge-video" : "badge-audio";
    const badgeLabel = isVideo ? "VIDEO" : "AUDIO";
    const sizeStr    = f.contentLength ? formatBytes(f.contentLength) : "";
    const container  = (f.container || "?").toUpperCase();

    const audioTag   = (isVideo && f.hasAudio)
      ? `<span class="tag">+Audio</span>`
      : "";

    const animDelay = `animation-delay:${index * 0.04}s`;

    return `
      <li class="format-item" style="${animDelay}">
        <span class="format-badge ${badgeClass}">${badgeLabel}</span>

        <div class="format-info">
          <div class="format-quality">${escapeHtml(f.quality)}</div>
          <div class="format-meta">
            <span>${container}</span>
            ${sizeStr ? `<span>~${sizeStr}</span>` : ""}
          </div>
        </div>

        <div class="format-tags">${audioTag}</div>

        <button class="dl-btn" data-itag="${f.itag}" title="Download ${escapeHtml(f.quality)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </button>
      </li>
    `;
  }

  // ── Download trigger ─────────────────────────────────
  function triggerDownload(url, itag, title) {
    const dlUrl = `/api/download?url=${encodeURIComponent(url)}&itag=${itag}&title=${encodeURIComponent(title)}`;
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ── Filter tabs ──────────────────────────────────────
  filterTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;

    filterTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.filter;

    if (currentVideoData) {
      renderFormats(currentVideoData.formats, currentFilter);
    }
  });

  // ── Copy link ────────────────────────────────────────
  copyBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim() || `https://youtube.com/watch?v=${currentVideoData?.videoId}`;
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.classList.add("copied");
      copyBtn.querySelector("svg").style.display = "none";
      const orig = copyBtn.innerHTML;
      copyBtn.textContent = "✓ Copied!";
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copyBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy link`;
        copyBtn.classList.remove("copied");
      }, 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  });

  // ── Preview ──────────────────────────────────────────
  previewBtn.addEventListener("click", () => {
    if (!currentVideoData?.videoId) return;
    previewFrame.src = `https://www.youtube.com/embed/${currentVideoData.videoId}?autoplay=1`;
    previewWrap.hidden = false;
    previewWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  closePreview.addEventListener("click", () => {
    previewWrap.hidden = true;
    previewFrame.src = "";
  });

  // ── New search ───────────────────────────────────────
  newSearchBtn.addEventListener("click", () => {
    hideResult();
    urlInput.value = "";
    clearBtn.hidden = true;
    currentVideoData = null;
    urlInput.focus();
    searchCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // ── Helpers ──────────────────────────────────────────
  async function apiFetch(endpoint) {
    const res = await fetch(endpoint);
    const data = await res.json().catch(() => ({ error: "Invalid server response." }));
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
    return data;
  }

  function setLoading(state) {
    fetchBtn.disabled = state;
    fetchBtn.classList.toggle("loading", state);
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  }

  function hideError() {
    errorMsg.hidden = true;
    errorMsg.textContent = "";
  }

  function hideResult() {
    resultCard.hidden = true;
  }

  function isYouTubeUrl(url) {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
  }

  function formatDuration(seconds) {
    const s = parseInt(seconds, 10);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function formatNumber(n) {
    const num = parseInt(n, 10);
    if (isNaN(num)) return "";
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
    if (num >= 1_000_000)     return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000)         return (num / 1_000).toFixed(1) + "K";
    return num.toString();
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "";
    const b = parseInt(bytes, 10);
    if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(1) + " GB";
    if (b >= 1_048_576)     return (b / 1_048_576).toFixed(1) + " MB";
    if (b >= 1_024)         return (b / 1_024).toFixed(0) + " KB";
    return b + " B";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
