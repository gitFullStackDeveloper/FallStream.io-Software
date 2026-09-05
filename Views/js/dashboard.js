(function () {
  "use strict";

  // ═══════════════ PERSISTENT LOGIN CHECK (15 days) ═══════════════
  (function checkPersistentLogin() {
    if (sessionStorage.getItem("token")) return; // Already logged in

    const persistentData = localStorage.getItem("persistentLogin");
    if (!persistentData) {
      window.location.replace("/login");
      return;
    }

    try {
      const loginData = JSON.parse(persistentData);

      if (Date.now() > loginData.expiresAt) {
        localStorage.removeItem("persistentLogin");
        sessionStorage.clear();
        window.location.replace("/login");
        return;
      }

      sessionStorage.setItem("token", loginData.token);
      sessionStorage.setItem("user", JSON.stringify(loginData.user));

      loginData.expiresAt = Date.now() + 15 * 24 * 60 * 60 * 1000;
      localStorage.setItem("persistentLogin", JSON.stringify(loginData));
    } catch (e) {
      localStorage.removeItem("persistentLogin");
      window.location.replace("/login");
    }
  })();

  // const API_BASE = 'http://localhost:5000/api';
  const API_BASE = window.location.origin + "/api";

  // ── Tab‑specific storage ────────────────────────────
  function getToken() {
    return sessionStorage.getItem("token");
  }
  function setUser(user) {
    localStorage.setItem("user", JSON.stringify(user));
  }
  function getUser() {
    return JSON.parse(localStorage.getItem("user") || "{}");
  }

  function clearAuth() {
    sessionStorage.clear();
    localStorage.removeItem("user");
    localStorage.removeItem("sidebarCollapsed");
    localStorage.removeItem("persistentLogin");
  }
  async function loadUser() {
    const token = getToken();
    if (!token) {
      window.location.href = "../login.html";
      return;
    }

    try {
      const cached = getUser();
      if (cached.name) applyUserToUI(cached);
    } catch (e) {}

    try {
      const res = await fetch(`${API_BASE}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        doLogout();
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch profile");
      const data = await res.json();
      const serverUser = data.user || data;

      const cached = getUser();
      if (!serverUser.profile_image && cached.profile_image) {
        serverUser.profile_image = cached.profile_image;
      }

      currentUser = serverUser;
      setUser(currentUser);
      applyUserToUI(currentUser);
    } catch (err) {
      console.warn("Profile fetch failed, using cached data");
    }
  }

  // ── Utility ────────────────────────────────────────
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  function formatDuration(seconds) {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function timeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Fetch video blob (with auth) ────────────────────
  async function fetchVideoBlob(recId) {
    const token = getToken();
    const url = `${API_BASE}/recordings/download/${recId}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch (err) {
      console.warn("Thumbnail fetch failed:", err);
      return null;
    }
  }

  // ── Generate thumbnail from blob ─────────────────────
  function generateThumbnailFromBlob(blob, callback) {
    if (!blob) {
      callback(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    video.currentTime = 1;

    video.addEventListener("loadeddata", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        callback(canvas.toDataURL("image/jpeg", 0.7));
      } catch (e) {
        callback(null);
      }
      URL.revokeObjectURL(url);
      video.remove();
    });

    video.addEventListener("error", () => {
      callback(null);
      URL.revokeObjectURL(url);
      video.remove();
    });

    setTimeout(() => {
      if (video.readyState < 2) {
        callback(null);
        URL.revokeObjectURL(url);
        video.remove();
      }
    }, 4000);
  }

  // ── Fetch user recordings ───────────────────────────
  async function fetchUserRecordings() {
    const token = getToken();
    if (!token) {
      window.location.href = "../login.html";
      return [];
    }
    try {
      const res = await fetch(`${API_BASE}/recordings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          clearAuth();
          window.location.href = "../login.html";
        }
        return [];
      }
      return await res.json();
    } catch (error) {
      console.error("Failed to fetch recordings:", error);
      return [];
    }
  }

  // ── Dashboard update ─────────────────────────────────
  async function loadDashboardData() {
    const recordings = await fetchUserRecordings();
    updateStats(recordings);
    updateRecentRecordings(recordings);
    updateActivity(recordings);
  }

  function updateStats(recordings) {
    const total = recordings.length;
    const totalSize = recordings.reduce((sum, r) => sum + (r.size || 0), 0);

    const statRecordings = document.getElementById("statRecordings");
    const statStorage = document.getElementById("statStorage");
    const statLastView = document.getElementById("statLastView");
    const statRating = document.getElementById("statRating");

    if (statRecordings) statRecordings.textContent = total;
    if (statStorage) statStorage.textContent = formatBytes(totalSize);

    if (recordings.length > 0) {
      const sorted = [...recordings].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
      const lastViewDate = sorted[0].createdAt;
      if (statLastView) {
        statLastView.textContent = timeAgo(lastViewDate);
        statLastView.title = new Date(lastViewDate).toLocaleString();
      }
    } else {
      if (statLastView) {
        statLastView.textContent = "Never";
        statLastView.title = "";
      }
    }

    if (statRating) statRating.textContent = "4.9";
  }

  function updateRecentRecordings(recordings) {
    const container = document.getElementById("recentRecordingsGrid");
    if (!container) return;

    console.log("📊 Recordings for dashboard:", recordings.length, recordings); // ADD THIS

    const sorted = [...recordings]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 12);

    if (sorted.length === 0) {
      container.innerHTML = `<div class="rec-card"><div class="rec-thumb"><div class="rec-thumb-placeholder"><i class="fas fa-film"></i></div></div><div class="rec-body"><div class="rec-name">No recordings yet</div></div></div>`;
      return;
    }

    container.innerHTML = sorted
      .map((rec) => {
        const title = escapeHtml(rec.title || "Untitled");
        const dateStr = formatDate(rec.createdAt);
        const sizeStr = rec.size ? formatBytes(rec.size) : "";
        const durationStr = rec.duration ? formatDuration(rec.duration) : "";
        return `
        <div class="rec-card" data-id="${rec._id}">
          <div class="rec-thumb">
            <div class="rec-thumb-placeholder"><i class="fas fa-film"></i></div>
            <span class="rec-dur-badge">${durationStr}</span>
          </div>
          <div class="rec-body">
            <div class="rec-name" title="${title}">${title}</div>
            <div class="rec-meta">
              <span>${dateStr}</span>
              ${sizeStr ? `<span>· ${sizeStr}</span>` : ""}
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    // Generate thumbnails using blob fetch
    container.querySelectorAll(".rec-card").forEach((card) => {
      const thumbDiv = card.querySelector(".rec-thumb");
      const recId = card.dataset.id;
      if (recId) {
        fetchVideoBlob(recId).then((blob) => {
          generateThumbnailFromBlob(blob, (dataUrl) => {
            if (dataUrl) {
              const placeholder = thumbDiv.querySelector(
                ".rec-thumb-placeholder",
              );
              if (placeholder) placeholder.remove();
              const img = document.createElement("img");
              img.src = dataUrl;
              img.style.width = "100%";
              img.style.height = "100%";
              img.style.objectFit = "cover";
              thumbDiv.prepend(img);
            }
          });
        });
      }

      card.addEventListener("click", () => {
        const id = card.dataset.id;
        if (id) window.location.href = `/downloads?id=${id}`;
      });
    });
  }

  function updateActivity(recordings) {
    const container = document.getElementById("activityList");
    if (!container) return;

    if (recordings.length === 0) {
      container.innerHTML = `<div class="activity-item"><span class="activity-dot blue"></span><span class="activity-text">No recent activity</span><span class="activity-time"></span></div>`;
      return;
    }

    const activities = recordings
      .map((rec) => ({
        type: "upload",
        description: `You recorded <b>${escapeHtml(rec.title || "Untitled")}</b>`,
        timestamp: rec.createdAt,
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5);

    container.innerHTML = activities
      .map((act) => {
        return `
        <div class="activity-item">
          <span class="activity-dot blue"></span>
          <span class="activity-text">${act.description}</span>
          <span class="activity-time">${timeAgo(act.timestamp)}</span>
        </div>
      `;
      })
      .join("");
  }

  // ── Logout / UI helpers ─────────────────────────────
  function initQuickLogout() {
    const btn = document.getElementById("quickLogout");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        clearAuth();
        window.location.href = "../login.html";
      });
    }
  }

  async function loadSidebar() {
    try {
      const response = await fetch("../tool/sidebar.html");
      const html = await response.text();
      const container = document.getElementById("sidebar-container");
      if (container) container.innerHTML = html;
      initSidebarToggle();
      highlightActivePage();
      initProfileDropdown();
      initMobileMenu();
    } catch (err) {
      console.error("Sidebar load failed:", err);
    }
  }

  function initSidebarToggle() {
    const sidebar = document.getElementById("sidebar");
    const toggleBtn = document.getElementById("sidebarToggle");
    const mainContent = document.querySelector(".main-content");
    if (!sidebar || !toggleBtn) return;

    if (localStorage.getItem("sidebarCollapsed") === "true") {
      sidebar.classList.add("collapsed");
      mainContent?.classList.add("sidebar-collapsed");
    }

    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      sidebar.classList.toggle("collapsed");
      mainContent?.classList.toggle("sidebar-collapsed");
      localStorage.setItem(
        "sidebarCollapsed",
        sidebar.classList.contains("collapsed"),
      );
    });
  }

  function highlightActivePage() {
    const currentPage = window.location.pathname
      .split("/")
      .pop()
      .replace(".html", "");
    document.querySelectorAll(".nav-item").forEach((item) => {
      const link = item.querySelector("a");
      const href = link?.getAttribute("href") || "";
      item.classList.toggle(
        "active",
        href.includes(currentPage) && currentPage !== "",
      );
    });
  }

  function initProfileDropdown() {
    const dropdown = document.getElementById("profileDropdown");
    if (!dropdown) return;
    dropdown.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("active");
    });
    document.addEventListener("click", () =>
      dropdown.classList.remove("active"),
    );
  }

  function initMobileMenu() {
    const headerLeft = document.querySelector(".header-left");
    const sidebar = document.getElementById("sidebar");
    if (!headerLeft || !sidebar) return;

    const setup = () => {
      const existing = document.querySelector(".mobile-menu-btn");
      if (window.innerWidth <= 768) {
        if (!existing) {
          const btn = document.createElement("button");
          btn.className = "mobile-menu-btn";
          btn.innerHTML = '<i class="fas fa-bars"></i>';
          btn.style.cssText =
            "background:none;border:none;font-size:1.3rem;color:var(--gray-700);margin-right:12px;cursor:pointer;padding:4px;";
          btn.addEventListener("click", () =>
            sidebar.classList.toggle("open-mobile"),
          );
          headerLeft.prepend(btn);
        }
      } else {
        existing?.remove();
        sidebar.classList.remove("open-mobile");
      }
    };
    setup();
    window.addEventListener("resize", setup);
  }

  function loadUserIntoHeader() {
    const user = getUser();
    if (!user.name) return;

    const nameEl = document.getElementById("headerName");
    const avatarEl = document.getElementById("headerAvatar");
    const welcomeEl = document.querySelector(".welcome-msg");

    if (nameEl) nameEl.textContent = user.name;
    if (avatarEl) {
      avatarEl.src = user.profile_image
        ? user.profile_image
        : `https://ui-avatars.com/api/?background=2563eb&color=fff&name=${encodeURIComponent(user.name)}&size=80`;
    }

    if (welcomeEl) {
      const firstName = user.name.split(" ")[0];
      welcomeEl.textContent = `Welcome back, ${firstName} 👋`;
    }
  }

  // ═══════════════ AUTH GUARD + LOGOUT ═══════════════
  (function () {
    const token = sessionStorage.getItem("token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        sessionStorage.clear();
        window.location.replace("/login");
      }
    } catch (e) {
      sessionStorage.clear();
      window.location.replace("/login");
    }
  })();

  function clearAuth() {
    sessionStorage.clear();
    localStorage.removeItem("sidebarCollapsed");
    localStorage.removeItem("persistentLogin");
  }

  function handleLogout() {
    clearAuth();
    window.location.replace("/login");
  }

  document.addEventListener("DOMContentLoaded", function () {
    document
      .getElementById("logoutBtn")
      ?.addEventListener("click", function (e) {
        e.preventDefault();
        handleLogout();
      });
  });

  // ── Boot ───────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    const token = getToken();
    if (!token) {
      window.location.href = "../tool/login.html";
      return;
    }

    loadSidebar();
    loadUserIntoHeader();
    // initLogout();
    initQuickLogout();
    loadDashboardData();
  });
})();

(function () {
  "use strict";

  const API_BASE = window.location.origin + "/api";
  const token = sessionStorage.getItem("token");
  if (!token) {
    window.location.href = "/login";
    return;
  }

  function getUser() {
    return JSON.parse(localStorage.getItem("user") || "{}");
  }
  function formatSize(bytes) {
    if (!bytes) return "0 B";
    if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1024).toFixed(0) + " KB";
  }
  function formatDuration(sec) {
    const h = Math.floor(sec / 3600),
      m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function loadUser() {
    const user = getUser();
    if (user.name) {
      document.getElementById("headerName").textContent = user.name;
      document.getElementById("headerAvatar").src =
        user.profile_image ||
        `https://ui-avatars.com/api/?background=2563eb&color=fff&name=${encodeURIComponent(user.name)}&size=80`;
      document.getElementById("welcomeMsg").textContent =
        `Welcome back, ${user.name.split(" ")[0]} 👋`;
    }
  }
  loadUser();

  // ── Thumbnail helpers (copied from original dashboard.js) ──
  async function fetchVideoBlob(recId) {
    const tok = sessionStorage.getItem("token");
    const url = `${API_BASE}/recordings/download/${recId}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch (err) {
      console.warn("Thumbnail fetch failed:", err);
      return null;
    }
  }

  function generateThumbnailFromBlob(blob, callback) {
    if (!blob) {
      callback(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    video.currentTime = 1;

    video.addEventListener("loadeddata", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        callback(canvas.toDataURL("image/jpeg", 0.7));
      } catch (e) {
        callback(null);
      }
      URL.revokeObjectURL(url);
      video.remove();
    });

    video.addEventListener("error", () => {
      callback(null);
      URL.revokeObjectURL(url);
      video.remove();
    });

    setTimeout(() => {
      if (video.readyState < 2) {
        callback(null);
        URL.revokeObjectURL(url);
        video.remove();
      }
    }, 4000);
  }

  // ── Fetch data & update dashboard ──
  async function loadDashboardData() {
    try {
      const recRes = await fetch(`${API_BASE}/recordings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const recordings = recRes.ok ? await recRes.json() : [];

      const sessRes = await fetch(`${API_BASE}/live/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sessions = sessRes.ok ? await sessRes.json() : [];

      document.getElementById("statRecordings").textContent = recordings.length;
      document.getElementById("statLiveSessions").textContent = sessions.filter(
        (s) => s.status === "live",
      ).length;
      document.getElementById("statScheduled").textContent = sessions.filter(
        (s) => s.status === "scheduled",
      ).length;

      const totalSize = recordings.reduce(
        (acc, rec) => acc + (rec.size || 0),
        0,
      );
      document.getElementById("statStorage").textContent =
        formatSize(totalSize);

      // Render recent recordings (last 6) with thumbnails
      renderRecentRecordings(recordings.slice(0, 12));

      // Render recent activity
      renderRecentActivity(recordings, sessions);
    } catch (err) {
      console.error("Dashboard load error:", err);
    }
  }

  function renderRecentRecordings(recordings) {
    const grid = document.getElementById("recentRecordingsGrid");
    if (!recordings.length) {
      grid.innerHTML = `<div style="text-align:center;padding:2rem;color:#94a3b8;"><i class="fas fa-film" style="font-size:2rem;margin-bottom:0.5rem;display:block;"></i>No recordings yet</div>`;
      return;
    }

    grid.innerHTML = recordings
      .map(
        (rec, idx) => `
        <div class="rec-card" data-id="${rec._id}" style="animation-delay:${idx * 0.08}s">
          <div class="rec-thumb">
            <div class="rec-thumb-placeholder"><i class="fas fa-film"></i></div>
            <div class="rec-play-overlay">
              <i class="fas fa-play-circle"></i>
            </div>
            <span class="rec-dur-badge">${formatDuration(rec.duration || 0)}</span>
          </div>
          <div class="rec-body">
            <div class="rec-name" title="${escapeHtml(rec.title)}">${escapeHtml(rec.title)}</div>
            <div class="rec-meta">
              <span><i class="far fa-calendar-alt"></i>${formatDate(rec.createdAt)}</span>
              <span><i class="fas fa-hdd"></i>${formatSize(rec.size)}</span>
            </div>
          </div>
        </div>
      `,
      )
      .join("");

    // Generate thumbnails
    grid.querySelectorAll(".rec-card").forEach((card) => {
      const thumbDiv = card.querySelector(".rec-thumb");
      const recId = card.dataset.id;
      if (recId) {
        fetchVideoBlob(recId).then((blob) => {
          generateThumbnailFromBlob(blob, (dataUrl) => {
            if (dataUrl) {
              const placeholder = thumbDiv.querySelector(
                ".rec-thumb-placeholder",
              );
              if (placeholder) placeholder.remove();
              const img = document.createElement("img");
              img.src = dataUrl;
              img.style.width = "100%";
              img.style.height = "100%";
              img.style.objectFit = "cover";
              thumbDiv.prepend(img);
            }
          });
        });
      }

      card.addEventListener("click", () => {
        const id = card.dataset.id;
        if (id) window.location.href = `/downloads?id=${id}`;
      });
    });
  }

  function renderRecentActivity(recordings, sessions) {
    const list = document.getElementById("activityList");
    const items = [];

    recordings.slice(0, 2).forEach((rec) => {
      items.push({
        icon: "blue",
        text: `Recording <b>${escapeHtml(rec.title)}</b> saved`,
        time: new Date(rec.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    });

    sessions.slice(0, 2).forEach((s) => {
      const action =
        s.status === "live"
          ? "started"
          : s.status === "scheduled"
            ? "scheduled"
            : "ended";
      items.push({
        icon: s.status === "live" ? "green" : "amber",
        text: `Live session <b>${escapeHtml(s.title)}</b> ${action}`,
        time:
          s.status === "live"
            ? s.startedAt
              ? new Date(s.startedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Now"
            : s.scheduledAt
              ? new Date(s.scheduledAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "",
      });
    });

    items.sort((a, b) => (b.time || "").localeCompare(a.time || ""));

    if (!items.length) {
      list.innerHTML = `<div class="activity-item"><span class="activity-dot blue"></span><span class="activity-text">No recent activity yet. Start recording or create a live session!</span></div>`;
      return;
    }

    list.innerHTML = items
      .map(
        (item) => `
        <div class="activity-item">
          <span class="activity-dot ${item.icon}"></span>
          <span class="activity-text">${item.text}</span>
          <span class="activity-time">${item.time}</span>
        </div>
      `,
      )
      .join("");
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  document.getElementById("logoutBtn")?.addEventListener("click", function (e) {
    e.preventDefault();
    sessionStorage.clear();
    localStorage.removeItem("user");
    localStorage.removeItem("persistentLogin");
    window.location.href = "/login";
  });

  loadDashboardData();
})();
