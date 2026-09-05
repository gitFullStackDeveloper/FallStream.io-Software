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

//    const API_BASE = 'http://localhost:5000/api';
const API_BASE = window.location.origin + "/api";

const token = sessionStorage.getItem("token");

if (!token) window.location.href = "/login";

let pendingAction = null;
let pendingLinkId = null;

// Load user header (dashboard.js already does this, but keep as fallback)
setTimeout(() => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (user.name) {
      const nameEl = document.getElementById("headerName");
      const avatarEl = document.getElementById("headerAvatar");
      if ((nameEl && !nameEl.textContent) || nameEl.textContent === "User") {
        nameEl.textContent = user.name;
      }
      if (avatarEl) {
        avatarEl.src =
          user.profile_image ||
          `https://ui-avatars.com/api/?background=2563eb&color=fff&name=${encodeURIComponent(user.name)}&size=80`;
      }
    }
  } catch (e) {}
}, 300);

// Logout - handles dynamically loaded sidebar
document.addEventListener("click", function (e) {
  if (e.target.closest("#logoutBtn")) {
    e.preventDefault();
    sessionStorage.clear();
    window.location.href = "/login";
  }
});

// Close action dropdowns when clicking outside
document.addEventListener("click", () => {
  document
    .querySelectorAll(".actions-dropdown.show")
    .forEach((d) => d.classList.remove("show"));
});

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showToast(msg, isError = false) {
  const toast = document.getElementById("toast");
  const icon = toast.querySelector("i");
  document.getElementById("toastMsg").textContent = msg;
  icon.style.color = isError ? "#ef4444" : "#22c55e";
  icon.className = isError ? "fas fa-times-circle" : "fas fa-check-circle";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function copyToClipboard(text, btn) {
  // Try Electron IPC first
  if (window.electronAPI && window.electronAPI.copyToClipboard) {
    window.electronAPI.copyToClipboard(text).then(() => {
      showToast("Link copied!");
      updateCopyBtn(btn);
    });
    return;
  }

  // Fallback for all environments
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  ta.focus();
  document.execCommand("copy");
  document.body.removeChild(ta);
  showToast("Link copied!");
  updateCopyBtn(btn);
}

function updateCopyBtn(btn) {
  if (!btn) return;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
  btn.style.background = "#10b981";
  setTimeout(() => {
    btn.innerHTML = origHTML;
    btn.style.background = "#3b82f6";
  }, 2000);
}
function toggleCard(card) {
  card.classList.toggle("open");
}

function toggleActions(e, linkId) {
  e.stopPropagation();
  document.querySelectorAll(".actions-dropdown.show").forEach((d) => {
    if (d.id !== "dropdown-" + linkId) d.classList.remove("show");
  });
  document.getElementById("dropdown-" + linkId).classList.toggle("show");
}

// Modal
function openModal(
  title,
  message,
  iconBg,
  iconClass,
  btnText,
  btnClass,
  callback,
) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMessage").textContent = message;
  document.getElementById("modalIcon").style.background = iconBg;
  document.getElementById("modalIcon").innerHTML =
    `<i class="${iconClass}"></i>`;
  const confirmBtn = document.getElementById("modalConfirmBtn");
  confirmBtn.textContent = btnText;
  confirmBtn.className = "modal-btn " + btnClass;
  pendingAction = callback;
  document.getElementById("confirmModal").classList.add("show");
}

function closeModal() {
  document.getElementById("confirmModal").classList.remove("show");
  pendingAction = null;
  pendingLinkId = null;
}

document.getElementById("confirmModal").addEventListener("click", function (e) {
  if (e.target === this) closeModal();
});

document
  .getElementById("modalConfirmBtn")
  .addEventListener("click", function () {
    if (pendingAction) pendingAction();
    closeModal();
  });

// Delete share link
async function deleteShareLink(linkId) {
  try {
    const res = await fetch(`${API_BASE}/share/links/${linkId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      showToast("Share link deleted!");
      loadAnalytics();
    } else {
      const data = await res.json();
      showToast(data.message || "Failed to delete", true);
    }
  } catch (err) {
    showToast("Network error", true);
  }
}

function confirmDelete(linkId) {
  openModal(
    "Delete Share Link",
    "This will remove the share link. Viewers will no longer be able to access this video. The recording will still be available in your downloads.",
    "#ef4444",
    "fas fa-trash-alt",
    "Delete",
    "modal-btn-danger",
    () => deleteShareLink(linkId),
  );
}

// Block/Unblock share link
async function toggleBlockLink(linkId, currentStatus) {
  const newStatus = currentStatus === "blocked" ? "active" : "blocked";
  try {
    const res = await fetch(`${API_BASE}/share/links/${linkId}/block`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      showToast(
        newStatus === "blocked"
          ? "Share link blocked!"
          : "Share link unblocked!",
      );
      loadAnalytics();
    } else {
      const data = await res.json();
      showToast(data.message || "Failed to update", true);
    }
  } catch (err) {
    showToast("Network error", true);
  }
}

function confirmBlock(linkId, currentStatus) {
  const isBlocked = currentStatus === "blocked";
  openModal(
    isBlocked ? "Unblock Share Link" : "Block Share Link",
    isBlocked
      ? "This will allow viewers to access this video again."
      : "This will prevent viewers from accessing this video until you unblock it.",
    "#f97316",
    isBlocked ? "fas fa-unlock" : "fas fa-ban",
    isBlocked ? "Unblock" : "Block",
    isBlocked ? "modal-btn-primary" : "modal-btn-danger",
    () => toggleBlockLink(linkId, currentStatus),
  );
}

async function loadAnalytics() {
  const shareList = document.getElementById("shareList");
  const emptyState = document.getElementById("emptyState");

  try {
    const res = await fetch(`${API_BASE}/share/links`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to fetch");

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      shareList.innerHTML = "";
      emptyState.style.display = "block";
      document.getElementById("totalLinks").textContent = "0";
      document.getElementById("totalViews").textContent = "0";
      document.getElementById("protectedLinks").textContent = "0";
      document.getElementById("blockedLinks").textContent = "0";
      return;
    }

    emptyState.style.display = "none";

    // Update stats
    const totalLinks = data.length;
    const totalViews = data.reduce(
      (sum, link) => sum + (Array.isArray(link.views) ? link.views.length : 0),
      0,
    );
    const protectedLinks = data.filter((link) => link.password).length;
    const blockedLinks = data.filter(
      (link) => link.status === "blocked",
    ).length;

    document.getElementById("totalLinks").textContent = totalLinks;
    document.getElementById("totalViews").textContent = totalViews;
    document.getElementById("protectedLinks").textContent = protectedLinks;
    document.getElementById("blockedLinks").textContent = blockedLinks;

    shareList.innerHTML = data
      .map((link) => {
        const views = Array.isArray(link.views) ? link.views : [];
        // const shareUrl = `http://localhost:5000/share/${link.token}`;
        const shareUrl = `http://localhost:5000/share/${link.token}`;
        const isExpired =
          link.expiresAt && new Date(link.expiresAt) < new Date();
        const isBlocked = link.status === "blocked";
        const createdAt = new Date(link.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        const createdAtTime = new Date(link.createdAt).toLocaleTimeString(
          "en-US",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        );

        let statusBadge = "";
        if (isBlocked) {
          statusBadge =
            '<span class="status-badge status-blocked">Blocked</span>';
        } else if (isExpired) {
          statusBadge =
            '<span class="status-badge status-expired">Expired</span>';
        } else {
          statusBadge =
            '<span class="status-badge status-active">Active</span>';
        }

        return `
                <div class="share-card ${isBlocked ? "blocked" : ""}" id="card-${link._id}">
                    <div class="share-card-header" onclick="toggleCard(this.parentElement)">
                        <div class="share-card-icon">
                            <i class="fas fa-video"></i>
                        </div>
                        <div class="share-card-info">
                            <div class="share-card-title">${escapeHtml(link.recordingId?.title || "Untitled Recording")}</div>
                            <div class="share-card-meta">
                                <span><i class="far fa-calendar-alt"></i> ${createdAt}</span>
                                <span><i class="far fa-clock"></i> ${createdAtTime}</span>
                                <span><i class="fas fa-eye"></i> ${views.length} views</span>
                                ${link.password ? '<span><i class="fas fa-lock"></i> Protected</span>' : ""}
                            </div>
                        </div>
                        <div class="share-card-actions">
                            ${statusBadge}
                        </div>
                        <div class="actions-cell">
                            <button class="actions-dots" onclick="toggleActions(event, '${link._id}')">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="actions-dropdown" id="dropdown-${link._id}">
                                <button class="block-btn" onclick="event.stopPropagation(); confirmBlock('${link._id}', '${link.status || "active"}')">
                                    <i class="fas ${isBlocked ? "fa-unlock" : "fa-ban"}"></i>
                                    ${isBlocked ? "Unblock Share" : "Block Share"}
                                </button>
                                <button class="delete-btn" onclick="event.stopPropagation(); confirmDelete('${link._id}')">
                                    <i class="fas fa-trash-alt"></i> Delete Share
                                </button>
                            </div>
                        </div>
                        <i class="fas fa-chevron-down collapse-arrow"></i>
                    </div>
                    <div class="share-card-body">
                        <div class="share-card-body-inner">
                            <div class="share-detail-row">
                                <span class="share-detail-label">Share URL</span>
                                <span class="share-url-inline">${shareUrl}</span>
                                <button class="copy-btn-sm" onclick="event.stopPropagation();copyToClipboard('${shareUrl}', this)">
                                    <i class="fas fa-copy"></i> Copy
                                </button>
                            </div>
                            ${
                              link.password
                                ? `
                            <div class="share-detail-row">
                                <span class="share-detail-label">Password</span>
                                <span class="share-detail-value">${escapeHtml(link.password)}</span>
                            </div>`
                                : ""
                            }
                            <div class="share-detail-row">
                                <span class="share-detail-label">Expires</span>
                                <span class="share-detail-value">${link.expiresAt ? new Date(link.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Never"}</span>
                            </div>
                            
                            <div style="margin-top:1rem;">
                                <p style="font-weight:600;color:#475569;margin-bottom:0.5rem;font-size:0.85rem;">
                                    👁️ Viewers (${views.length})
                                </p>
                                ${
                                  views.length > 0
                                    ? `
                                <div style="overflow-x:auto;">
                                    <table class="viewers-table">
                                        <thead>
                                            <tr><th>Name</th><th>Email</th><th>Date & Time</th></tr>
                                        </thead>
                                        <tbody>
                                            ${views
                                              .map(
                                                (v) => `
                                            <tr>
                                                <td>${escapeHtml(v.name || "Anonymous")}</td>
                                                <td>${escapeHtml(v.email || "N/A")}</td>
                                                <td>${v.viewedAt ? new Date(v.viewedAt).toLocaleString() : "N/A"}</td>
                                            </tr>`,
                                              )
                                              .join("")}
                                        </tbody>
                                    </table>
                                </div>
                                `
                                    : '<p class="no-views">No views yet</p>'
                                }
                            </div>
                        </div>
                    </div>
                </div>`;
      })
      .join("");
  } catch (err) {
    console.error("Analytics error:", err);
    shareList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle" style="color:#ef4444;"></i>
                    <h3>Failed to load analytics</h3>
                    <p>${err.message}</p>
                </div>`;
  }
}

loadAnalytics();

// ═══ SEARCH FUNCTIONALITY ═══
const searchAnalytics = document.getElementById("searchAnalytics");
const searchClear = document.getElementById("searchClear");

searchAnalytics.addEventListener("input", () => {
  filterCards();
  toggleClearBtn();
});

searchClear.addEventListener("click", () => {
  searchAnalytics.value = "";
  filterCards();
  toggleClearBtn();
  searchAnalytics.focus();
});

function toggleClearBtn() {
  searchClear.classList.toggle("visible", searchAnalytics.value.length > 0);
}

function filterCards() {
  const query = searchAnalytics.value.toLowerCase();
  const cards = document.querySelectorAll(".share-card");
  let visibleCount = 0;

  cards.forEach((card) => {
    const title =
      card.querySelector(".share-card-title")?.textContent.toLowerCase() || "";
    const match = !query || title.includes(query);
    card.style.display = match ? "" : "none";
    if (match) visibleCount++;
  });

  document.getElementById("resultCount").textContent =
    visibleCount + " link" + (visibleCount !== 1 ? "s" : "");

  // Show empty state if no results
  const emptyState = document.getElementById("emptyState");
  const shareList = document.getElementById("shareList");
  if (visibleCount === 0 && query && shareList.children.length > 0) {
    emptyState.style.display = "block";
    emptyState.innerHTML =
      '<i class="fas fa-search"></i><h3>No links found</h3><p>Try a different search term</p>';
  } else if (
    emptyState.style.display === "block" &&
    shareList.children.length > 0
  ) {
    emptyState.style.display = "none";
  }
}

// Ctrl+K to focus search
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    searchAnalytics.focus();
    searchAnalytics.select();
  }
});

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
  document.getElementById("logoutBtn")?.addEventListener("click", function (e) {
    e.preventDefault();
    handleLogout();
  });
});
