(function () {
  "use strict";
  // ═══════════════ PERSISTENT LOGIN CHECK (15 days) ═══════════════
  (function checkPersistentLogin() {
    if (sessionStorage.getItem("token")) return;

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

  // const API_BASE = 'http://localhost:5000/api';
  const API_BASE = window.location.origin + "/api";
  let currentUser = {};
  let pendingFile = null;

  // ── Tab‑specific auth helpers ───────────────────────
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
    localStorage.removeItem("persistentLogin");
  }
  // ── DOM references ──────────────────────────────────
  const dom = {
    get alertArea() {
      return document.getElementById("alertArea");
    },
    get toast() {
      return document.getElementById("toast");
    },
    get toastMsg() {
      return document.getElementById("toastMsg");
    },
    get pcardName() {
      return document.getElementById("pcardName");
    },
    get pcardEmail() {
      return document.getElementById("pcardEmail");
    },
    get pcardPhone() {
      return document.getElementById("pcardPhone");
    },
    get pcardPhoneVal() {
      return document.getElementById("pcardPhoneVal");
    },
    get avatarImg() {
      return document.getElementById("avatarImg");
    },
    get avatarInitials() {
      return document.getElementById("avatarInitials");
    },
    get headerName() {
      return document.getElementById("headerName");
    },
    get headerAvatar() {
      return document.getElementById("headerAvatar");
    },
    get fieldName() {
      return document.getElementById("fieldName");
    },
    get fieldEmail() {
      return document.getElementById("fieldEmail");
    },
    get fieldPhone() {
      return document.getElementById("fieldPhone");
    },
    get fieldAddress() {
      return document.getElementById("fieldAddress");
    },
    get fieldBio() {
      return document.getElementById("fieldBio");
    },
    get charCounter() {
      return document.getElementById("charCounter");
    },
    get photoPreviewImg() {
      return document.getElementById("photoPreviewImg");
    },
    get photoPreviewInitials() {
      return document.getElementById("photoPreviewInitials");
    },
    get photoSelectedBadge() {
      return document.getElementById("photoSelectedBadge");
    },
    get photoSelectedName() {
      return document.getElementById("photoSelectedName");
    },
    get btnUploadPhoto() {
      return document.getElementById("btnUploadPhoto");
    },
    get btnClearPhoto() {
      return document.getElementById("btnClearPhoto");
    },
    get imgFileInput() {
      return document.getElementById("imgFileInput");
    },
    get statRecordings() {
      return document.getElementById("statRecordings");
    },
    get statJoined() {
      return document.getElementById("statJoined");
    },
    get infoName() {
      return document.getElementById("infoName");
    },
    get infoEmail() {
      return document.getElementById("infoEmail");
    },
    get infoPhone() {
      return document.getElementById("infoPhone");
    },
    get infoAddress() {
      return document.getElementById("infoAddress");
    },
    get infoPhoto() {
      return document.getElementById("infoPhoto");
    },
    get infoCreated() {
      return document.getElementById("infoCreated");
    },
    get strengthBar() {
      return document.getElementById("strengthBar");
    },
    get strengthLabel() {
      return document.getElementById("strengthLabel");
    },
    get currentPw() {
      return document.getElementById("currentPw");
    },
    get newPw() {
      return document.getElementById("newPw");
    },
    get confirmPw() {
      return document.getElementById("confirmPw");
    },
  };

  // ── Helpers ─────────────────────────────────────────
  function setText(el, text) {
    if (el) el.textContent = text;
  }
  function setVal(el, value) {
    if (el) el.value = value;
  }
  function showToast(msg, isError = false) {
    const t = dom.toast;
    const icon = t?.querySelector("i");
    if (!t || !dom.toastMsg) return;
    dom.toastMsg.textContent = msg;
    if (icon) {
      icon.style.color = isError ? "#ef4444" : "#22c55e";
      icon.className = isError ? "fas fa-times-circle" : "fas fa-check-circle";
    }
    t.classList.remove("hidden");
    setTimeout(() => t.classList.add("hidden"), 3500);
  }
  function showAlert(msg, type = "success") {
    const area = dom.alertArea;
    if (!area) return;
    const icon =
      type === "success" ? "fa-circle-check" : "fa-circle-exclamation";
    area.innerHTML = `
      <div class="alert-box ${type}">
        <i class="fas ${icon}" style="flex-shrink:0;margin-top:2px;"></i>
        <span>${msg}</span>
      </div>`;
    setTimeout(() => {
      area.innerHTML = "";
    }, 5000);
  }
  function getInitials(name) {
    return (
      name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?"
    );
  }
  function setAvatarImage(src) {
    const img = dom.avatarImg;
    const init = dom.avatarInitials;
    if (img) {
      img.src = src;
      img.style.display = "block";
    }
    if (init) init.style.display = "none";
  }
  function setInitials(initials) {
    const img = dom.avatarImg;
    const init = dom.avatarInitials;
    if (img) img.style.display = "none";
    if (init) {
      init.style.display = "flex";
      init.textContent = initials;
    }
  }

  function doLogout() {
    clearAuth();
    window.location.href = "../login.html";
  }

  // ── Load user data from server ──────────────────────
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
  function applyUserToUI(user) {
    currentUser = user;
    const name = user.name || "";
    const email = user.email || "";
    const phone = user.phone || "";
    const address = user.address || "";
    const bio = user.bio || "";
    const initials = getInitials(name);
    const joinDate = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        })
      : "—";

    setText(dom.pcardName, name);
    setText(dom.pcardEmail, email);
    if (phone) {
      setText(dom.pcardPhoneVal, phone);
      dom.pcardPhone?.classList.remove("hidden");
    } else {
      dom.pcardPhone?.classList.add("hidden");
    }

    if (user.profile_image) {
      setAvatarImage(user.profile_image);
    } else {
      setInitials(initials);
    }

    setText(dom.headerName, name);
    if (dom.headerAvatar) {
      dom.headerAvatar.src = user.profile_image
        ? user.profile_image
        : `https://ui-avatars.com/api/?background=2563eb&color=fff&name=${encodeURIComponent(name)}&size=80`;
    }

    setVal(dom.fieldName, name);
    setVal(dom.fieldEmail, email);
    setVal(dom.fieldPhone, phone);
    setVal(dom.fieldAddress, address);
    setVal(dom.fieldBio, bio);
    updateCharCount(bio);

    const ppImg = dom.photoPreviewImg;
    const ppInit = dom.photoPreviewInitials;
    if (user.profile_image && ppImg) {
      ppImg.src = user.profile_image;
      ppImg.style.display = "block";
      if (ppInit) ppInit.style.display = "none";
    } else if (ppInit) {
      ppInit.style.display = "flex";
      if (ppImg) ppImg.style.display = "none";
    }

    setText(dom.infoName, name || "—");
    setText(dom.infoEmail, email || "—");
    setText(dom.infoPhone, phone || "—");
    setText(dom.infoAddress, address || "—");
    setText(dom.infoPhoto, user.profile_image ? "✓ Uploaded" : "Not set");
    setText(dom.infoCreated, joinDate);
    setText(dom.statJoined, joinDate);
  }

  async function loadRecordingCount() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/recordings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const recordings = await res.json();
      setText(dom.statRecordings, recordings.length);
    } catch (e) {
      setText(dom.statRecordings, "—");
    }
  }

  // ── Tab switching ───────────────────────────────────
  window.switchTab = function (name) {
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));
    document
      .querySelectorAll(".vtab")
      .forEach((b) => b.classList.remove("active"));
    document.getElementById("tab-" + name)?.classList.add("active");
    document.getElementById("vtab-" + name)?.classList.add("active");
    document
      .querySelector(".profile-right")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.liveUpdateName = function (val) {
    setText(dom.pcardName, val || currentUser.name || "");
    if (!currentUser.profile_image) {
      const initials = getInitials(val.trim());
      setInitials(initials);
    }
  };
  window.liveUpdatePhone = function (val) {
    if (val.trim()) {
      setText(dom.pcardPhoneVal, val);
      dom.pcardPhone?.classList.remove("hidden");
    } else {
      dom.pcardPhone?.classList.add("hidden");
    }
  };
  window.updateCharCount = function (val) {
    const el = dom.charCounter;
    if (!el) return;
    const len = (val || "").length;
    el.textContent = len + " / 500";
    el.classList.toggle("warn", len > 450);
  };

  window.previewImage = function (input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showAlert("Image too large. Max 2 MB.", "error");
      input.value = "";
      return;
    }
    pendingFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      const ppImg = dom.photoPreviewImg;
      const ppInit = dom.photoPreviewInitials;
      if (ppImg) {
        ppImg.src = url;
        ppImg.style.display = "block";
      }
      if (ppInit) ppInit.style.display = "none";
      setAvatarImage(url);

      const badge = dom.photoSelectedBadge;
      const nameEl = dom.photoSelectedName;
      const uploadBtn = dom.btnUploadPhoto;
      const clearBtn = dom.btnClearPhoto;
      if (badge) {
        badge.classList.add("show");
      }
      if (nameEl) nameEl.textContent = file.name;
      if (uploadBtn) uploadBtn.classList.remove("hidden");
      if (clearBtn) clearBtn.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  };

  window.clearPhotoSelection = function () {
    pendingFile = null;
    const input = dom.imgFileInput;
    if (input) input.value = "";

    const ppImg = dom.photoPreviewImg;
    const ppInit = dom.photoPreviewInitials;
    const badge = dom.photoSelectedBadge;
    const uploadBtn = dom.btnUploadPhoto;
    const clearBtn = dom.btnClearPhoto;

    if (currentUser.profile_image) {
      if (ppImg) {
        ppImg.src = currentUser.profile_image;
        ppImg.style.display = "block";
      }
      if (ppInit) ppInit.style.display = "none";
      setAvatarImage(currentUser.profile_image);
    } else {
      if (ppImg) ppImg.style.display = "none";
      if (ppInit) ppInit.style.display = "flex";
      setInitials(getInitials(currentUser.name || ""));
    }

    if (badge) badge.classList.remove("show");
    if (uploadBtn) uploadBtn.classList.add("hidden");
    if (clearBtn) clearBtn.classList.add("hidden");
  };

  window.uploadPhoto = async function () {
    if (!pendingFile) return;
    const token = getToken();

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64Image = ev.target.result;

      try {
        // Save to server via profile update API
        const res = await fetch(`${API_BASE}/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: currentUser.name,
            email: currentUser.email,
            phone: currentUser.phone || "",
            address: currentUser.address || "",
            bio: currentUser.bio || "",
            profile_image: base64Image, // ← Send image as base64
          }),
        });

        const data = await res.json();

        if (res.ok) {
          currentUser.profile_image = base64Image;
          setUser(currentUser);
          setAvatarImage(base64Image);
          clearPhotoSelection();
          showAlert("Profile photo updated!", "success");
          showToast("Photo uploaded successfully!");
        } else {
          currentUser.profile_image = base64Image;
          setUser(currentUser);
          setAvatarImage(base64Image);
          clearPhotoSelection();
          showToast("Photo saved locally!");
        }
      } catch (e) {
        currentUser.profile_image = base64Image;
        setUser(currentUser);
        setAvatarImage(base64Image);
        clearPhotoSelection();
        showToast("Photo saved locally!");
      }
    };
    reader.readAsDataURL(pendingFile);
  };
  window.saveProfile = async function (e) {
    e.preventDefault();
    const token = getToken();
    const payload = {
      name: dom.fieldName?.value.trim(),
      email: dom.fieldEmail?.value.trim(),
      phone: dom.fieldPhone?.value.trim(),
      address: dom.fieldAddress?.value.trim(),
      bio: dom.fieldBio?.value.trim(),
    };

    try {
      const res = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        const updated = { ...currentUser, ...payload };
        currentUser = updated;
        setUser(updated);
        applyUserToUI(updated);
        showAlert("Profile updated successfully!", "success");
        showToast("Profile saved!");
      } else {
        showAlert(data.message || "Failed to save", "error");
      }
    } catch (e) {
      const updated = { ...currentUser, ...payload };
      currentUser = updated;
      setUser(updated);
      applyUserToUI(updated);
      showToast("Profile saved locally!");
      showAlert("Saved locally (offline mode)", "success");
    }
  };

  window.changePassword = async function (e) {
    e.preventDefault();
    const current = dom.currentPw?.value;
    const newPw = dom.newPw?.value;
    const confirm = dom.confirmPw?.value;

    if (!current || !newPw || !confirm) {
      showAlert("All fields are required", "error");
      return;
    }
    if (newPw.length < 8) {
      showAlert("New password must be at least 8 characters", "error");
      return;
    }
    if (newPw !== confirm) {
      showAlert("Passwords do not match", "error");
      return;
    }

    const token = getToken();
    try {
      const res = await fetch(`${API_BASE}/profile/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: current,
          password: newPw,
          password_confirmation: confirm,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (dom.currentPw) dom.currentPw.value = "";
        if (dom.newPw) dom.newPw.value = "";
        if (dom.confirmPw) dom.confirmPw.value = "";
        if (dom.strengthBar) dom.strengthBar.style.width = "0";
        if (dom.strengthLabel)
          dom.strengthLabel.textContent = "Enter a new password";
        showAlert("Password updated successfully!", "success");
        showToast("Password changed!");
      } else {
        showAlert(data.message || "Failed to update password", "error");
      }
    } catch (e) {
      showAlert("Server unavailable. Please try again.", "error");
    }
  };

  window.togglePw = function (id, btn) {
    const inp = document.getElementById(id);
    const ico = btn.querySelector("i");
    if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
    ico.classList.toggle("fa-eye");
    ico.classList.toggle("fa-eye-slash");
  };

  window.updateStrength = function (val) {
    const bar = dom.strengthBar;
    const lbl = dom.strengthLabel;
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const levels = [
      { w: "0%", color: "transparent", label: "Enter a new password" },
      { w: "25%", color: "#ef4444", label: "⚠ Weak" },
      { w: "50%", color: "#f97316", label: "⚡ Fair" },
      { w: "75%", color: "#38bdf8", label: "✓ Good" },
      { w: "100%", color: "#22c55e", label: "✦ Strong" },
    ];
    const s = val.length === 0 ? levels[0] : levels[score] || levels[1];
    if (bar) {
      bar.style.width = s.w;
      bar.style.background = s.color;
    }
    if (lbl) lbl.textContent = s.label;
  };

  // ── Sidebar loading and toggle initialization ───────
  async function loadSidebar() {
    if (document.getElementById("sidebar")) return;
    try {
      const res = await fetch("../tool/sidebar.html");
      const html = await res.text();
      const container = document.getElementById("sidebar-container");
      if (container) container.innerHTML = html;
      initSidebarToggle();
      highlightActivePage();
      initProfileDropdown();
      initMobileMenu();
    } catch (e) {
      console.error("Sidebar load failed:", e);
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

  function bindEvents() {
    document.getElementById("logoutBtn")?.addEventListener("click", doLogout);
    document.getElementById("logoutVtab")?.addEventListener("click", doLogout);
  }

  // ── Boot ────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    const token = getToken();
    if (!token) {
      window.location.href = "../tool/login.html";
      return;
    }

    loadSidebar();
    bindEvents();
    loadUser();
    loadRecordingCount();
  });

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
})();
