const token = window.location.pathname.split("/").pop();
// const API_BASE = 'http://localhost:5000/api';
const API_BASE = window.location.origin + "/api";

async function loadShareInfo() {
  try {
    const res = await fetch(`${API_BASE}/share/${token}`);
    const data = await res.json();

    if (!res.ok) {
      // Link not found or expired
      document.getElementById("accessIcon").className = "access-icon expired";
      document.getElementById("accessIcon").innerHTML =
        '<i class="fas fa-clock"></i>';
      document.getElementById("accessTitle").textContent = "Link Unavailable";
      document.getElementById("sharedByName").textContent = "Unknown";
      document.getElementById("recordingTitle").textContent = "";
      document.getElementById("accessForm").style.display = "none";
      document.getElementById("expiredMessage").style.display = "block";
      return;
    }

    // Check if blocked
    if (data.isBlocked) {
      document.getElementById("accessIcon").className = "access-icon blocked";
      document.getElementById("accessIcon").innerHTML =
        '<i class="fas fa-ban"></i>';
      document.getElementById("accessTitle").textContent = "Access Denied";
      document.getElementById("sharedByName").textContent =
        data.sharedBy || "Unknown";
      document.getElementById("recordingTitle").textContent =
        data.recordingTitle || "";
      document.getElementById("accessForm").style.display = "none";
      document.getElementById("blockedMessage").style.display = "block";
      return;
    }

    // Normal access
    document.getElementById("sharedByName").textContent =
      data.sharedBy || "Unknown";
    document.getElementById("recordingTitle").textContent =
      "Recording: " + (data.recordingTitle || "Untitled");

    if (!data.hasPassword) {
      document.getElementById("passwordSection").style.display = "none";
    }
  } catch (err) {
    console.error(err);
    document.getElementById("accessTitle").textContent = "Error";
    document.getElementById("recordingTitle").textContent =
      "Something went wrong. Please try again.";
  }
}

document.getElementById("btnAccess").addEventListener("click", async () => {
  const password = document.getElementById("accessPassword").value.trim();
  const viewerName = document.getElementById("viewerName").value.trim();
  const viewerEmail = document.getElementById("viewerEmail").value.trim();

  const errorMsg = document.getElementById("errorMsg");
  errorMsg.classList.remove("show");

  const btn = document.getElementById("btnAccess");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

  try {
    const res = await fetch(`${API_BASE}/share/verify/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, viewerName, viewerEmail }),
    });
    const data = await res.json();

    if (res.ok) {
      // Check if blocked again (in case status changed)
      if (data.blocked) {
        document.getElementById("accessIcon").className = "access-icon blocked";
        document.getElementById("accessIcon").innerHTML =
          '<i class="fas fa-ban"></i>';
        document.getElementById("accessTitle").textContent = "Access Denied";
        document.getElementById("accessForm").style.display = "none";
        document.getElementById("blockedMessage").style.display = "block";
        return;
      }

      window.location.href = `/share-view?id=${data.recordingId}&token=${token}`;
    } else {
      errorMsg.textContent = data.message || "Access denied";
      errorMsg.classList.add("show");
    }
  } catch (err) {
    errorMsg.textContent = "Network error. Please try again.";
    errorMsg.classList.add("show");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-play"></i> Access Video';
  }
});

loadShareInfo();
