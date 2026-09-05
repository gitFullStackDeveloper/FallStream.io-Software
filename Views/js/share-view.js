const params = new URLSearchParams(window.location.search);
const recordingId = params.get("id");
const shareToken = params.get("token") || "";
const API_BASE = window.location.origin + "/api";

let videoBlobUrl = null;

// Fullscreen toggle
function toggleFullscreen() {
  const container = document.getElementById("videoContainer");
  const btn = document.getElementById("fullscreenBtn");
  if (!document.fullscreenElement) {
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen();
    }
    btn.innerHTML = '<i class="fas fa-compress"></i>';
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    btn.innerHTML = '<i class="fas fa-expand"></i>';
  }
}

// Listen for fullscreen changes to update icon
document.addEventListener("fullscreenchange", updateFullscreenIcon);
document.addEventListener("webkitfullscreenchange", updateFullscreenIcon);
document.addEventListener("msfullscreenchange", updateFullscreenIcon);

function updateFullscreenIcon() {
  const btn = document.getElementById("fullscreenBtn");
  if (document.fullscreenElement) {
    btn.innerHTML = '<i class="fas fa-compress"></i>';
  } else {
    btn.innerHTML = '<i class="fas fa-expand"></i>';
  }
}

async function loadVideo() {
  if (!recordingId) {
    document.getElementById("videoTitle").textContent =
      "No recording specified";
    hideLoading();
    return;
  }

  try {
    let url = `${API_BASE}/recordings/download/${recordingId}`;
    if (shareToken) {
      url += `?token=${encodeURIComponent(shareToken)}`;
    }

    console.log("📥 Loading:", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load");

    const blob = await res.blob();
    videoBlobUrl = URL.createObjectURL(blob);
    const video = document.getElementById("sharedVideo");
    video.src = videoBlobUrl;
    document.getElementById("videoTitle").textContent = "Shared Recording";

    // Hide loading overlay when video is ready to play
    video.addEventListener("loadeddata", hideLoading);
    video.addEventListener("error", () => {
      document.getElementById("videoTitle").textContent = "Video unavailable";
      hideLoading();
    });
  } catch (err) {
    console.error(err);
    document.getElementById("videoTitle").textContent = "Video unavailable";
    hideLoading();
  }
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.add("hidden");
}

loadVideo();

window.addEventListener("beforeunload", () => {
  if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
});
