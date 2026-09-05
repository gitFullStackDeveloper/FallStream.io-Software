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
