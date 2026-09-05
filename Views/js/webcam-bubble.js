const { ipcRenderer } = require("electron");
const video = document.getElementById("bubbleVideo");
const bubble = document.getElementById("bubble");
const fullscreenBtn = document.getElementById("fullscreenBtn");
let isFullscreen = false;
let hideControlsTimer = null;

async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 30 },
    });
    video.srcObject = stream;
    await video.play();
    console.log("✅ Camera active");
  } catch (err) {
    console.error("❌ Camera error:", err.message);
  }
}

// Show controls in fullscreen, auto-hide after 3 seconds
function showControlsTemporarily() {
  if (!isFullscreen) return;

  bubble.classList.add("show-controls");

  // Clear existing timer
  if (hideControlsTimer) clearTimeout(hideControlsTimer);

  // Auto-hide after 3 seconds
  hideControlsTimer = setTimeout(() => {
    bubble.classList.remove("show-controls");
  }, 3000);
}

// Fullscreen toggle
fullscreenBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  isFullscreen = !isFullscreen;

  if (isFullscreen) {
    bubble.classList.add("fullscreen");
    fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
    fullscreenBtn.title = "Exit Full Screen";
    ipcRenderer.send("webcam-fullscreen-toggle", true);
    // Show controls briefly
    showControlsTemporarily();
  } else {
    bubble.classList.remove("fullscreen", "show-controls");
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenBtn.title = "Full Screen";
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
    ipcRenderer.send("webcam-fullscreen-toggle", false);
  }
});

// Mouse move in fullscreen = show controls
document.addEventListener("mousemove", () => {
  if (isFullscreen) showControlsTemporarily();
});

ipcRenderer.on("update-bubble-style", (event, styles) => {
  if (!bubble || isFullscreen) return;
  if (styles.size) {
    bubble.style.width = styles.size + "px";
    bubble.style.height = styles.size + "px";
  }
  if (styles.borderColor) bubble.style.borderColor = styles.borderColor;
  if (styles.borderRadius) bubble.style.borderRadius = styles.borderRadius;

  bubble.style.animation = "none";
  if (styles.shape === "blob")
    bubble.style.animation = "blobMorph 4s ease-in-out infinite";
  if (styles.borderAnimation && styles.borderAnimation !== "none") {
    const parts = styles.borderAnimation.split(" ");
    const currentAnim =
      bubble.style.animation === "none" ? "" : bubble.style.animation + ", ";
    bubble.style.animation =
      currentAnim +
      `${parts[0]} ${parts[1] || "2s"} ${parts.slice(2).join(" ") || "ease-in-out infinite"}`;
  }
  bubble.style.setProperty("--bcolor", styles.borderColor + "80");
  bubble.style.setProperty("--glowcolor", styles.borderColor);
});

window.addEventListener("beforeunload", () => {
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
});

startWebcam();
