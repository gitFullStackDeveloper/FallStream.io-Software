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

  (function loadUserHeader() {
    try {
      const user = getUser();
      if (user.name) {
        const nameEl = document.getElementById("headerName");
        const avatarEl = document.getElementById("headerAvatar");
        if (nameEl) nameEl.textContent = user.name;
        if (avatarEl)
          avatarEl.src =
            user.profile_image ||
            `https://ui-avatars.com/api/?background=2563eb&color=fff&name=${encodeURIComponent(user.name)}&size=80`;
      }
    } catch (e) {}
  })();

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    clearAuth();
    window.location.href = "../login.html";
  });

  let allRecordings = [];
  let currentRecId = null;
  let deleteTargetId = null;
  let isGridView = true;
  let currentVideoBlobUrl = null;
  let shareRecordingId = null;
  let renameTargetId = null;

  const renameModal = document.getElementById("renameModal");
  const renameInput = document.getElementById("renameInput");
  const btnRenameConfirm = document.getElementById("btnRenameConfirm");
  const btnRenameCancel = document.getElementById("btnRenameCancel");
  const mainPlayer = document.getElementById("mainPlayer");
  const playerIdle = document.getElementById("playerIdle");
  const playerInfoBar = document.getElementById("playerInfoBar");
  const playerTitle = document.getElementById("playerTitle");
  const playerDur = document.getElementById("playerDur");
  const playerDate = document.getElementById("playerDate");
  const playerSize = document.getElementById("playerSize");
  const btnDownload = document.getElementById("btnDownload");
  const btnShare = document.getElementById("btnShare");
  const btnPlayerReset = document.getElementById("btnPlayerDelete");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const btnGrid = document.getElementById("btnGrid");
  const btnList = document.getElementById("btnList");
  const recGrid = document.getElementById("recordingsGrid");
  const recList = document.getElementById("recordingsList");
  const libEmpty = document.getElementById("libEmpty");
  const statCount = document.getElementById("statCount");
  const statTotal = document.getElementById("statTotal");
  const deleteModal = document.getElementById("deleteModal");
  const btnDelConfirm = document.getElementById("btnDelConfirm");
  const btnDelCancel = document.getElementById("btnDelCancel");
  const toastEl = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");

  // ═══════════════ SHARE MODAL ═══════════════
  const shareModal = document.createElement("div");
  shareModal.className = "modal-overlay hidden";
  shareModal.id = "shareModal";
  shareModal.innerHTML = `

  
    <div class="modal-card" style="max-width:480px;">
      <div class="modal-icon blue" ><i class="fas fa-share-alt" ></i></div>
      <h3>Share Video</h3>
      <div id="shareForm">
        <div style="margin-bottom:1.2rem;"><label style="font-weight:600;color:#475569;display:block;margin-bottom:0.5rem;">Link Expiry</label>
          <div style="display:flex;flex-direction:column;gap:0.5rem;">
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.9rem;color:#475569;"><input type="radio" name="shareExpiry" value="0" checked> Never expires</label>
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.9rem;color:#475569;"><input type="radio" name="shareExpiry" value="7"> Expires in 7 days</label>
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.9rem;color:#475569;"><input type="radio" name="shareExpiry" value="30"> Expires in 30 days</label>
          </div>
        </div>
        <div style="margin-bottom:1.5rem;"><label style="font-weight:600;color:#475569;display:block;margin-bottom:0.5rem;">Password (optional)</label>
          <input type="text" id="sharePasswordInput" placeholder="Leave empty for no password" style="width:100%;padding:0.7rem 1rem;border:1.5px solid #e2e8f0;border-radius:10px;font-family:inherit;font-size:0.9rem;outline:none;">
        </div>
        <div style="display:flex;gap:0.8rem;justify-content:flex-end;">
          <button class="modal-btn-outline" id="btnShareCancel">Cancel</button>
          <button class="modal-btn-del btn-hover-slide" id="btnGenerateShare" style="background:#2563eb;color:white;"><i class="fas fa-link"></i> <span style="color:white;">  Generate Link </span> </button>
        </div>
      </div>
      <div id="shareResult" style="display:none;">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;text-align:center;"><i class="fas fa-check-circle" style="color:#22c55e;font-size:2.5rem;margin-bottom:0.5rem;display:block;"></i><p style="color:#065f46;font-weight:700;">Link Generated!</p></div>
        <div style="margin-bottom:1rem;"><label style="font-weight:600;color:#475569;display:block;margin-bottom:0.3rem;">Share URL</label>
          <div style="display:flex;gap:0.5rem;"><input type="text" id="shareUrlInput" readonly style="flex:1;padding:0.6rem;border:1.5px solid #e2e8f0;border-radius:8px;font-family:monospace;font-size:0.78rem;background:#f8fafc;"><button id="btnCopyUrl"  style="padding:0.6rem 1.2rem;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;white-space:nowrap;"><i class="fas fa-copy"></i> <span style="color:white;"> Copy </span></button></div>
        </div>
        <div id="sharePassResult" style="margin-bottom:1rem;display:none;"><label style="font-weight:600;color:#475569;display:block;margin-bottom:0.3rem;">Password</label>
          <div style="display:flex;gap:0.5rem;"><input type="text" id="sharePassResultInput" readonly style="flex:1;padding:0.6rem;border:1.5px solid #e2e8f0;border-radius:8px;font-family:monospace;font-size:0.9rem;background:#f8fafc;"><button id="btnCopyPass"  style="padding:0.6rem 1.2rem;background:#10b981;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;white-space:nowrap;"><i class="fas fa-copy"></i><span style="color:white;"> Copy </span></button></div>
        </div>
        <button class="modal-btn-outline" id="btnShareClose" style="width:100%;">Close</button>
      </div>
    </div>`;
  document.body.appendChild(shareModal);

  document
    .getElementById("btnShareCancel")
    ?.addEventListener("click", () => shareModal.classList.add("hidden"));
  document
    .getElementById("btnShareClose")
    ?.addEventListener("click", () => shareModal.classList.add("hidden"));
  shareModal.addEventListener("click", function (e) {
    if (e.target === shareModal) shareModal.classList.add("hidden");
  });

  document
    .getElementById("btnGenerateShare")
    ?.addEventListener("click", async function () {
      if (!shareRecordingId) {
        showToast("No recording selected", true);
        return;
      }
      const expiry = parseInt(
        document.querySelector('input[name="shareExpiry"]:checked')?.value ||
          "0",
      );
      const password =
        document.getElementById("sharePasswordInput")?.value?.trim() || "";
      const token = getToken();
      if (!token) {
        showToast("Please login again", true);
        return;
      }
      const btn = this;
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
      btn.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/share/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recordingId: shareRecordingId,
            expiryDays: expiry,
            password,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          document.getElementById("shareForm").style.display = "none";
          document.getElementById("shareResult").style.display = "block";
          document.getElementById("shareUrlInput").value = data.shareUrl;
          if (data.password) {
            document.getElementById("sharePassResult").style.display = "block";
            document.getElementById("sharePassResultInput").value =
              data.password;
          } else {
            document.getElementById("sharePassResult").style.display = "none";
          }
          showToast("Share link generated!");
        } else {
          showToast(data.message || "Failed", true);
        }
      } catch (err) {
        showToast("Network error", true);
      } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
      }
    });

  document.addEventListener("click", function (e) {
    const btn = e.target.closest(
      "#btnCopyUrl, #btnCopyPass, .copy-btn-already-shared",
    );
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    let text = "";
    const input = btn.parentElement?.querySelector("input");
    if (input) {
      text = input.value?.trim();
    } else {
      text = btn.getAttribute("data-copy-url")?.trim();
    }

    if (!text) {
      showToast("Nothing to copy!", true);
      return;
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.focus();
    document.execCommand("copy");
    document.body.removeChild(ta);

    showToast("Copied!");
    btn.innerHTML =
      '<i class="fas fa-check"></i> <span style="color:#fff;">Copied!</span>';
    setTimeout(() => {
      btn.innerHTML =
        '<i class="fas fa-copy"></i> <span style="color:#fff;">Copy</span>';
    }, 2000);
  });

  async function shareRecording(rec) {
    shareRecordingId = rec._id;

    const token = getToken();
    if (!token) {
      showToast("Please login again", true);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/share/links`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const links = await res.json();
        const existingLink = Array.isArray(links)
          ? links.find(
              (link) =>
                link.recordingId &&
                (link.recordingId._id === rec._id ||
                  link.recordingId === rec._id) &&
                link.status !== "blocked",
            )
          : null;

        if (existingLink) {
          showAlreadySharedModal(existingLink);
          return;
        }
      }
    } catch (err) {
      console.error("Error checking share links:", err);
    }

    document.getElementById("shareForm").style.display = "block";
    document.getElementById("shareResult").style.display = "none";
    document.getElementById("sharePasswordInput").value = "";
    document.querySelector('input[name="shareExpiry"][value="0"]').checked =
      true;
    shareModal.classList.remove("hidden");
  }

  // ═══════════════ ALREADY SHARED MODAL ═══════════════
  function showAlreadySharedModal(link) {
    // const shareUrl = `http://localhost:5000/share/${link.token}`;
    const shareUrl = `${window.location.origin}/share/${link.token}`;
    const createdDate = new Date(link.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const views = Array.isArray(link.views) ? link.views.length : 0;

    document.getElementById("shareForm").style.display = "none";
    document.getElementById("shareResult").style.display = "block";

    const resultDiv = document.getElementById("shareResult");
    resultDiv.innerHTML = `
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;text-align:center;">
        <i class="fas fa-exclamation-triangle" style="color:#f59e0b;font-size:2rem;margin-bottom:0.5rem;display:block;"></i>
        <p style="color:#92400e;font-weight:700;font-size:0.95rem;">Already Shared!</p>
        <p style="color:#a16207;font-size:0.8rem;margin-top:0.3rem;">This video already has an active share link.</p>
      </div>
      <div style="margin-bottom:0.8rem;">
        <label style="font-weight:600;color:#475569;display:block;margin-bottom:0.3rem;">Existing Share URL</label>
        <div style="display:flex;gap:0.5rem;">
          <input type="text" value="${shareUrl}" readonly style="flex:1;padding:0.6rem;border:1.5px solid #e2e8f0;border-radius:8px;font-family:monospace;font-size:0.78rem;background:#f8fafc;">
          <button  onclick="navigator.clipboard.writeText('${shareUrl}');this.innerHTML='<i class=\\'fas fa-check\\'></i> Copied';setTimeout(()=>this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy',2000)" style="padding:0.6rem 1.2rem;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;white-space:nowrap;">
            <i class="fas fa-copy"></i> <span style="color:white;"> Copy </span>
          </button>
        </div>
      </div>
      <div style="display:flex;gap:0.8rem;margin-bottom:1rem;">
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:0.6rem;text-align:center;">
          <span style="font-size:0.75rem;color:#94a3b8;">Created</span><br>
          <span style="font-weight:600;color:#475569;font-size:0.85rem;">${createdDate}</span>
        </div>
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:0.6rem;text-align:center;">
          <span style="font-size:0.75rem;color:#94a3b8;">Views</span><br>
          <span style="font-weight:600;color:#475569;font-size:0.85rem;">${views}</span>
        </div>
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:0.6rem;text-align:center;">
          <span style="font-size:0.75rem;color:#94a3b8;">Status</span><br>
          <span style="font-weight:600;color:#10b981;font-size:0.85rem;">Active</span>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <a href="/share-analytics" class="btn-hover-slide" style="flex:1;padding:0.6rem;background:#2563eb;color:#fff;border:none;border-radius:8px;text-align:center;text-decoration:none;font-weight:600;font-size:0.85rem;cursor:pointer;">
          <i class="fas fa-chart-bar"></i><span style="color: white;"> View Analytics </span>
        </a>
        <button onclick="document.getElementById('shareModal').classList.add('hidden')" style="flex:1;padding:0.6rem;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.85rem;">
          Close
        </button>
      </div>
    `;

    shareModal.classList.remove("hidden");
  }

  // ═══════════════ UTILITIES ═══════════════
  function formatDur(s) {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  function formatSize(bytes) {
    if (!bytes) return "0 B";
    if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1024).toFixed(0) + " KB";
  }
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  function showToast(msg, isErr) {
    if (!toastEl || !toastMsg) return;
    const icon = toastEl.querySelector("i");
    toastMsg.textContent = msg;
    if (icon) {
      icon.style.color = isErr ? "#ef4444" : "#22c55e";
      icon.className = isErr ? "fas fa-times-circle" : "fas fa-check-circle";
    }
    toastEl.classList.remove("hidden");
    setTimeout(() => toastEl.classList.add("hidden"), 3500);
  }
  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  // ═══════════════ API ═══════════════
  function generateThumbnailFromBlob(blob, cb) {
    const u = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.preload = "metadata";
    v.muted = true;
    v.src = u;
    v.currentTime = 1;
    v.addEventListener("loadeddata", () => {
      try {
        const c = document.createElement("canvas");
        c.width = v.videoWidth || 320;
        c.height = v.videoHeight || 180;
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        cb(c.toDataURL("image/jpeg", 0.7));
      } catch (e) {
        cb(null);
      }
      URL.revokeObjectURL(u);
      v.remove();
    });
    v.addEventListener("error", () => {
      cb(null);
      URL.revokeObjectURL(u);
      v.remove();
    });
    setTimeout(() => {
      if (v.readyState < 2) {
        cb(null);
        URL.revokeObjectURL(u);
        v.remove();
      }
    }, 4000);
  }
  async function loadAllRecordings() {
    const t = getToken();
    if (!t) {
      window.location.href = "../login.html";
      return [];
    }
    try {
      const r = await fetch(`${API_BASE}/recordings`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!r.ok) throw new Error("Failed");
      return await r.json();
    } catch (e) {
      showToast("Could not load recordings", true);
      return [];
    }
  }
  async function deleteFromServer(id) {
    const t = getToken();
    const r = await fetch(`${API_BASE}/recordings/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!r.ok) throw new Error("Delete failed");
  }
  async function renameOnServer(id, title) {
    const t = getToken();
    const r = await fetch(`${API_BASE}/recordings/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({ title }),
    });
    if (!r.ok) throw new Error("Rename failed");
    return await r.json();
  }

  // ═══════════════ IMPORT ═══════════════
  const importModal = document.getElementById("importModal");
  const importFile = document.getElementById("importFile");
  const importTitle = document.getElementById("importTitle");
  const importFileName = document.getElementById("importFileName");
  let importFileData = null;

  document.getElementById("btnImportVideo")?.addEventListener("click", () => {
    importFileData = null;
    importTitle.value = "";
    importFileName.textContent = "";
    importFileName.style.display = "none";
    importFile.value = "";
    importModal.classList.remove("hidden");
  });
  document
    .getElementById("btnImportCancel")
    ?.addEventListener("click", () => importModal.classList.add("hidden"));
  importModal?.addEventListener("click", (e) => {
    if (e.target === importModal) importModal.classList.add("hidden");
  });

  window.handleImportFileSelect = function (input) {
    const f = input.files[0];
    if (!f) return;
    if (f.size > 524288000) {
      showToast("File must be less than 500MB", true);
      input.value = "";
      return;
    }
    importFileData = f;
    importFileName.textContent =
      "📁 " + f.name + " (" + formatSize(f.size) + ")";
    importFileName.style.display = "block";
    if (!importTitle.value) importTitle.value = f.name.replace(/\.[^/.]+$/, "");
  };

  const dropZone = document.getElementById("importDropZone");
  dropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#3b82f6";
    dropZone.style.background = "#f8fafc";
  });
  dropZone?.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "#e2e8f0";
    dropZone.style.background = "transparent";
  });
  dropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#e2e8f0";
    dropZone.style.background = "transparent";
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("video/")) {
      importFile.files = e.dataTransfer.files;
      handleImportFileSelect(importFile);
    }
  });

  document
    .getElementById("btnImportConfirm")
    ?.addEventListener("click", async () => {
      if (!importFileData) {
        showToast("Please select a video file", true);
        return;
      }
      const title =
        importTitle.value.trim() ||
        importFileData.name.replace(/\.[^/.]+$/, "");
      const t = getToken();
      const fd = new FormData();
      fd.append("video", importFileData);
      const btn = document.getElementById("btnImportConfirm");
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
      try {
        const r = await fetch(
          `${API_BASE}/recordings?title=${encodeURIComponent(title)}&duration=0`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${t}` },
            body: fd,
          },
        );
        if (r.ok) {
          importModal.classList.add("hidden");
          showToast("Video imported!");
          allRecordings = await loadAllRecordings();
          updateCredits();
          renderAll();
        } else {
          const d = await r.json();
          showToast(d.message || "Import failed", true);
        }
      } catch (er) {
        showToast("Network error", true);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-upload"></i> Import Video';
      }
    });

  // ═══════════════ CREDITS ═══════════════
  function updateCredits() {
    const t = allRecordings.length;
    const ts = allRecordings.reduce((a, r) => a + (r.size || 0), 0);
    const td = allRecordings.reduce((a, r) => a + (r.duration || 0), 0);
    document.getElementById("creditTotal").textContent = t;
    document.getElementById("creditStorage").textContent = formatSize(ts);
    const h = Math.floor(td / 3600),
      m = Math.floor((td % 3600) / 60);
    document.getElementById("creditDuration").textContent =
      h > 0 ? h + "h " + m + "m" : m + "m";
    fetchSharedCount();
  }
  async function fetchSharedCount() {
    try {
      const t = getToken();
      const r = await fetch(`${API_BASE}/share/links`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (r.ok) {
        const l = await r.json();
        document.getElementById("creditShared").textContent = Array.isArray(l)
          ? l.length
          : 0;
      }
    } catch (e) {
      document.getElementById("creditShared").textContent = "0";
    }
  }

  // ═══════════════ FILTER & RENDER ═══════════════
  function getFiltered() {
    const q = searchInput?.value.trim().toLowerCase() || "";
    let r = q
      ? allRecordings.filter((r) => r.title.toLowerCase().includes(q))
      : [...allRecordings];
    const s = sortSelect?.value || "newest";
    if (s === "newest")
      r.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (s === "oldest")
      r.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (s === "name") r.sort((a, b) => a.title.localeCompare(b.title));
    if (s === "size") r.sort((a, b) => b.size - a.size);
    return r;
  }
  function updateStats(recs) {
    const t = recs.reduce((a, r) => a + (r.size || 0), 0);
    if (statCount)
      statCount.textContent = `${recs.length} recording${recs.length !== 1 ? "s" : ""}`;
    if (statTotal) statTotal.textContent = formatSize(t) + " total";
  }
  function renderAll() {
    const recs = getFiltered();
    updateStats(recs);
    if (!recs.length) {
      libEmpty?.classList.remove("hidden");
      recGrid.innerHTML = "";
      recList.innerHTML = "";
      return;
    }
    libEmpty?.classList.add("hidden");
    renderGrid(recs);
    renderList(recs);
  }
  function attachThumbnail(container, recId) {
    fetchVideoBlob(recId)
      .then((blob) => {
        generateThumbnailFromBlob(blob, (dataUrl) => {
          if (dataUrl) {
            const p = container.querySelector(
              ".rec-thumb-placeholder, i.fa-film",
            );
            if (p) p.remove();
            const img = document.createElement("img");
            img.src = dataUrl;
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
            container.prepend(img);
          }
        });
      })
      .catch(() => {});
  }
  function renderGrid(recs) {
    if (!recGrid) return;
    recGrid.innerHTML = "";
    recs.forEach((rec, i) => {
      const c = document.createElement("div");
      c.className = `rec-card${rec._id === currentRecId ? " playing" : ""}`;
      c.style.animationDelay = `${i * 0.04}s`;
      c.dataset.id = rec._id;
      c.innerHTML = `<div class="rec-thumb"><div class="rec-thumb-placeholder"><i class="fas fa-film"></i></div><span class="rec-dur-badge">${formatDur(rec.duration || 0)}</span><div class="rec-play-overlay"><i class="fas fa-play"></i></div></div><div class="rec-body"><div class="rec-name" title="${escapeHtml(rec.title)}">${escapeHtml(rec.title)}</div><div class="rec-meta"><span>${formatDate(rec.createdAt)}</span><span>·</span><span>${formatSize(rec.size)}</span></div></div><div class="rec-card-foot"><button class="rca-play-btn"><i class="fas fa-play"></i> Play</button><div class="card-more-wrap"><button class="card-more-btn" title="More"><i class="fas fa-ellipsis-v"></i></button><div class="card-dropdown"><button class="cdrop-card-item dd-dl"><i class="fas fa-download"></i> Download</button><button class="cdrop-card-item dd-share"><i class="fas fa-share-alt"></i> Share link</button><button class="cdrop-card-item dd-rename"><i class="fas fa-pen"></i> Rename</button><div class="cdrop-card-divider"></div><button class="cdrop-card-item cdrop-del dd-del"><i class="fas fa-trash"></i> Delete</button></div></div></div>`;
      const td = c.querySelector(".rec-thumb");
      attachThumbnail(td, rec._id);
      c.querySelector(".rca-play-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        playRecording(rec);
      });
      c.querySelector(".rec-play-overlay").addEventListener("click", (e) => {
        e.stopPropagation();
        playRecording(rec);
      });
      const mb = c.querySelector(".card-more-btn"),
        dd = c.querySelector(".card-dropdown");
      mb.addEventListener("click", (e) => {
        e.stopPropagation();
        document
          .querySelectorAll(".card-dropdown.open, .rli-dropdown.open")
          .forEach((d) => {
            if (d !== dd) d.classList.remove("open");
          });
        dd.classList.toggle("open");
      });
      dd.addEventListener("click", (e) => e.stopPropagation());
      c.querySelector(".dd-dl").addEventListener("click", () => {
        dd.classList.remove("open");
        downloadRecording(rec);
      });
      c.querySelector(".dd-share").addEventListener("click", () => {
        dd.classList.remove("open");
        shareRecording(rec);
      });
      c.querySelector(".dd-rename").addEventListener("click", () => {
        dd.classList.remove("open");
        openRenameModal(rec);
      });
      c.querySelector(".dd-del").addEventListener("click", () => {
        dd.classList.remove("open");
        openDeleteModal(rec._id);
      });
      recGrid.appendChild(c);
    });
  }
  function renderList(recs) {
    if (!recList) return;
    recList.innerHTML = "";
    recs.forEach((rec, i) => {
      const it = document.createElement("div");
      it.className = `rec-list-item${rec._id === currentRecId ? " playing" : ""}`;
      it.style.animationDelay = `${i * 0.03}s`;
      it.dataset.id = rec._id;
      it.innerHTML = `<div class="rli-thumb"><i class="fas fa-film"></i><div class="rli-play-ov"><i class="fas fa-play"></i></div></div><div class="rli-info"><div class="rli-name" title="${escapeHtml(rec.title)}">${escapeHtml(rec.title)}</div><div class="rli-meta">${formatDate(rec.createdAt)} · ${formatDur(rec.duration || 0)} · ${formatSize(rec.size)}</div></div><div class="rli-actions"><button class="rli-btn rli-play-btn" title="Play"><i class="fas fa-play"></i></button><button class="rli-btn rli-dl-btn" title="Download"><i class="fas fa-download"></i></button><div class="rli-more-wrap"><button class="rli-btn rli-more-btn" title="More"><i class="fas fa-ellipsis-v"></i></button><div class="rli-dropdown"><button class="cdrop-card-item rli-share"><i class="fas fa-share-alt"></i> Share link</button><button class="cdrop-card-item rli-rename"><i class="fas fa-pen"></i> Rename</button><div class="cdrop-card-divider"></div><button class="cdrop-card-item cdrop-del rli-del"><i class="fas fa-trash"></i> Delete</button></div></div></div>`;
      const td = it.querySelector(".rli-thumb");
      attachThumbnail(td, rec._id);
      it.querySelector(".rli-play-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        playRecording(rec);
      });
      it.querySelector(".rli-dl-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        downloadRecording(rec);
      });
      const mb = it.querySelector(".rli-more-btn"),
        dd = it.querySelector(".rli-dropdown");
      mb.addEventListener("click", (e) => {
        e.stopPropagation();
        document
          .querySelectorAll(".card-dropdown.open, .rli-dropdown.open")
          .forEach((d) => {
            if (d !== dd) d.classList.remove("open");
          });
        dd.classList.toggle("open");
      });
      dd.addEventListener("click", (e) => e.stopPropagation());
      it.querySelector(".rli-share").addEventListener("click", () => {
        dd.classList.remove("open");
        shareRecording(rec);
      });
      it.querySelector(".rli-rename").addEventListener("click", () => {
        dd.classList.remove("open");
        openRenameModal(rec);
      });
      it.querySelector(".rli-del").addEventListener("click", () => {
        dd.classList.remove("open");
        openDeleteModal(rec._id);
      });
      it.addEventListener("click", () => playRecording(rec));
      recList.appendChild(it);
    });
  }

  function resetPlayer() {
    if (mainPlayer) {
      mainPlayer.pause();
      if (currentVideoBlobUrl) {
        URL.revokeObjectURL(currentVideoBlobUrl);
        currentVideoBlobUrl = null;
      }
      mainPlayer.src = "";
      mainPlayer.style.display = "none";
    }
    if (playerIdle) playerIdle.style.display = "flex";
    if (playerInfoBar) playerInfoBar.style.display = "none";
    currentRecId = null;
    document
      .querySelectorAll(".rec-card, .rec-list-item")
      .forEach((el) => el.classList.remove("playing"));
  }

  async function fetchVideoBlob(recId) {
    const t = getToken();
    const url = `${API_BASE}/recordings/download/${recId}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.blob();
  }

  async function playRecording(rec) {
    showToast("Loading video...", false);
    try {
      const blob = await fetchVideoBlob(rec._id);
      if (blob.size === 0) throw new Error("Video file is empty (0 bytes)");
      if (currentVideoBlobUrl) URL.revokeObjectURL(currentVideoBlobUrl);
      currentVideoBlobUrl = URL.createObjectURL(blob);
      mainPlayer.src = currentVideoBlobUrl;
      mainPlayer.style.display = "block";
      playerIdle.style.display = "none";
      currentRecId = rec._id;
      playerTitle.textContent = rec.title || "Untitled";
      playerDur.innerHTML = `<i class="fas fa-clock"></i> ${formatDur(rec.duration || 0)}`;
      playerDate.innerHTML = `<i class="fas fa-calendar"></i> ${formatDate(rec.createdAt)}`;
      playerSize.innerHTML = `<i class="fas fa-hdd"></i> ${formatSize(rec.size)}`;
      playerInfoBar.style.display = "flex";
      document
        .querySelector(".player-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (btnDownload) btnDownload.onclick = () => downloadRecording(rec);
      if (btnShare) btnShare.onclick = () => shareRecording(rec);
      if (btnPlayerReset) {
        btnPlayerReset.onclick = () => resetPlayer();
        btnPlayerReset.innerHTML = '<i class="fas fa-times"></i> Reset';
      }
      document.querySelectorAll(".rec-card, .rec-list-item").forEach((el) => {
        el.classList.toggle("playing", el.dataset.id === rec._id);
      });
      try {
        await mainPlayer.play();
        showToast("Now playing", false);
      } catch (playErr) {
        showToast("Click play button to start", false);
      }
    } catch (err) {
      showToast("Could not load video: " + err.message, true);
      resetPlayer();
    }
  }

  async function downloadRecording(rec) {
    try {
      showToast(`Downloading "${rec.title}"...`, false);
      const token = getToken();
      if (!token) {
        showToast("Please login again", true);
        return;
      }
      const response = await fetch(
        `${API_BASE}/recordings/download/${rec._id}`,
        { method: "GET", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${rec.title}.webm`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      showToast(`"${rec.title}" downloaded!`, false);
    } catch (err) {
      showToast("Download failed. Please try again.", true);
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

  function openDeleteModal(id) {
    deleteTargetId = id;
    deleteModal.classList.remove("hidden");
  }
  function openRenameModal(rec) {
    renameTargetId = rec._id;
    renameInput.value = rec.title;
    renameModal.classList.remove("hidden");
    renameInput.focus();
    renameInput.select();
  }

  btnDelCancel?.addEventListener("click", () => {
    deleteModal.classList.add("hidden");
    deleteTargetId = null;
  });
  btnDelConfirm?.addEventListener("click", async () => {
    if (!deleteTargetId) return;

    // Show spinner
    const btnText = btnDelConfirm.querySelector(".btn-text");
    const btnSpinner = btnDelConfirm.querySelector(".btn-spinner");
    if (btnText) btnText.style.display = "none";
    if (btnSpinner) btnSpinner.style.display = "inline";
    btnDelConfirm.disabled = true;

    try {
      await deleteFromServer(deleteTargetId);
      allRecordings = allRecordings.filter((r) => r._id !== deleteTargetId);
      if (currentRecId === deleteTargetId) resetPlayer();
      deleteModal.classList.add("hidden");
      deleteTargetId = null;
      updateCredits();
      renderAll();
      showToast("Recording deleted");
    } catch {
      showToast("Failed to delete", true);
    } finally {
      // Reset button
      if (btnText) btnText.style.display = "inline";
      if (btnSpinner) btnSpinner.style.display = "none";
      btnDelConfirm.disabled = false;
    }
  });
  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) {
      deleteModal.classList.add("hidden");
      deleteTargetId = null;
    }
  });
  btnRenameCancel?.addEventListener("click", () => {
    renameModal.classList.add("hidden");
    renameTargetId = null;
  });
  btnRenameConfirm?.addEventListener("click", async () => {
    if (!renameTargetId) return;
    const t = renameInput.value.trim();
    if (!t) {
      showToast("Name cannot be empty", true);
      return;
    }

    // Show spinner
    const btnText = btnRenameConfirm.querySelector(".btn-text");
    const btnSpinner = btnRenameConfirm.querySelector(".btn-spinner");
    if (btnText) btnText.style.display = "none";
    if (btnSpinner) btnSpinner.style.display = "inline";
    btnRenameConfirm.disabled = true;

    try {
      const u = await renameOnServer(renameTargetId, t);
      const i = allRecordings.findIndex((r) => r._id === renameTargetId);
      if (i !== -1) allRecordings[i].title = u.title;
      if (currentRecId === renameTargetId && playerTitle)
        playerTitle.textContent = u.title;
      renameModal.classList.add("hidden");
      renameTargetId = null;
      renderAll();
      showToast("Recording renamed");
    } catch {
      showToast("Failed to rename", true);
    } finally {
      if (btnText) btnText.style.display = "inline";
      if (btnSpinner) btnSpinner.style.display = "none";
      btnRenameConfirm.disabled = false;
    }
  });
  renameModal?.addEventListener("click", (e) => {
    if (e.target === renameModal) {
      renameModal.classList.add("hidden");
      renameTargetId = null;
    }
  });
  renameInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnRenameConfirm.click();
    }
  });

  // ═══ View Toggle - Grid ═══
  document.getElementById("btnGrid")?.addEventListener("click", function () {
    isGridView = true;
    document
      .querySelectorAll(".segment-btn")
      .forEach((b) => b.classList.remove("active"));
    this.classList.add("active");
    if (recGrid) recGrid.classList.remove("hidden");
    if (recList) recList.classList.add("hidden");
  });

  // ═══ View Toggle - List ═══
  document.getElementById("btnList")?.addEventListener("click", function () {
    isGridView = false;
    document
      .querySelectorAll(".segment-btn")
      .forEach((b) => b.classList.remove("active"));
    this.classList.add("active");
    if (recList) recList.classList.remove("hidden");
    if (recGrid) recGrid.classList.add("hidden");
  });

  searchInput?.addEventListener("input", renderAll);
  document.addEventListener("click", () => {
    document
      .querySelectorAll(".card-dropdown.open, .rli-dropdown.open")
      .forEach((d) => d.classList.remove("open"));
  });
  sortSelect?.addEventListener("change", renderAll);

  // ═══════════════ SORT CHIPS HANDLING ═══════════════
  const sortChips = document.querySelectorAll(".sort-chip");
  sortChips.forEach((chip) => {
    chip.addEventListener("click", function () {
      sortChips.forEach((c) => c.classList.remove("active"));
      this.classList.add("active");
      const sortVal = this.dataset.sort;
      if (sortSelect) sortSelect.value = sortVal;
      renderAll();
    });
  });

  // Apply button
  document.getElementById("applyFilterBtn")?.addEventListener("click", () => {
    renderAll();
    showToast("Filters applied!", false);
  });

  // Reset button
  document.getElementById("resetFilterBtn")?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (sortSelect) sortSelect.value = "newest";
    sortChips.forEach((c) => c.classList.remove("active"));
    const newestChip = document.querySelector('.sort-chip[data-sort="newest"]');
    if (newestChip) newestChip.classList.add("active");
    isGridView = true;
    document
      .querySelectorAll(".segment-btn")
      .forEach((b) => b.classList.remove("active"));
    document.getElementById("btnGrid")?.classList.add("active");
    if (recGrid) recGrid.classList.remove("hidden");
    if (recList) recList.classList.add("hidden");
    renderAll();
    showToast("Filters reset!", false);
  });

  async function autoPlayFromUrl() {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("id");
    if (id && allRecordings.length) {
      const rec = allRecordings.find((r) => r._id === id);
      if (rec) {
        await playRecording(rec);
        document
          .querySelector(".player-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  (async function init() {
    const t = getToken();
    if (!t) {
      window.location.href = "../tool/login.html";
      return;
    }
    try {
      allRecordings = await loadAllRecordings();
      updateCredits();
      renderAll();
      await autoPlayFromUrl();
    } catch {
      libEmpty?.classList.remove("hidden");
    }
  })();
})();
