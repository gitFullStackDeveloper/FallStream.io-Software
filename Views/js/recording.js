(function () {
  "use strict";

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
        if (avatarEl) {
          avatarEl.src = user.profile_image
            ? user.profile_image
            : `https://ui-avatars.com/api/?background=2563eb&color=fff&name=${encodeURIComponent(user.name)}&size=80`;
        }
      }
    } catch (e) {}
  })();

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    clearAuth();
    window.location.href = "../login.html";
  });

  // ── State ─────────────────────────────────────────
  let mediaRecorder = null;
  let recordedChunks = [];
  let screenStream = null;
  let webcamStream = null;
  let micStream = null;
  let systemAudioStream = null;
  let audioCtx = null;
  let timerInterval = null;
  let seconds = 0;
  let isRecording = false;
  let isPaused = false;
  let currentBlob = null;
  let micAnalyser = null;
  let micAnimFrame = null;
  let bubbleSize = 140;
  let bubblePos = "br";
  let bubbleShape = "circle";
  let bubbleBorderColor = "#3b82f6";
  let bubbleBorderAnim = "solid";
  let isDragging = false;
  let dragOffX = 0,
    dragOffY = 0;
  let fpsCounter = 0;
  let fpsInterval = null;
  let lastFrameTime = 0;
  let frameCount = 0;
  let activeKeys = new Set();
  let keyTimers = {};
  let spotlightActive = false;
  let zoomLevel = 1;
  let recordingOverlay = null;
  let floatingBubbleWindow = null;

  // ── DOM refs ──────────────────────────────────────
  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnResume = document.getElementById("btnResume");
  const btnStop = document.getElementById("btnStop");
  const timerDisplay = document.getElementById("timerDisplay");
  const timerText = document.getElementById("timerText");
  const recBadge = document.getElementById("recBadge");
  const screenPreview = document.getElementById("screenPreview");
  const previewIdle = document.getElementById("previewIdle");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const webcamBubble = document.getElementById("webcamBubble");
  const webcamVideo = document.getElementById("webcamVideo");
  const webcamOffMsg = document.getElementById("webcamOffMsg");
  const micBar = document.getElementById("micBar");
  const micLabel = document.getElementById("micLabel");
  const statusDot = document.getElementById("statusDot");
  const statusTitle = document.getElementById("statusTitle");
  const statusSub = document.getElementById("statusSub");
  const saveModal = document.getElementById("saveModal");
  const recordingTitle = document.getElementById("recordingTitle");
  const btnModalSave = document.getElementById("btnModalSave");
  const btnModalDiscard = document.getElementById("btnModalDiscard");
  const toggleCam = document.getElementById("toggleCam");
  const toggleMic = document.getElementById("toggleMic");
  const toggleSysAudio = document.getElementById("toggleSysAudio");
  const ctrlMoreWrap = document.getElementById("ctrlMoreWrap");
  const ctrlMoreBtn = document.getElementById("ctrlMoreBtn");
  const ctrlDropdown = document.getElementById("ctrlDropdown");
  const camCard = document.getElementById("camCard");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const countdownNumber = document.getElementById("countdownNumber");
  const countdownText = document.getElementById("countdownText");
  const keystrokeDisplay = document.getElementById("keystrokeDisplay");
  const fpsDisplay = document.getElementById("fpsDisplay");
  const modalThumbnail = document.getElementById("modalThumbnail");
  const modalThumbVideo = document.getElementById("modalThumbVideo");
  const recordingDuration = document.getElementById("recordingDuration");
  const recordingSize = document.getElementById("recordingSize");
  const previewWrap = document.getElementById("previewWrap");
  const spotlightOverlay = document.getElementById("spotlightOverlay");
  const zoomIndicator = document.getElementById("zoomIndicator");
  const bubbleColorPicker = document.getElementById("bubbleColorPicker");

  // ── Utilities ─────────────────────────────────────
  function show(el) {
    el?.classList.remove("hidden");
  }
  function hide(el) {
    el?.classList.add("hidden");
  }

  function formatTime(s) {
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  }

  function formatSize(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function setStatus(state, title, sub) {
    if (statusDot) statusDot.className = `status-dot ${state}`;
    if (statusTitle) statusTitle.textContent = title;
    if (statusSub) statusSub.textContent = sub;
  }

  function showToast(msg, isError = false) {
    const t = document.getElementById("toast");
    const icon = t?.querySelector("i");
    const msgSpan = document.getElementById("toastMsg");
    if (!t || !icon || !msgSpan) return;
    msgSpan.textContent = msg;
    icon.style.color = isError ? "#ef4444" : "#22c55e";
    icon.className = isError ? "fas fa-times-circle" : "fas fa-check-circle";
    show(t);
    setTimeout(() => hide(t), 3500);
  }

  // ═══════════════ BUTTON SPINNER HELPERS ═══════════════
  function setBtnLoading(btn, text) {
    if (!btn) return;
    btn.disabled = true;
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${text}</span>`;
  }

  function resetBtn(btn) {
    if (!btn) return;
    btn.disabled = false;
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
  }

  // ═══════════════ CREATE RECORDING OVERLAY ═══════════════
  function createRecordingOverlay() {
    removeRecordingOverlay();

    recordingOverlay = document.createElement("div");
    recordingOverlay.id = "recordingOverlay";
    recordingOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(4, 13, 26, 0.92);
      z-index: 5;
      backdrop-filter: blur(12px);
      transition: opacity 0.3s ease;
    `;
    recordingOverlay.innerHTML = `
      <div class="recording-icon-wrapper" style="margin-bottom: 1.5rem; position: relative;">
        <div style="
          position: absolute;
          inset: -15px;
          border-radius: 50%;
          border: 2px solid rgba(34, 197, 94, 0.3);
          animation: recordingRingPulse 2s ease-in-out infinite;
        "></div>
        <div style="
          position: absolute;
          inset: -30px;
          border-radius: 50%;
          border: 1.5px solid rgba(34, 197, 94, 0.15);
          animation: recordingRingPulse 2s ease-in-out infinite 0.5s;
        "></div>
        <i class="fas fa-dot-circle" style="
          font-size: 3.5rem;
          color: #22c55e;
          animation: recordingIconPulse 1.5s ease-in-out infinite;
          filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.6));
          position: relative;
          z-index: 1;
        "></i>
      </div>
      <div style="
        font-family: 'Outfit', sans-serif;
        font-size: 1.5rem;
        font-weight: 700;
        color: #fff;
        margin-bottom: 0.5rem;
        letter-spacing: 0.02em;
      ">
        Recording in Progress
      </div>
      <div style="
        font-size: 0.9rem;
        color: rgba(255,255,255,0.6);
        text-align: center;
        max-width: 420px;
        line-height: 1.6;
        margin-bottom: 1.5rem;
      ">
        Your screen is being captured. Switch to the window you want to record.
        <br>Press <strong style="color: #fff;">Stop</strong> when finished.
      </div>
      <div style="
        padding: 10px 24px;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        border-radius: 30px;
        color: #22c55e;
        font-size: 0.85rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      ">
        <i class="fas fa-shield-alt"></i>
        <span>Recording secured & encrypted</span>
      </div>
      <div style="
        margin-top: 1.2rem;
        padding: 8px 20px;
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 30px;
        color: #f59e0b;
        font-size: 0.8rem;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      ">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Minimize this window for clean recording</span>
      </div>
    `;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
      @keyframes recordingRingPulse {
        0%, 100% { transform: scale(1); opacity: 0.3; }
        50% { transform: scale(1.05); opacity: 0.8; }
      }
      @keyframes recordingIconPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.1); opacity: 0.8; }
      }
      .recording-icon-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 80px;
        height: 80px;
      }
    `;
    document.head.appendChild(styleSheet);

    previewWrap.appendChild(recordingOverlay);
  }

  function removeRecordingOverlay() {
    if (recordingOverlay) {
      recordingOverlay.remove();
      recordingOverlay = null;
    }
    const existingOverlay = document.getElementById("recordingOverlay");
    if (existingOverlay) existingOverlay.remove();
  }

  function showRecordingOverlay() {
    if (recordingOverlay) {
      recordingOverlay.style.opacity = "1";
      recordingOverlay.style.display = "flex";
    }
  }

  function hideRecordingOverlay() {
    if (recordingOverlay) {
      recordingOverlay.style.display = "none";
    }
  }

  // ═══════════════ ALWAYS-ON-TOP FLOATING WEBCAM BUBBLE ═══════════════
  function getBubbleStyles() {
    const borderRadius =
      bubbleShape === "circle"
        ? "50%"
        : bubbleShape === "square"
          ? "16px"
          : "60% 40% 50% 50% / 50% 60% 40% 50%";
    const blobAnimation =
      bubbleShape === "blob"
        ? "floatBlobMorph 4s ease-in-out infinite"
        : "none";

    let borderAnimationStyle = "";
    let borderAnimationName = "none";

    if (bubbleBorderAnim === "pulse") {
      borderAnimationName = "floatBorderPulse 2s ease-in-out infinite";
      borderAnimationStyle = `
        @keyframes floatBorderPulse {
          0%,100% { box-shadow: 0 6px 28px rgba(0,0,0,0.6), 0 0 0 4px ${bubbleBorderColor}80; }
          50%     { box-shadow: 0 6px 28px rgba(0,0,0,0.6), 0 0 0 14px transparent; }
        }
      `;
    } else if (bubbleBorderAnim === "rainbow") {
      borderAnimationName = "floatRainbowBorder 3s linear infinite";
      borderAnimationStyle = `
        @keyframes floatRainbowBorder {
          0%   { border-color: #ef4444; }
          20%  { border-color: #f59e0b; }
          40%  { border-color: #22c55e; }
          60%  { border-color: #3b82f6; }
          80%  { border-color: #a855f7; }
          100% { border-color: #ef4444; }
        }
      `;
    } else if (bubbleBorderAnim === "glow") {
      borderAnimationName = "floatGlowPulse 1.5s ease-in-out infinite";
      borderAnimationStyle = `
        @keyframes floatGlowPulse {
          0%,100% { box-shadow: 0 6px 28px rgba(0,0,0,0.6), 0 0 20px 4px ${bubbleBorderColor}; }
          50%     { box-shadow: 0 6px 28px rgba(0,0,0,0.6), 0 0 40px 10px ${bubbleBorderColor}; }
        }
      `;
    }

    return {
      borderRadius,
      blobAnimation,
      borderAnimationName,
      borderAnimationStyle,
    };
  }

  function buildBubbleHTML() {
    const styles = getBubbleStyles();

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: transparent !important;
      overflow: hidden;
      user-select: none;
      -webkit-app-region: drag;
      cursor: move;
    }
    
    .bubble-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .bubble {
      position: relative;
      width: ${bubbleSize}px;
      height: ${bubbleSize}px;
      overflow: hidden;
      border: 3px solid ${bubbleBorderColor};
      border-radius: ${styles.borderRadius};
      box-shadow: 0 6px 28px rgba(0,0,0,0.6), 0 0 0 4px rgba(59,130,246,0.5);
      background: #0a1628;
      transition: box-shadow 0.3s, border-radius 0.3s;
      animation: ${styles.blobAnimation}, ${styles.borderAnimationName};
    }

    .bubble:hover {
      box-shadow: 0 8px 36px rgba(0,0,0,0.65), 0 0 0 5px rgba(56,189,248,0.7);
    }

    .bubble video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      -webkit-app-region: no-drag;
    }

    .bubble-off {
      position: absolute;
      inset: 0;
      background: #0a1628;
      display: none;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.4);
      font-size: ${bubbleSize * 0.4}px;
      border-radius: inherit;
    }

    .bubble-off.show {
      display: flex;
    }

    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      background: rgba(239, 68, 68, 0.9);
      border: none;
      border-radius: 50%;
      color: white;
      font-size: 0.65rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: all 0.2s;
      opacity: 0;
      -webkit-app-region: no-drag;
    }

    .close-btn:hover {
      background: #ef4444;
      transform: scale(1.1);
    }

    .bubble:hover .close-btn {
      opacity: 1;
    }

    ${
      bubbleShape === "blob"
        ? `
    @keyframes floatBlobMorph {
      0%,100% { border-radius: 60% 40% 50% 50% / 50% 60% 40% 50%; }
      33%     { border-radius: 40% 60% 50% 50% / 60% 40% 60% 40%; }
      66%     { border-radius: 55% 45% 45% 55% / 55% 55% 45% 45%; }
    }
    `
        : ""
    }

    ${styles.borderAnimationStyle}

    .drag-hint {
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.7);
      color: rgba(255,255,255,0.6);
      padding: 3px 10px;
      border-radius: 10px;
      font-size: 0.55rem;
      font-family: 'Segoe UI', sans-serif;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .bubble-container:hover .drag-hint {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="bubble-container">
    <div class="bubble" id="mainBubble">
      <video id="bubbleVideo" autoplay muted playsinline></video>
      <div class="bubble-off" id="bubbleOff">
        <i class="fas fa-video-slash"></i>
      </div>
      <button class="close-btn" id="closeBtn" title="Close webcam">
        <i class="fas fa-times"></i>
      </button>
      <div class="drag-hint">Drag to move anywhere</div>
    </div>
  </div>
  <script>
    // Close button
    document.getElementById('closeBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      window.opener.postMessage({ type: 'CLOSE_FLOATING_BUBBLE' }, '*');
      window.close();
    });

    // Keep window always on top
    setInterval(function() {
      try { window.focus(); } catch(e) {}
    }, 1000);

    // Notify parent when window is closed
    window.addEventListener('beforeunload', function() {
      window.opener.postMessage({ type: 'BUBBLE_WINDOW_CLOSED' }, '*');
    });

    // Listen for style updates from parent
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'UPDATE_BUBBLE_STYLE') {
        const bubble = document.getElementById('mainBubble');
        const offMsg = document.getElementById('bubbleOff');
        const video = document.getElementById('bubbleVideo');
        
        if (bubble && e.data.styles) {
          const s = e.data.styles;
          bubble.style.width = s.size + 'px';
          bubble.style.height = s.size + 'px';
          bubble.style.borderColor = s.borderColor;
          bubble.style.borderRadius = s.borderRadius;
          bubble.style.animation = s.blobAnimation + (s.blobAnimation && s.borderAnimation ? ', ' : '') + s.borderAnimation;
          
          if (offMsg) {
            offMsg.style.fontSize = (s.size * 0.4) + 'px';
          }
        }
        
        // Update window size
        window.resizeTo(e.data.styles.size + 16, e.data.styles.size + 16);
      }
      
      if (e.data && e.data.type === 'SET_WEBCAM_STREAM') {
        const video = document.getElementById('bubbleVideo');
        const offMsg = document.getElementById('bubbleOff');
        if (video && e.data.streamId) {
          navigator.mediaDevices.getUserMedia({
            video: { 
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 }
            }
          }).then(stream => {
            video.srcObject = stream;
            if (offMsg) offMsg.classList.remove('show');
          }).catch(() => {
            if (offMsg) offMsg.classList.add('show');
          });
        }
      }
    });
  <\/script>
</body>
</html>`;
  }

  function createFloatingBubble() {
    closeFloatingBubble();

    const width = bubbleSize + 16;
    const height = bubbleSize + 16;
    const left = screen.width - width - 20;
    const top = screen.height - height - 80;

    floatingBubbleWindow = window.open(
      "",
      "WebcamBubble",
      `width=${width},height=${height},left=${left},top=${top},` +
        `resizable=no,alwaysOnTop=yes,frame=no,titlebar=no,` +
        `menubar=no,toolbar=no,location=no,status=no,scrollbars=no`,
    );

    if (!floatingBubbleWindow) {
      showToast("Please allow popups for webcam bubble", true);
      return;
    }

    floatingBubbleWindow.document.write(buildBubbleHTML());
    floatingBubbleWindow.document.close();

    setTimeout(() => {
      if (floatingBubbleWindow && !floatingBubbleWindow.closed) {
        const bubbleVideo =
          floatingBubbleWindow.document.getElementById("bubbleVideo");
        const bubbleOff =
          floatingBubbleWindow.document.getElementById("bubbleOff");

        if (bubbleVideo && webcamStream) {
          bubbleVideo.srcObject = webcamStream;
          if (bubbleOff) bubbleOff.classList.remove("show");
        } else if (bubbleOff) {
          bubbleOff.classList.add("show");
        }
      }
    }, 300);

    const checkClosed = setInterval(() => {
      if (!floatingBubbleWindow || floatingBubbleWindow.closed) {
        clearInterval(checkClosed);
        floatingBubbleWindow = null;
        if (toggleCam) toggleCam.checked = false;
        camCard?.classList.remove("cam-active");
      }
    }, 500);
  }

  function updateFloatingBubbleStyle() {
    if (!floatingBubbleWindow || floatingBubbleWindow.closed) return;

    const styles = getBubbleStyles();

    try {
      floatingBubbleWindow.postMessage(
        {
          type: "UPDATE_BUBBLE_STYLE",
          styles: {
            size: bubbleSize,
            borderColor: bubbleBorderColor,
            borderRadius: styles.borderRadius,
            blobAnimation: styles.blobAnimation,
            borderAnimation: styles.borderAnimationName,
          },
        },
        "*",
      );

      floatingBubbleWindow.resizeTo(bubbleSize + 16, bubbleSize + 16);
    } catch (e) {
      floatingBubbleWindow = null;
    }
  }

  function closeFloatingBubble() {
    if (floatingBubbleWindow && !floatingBubbleWindow.closed) {
      try {
        floatingBubbleWindow.close();
      } catch (e) {}
    }
    floatingBubbleWindow = null;
  }

  window.addEventListener("message", function (e) {
    if (
      e.data &&
      (e.data.type === "CLOSE_FLOATING_BUBBLE" ||
        e.data.type === "BUBBLE_WINDOW_CLOSED")
    ) {
      floatingBubbleWindow = null;
      if (toggleCam) toggleCam.checked = false;
      camCard?.classList.remove("cam-active");
      webcamStream?.getTracks().forEach((t) => t.stop());
      webcamStream = null;
    }
  });

  // ═══════════════ COUNTDOWN ═══════════════
  async function startCountdown(callback) {
    show(countdownOverlay);
    const nums = ["3", "2", "1"];
    for (let i = 0; i < nums.length; i++) {
      countdownNumber.textContent = nums[i];
      countdownNumber.style.animation = "none";
      countdownNumber.offsetHeight;
      countdownNumber.style.animation =
        "countPop 0.7s cubic-bezier(0.2,0.9,0.4,1.1)";
      countdownText.textContent = i === 2 ? "🎬 Recording!" : "Get Ready...";
      await new Promise((r) => setTimeout(r, 750));
    }
    hide(countdownOverlay);
    callback();
  }

  // ═══════════════ CLICK RIPPLE ═══════════════
  function createClickRipple(e) {
    if (!isRecording || !previewWrap) return;
    const rect = previewWrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ripple = document.createElement("div");
    ripple.className = "click-ripple";
    ripple.style.left = x + "px";
    ripple.style.top = y + "px";
    previewWrap.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  }

  // ═══════════════ KEYSTROKE ═══════════════
  function getKeyDisplayName(key) {
    const map = {
      Control: "Ctrl",
      Alt: "Alt",
      Shift: "Shift",
      Meta: "Win",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      " ": "Space",
      Backspace: "⌫",
      Delete: "⌦",
      Enter: "↵",
      Tab: "Tab",
      Escape: "Esc",
      CapsLock: "Caps",
    };
    return map[key] || key.length === 1 ? key.toUpperCase() : key;
  }

  function showKey(key) {
    if (!isRecording) return;
    activeKeys.add(key);
    updateKeystrokeDisplay();
    if (keyTimers[key]) clearTimeout(keyTimers[key]);
    keyTimers[key] = setTimeout(() => {
      activeKeys.delete(key);
      updateKeystrokeDisplay();
    }, 1500);
  }

  function updateKeystrokeDisplay() {
    if (!keystrokeDisplay) return;
    if (activeKeys.size === 0) {
      keystrokeDisplay.innerHTML = "";
      return;
    }
    const sorted = Array.from(activeKeys).sort((a, b) => {
      const order = ["Control", "Alt", "Shift", "Meta"];
      return order.indexOf(b) - order.indexOf(a);
    });
    keystrokeDisplay.innerHTML = sorted
      .map((k) => `<span class="keystroke-key">${getKeyDisplayName(k)}</span>`)
      .join(" + ");
  }

  // ═══════════════ FPS ═══════════════
  function startFpsCounter() {
    frameCount = 0;
    lastFrameTime = performance.now();
    fpsInterval = setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastFrameTime;
      fpsCounter = Math.round((frameCount / elapsed) * 1000);
      frameCount = 0;
      lastFrameTime = now;
      if (fpsDisplay) fpsDisplay.textContent = fpsCounter + " FPS";
    }, 1000);
    function countFrame() {
      if (!isRecording) return;
      frameCount++;
      requestAnimationFrame(countFrame);
    }
    requestAnimationFrame(countFrame);
  }

  function stopFpsCounter() {
    if (fpsInterval) clearInterval(fpsInterval);
    if (fpsDisplay) fpsDisplay.textContent = "";
  }

  // ═══════════════ SPOTLIGHT ═══════════════
  function toggleSpotlight() {
    spotlightActive = !spotlightActive;
    if (spotlightActive) {
      spotlightOverlay?.classList.add("active");
      showToast("🔦 Spotlight ON");
    } else {
      spotlightOverlay?.classList.remove("active");
      showToast("Spotlight OFF");
    }
  }

  previewWrap?.addEventListener("mousemove", (e) => {
    if (!spotlightActive || !spotlightOverlay) return;
    const rect = previewWrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spotlightOverlay.style.background = `radial-gradient(circle 140px at ${x}px ${y}px, transparent 0%, rgba(0,0,0,0.6) 100%)`;
  });

  // ═══════════════ ZOOM ═══════════════
  function setZoom(level) {
    zoomLevel = level;
    if (screenPreview) {
      screenPreview.style.transform = `scale(${level})`;
      screenPreview.style.transformOrigin = "center center";
    }
    if (zoomIndicator) {
      if (level > 1) {
        zoomIndicator.textContent = `🔍 ${level}x`;
        zoomIndicator.classList.add("show");
      } else {
        zoomIndicator.classList.remove("show");
      }
    }
  }

  // ═══════════════ EVENT LISTENERS ═══════════════
  document.addEventListener("click", createClickRipple);
  document.addEventListener("keydown", (e) => {
    if (!isRecording) return;
    showKey(e.key);
  });
  document.addEventListener("keyup", (e) => {
    activeKeys.delete(e.key);
    updateKeystrokeDisplay();
  });

  // Profile dropdown
  (function () {
    const pd = document.getElementById("profileDropdown");
    if (!pd) return;
    pd.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      this.classList.toggle("active");
    });
    document.addEventListener("click", function (e) {
      if (!pd.contains(e.target)) {
        pd.classList.remove("active");
      }
    });
    const dropdownMenu = pd.querySelector(".dropdown-menu");
    if (dropdownMenu) {
      dropdownMenu.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }
  })();

  ctrlMoreBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    ctrlDropdown?.classList.toggle("open");
  });
  document.addEventListener("click", () =>
    ctrlDropdown?.classList.remove("open"),
  );
  ctrlDropdown?.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("ddDiscard")?.addEventListener("click", () => {
    ctrlDropdown?.classList.remove("open");
    if (confirm("Discard this recording?")) discardRecording();
  });
  document.getElementById("ddToggleCam")?.addEventListener("click", () => {
    ctrlDropdown?.classList.remove("open");
    if (toggleCam) {
      toggleCam.checked = !toggleCam.checked;
      toggleCam.dispatchEvent(new Event("change"));
    }
  });
  document.getElementById("ddToggleMic")?.addEventListener("click", () => {
    ctrlDropdown?.classList.remove("open");
    if (toggleMic) {
      toggleMic.checked = !toggleMic.checked;
      toggleMic.dispatchEvent(new Event("change"));
    }
  });
  document.getElementById("ddSpotlight")?.addEventListener("click", () => {
    ctrlDropdown?.classList.remove("open");
    toggleSpotlight();
  });
  document.getElementById("ddZoomIn")?.addEventListener("click", () => {
    ctrlDropdown?.classList.remove("open");
    setZoom(1.5);
  });
  document.getElementById("ddZoomOut")?.addEventListener("click", () => {
    ctrlDropdown?.classList.remove("open");
    setZoom(1);
  });

  // ═══════════════ WEBCAM TOGGLE ═══════════════
  toggleCam?.addEventListener("change", async () => {
    const isElectron = window.electronAPI?.isElectron;

    if (toggleCam.checked) {
      camCard?.classList.add("cam-active");
      if (webcamBubble) webcamBubble.style.display = "none";

      if (isElectron) {
        window.electronAPI.openWebcamBubble({
          size: bubbleSize,
          x: screen.width - bubbleSize - 40,
          y: screen.height - bubbleSize - 100,
        });

        updateNativeBubbleStyle();

        window.electronAPI.onWebcamBubbleClosed(() => {
          toggleCam.checked = false;
          camCard?.classList.remove("cam-active");
        });

        showToast("📷 Webcam bubble ready — drag anywhere!");
      } else {
        try {
          webcamStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 },
            },
          });
          createFloatingBubble();
          showToast("📷 Webcam bubble ready!");
        } catch (err) {
          showToast("Camera access denied", true);
          toggleCam.checked = false;
          camCard?.classList.remove("cam-active");
        }
      }
    } else {
      camCard?.classList.remove("cam-active");
      if (isElectron) {
        window.electronAPI.closeWebcamBubble();
      } else {
        closeFloatingBubble();
      }
    }
  });

  // Update native bubble style
  function updateNativeBubbleStyle() {
    const isElectron = window.electronAPI?.isElectron;
    if (!isElectron) return;

    const borderRadius =
      bubbleShape === "circle"
        ? "50%"
        : bubbleShape === "square"
          ? "16px"
          : "60% 40% 50% 50% / 50% 60% 40% 50%";
    const blobAnimation =
      bubbleShape === "blob" ? "blobMorph 4s ease-in-out infinite" : "none";

    let borderAnimation = "none";
    if (bubbleBorderAnim === "pulse")
      borderAnimation = "borderPulse 2s ease-in-out infinite";
    else if (bubbleBorderAnim === "rainbow")
      borderAnimation = "rainbowBorder 3s linear infinite";
    else if (bubbleBorderAnim === "glow")
      borderAnimation = "glowPulse 1.5s ease-in-out infinite";

    window.electronAPI.updateWebcamBubble({
      size: bubbleSize,
      borderColor: bubbleBorderColor,
      borderRadius: borderRadius,
      blobAnimation: blobAnimation,
      borderAnimation: borderAnimation,
      shape: bubbleShape,
    });
  }
  toggleMic?.addEventListener("change", () => {
    if (!toggleMic.checked) {
      if (micBar) micBar.style.width = "0%";
      if (micLabel) micLabel.textContent = "Microphone muted";
      if (micAnimFrame) {
        cancelAnimationFrame(micAnimFrame);
        micAnimFrame = null;
      }
    } else {
      if (micLabel) micLabel.textContent = "Mic ready";
    }
  });

  function startMicMeter(stream) {
    if (!stream) return;
    try {
      if (!audioCtx)
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      src.connect(micAnalyser);
      if (micLabel) micLabel.textContent = "Microphone active";
      animateMicMeter();
    } catch (e) {
      console.warn("Mic meter failed", e);
    }
  }

  function animateMicMeter() {
    if (!micAnalyser || !micBar) return;
    const data = new Uint8Array(micAnalyser.frequencyBinCount);
    micAnalyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    micBar.style.width = Math.min(100, avg * 2) + "%";
    micAnimFrame = requestAnimationFrame(animateMicMeter);
  }

  document.querySelectorAll(".source-opt").forEach((opt) => {
    opt.addEventListener("click", () => {
      document
        .querySelectorAll(".source-opt")
        .forEach((o) => o.classList.remove("active"));
      opt.classList.add("active");
      opt.querySelector("input").checked = true;
    });
  });
  // Shape buttons
  document.querySelectorAll(".shape-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".shape-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bubbleShape = btn.dataset.shape;
      updateFloatingBubbleStyle();
      updateNativeBubbleStyle();
    });
  });

  // Size buttons
  document.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".size-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bubbleSize = parseInt(btn.dataset.size);
      updateFloatingBubbleStyle();
      updateNativeBubbleStyle();
    });
  });

  // Position buttons
  document.querySelectorAll(".pos-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".pos-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bubblePos = btn.dataset.pos;

      const isElectron = window.electronAPI?.isElectron;
      if (isElectron) {
        window.electronAPI.moveWebcamBubble(bubblePos, bubbleSize);
      } else {
        updateFloatingBubbleStyle();
      }
      updateNativeBubbleStyle();
    });
  });
  // Color picker
  bubbleColorPicker?.addEventListener("input", () => {
    bubbleBorderColor = bubbleColorPicker.value;
    updateFloatingBubbleStyle();
    updateNativeBubbleStyle();
  });

  // Animation buttons
  document.querySelectorAll(".border-anim-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".border-anim-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bubbleBorderAnim = btn.dataset.anim;
      updateFloatingBubbleStyle();
      updateNativeBubbleStyle();
    });
  });
  // Quality
  document.querySelectorAll(".q-opt").forEach((opt) => {
    opt.querySelector("input")?.addEventListener("change", () => {
      document
        .querySelectorAll(".q-opt")
        .forEach((o) => o.classList.remove("active-q"));
      opt.classList.add("active-q");
    });
  });

  // ═══════════════ START RECORDING ═══════════════
  async function doStartRecording() {
    try {
      if (toggleMic?.checked) {
        try {
          if (!micStream)
            micStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
            });
          startMicMeter(micStream);
        } catch {
          showToast("Mic denied — recording without audio", true);
          if (toggleMic) toggleMic.checked = false;
        }
      }

      const isElectron = window.electronAPI?.isElectron;

      if (isElectron) {
        console.log("🖥️ Electron detected - using desktopCapturer");
        try {
          const sources = await window.electronAPI.getScreenSources();
          console.log("📺 Sources found:", sources?.length, sources);

          if (sources && sources.length > 0) {
            const screenSource =
              sources.find((s) => s.name.includes("Screen")) || sources[0];
            console.log("🎯 Using source:", screenSource.name);
            screenStream = await window.electronAPI.getDisplayMedia(
              screenSource.id,
            );
            console.log("✅ Screen stream obtained");
          } else {
            console.log("⚠️ No sources, trying direct getUserMedia...");
            screenStream = await navigator.mediaDevices.getUserMedia({
              video: {
                mandatory: {
                  chromeMediaSource: "desktop",
                },
              },
            });
          }
        } catch (electronErr) {
          console.error("❌ Electron capture error:", electronErr);
          showToast("Screen capture failed: " + electronErr.message, true);
          return;
        }
      } else {
        console.log("🌐 Browser detected - using getDisplayMedia");
        try {
          const sourceVal =
            document.querySelector('input[name="source"]:checked')?.value ||
            "screen";
          const videoConstraints = { cursor: "always" };
          if (sourceVal === "screen")
            videoConstraints.displaySurface = "monitor";
          else if (sourceVal === "window")
            videoConstraints.displaySurface = "window";
          else videoConstraints.displaySurface = "browser";

          if (toggleSysAudio?.checked) {
            try {
              systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
              });
              systemAudioStream.getVideoTracks().forEach((t) => t.stop());
            } catch {
              console.warn("System audio failed");
            }
          }

          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: videoConstraints,
            audio: !toggleSysAudio?.checked,
          });
          console.log("✅ Screen stream obtained via browser");
        } catch (browserErr) {
          console.error("Browser capture error:", browserErr);
          if (browserErr.name === "NotAllowedError") {
            showToast("Permission denied. Please allow screen capture.", true);
          } else {
            showToast("Screen capture failed: " + browserErr.message, true);
          }
          return;
        }
      }

      if (!screenStream) {
        showToast("Failed to get screen stream", true);
        return;
      }

      const tracks = [...screenStream.getVideoTracks()];
      if (toggleMic?.checked && micStream)
        tracks.push(...micStream.getAudioTracks());
      if (toggleSysAudio?.checked && systemAudioStream)
        tracks.push(...systemAudioStream.getAudioTracks());
      else if (screenStream.getAudioTracks().length)
        tracks.push(...screenStream.getAudioTracks());

      const combined = new MediaStream(tracks);
      mediaRecorder = new MediaRecorder(combined, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      recordedChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data?.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = handleRecordingStop;
      mediaRecorder.start(500);

      isRecording = true;
      isPaused = false;

      hide(screenPreview);
      hide(previewIdle);
      hide(pauseOverlay);

      createRecordingOverlay();

      show(recBadge);
      show(timerDisplay);
      show(fpsDisplay);

      startFpsCounter();

      screenStream.getVideoTracks()[0].addEventListener("ended", () => {
        if (isRecording) stopRecording();
      });

      seconds = 0;
      if (timerText) timerText.textContent = formatTime(0);
      timerInterval = setInterval(() => {
        seconds++;
        if (timerText) timerText.textContent = formatTime(seconds);
      }, 1000);

      hide(btnStart);
      show(btnPause);
      show(btnStop);
      hide(btnResume);
      if (ctrlMoreWrap) ctrlMoreWrap.style.display = "flex";
      setStatus("live", "Recording", "Screen captured");

      console.log("✅ Recording started successfully");
    } catch (err) {
      console.error("❌ Recording error:", err);
      if (err.name === "NotAllowedError") {
        showToast("Permission denied. Please allow screen capture.", true);
      } else {
        showToast("Error: " + err.message, true);
      }
    }
  }

  // ═══════════════ BUTTON HANDLERS ═══════════════
  btnStart?.addEventListener("click", () => startCountdown(doStartRecording));

  btnPause?.addEventListener("click", () => {
    if (!mediaRecorder || mediaRecorder.state !== "recording") return;
    mediaRecorder.pause();
    isPaused = true;
    clearInterval(timerInterval);
    stopFpsCounter();
    show(pauseOverlay);
    hideRecordingOverlay();
    hide(btnPause);
    show(btnResume);
    hide(recBadge);
    setStatus("paused", "Paused", "Recording paused");
  });

  btnResume?.addEventListener("click", () => {
    if (!mediaRecorder || mediaRecorder.state !== "paused") return;
    mediaRecorder.resume();
    isPaused = false;
    hide(pauseOverlay);
    showRecordingOverlay();
    hide(btnResume);
    show(btnPause);
    show(recBadge);
    startFpsCounter();
    timerInterval = setInterval(() => {
      seconds++;
      if (timerText) timerText.textContent = formatTime(seconds);
    }, 1000);
    setStatus("live", "Recording", "Screen captured");
  });

  btnStop?.addEventListener("click", stopRecording);

  function stopRecording() {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    clearInterval(timerInterval);
    stopFpsCounter();
    isRecording = false;
    isPaused = false;
    screenStream?.getTracks().forEach((t) => t.stop());
    removeRecordingOverlay();
    hide(pauseOverlay);
    if (screenPreview) {
      screenPreview.srcObject = null;
      screenPreview.style.transform = "scale(1)";
    }
    hide(screenPreview);
    show(previewIdle);
    hide(recBadge);
    hide(timerDisplay);
    hide(fpsDisplay);
    hide(btnPause);
    hide(btnResume);
    hide(btnStop);
    show(btnStart);
    if (ctrlMoreWrap) ctrlMoreWrap.style.display = "none";
    activeKeys.clear();
    updateKeystrokeDisplay();
    spotlightActive = false;
    spotlightOverlay?.classList.remove("active");
    zoomLevel = 1;
    zoomIndicator?.classList.remove("show");
    setStatus("done", "Stopped", "Processing…");
  }
  // ═══════════════ STOP ═══════════════
  btnStop?.addEventListener("click", stopRecording);

  function discardRecording() {
    stopRecording();
    recordedChunks = [];
    currentBlob = null;
    setStatus("idle", "Ready", "Configure and start");
  }

  function handleRecordingStop() {
    if (!recordedChunks.length) return;
    currentBlob = new Blob(recordedChunks, { type: "video/webm" });
    recordedChunks = [];
    const now = new Date();
    if (recordingTitle)
      recordingTitle.value = `Recording ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    if (recordingDuration) recordingDuration.textContent = formatTime(seconds);
    if (recordingSize) recordingSize.textContent = formatSize(currentBlob.size);
    if (modalThumbVideo && currentBlob) {
      const url = URL.createObjectURL(currentBlob);
      modalThumbVideo.src = url;
      modalThumbnail?.classList.add("show");
    }
    show(saveModal);
  }

  // ═══════════════ SAVE (with spinner) ═══════════════
  btnModalSave?.addEventListener("click", async () => {
    const title = recordingTitle?.value.trim() || "Untitled";
    if (!currentBlob) return;
    const token = getToken();
    if (!token) {
      showToast("Please log in again", true);
      window.location.href = "../login.html";
      return;
    }

    setBtnLoading(btnModalSave, "Saving...");

    const formData = new FormData();
    formData.append("video", currentBlob, "recording.webm");
    try {
      const res = await fetch(
        `${API_BASE}/recordings?title=${encodeURIComponent(title)}&duration=${seconds}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );
      if (res.ok) {
        hide(saveModal);
        currentBlob = null;
        seconds = 0;
        setStatus("idle", "Ready", "Recording saved");
        showToast(`"${title}" saved!`);
      } else {
        const err = await res.json();
        showToast(err.message || "Failed", true);
      }
    } catch {
      showToast("Network error", true);
    } finally {
      resetBtn(btnModalSave);
    }
  });
  btnModalDiscard?.addEventListener("click", () => {
    if (confirm("Discard permanently?")) {
      setBtnLoading(btnModalDiscard, "Discarding...");
      setTimeout(() => {
        if (modalThumbVideo) modalThumbVideo.src = "";
        currentBlob = null;
        hide(saveModal);
        setStatus("idle", "Ready", "Configure and start");
        resetBtn(btnModalDiscard);
        showToast("Recording discarded", true);
      }, 500);
    }
  });

  // ═══════════════ SIDEBAR LOADING ═══════════════
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

  // ═══════════════ INIT ═══════════════
  (function init() {
    if (!getToken()) {
      window.location.href = "../login.html";
      return;
    }
    loadSidebar();
  })();

  window.addEventListener("beforeunload", () => {
    closeFloatingBubble();
  });

  const toggleToolbar = document.getElementById("toggleToolbar");
  let toolbarActive = false;

  toggleToolbar?.addEventListener("change", () => {
    const isElectron = window.electronAPI?.isElectron;
    if (!isElectron) {
      showToast("Teacher toolbar is only available in the desktop app", true);
      toggleToolbar.checked = false;
      return;
    }

    if (toggleToolbar.checked) {
      window.electronAPI.openTeacherOverlay();
      toolbarActive = true;
      showToast("📚 Teacher toolbar opened! Press P to activate tools");
    } else {
      window.electronAPI.closeTeacherOverlay();
      toolbarActive = false;
      showToast("Toolbar closed");
    }
  });

  const _originalStopRecording = stopRecording;
  stopRecording = function () {
    _originalStopRecording();
    if (toolbarActive && window.electronAPI?.isElectron) {
      window.electronAPI.closeTeacherOverlay();
      toolbarActive = false;
      if (toggleToolbar) toggleToolbar.checked = false;
    }
  };

  const _originalDiscardRecording = discardRecording;
  discardRecording = function () {
    _originalDiscardRecording();
    if (toolbarActive && window.electronAPI?.isElectron) {
      window.electronAPI.closeTeacherOverlay();
      toolbarActive = false;
      if (toggleToolbar) toggleToolbar.checked = false;
    }
  };
  if (window.electronAPI?.isElectron) {
    window.electronAPI.onTeacherOverlayClosed(() => {
      toolbarActive = false;
      if (toggleToolbar) toggleToolbar.checked = false;
    });
  }

  const toggleCamItem = document.getElementById("ddToggleCam");
  if (toggleCamItem) {
    const divider = toggleCamItem.previousElementSibling;
    if (divider && divider.classList.contains("cdrop-divider")) {
      divider.parentNode.insertBefore(toolbarToggleBtn, divider);
    }
  }
})();
