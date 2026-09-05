(function () {
  "use strict";

  if (!sessionStorage.getItem("token")) {
    window.location.replace("/login");
    return;
  }

  const API_BASE = window.location.origin + "/api";
  let allSessions = [];
  let pendingDeleteRoomId = null;

  function getToken() {
    return sessionStorage.getItem("token");
  }
  function getUser() {
    return JSON.parse(localStorage.getItem("user") || "{}");
  }

  // Profile dropdown
  const profileDropdown = document.getElementById("profileDropdown");
  profileDropdown?.addEventListener("click", function (e) {
    e.stopPropagation();
    this.classList.toggle("open");
  });
  document.addEventListener("click", function () {
    profileDropdown?.classList.remove("open");
  });

  // Load user info
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

  document.getElementById("logoutBtn")?.addEventListener("click", function (e) {
    e.preventDefault();
    sessionStorage.clear();
    localStorage.removeItem("user");
    localStorage.removeItem("persistentLogin");
    window.location.href = "../login";
  });

  // Modals
  const createModal = document.getElementById("createModal");
  const editModal = document.getElementById("editModal");
  const deleteConfirmModal = document.getElementById("deleteConfirmModal");
  let editingRoomId = null;

  document
    .getElementById("btnOpenCreateModal")
    .addEventListener("click", () => {
      createModal.classList.add("show");
      document.getElementById("sessTitle").focus();
    });
  document
    .getElementById("btnCancelCreate")
    .addEventListener("click", () => createModal.classList.remove("show"));
  document
    .getElementById("btnCancelEdit")
    .addEventListener("click", () => editModal.classList.remove("show"));
  document
    .getElementById("btnCancelDelete")
    .addEventListener("click", () =>
      deleteConfirmModal.classList.remove("show"),
    );

  [createModal, editModal, deleteConfirmModal].forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("show");
    });
  });

  document.getElementById("sessMode").addEventListener("change", function () {
    document.getElementById("passwordGroup").style.display =
      this.value === "private" ? "block" : "none";
  });
  document.getElementById("editMode").addEventListener("change", function () {
    document.getElementById("editPasswordGroup").style.display =
      this.value === "private" ? "block" : "none";
  });

  // Create session
  document
    .getElementById("btnCreateSession")
    .addEventListener("click", async () => {
      const btn = document.getElementById("btnCreateSession");
      const title = document.getElementById("sessTitle").value.trim();
      if (!title) return showToast("Please enter a title", true);

      setBtnLoading(btn);

      const body = {
        title,
        description: document.getElementById("sessDesc").value,
        mode: document.getElementById("sessMode").value,
        password: document.getElementById("sessPassword").value,
        scheduledAt: document.getElementById("sessStart").value || null,
        scheduledEndAt: document.getElementById("sessEnd").value || null,
        accessCodeCount: 0,
      };

      try {
        const res = await fetch(`${API_BASE}/live/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        createModal.classList.remove("show");
        [
          "sessTitle",
          "sessDesc",
          "sessPassword",
          "sessStart",
          "sessEnd",
        ].forEach((id) => (document.getElementById(id).value = ""));
        document.getElementById("sessMode").value = "public";
        document.getElementById("passwordGroup").style.display = "none";
        showToast(data.message);
        loadSessions();
      } catch (err) {
        showToast(err.message, true);
      } finally {
        resetBtn(btn);
      }
    });

  async function loadSessions() {
    try {
      const res = await fetch(`${API_BASE}/live/sessions`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      allSessions = await res.json();
      updateStats(allSessions);
      filterSessions();
    } catch (err) {
      console.error(err);
    }
  }

  function updateStats(sessions) {
    document.getElementById("statTotal").textContent = sessions.length;
    document.getElementById("statLive").textContent = sessions.filter(
      (s) => s.status === "live",
    ).length;
    document.getElementById("statScheduled").textContent = sessions.filter(
      (s) => s.status === "scheduled",
    ).length;
    document.getElementById("statEnded").textContent = sessions.filter(
      (s) => s.status === "ended",
    ).length;
  }

  function filterSessions() {
    const query = document.getElementById("searchInput").value.toLowerCase();
    const filtered = allSessions.filter((s) =>
      s.title.toLowerCase().includes(query),
    );
    renderSessions(filtered);
  }
  document
    .getElementById("searchInput")
    .addEventListener("input", filterSessions);

  function renderSessions(sessions) {
    const list = document.getElementById("sessionList");
    if (!sessions.length) {
      list.innerHTML = `<div style="text-align:center; padding:4rem 1rem;">
                        <div style="font-size:3rem; color:#cbd5e1; margin-bottom:1rem;"><i class="fas fa-video-slash"></i></div>
                        <h3 style="color:#475569;">No sessions found</h3>
                        <p style="color:#94a3b8; font-size:0.9rem;">Create a new session or adjust your search</p>
                    </div>`;
      return;
    }

    list.innerHTML = sessions
      .map((s) => {
        const status = s.status;
        let dateInfo = "";
        if (status === "scheduled" && s.scheduledAt) {
          const start = new Date(s.scheduledAt).toLocaleString();
          const end = s.scheduledEndAt
            ? new Date(s.scheduledEndAt).toLocaleString()
            : "";
          dateInfo = `<span><i class="far fa-calendar-alt"></i> ${start}${end ? " → " + new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>`;
        } else if (status === "live" && s.startedAt) {
          dateInfo = `<span><i class="far fa-clock"></i> Started ${new Date(s.startedAt).toLocaleString()}</span>`;
        } else if (status === "ended") {
          const start = s.startedAt
            ? new Date(s.startedAt).toLocaleDateString()
            : "?";
          const end = s.endedAt
            ? new Date(s.endedAt).toLocaleDateString()
            : "?";
          dateInfo = `<span><i class="far fa-calendar-check"></i> ${start} — ${end}</span>`;
        }

        return `
                    <div class="session-card">
                        <div class="session-status-dot ${status}"></div>
                        <div class="session-main">
                            <div class="session-title">${esc(s.title)}</div>
                            <div class="session-meta">
                                <span><i class="fas fa-${s.mode === "public" ? "globe" : "lock"}"></i> ${s.mode}</span>
                                ${dateInfo}
                            </div>
                        </div>
                        <div class="session-actions">
                            ${status === "scheduled" ? `<button class="btn btn-green btn-sm" onclick="startScheduled('${s.roomId}')"><i class="fas fa-play"></i> Start</button>` : ""}
                            ${status === "live" ? `<button class="btn btn-primary btn-sm" onclick="joinLive('${s.roomId}')"><i class="fas fa-broadcast-tower"></i> Join</button>` : ""}
                            <button class="btn btn-outline btn-sm" onclick="copyRoomLink('${s.roomId}')"><i class="fas fa-link"></i></button>
                            <div class="actions-cell">
                                <button class="actions-dots" data-room="${s.roomId}"><i class="fas fa-ellipsis-v"></i></button>
                                <div class="actions-dropdown" id="dd-${s.roomId}">
                                    <button onclick="openEditModal('${s.roomId}')"><i class="fas fa-edit"></i> Edit</button>
                                    <button class="delete-btn" onclick="requestDeleteSession('${s.roomId}')"><i class="fas fa-trash-alt"></i> Delete</button>
                                </div>
                            </div>
                        </div>
                    </div>`;
      })
      .join("");

    // Attach three-dot toggles + stacking fix
    document.querySelectorAll(".actions-dots").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const room = btn.dataset.room;
        const dropdown = document.getElementById("dd-" + room);
        const card = btn.closest(".session-card");

        // Close all other dropdowns and reset their cards
        document.querySelectorAll(".actions-dropdown.show").forEach((d) => {
          if (d !== dropdown) {
            d.classList.remove("show");
            d.closest(".session-card")?.classList.remove("has-open-dropdown");
          }
        });

        // Toggle current dropdown
        const isOpen = dropdown.classList.toggle("show");
        if (isOpen) {
          card?.classList.add("has-open-dropdown");
        } else {
          card?.classList.remove("has-open-dropdown");
        }
      });
    });
  }

  window.startScheduled = async function (roomId) {
    await fetch(`${API_BASE}/live/start/${roomId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    loadSessions();
  };

  window.joinLive = function (roomId) {
    window.location.href = `/live-screen?roomId=${roomId}`;
  };

  window.copyRoomLink = function (roomId) {
    const url = `${window.location.origin}/live/${roomId}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => showToast("Link copied!"))
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showToast("Link copied!");
      });
  };
  function setBtnLoading(btn) {
    if (!btn) return;
    btn.classList.add("btn-loading");
  }

  function resetBtn(btn) {
    if (!btn) return;
    btn.classList.remove("btn-loading");
  }
  window.requestDeleteSession = function (roomId) {
    pendingDeleteRoomId = roomId;
    deleteConfirmModal.classList.add("show");
  };

  document
    .getElementById("btnConfirmDelete")
    .addEventListener("click", async () => {
      const btn = document.getElementById("btnConfirmDelete");
      if (!pendingDeleteRoomId) return;
      setBtnLoading(btn);
      try {
        await fetch(`${API_BASE}/live/${pendingDeleteRoomId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        deleteConfirmModal.classList.remove("show");
        showToast("Session deleted", false);
        loadSessions();
      } catch (err) {
        showToast("Error: " + err.message, true);
      } finally {
        resetBtn(btn);
      }
      pendingDeleteRoomId = null;
    });

  window.openEditModal = function (roomId) {
    editingRoomId = roomId;
    const s = allSessions.find((s) => s.roomId === roomId);
    if (!s) return showToast("Session not found", true);
    document.getElementById("editTitle").value = s.title || "";
    document.getElementById("editDesc").value = s.description || "";
    document.getElementById("editMode").value = s.mode || "public";
    document.getElementById("editPassword").value = s.password || "";
    document.getElementById("editPasswordGroup").style.display =
      s.mode === "private" ? "block" : "none";
    document.getElementById("editStart").value = s.scheduledAt
      ? toDatetimeLocal(s.scheduledAt)
      : "";
    document.getElementById("editEnd").value = s.scheduledEndAt
      ? toDatetimeLocal(s.scheduledEndAt)
      : "";
    editModal.classList.add("show");
  };

  document.getElementById("btnSaveEdit").addEventListener("click", async () => {
    const btn = document.getElementById("btnSaveEdit");
    const body = {
      title: document.getElementById("editTitle").value.trim(),
      description: document.getElementById("editDesc").value.trim(),
      mode: document.getElementById("editMode").value,
      password: document.getElementById("editPassword").value,
      scheduledAt: document.getElementById("editStart").value || null,
      scheduledEndAt: document.getElementById("editEnd").value || null,
    };

    setBtnLoading(btn);

    try {
      const res = await fetch(`${API_BASE}/live/update/${editingRoomId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");

      editModal.classList.remove("show");
      showToast("Session updated");
      loadSessions();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      resetBtn(btn);
    }
  });

  function toDatetimeLocal(dateStr) {
    const d = new Date(dateStr);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function showToast(msg, isError = false) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i class="fas ${isError ? "fa-exclamation-circle" : "fa-check-circle"}" style="color:${isError ? "#ef4444" : "#22c55e"}"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // Close dropdowns on outside click & reset card z-index
  document.addEventListener("click", () => {
    document.querySelectorAll(".actions-dropdown.show").forEach((d) => {
      d.classList.remove("show");
      d.closest(".session-card")?.classList.remove("has-open-dropdown");
    });
  });

  loadSessions();
  setInterval(loadSessions, 30000);
})();
