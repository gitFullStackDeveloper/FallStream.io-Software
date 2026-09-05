(function () {
  "use strict";
  if (!sessionStorage.getItem("token")) {
    window.location.replace("/login");
    return;
  }

  const API_BASE = window.location.origin + "/api";
  const WS_BASE = window.location.origin.replace("http", "ws") + "/ws/live";

  let ws = null,
    localStream = null,
    currentRoomId = null,
    liveSeconds = 0,
    liveTimer = null;
  let peerConnections = new Map();
  let pinMode = false;
  let mediaRecorder = null,
    recordedChunks = [],
    recordingBlob = null,
    recordingEnabled = true;

  function getToken() {
    return sessionStorage.getItem("token");
  }
  function getUser() {
    return JSON.parse(localStorage.getItem("user") || "{}");
  }

  const params = new URLSearchParams(window.location.search);
  currentRoomId = params.get("roomId");
  if (!currentRoomId) {
    alert("No session specified");
    window.location.replace("/live-session");
    return;
  }

  document.getElementById("shareUrl").value =
    `${window.location.origin}/live/${currentRoomId}`;

  // Recording toggle
  document
    .getElementById("recordToggle")
    .addEventListener("change", function () {
      recordingEnabled = this.checked;
      if (!recordingEnabled) {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
          recordedChunks = [];
          mediaRecorder = null;
          recordingBlob = null;
          showToast("Recording stopped and discarded", false);
        }
      } else {
        if (localStream && localStream.active) {
          recordedChunks = [];
          try {
            mediaRecorder = new MediaRecorder(localStream, {
              mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
                ? "video/webm;codecs=vp9"
                : "video/webm",
            });
            mediaRecorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) recordedChunks.push(e.data);
            };
            mediaRecorder.start(1000);
            showToast("Recording started", false);
          } catch (recErr) {
            console.warn("MediaRecorder failed:", recErr);
          }
        }
      }
    });

  // Load chat history
  async function loadChatHistory(roomId) {
    try {
      const res = await fetch(`${API_BASE}/live/chat/${roomId}`);
      if (!res.ok) return;
      const messages = await res.json();
      const div = document.getElementById("chatMessages");
      div.innerHTML = "";
      messages.forEach((msg) => {
        const isMe =
          msg.userName === (getUser().name || "Host") ||
          msg.userId === getUser().id;
        addChat(
          msg.userName,
          msg.message,
          isMe ? "host" : "viewer",
          msg.timestamp,
        );
      });
    } catch (e) {
      console.warn("Could not load chat history:", e);
    }
  }

  // Start screen capture & streaming
  async function startStreaming() {
    const isElectron = window.electronAPI?.isElectron;
    try {
      if (isElectron) {
        let sources = [];
        try {
          sources = await window.electronAPI.getScreenSources();
        } catch (e) {}
        if (sources && sources.length > 0) {
          const screenSource =
            sources.find(
              (s) => s.name.includes("Screen") || s.name.includes("Entire"),
            ) || sources[0];
          localStream = await window.electronAPI.getDisplayMedia(
            screenSource.id,
          );
        } else {
          try {
            localStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            });
          } catch (e2) {
            localStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: "desktop",
                  chromeMediaSourceId: "screen:0:0",
                },
              },
            });
          }
        }
      } else {
        localStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      }
      document.getElementById("streamPreview").srcObject = localStream;

      if (document.getElementById("recordToggle").checked) {
        recordedChunks = [];
        try {
          mediaRecorder = new MediaRecorder(localStream, {
            mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
              ? "video/webm;codecs=vp9"
              : "video/webm",
          });
          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
          };
          mediaRecorder.start(1000);
        } catch (recErr) {
          console.warn("MediaRecorder failed:", recErr);
        }
      }
    } catch (err) {
      alert("Screen sharing failed: " + err.message);
      window.location.replace("/live-session");
      return;
    }

    let micStream = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.warn("Microphone not available:", e);
    }
    window._micStream = micStream;

    await loadChatHistory(currentRoomId);
    connectWebSocket();
    startLiveTimer();
  }

  function connectWebSocket() {
    ws = new WebSocket(
      `${WS_BASE}?roomId=${currentRoomId}&role=host&token=${getToken()}`,
    );
    ws.onopen = () => {
      console.log("✅ Host WebSocket connected");
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "viewer-joined") {
        createPeerForViewer(msg.userId);
        document.getElementById("viewerCount").textContent = msg.count;
      } else if (msg.type === "viewer-left") {
        if (peerConnections.has(msg.userId)) {
          peerConnections.get(msg.userId).close();
          peerConnections.delete(msg.userId);
        }
        document.getElementById("viewerCount").textContent = msg.count;
      } else if (msg.type === "viewer-count") {
        document.getElementById("viewerCount").textContent = msg.count;
      } else if (msg.type === "answer") {
        const pc = peerConnections.get(msg.userId);
        if (pc) pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
      } else if (msg.type === "ice-candidate") {
        const pc = peerConnections.get(msg.userId);
        if (pc && msg.candidate)
          pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } else if (msg.type === "chat-message") {
        const myUserId = getUser().id;
        const isMyMessage =
          msg.userId === myUserId ||
          msg.userName === (getUser().name || "Host");
        addChat(
          msg.userName || msg.userId,
          msg.message,
          isMyMessage ? "host" : "viewer",
          msg.timestamp,
        );
      } else if (msg.type === "pin-message") {
        if (msg.pinned) showPinnedBar(msg.message, msg.userName);
        else hidePinnedBar();
      } else if (msg.type === "clear-pin") {
        hidePinnedBar();
      }
    };
  }

  async function createPeerForViewer(viewerId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    });
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    if (window._micStream) {
      window._micStream
        .getAudioTracks()
        .forEach((track) => pc.addTrack(track, window._micStream));
    }
    pc.onicecandidate = (event) => {
      if (event.candidate && ws?.readyState === 1) {
        ws.send(
          JSON.stringify({
            type: "ice-candidate",
            candidate: event.candidate,
            target: viewerId,
          }),
        );
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(
      JSON.stringify({
        type: "offer",
        offer: pc.localDescription,
        target: viewerId,
      }),
    );
    peerConnections.set(viewerId, pc);
  }

  function addChat(name, message, role, time, msgId) {
    const div = document.getElementById("chatMessages");
    const isHost = role === "host";
    const id = msgId || Date.now().toString(36);
    div.innerHTML += `
                    <div class="chat-msg" id="msg-${id}">
                        <div class="chat-avatar ${isHost ? "host" : "viewer"}">${(name || "?")[0].toUpperCase()}</div>
                        <div class="chat-bubble">
                            <div class="chat-name">${esc(name)} ${isHost ? "(You)" : ""}</div>
                            <div>${esc(message)}</div>
                            <div class="chat-time">${new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                    </div>`;
    div.scrollTop = div.scrollHeight;
  }

  window.togglePinMode = function () {
    pinMode = !pinMode;
    const btn = document.getElementById("pinToggleBtn");
    if (pinMode) {
      btn.classList.add("active");
      btn.title = "Pin mode ON — next message will be pinned";
    } else {
      btn.classList.remove("active");
      btn.title = "Pin mode OFF";
    }
  };

  window.sendChat = function () {
    const input = document.getElementById("chatInput");
    const message = input.value.trim();
    if (!message || !ws) return;
    ws.send(
      JSON.stringify({
        type: "chat-message",
        message: message,
        userName: getUser().name || "Host",
      }),
    );
    if (pinMode) {
      ws.send(
        JSON.stringify({
          type: "pin-message",
          message: message,
          userName: getUser().name || "Host",
          pinned: true,
        }),
      );
      showPinnedBar(message, getUser().name || "Host");
      pinMode = false;
      document.getElementById("pinToggleBtn").classList.remove("active");
      document.getElementById("pinToggleBtn").title = "Pin mode OFF";
    }
    input.value = "";
  };

  function startLiveTimer() {
    liveSeconds = 0;
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = setInterval(() => {
      liveSeconds++;
      const h = String(Math.floor(liveSeconds / 3600)).padStart(2, "0");
      const m = String(Math.floor((liveSeconds % 3600) / 60)).padStart(2, "0");
      const s = String(liveSeconds % 60).padStart(2, "0");
      document.getElementById("liveTimer").textContent = `${h}:${m}:${s}`;
    }, 1000);
  }

  window.endLiveSession = function () {
    // Show the custom confirmation modal
    const modal = document.getElementById("endSessionModal");
    modal.classList.add("show");

    // Cancel button
    document.getElementById("btnCancelEnd").onclick = function () {
      modal.classList.remove("show");
    };

    // Confirm button
    document.getElementById("btnConfirmEnd").onclick = function () {
      const btn = document.getElementById("btnConfirmEnd");
      setBtnLoading(btn, "Ending...");

      // Perform the actual session ending
      if (ws) {
        ws.send(JSON.stringify({ type: "end-session" }));
        ws.close();
      }
      peerConnections.forEach((pc) => pc.close());
      peerConnections.clear();
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (window._micStream) {
        window._micStream.getTracks().forEach((t) => t.stop());
        window._micStream = null;
      }
      if (liveTimer) clearInterval(liveTimer);

      // Handle recording if enabled
      if (recordingEnabled) {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.onstop = () => {
            if (recordedChunks.length > 0)
              recordingBlob = new Blob(recordedChunks, {
                type: mediaRecorder.mimeType || "video/webm",
              });
            else recordingBlob = null;
            recordedChunks = [];
            showSaveRecordingModal();
          };
          mediaRecorder.stop();
          return;
        } else if (recordedChunks.length > 0) {
          recordingBlob = new Blob(recordedChunks, { type: "video/webm" });
          recordedChunks = [];
          showSaveRecordingModal();
          return;
        }
      }

      // If no recording to save, end directly
      fetch(`${API_BASE}/live/end/${currentRoomId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      window.location.replace("/live-session");
    };

    // Close modal when clicking outside
    modal.addEventListener("click", function (e) {
      if (e.target === modal) modal.classList.remove("show");
    });
  };

  // Helper: show loading state on any button
  function setBtnLoading(btn, text) {
    if (!btn) return;
    btn.classList.add("btn-loading");
    btn.querySelector(".btn-text").style.display = "none";
    btn.querySelector(".btn-spinner").style.display = "inline-flex";
    // Optionally change the spinner text
    const spinnerText = btn.querySelector(".btn-spinner span");
    if (spinnerText) spinnerText.textContent = text;
  }

  function resetBtn(btn) {
    if (!btn) return;
    btn.classList.remove("btn-loading");
    btn.querySelector(".btn-text").style.display = "";
    btn.querySelector(".btn-spinner").style.display = "none";
  }

  function showSaveRecordingModal() {
    if (!recordingBlob) {
      fetch(`${API_BASE}/live/end/${currentRoomId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      window.location.replace("/live-session");
      return;
    }

    const old = document.getElementById("saveRecordingModal");
    if (old) old.remove();

    const defaultTitle = `Live Session Recording ${new Date().toLocaleString()}`;
    const modal = document.createElement("div");
    modal.id = "saveRecordingModal";
    modal.className = "modal-overlay show";
    modal.innerHTML = `
        <div class="modal-card" style="text-align:center;">
            <div class="modal-icon blue"><i class="fas fa-save"></i></div>
            <h3>Save Recording</h3>
            <p>Name your live session recording before saving</p>
            <input type="text" id="saveRecTitle" class="rename-input" value="${defaultTitle}" maxlength="80">
            <div class="modal-actions" style="justify-content:center;">
                <button class="btn btn-outline" id="btnDiscardRec">
                    <span class="btn-text"><i class="fas fa-trash"></i> Discard</span>
                    <span class="btn-spinner"><i class="fas fa-spinner fa-spin"></i> Discarding...</span>
                </button>
                <button class="btn btn-primary" id="btnSaveRec">
                    <span class="btn-text"><i class="fas fa-cloud-upload-alt"></i> Save</span>
                    <span class="btn-spinner"><i class="fas fa-spinner fa-spin"></i> Saving...</span>
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const titleInput = document.getElementById("saveRecTitle");
    titleInput.focus();
    titleInput.select();

    document.getElementById("btnDiscardRec").addEventListener("click", () => {
      setBtnLoading(document.getElementById("btnDiscardRec"), "Discarding...");
      setTimeout(() => {
        modal.remove();
        fetch(`${API_BASE}/live/end/${currentRoomId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        window.location.replace("/live-session");
      }, 300);
    });
    document
      .getElementById("btnSaveRec")
      .addEventListener("click", async () => {
        const title = titleInput.value.trim() || defaultTitle;
        if (!recordingBlob) {
          showToast("No recording available", true);
          return;
        }
        const token = getToken();
        const formData = new FormData();
        formData.append("video", recordingBlob, "recording.webm");
        const btn = document.getElementById("btnSaveRec");
        setBtnLoading(btn, "Saving...");
        try {
          const res = await fetch(
            `${API_BASE}/recordings?title=${encodeURIComponent(title)}&duration=${liveSeconds}`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            },
          );
          if (res.ok) {
            showToast("Recording saved!", false);
            modal.remove();
            await fetch(`${API_BASE}/live/end/${currentRoomId}`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${token}` },
            });
            window.location.replace("/live-session");
          } else {
            const err = await res.json();
            showToast(err.message || "Failed to save", true);
            resetBtn(btn);
          }
        } catch (e) {
          showToast("Network error", true);
          resetBtn(btn);
        }
      });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
        fetch(`${API_BASE}/live/end/${currentRoomId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        window.location.replace("/live-session");
      }
    });
  }

  // window.copyShareUrl = function() {
  //     document.getElementById('shareUrl').select();
  //     document.execCommand('copy');
  //     alert('Link copied!');
  // };
  window.copyShareUrl = function () {
    document.getElementById("shareUrl").select();
    document.execCommand("copy");
    showToast("Link copied!", false);
  };
  window.clearPinnedMessage = function () {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "clear-pin" }));
    hidePinnedBar();
  };

  function showPinnedBar(message, userName) {
    const bar = document.getElementById("pinnedBar");
    document.getElementById("pinnedText").textContent =
      `${userName}: ${message}`;
    bar.classList.add("show");
  }

  function hidePinnedBar() {
    document.getElementById("pinnedBar").classList.remove("show");
  }

  function showToast(msg, isError = false) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: ${isError ? "#ef4444" : "#22c55e"}; color: #fff; padding: 12px 24px; border-radius: 8px; font-weight: 600; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.2);`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // Kick off everything
  startStreaming();
})();

(function () {
  "use strict";

  // ── Webcam State ─────────────────────────
  let webcamStream = null;
  let bubbleSize = 140;
  let bubblePos = "br"; // bottom‑right
  let bubbleShape = "circle";
  let bubbleBorderColor = "#3b82f6";
  let bubbleBorderAnim = "solid";
  let floatingBubbleWindow = null;
  const isElectron = window.electronAPI?.isElectron;

  // ── Other Feature State ─────────────────
  let micAnalyser = null,
    micAnimFrame = null;
  let spotlightActive = false,
    zoomLevel = 1;
  let activeKeys = new Set(),
    keyTimers = {};
  let fpsInterval = null,
    lastFrameTime = 0,
    frameCount = 0;
  let isStreaming = false; // will be set to true when stream starts

  // DOM refs
  const streamBox = document.getElementById("streamBox");
  const toggleCam = document.getElementById("toggleCam");
  const camCard = document.getElementById("camCard");
  const bubbleColorPicker = document.getElementById("bubbleColorPicker");
  const spotlightOverlay = document.getElementById("spotlightOverlay");
  const zoomIndicator = document.getElementById("zoomIndicator");
  const keystrokeDisplay = document.getElementById("keystrokeDisplay");
  const fpsDisplay = document.getElementById("fpsDisplay");
  const toggleMic = document.getElementById("toggleMic");
  const micBar = document.getElementById("micBar");
  const micLabel = document.getElementById("micLabel");
  const toggleToolbar = document.getElementById("toggleToolbar");
  const statusDot = document.getElementById("statusDot");
  const statusTitle = document.getElementById("statusTitle");
  const statusSub = document.getElementById("statusSub");

  // ── Helpers ────────────────────────────
  function showToast(msg, isError) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.cssText = `position:fixed;bottom:20px;right:20px;background:${isError ? "#ef4444" : "#22c55e"};color:#fff;padding:12px 24px;border-radius:8px;font-weight:600;z-index:9999;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
  function setStatus(state, title, sub) {
    if (statusDot) statusDot.className = `status-dot ${state}`;
    if (statusTitle) statusTitle.textContent = title;
    if (statusSub) statusSub.textContent = sub;
  }

  // ── Bubble style helpers (from recording.js) ──
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
    let borderAnimationStyle = "",
      borderAnimationName = "none";
    if (bubbleBorderAnim === "pulse") {
      borderAnimationName = "floatBorderPulse 2s ease-in-out infinite";
      borderAnimationStyle = `@keyframes floatBorderPulse{0%,100%{box-shadow:0 6px 28px rgba(0,0,0,0.6),0 0 0 4px ${bubbleBorderColor}80;}50%{box-shadow:0 6px 28px rgba(0,0,0,0.6),0 0 0 14px transparent;}}`;
    } else if (bubbleBorderAnim === "rainbow") {
      borderAnimationName = "floatRainbowBorder 3s linear infinite";
      borderAnimationStyle = `@keyframes floatRainbowBorder{0%{border-color:#ef4444;}20%{border-color:#f59e0b;}40%{border-color:#22c55e;}60%{border-color:#3b82f6;}80%{border-color:#a855f7;}100%{border-color:#ef4444;}}`;
    } else if (bubbleBorderAnim === "glow") {
      borderAnimationName = "floatGlowPulse 1.5s ease-in-out infinite";
      borderAnimationStyle = `@keyframes floatGlowPulse{0%,100%{box-shadow:0 6px 28px rgba(0,0,0,0.6),0 0 20px 4px ${bubbleBorderColor};}50%{box-shadow:0 6px 28px rgba(0,0,0,0.6),0 0 40px 10px ${bubbleBorderColor};}}`;
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
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"><style>
                    *{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:transparent!important;overflow:hidden;user-select:none;-webkit-app-region:drag;cursor:move}
                    .bubble-container{width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative}
                    .bubble{position:relative;width:${bubbleSize}px;height:${bubbleSize}px;overflow:hidden;border:3px solid ${bubbleBorderColor};border-radius:${styles.borderRadius};box-shadow:0 6px 28px rgba(0,0,0,0.6),0 0 0 4px rgba(59,130,246,0.5);background:#0a1628;transition:box-shadow 0.3s,border-radius 0.3s;animation:${styles.blobAnimation},${styles.borderAnimationName}}
                    .bubble:hover{box-shadow:0 8px 36px rgba(0,0,0,0.65),0 0 0 5px rgba(56,189,248,0.7)}
                    .bubble video{width:100%;height:100%;object-fit:cover;display:block;-webkit-app-region:no-drag}
                    .bubble-off{position:absolute;inset:0;background:#0a1628;display:none;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);font-size:${bubbleSize * 0.4}px;border-radius:inherit}
                    .bubble-off.show{display:flex}
                    .close-btn{position:absolute;top:8px;right:8px;width:24px;height:24px;background:rgba(239,68,68,0.9);border:none;border-radius:50%;color:#fff;font-size:0.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:all 0.2s;opacity:0;-webkit-app-region:no-drag}
                    .close-btn:hover{background:#ef4444;transform:scale(1.1)}
                    .bubble:hover .close-btn{opacity:1}
                    ${bubbleShape === "blob" ? `@keyframes floatBlobMorph{0%,100%{border-radius:60% 40% 50% 50% / 50% 60% 40% 50%}33%{border-radius:40% 60% 50% 50% / 60% 40% 60% 40%}66%{border-radius:55% 45% 45% 55% / 55% 55% 45% 45%}}` : ""}
                    ${styles.borderAnimationStyle}
                    .drag-hint{position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:rgba(255,255,255,0.6);padding:3px 10px;border-radius:10px;font-size:0.55rem;font-family:'Segoe UI',sans-serif;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity 0.3s}
                    .bubble-container:hover .drag-hint{opacity:1}
                </style></head><body><div class="bubble-container"><div class="bubble" id="mainBubble"><video id="bubbleVideo" autoplay muted playsinline></video><div class="bubble-off" id="bubbleOff"><i class="fas fa-video-slash"></i></div><button class="close-btn" id="closeBtn" title="Close webcam"><i class="fas fa-times"></i></button><div class="drag-hint">Drag to move anywhere</div></div></div><script>
                    document.getElementById('closeBtn').addEventListener('click',function(e){e.stopPropagation();window.opener.postMessage({type:'CLOSE_FLOATING_BUBBLE'},'*');window.close();});
                    window.addEventListener('beforeunload',function(){window.opener.postMessage({type:'BUBBLE_WINDOW_CLOSED'},'*');});
                    window.addEventListener('message',function(e){
                        if(e.data&&e.data.type==='UPDATE_BUBBLE_STYLE'){
                            const bubble=document.getElementById('mainBubble'),off=document.getElementById('bubbleOff');
                            if(bubble&&e.data.styles){
                                const s=e.data.styles;
                                bubble.style.width=s.size+'px';bubble.style.height=s.size+'px';
                                bubble.style.borderColor=s.borderColor;bubble.style.borderRadius=s.borderRadius;
                                bubble.style.animation=s.blobAnimation+(s.blobAnimation&&s.borderAnimation?', ':'')+s.borderAnimation;
                                if(off)off.style.fontSize=(s.size*0.4)+'px';
                            }
                            window.resizeTo(e.data.styles.size+16,e.data.styles.size+16);
                        }
                        if(e.data&&e.data.type==='SET_WEBCAM_STREAM'){
                            const video=document.getElementById('bubbleVideo'),off=document.getElementById('bubbleOff');
                            if(video&&e.data.streamId){
                                navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}})
                                .then(stream=>{video.srcObject=stream;if(off)off.classList.remove('show');})
                                .catch(()=>{if(off)off.classList.add('show');});
                            }
                        }
                    });
                <\/script></body></html>`;
  }

  function createFloatingBubble() {
    closeFloatingBubble();
    const width = bubbleSize + 16,
      height = bubbleSize + 16;
    const left = screen.width - width - 20,
      top = screen.height - height - 80;
    floatingBubbleWindow = window.open(
      "",
      "WebcamBubble",
      `width=${width},height=${height},left=${left},top=${top},resizable=no,alwaysOnTop=yes,frame=no,titlebar=no,menubar=no,toolbar=no,location=no,status=no,scrollbars=no`,
    );
    if (!floatingBubbleWindow) {
      showToast("Please allow popups for webcam bubble", true);
      return;
    }
    floatingBubbleWindow.document.write(buildBubbleHTML());
    floatingBubbleWindow.document.close();
    setTimeout(() => {
      if (floatingBubbleWindow && !floatingBubbleWindow.closed) {
        const video =
          floatingBubbleWindow.document.getElementById("bubbleVideo");
        const off = floatingBubbleWindow.document.getElementById("bubbleOff");
        if (video && webcamStream) {
          video.srcObject = webcamStream;
          if (off) off.classList.remove("show");
        } else if (off) off.classList.add("show");
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

  // Move popup window to selected corner (for browser)
  function moveFloatingBubbleToPos(pos) {
    if (!floatingBubbleWindow || floatingBubbleWindow.closed) return;
    const w = bubbleSize + 16,
      h = bubbleSize + 16;
    let left, top;
    switch (pos) {
      case "br":
        left = screen.width - w - 20;
        top = screen.height - h - 80;
        break;
      case "bl":
        left = 20;
        top = screen.height - h - 80;
        break;
      case "tr":
        left = screen.width - w - 20;
        top = 20;
        break;
      case "tl":
        left = 20;
        top = 20;
        break;
    }
    floatingBubbleWindow.moveTo(left, top);
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
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop());
        webcamStream = null;
      }
    }
  });

  // ── Webcam Toggle ──────────────────────
  toggleCam?.addEventListener("change", async () => {
    if (toggleCam.checked) {
      camCard?.classList.add("cam-active");
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
        if (webcamStream) {
          webcamStream.getTracks().forEach((t) => t.stop());
          webcamStream = null;
        }
      }
    }
  });

  function updateNativeBubbleStyle() {
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
      borderRadius,
      blobAnimation,
      borderAnimation,
      shape: bubbleShape,
    });
  }

  // ── Style Control Buttons ──────────────────
  document.querySelectorAll(".shape-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".shape-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bubbleShape = btn.dataset.shape;
      updateFloatingBubbleStyle();
      updateNativeBubbleStyle();
    }),
  );
  document.querySelectorAll(".size-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".size-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bubbleSize = parseInt(btn.dataset.size);
      updateFloatingBubbleStyle();
      updateNativeBubbleStyle();
    }),
  );
  document.querySelectorAll(".pos-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".pos-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bubblePos = btn.dataset.pos;
      if (!isElectron)
        moveFloatingBubbleToPos(bubblePos); // move popup window
      else window.electronAPI.moveWebcamBubble(bubblePos, bubbleSize);
      updateFloatingBubbleStyle();
      updateNativeBubbleStyle();
    }),
  );
  bubbleColorPicker?.addEventListener("input", () => {
    bubbleBorderColor = bubbleColorPicker.value;
    updateFloatingBubbleStyle();
    updateNativeBubbleStyle();
  });
  document.querySelectorAll(".border-anim-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".border-anim-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bubbleBorderAnim = btn.dataset.anim;
      updateFloatingBubbleStyle();
      updateNativeBubbleStyle();
    }),
  );

  // ── Mic Meter ─────────────────────────
  function startMicMeter() {
    if (!window._micStream) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(window._micStream);
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
      startMicMeter();
    }
  });

  // ── Monitor stream start/stop ─────────────────
  const videoEl = document.getElementById("streamPreview");
  if (videoEl) {
    const observer = new MutationObserver(() => {
      if (videoEl.srcObject) {
        isStreaming = true;
        startFpsCounter();
        fpsDisplay?.classList.remove("hidden");
        setStatus("live", "Live Streaming", "Screen shared");
      } else {
        isStreaming = false;
        stopFpsCounter();
        fpsDisplay?.classList.add("hidden");
        activeKeys.clear();
        updateKeystrokeDisplay();
        spotlightActive = false;
        spotlightOverlay?.classList.remove("active");
        setZoom(1);
        setStatus("idle", "Ready", "Stream ended");
      }
    });
    observer.observe(videoEl, {
      attributes: true,
      attributeFilter: ["srcObject"],
    });
  }

  // Start mic meter if mic is checked and stream available
  if (toggleMic?.checked && window._micStream) startMicMeter();

  window.addEventListener("beforeunload", () => {
    closeFloatingBubble();
    if (webcamStream) {
      webcamStream.getTracks().forEach((t) => t.stop());
    }
  });
})();
