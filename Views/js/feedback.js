(function () {
  "use strict";
  // ═══════════════ PERSISTENT LOGIN CHECK (15 days) ═══════════════
  (function checkPersistentLogin() {
    // First check session (current tab session)
    if (sessionStorage.getItem("token")) return; // Already logged in

    // Check persistent login from localStorage
    const persistentData = localStorage.getItem("persistentLogin");
    if (!persistentData) {
      window.location.replace("/login");
      return;
    }

    try {
      const loginData = JSON.parse(persistentData);

      // Check if expired (15 days)
      if (Date.now() > loginData.expiresAt) {
        // Expired - clear and redirect to login
        localStorage.removeItem("persistentLogin");
        sessionStorage.clear();
        window.location.replace("/login");
        return;
      }

      // Still valid - restore session
      sessionStorage.setItem("token", loginData.token);
      sessionStorage.setItem("user", JSON.stringify(loginData.user));

      // Refresh the expiry (extend for another 15 days from now)
      loginData.expiresAt = Date.now() + 15 * 24 * 60 * 60 * 1000;
      localStorage.setItem("persistentLogin", JSON.stringify(loginData));
    } catch (e) {
      localStorage.removeItem("persistentLogin");
      window.location.replace("/login");
    }
  })();

  ///////////////////////////////////////////////////////////////

  // ─── Helper: get token from sessionStorage ────
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
    localStorage.removeItem("user"); // ← ADD THIS
    localStorage.removeItem("sidebarCollapsed");
  }
  async function loadUser() {
    const token = getToken();
    if (!token) {
      window.location.href = "../login.html";
      return;
    }

    // Load cached data FIRST (from localStorage - has image)
    try {
      const cached = getUser();
      if (cached.name) applyUserToUI(cached);
    } catch (e) {}

    // Then fetch from server (merge with cached image)
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

      // Keep the cached profile_image if server doesn't have one
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

  // ─── Sidebar loading (same method as dashboard.js) ───
  async function loadSidebar() {
    try {
      const response = await fetch("../tool/sidebar.html");
      const html = await response.text();
      const container = document.getElementById("sidebar-container");
      if (container) container.innerHTML = html;
      initSidebarToggle();
      highlightActivePage();
    } catch (err) {
      console.error("Sidebar load failed:", err);
    }
  }

  function initSidebarToggle() {
    const sidebar = document.getElementById("sidebar");
    const toggleBtn = document.getElementById("sidebarToggle");
    const mainContent = document.querySelector(".main-content");
    if (!sidebar || !toggleBtn) return;

    // respect saved collapsed state
    if (localStorage.getItem("sidebarCollapsed") === "true") {
      sidebar.classList.add("collapsed");
      mainContent?.classList.add("sidebar-collapsed");
    }

    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      mainContent?.classList.toggle("sidebar-collapsed");
      localStorage.setItem(
        "sidebarCollapsed",
        sidebar.classList.contains("collapsed"),
      );
    });
  }

  function highlightActivePage() {
    // feedback page → nav item with data-page="feedback"
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active");
      if (item.getAttribute("data-page") === "feedback") {
        item.classList.add("active");
      }
    });
  }

  // ─── User info in header (from API or session) ────
  async function loadUserInfo() {
    // Try to fill from sessionStorage first (dashboard stores it after login)
    const user = getUser();
    if (user.name) {
      updateHeaderUI(user);
    }

    // Always try to refresh from server
    const token = getToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }
    try {
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const serverUser = data.user;
        // Update sessionStorage for consistency
        localStorage.setItem("user", JSON.stringify(serverUser));
        updateHeaderUI(serverUser);
      } else if (res.status === 401) {
        clearAuth();
        window.location.href = "/login";
      }
    } catch (e) {
      console.warn("Could not refresh user from server");
    }
  }

  function updateHeaderUI(user) {
    const nameEl = document.getElementById("headerName");
    const avatarEl = document.getElementById("headerAvatar");
    const welcomeEl = document.getElementById("welcomeMessage");

    if (nameEl) nameEl.textContent = user.name;
    if (avatarEl) {
      avatarEl.src = user.profile_image
        ? user.profile_image
        : `https://ui-avatars.com/api/?background=2563eb&color=fff&name=${encodeURIComponent(user.name)}`;
    }
    if (welcomeEl) {
      const firstName = user.name.split(" ")[0];
      welcomeEl.textContent = `Welcome back, ${firstName} 👋`;
    }
  }

  // ─── Profile dropdown & logout ────
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

  // ═══════════════ AUTH GUARD + LOGOUT ═══════════════
  (function () {
    const token = sessionStorage.getItem("token");

    // Check if logged in
    if (!token) {
      window.location.replace("/login");
      return;
    }

    // Verify token expiry
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
  }

  // ═══════════════ AUTH GUARD + LOGOUT ═══════════════
  (function () {
    const token = sessionStorage.getItem("token");

    // Check if logged in
    if (!token) {
      window.location.replace("/login");
      return;
    }

    // Verify token expiry
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

  // Logout handler - prevents back button access
  function handleLogout() {
    clearAuth();
    // replace() prevents the page from being in browser history
    window.location.replace("/login");
  }

  // Attach logout to all logout buttons
  document.addEventListener("DOMContentLoaded", function () {
    document
      .getElementById("logoutBtn")
      ?.addEventListener("click", function (e) {
        e.preventDefault();
        handleLogout();
      });
  });

  // ─── Feedback form submission ────
  function initFeedbackForm() {
    const form = document.getElementById("feedbackForm");
    const alertDiv = document.getElementById("alertContainer");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = document.getElementById("feedbackMsg").value.trim();
      if (!message) return;

      const submitBtn = form.querySelector(".submit-btn");
      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Submitting...';

      try {
        const token = getToken();
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message }),
        });
        const data = await res.json();
        if (res.ok) {
          alertDiv.innerHTML =
            '<div class="alert alert-success">Thank you! Your feedback has been submitted.</div>';
          document.getElementById("feedbackMsg").value = "";
        } else {
          alertDiv.innerHTML = `<div class="alert alert-error">${data.message}</div>`;
        }
      } catch (err) {
        alertDiv.innerHTML =
          '<div class="alert alert-error">Network error. Please try again.</div>';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML =
          '<i class="fas fa-paper-plane"></i> Submit Feedback';
      }
    });
  }

  // ─── Boot ────
  document.addEventListener("DOMContentLoaded", () => {
    const token = getToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }
    loadSidebar();
    loadUserInfo();
    initProfileDropdown();
    initLogout();
    initFeedbackForm();
  });
})();
