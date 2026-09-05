const roomId = window.location.pathname.split("/").pop();
const API_BASE = window.location.origin + "/api";
const WS_BASE = window.location.origin.replace("http", "ws") + "/ws/live";
let ws = null,
  pc = null,
  userName = "Anonymous";
let pendingIce = [];

// Join button elements
const joinBtn = document.getElementById("joinBtn");
const joinBtnText = joinBtn.querySelector(".btn-text");
const joinBtnSpinner = joinBtn.querySelector(".btn-spinner");

// Initial loading state
joinBtn.disabled = true;
joinBtnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

function setJoinLoading(isLoading) {
  if (isLoading) {
    joinBtn.disabled = true;
    joinBtnText.style.display = "none";
    joinBtnSpinner.style.display = "inline-flex";
  } else {
    joinBtn.disabled = false;
    joinBtnText.style.display = "inline-flex";
    joinBtnSpinner.style.display = "none";
  }
}

async function joinSession() {
  if (joinBtn.disabled) return;
  userName = document.getElementById("viewerName").value.trim() || "Anonymous";
  const passwordInput = document.getElementById("accessInput");
  const password = passwordInput.value.trim();
  if (passwordInput.style.display !== "none" && !password) {
    alert("Please enter the password");
    return;
  }

  setJoinLoading(true);

  try {
    const res = await fetch(`${API_BASE}/live/join/${roomId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    document.getElementById("joinForm").classList.add("hidden");
    document.getElementById("streamView").classList.remove("hidden");
    document.getElementById("hostNameLive").textContent =
      data.hostName || "Host";
    document.getElementById("titleLive").textContent = data.title || "";
    document.getElementById("hostAvatar").textContent = (data.hostName ||
      "H")[0].toUpperCase();

    await loadChatHistory();
    connectWebSocket();
  } catch (err) {
    alert("Failed to join: " + err.message);
    setJoinLoading(false);
  }
}

// Fullscreen toggle
function toggleFullscreen() {
  const container = document.getElementById("videoContainer");
  const btn = document.getElementById("fullscreenBtn");
  if (!document.fullscreenElement) {
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
      /* Safari */
      container.webkitRequestFullscreen();
    } else if (container.msRequestFullscreen) {
      /* IE/Edge */
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

// Listen for fullscreen change to update icon
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

// ═══ LOAD CHAT HISTORY ═══
async function loadChatHistory() {
  try {
    const res = await fetch(`${API_BASE}/live/chat/${roomId}`);
    if (!res.ok) return;
    const messages = await res.json();
    const div = document.getElementById("chatMessages");
    div.innerHTML = "";
    messages.forEach((msg) => {
      addChat(msg.userName, msg.message, msg.timestamp);
    });
  } catch (e) {
    console.warn("Could not load chat history:", e);
  }
}

function connectWebSocket() {
  const wsUrl = `${WS_BASE}?roomId=${roomId}&role=viewer&userId=${encodeURIComponent(userName)}`;
  ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    console.log("✅ Viewer WebSocket connected");
    createPeerConnection();
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "offer" && pc) handleOffer(msg.offer);
    if (msg.type === "ice-candidate" && pc) handleIceCandidate(msg.candidate);
    if (msg.type === "chat-message")
      addChat(msg.userName, msg.message, msg.timestamp);
    if (msg.type === "session-ended") {
      document.getElementById("streamView").innerHTML =
        '<div class="join-card"><h1>Session Ended</h1><p>The host has stopped.</p></div>';
      document.getElementById("streamView").classList.remove("hidden");
    } else if (msg.type === "pin-message") {
      if (msg.pinned) {
        const bar = document.getElementById("pinnedBar");
        document.getElementById("pinnedText").textContent =
          `${msg.userName}: ${msg.message}`;
        bar.classList.add("show");
      } else {
        document.getElementById("pinnedBar").classList.remove("show");
      }
    } else if (msg.type === "clear-pin") {
      document.getElementById("pinnedBar").classList.remove("show");
    }
  };
  ws.onerror = (err) => console.error("WebSocket error:", err);
}

let remoteStream = null;
function createPeerConnection() {
  pc = new RTCPeerConnection({
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
  remoteStream = new MediaStream();
  const video = document.getElementById("remoteVideo");
  video.srcObject = remoteStream;
  video.muted = true;
  pc.ontrack = (event) => {
    remoteStream.addTrack(event.track);
    if (event.track.kind === "video") {
      video.srcObject = remoteStream;
      video
        .play()
        .then(() => {
          video.muted = false;
          document.getElementById("unmuteBtn").style.display = "none";
        })
        .catch(() => {
          document.getElementById("unmuteBtn").style.display = "flex";
        });
    }
  };
  pc.onicecandidate = (event) => {
    if (event.candidate && ws?.readyState === 1) {
      ws.send(
        JSON.stringify({ type: "ice-candidate", candidate: event.candidate }),
      );
    }
  };
  pc.onconnectionstatechange = () =>
    console.log("🔗 Viewer connection state:", pc.connectionState);
  pendingIce.forEach((c) =>
    pc.addIceCandidate(new RTCIceCandidate(c)).catch((e) => console.error(e)),
  );
  pendingIce = [];
}

async function handleOffer(offer) {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: "answer", answer: pc.localDescription }));
}

function handleIceCandidate(candidate) {
  if (!pc.remoteDescription) pendingIce.push(candidate);
  else
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) =>
      console.error(err),
    );
}

window.unmuteVideo = function () {
  const video = document.getElementById("remoteVideo");
  video.muted = false;
  document.getElementById("unmuteBtn").style.display = "none";
};

function addChat(name, message, time) {
  const div = document.getElementById("chatMessages");
  const existing = div.querySelector(`[data-time="${time}"]`);
  if (existing) return;
  div.innerHTML += `
                <div class="chat-msg" data-time="${time}">
                    <div class="chat-avatar viewer">${(name || "?")[0].toUpperCase()}</div>
                    <div class="chat-bubble">
                        <div class="chat-name">${esc(name)}</div>
                        <div>${esc(message)}</div>
                        <div class="chat-time">${new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                </div>`;
  div.scrollTop = div.scrollHeight;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

window.sendChat = function () {
  const input = document.getElementById("chatInput");
  if (!input.value.trim() || !ws) return;
  ws.send(
    JSON.stringify({
      type: "chat-message",
      message: input.value.trim(),
      userName,
    }),
  );
  input.value = "";
};

// Load session info and manage UI
fetch(`${API_BASE}/live/join/${roomId}`)
  .then((r) => r.json())
  .then((d) => {
    document.getElementById("sessionTitle").textContent =
      d.title || "Live Session";
    document.getElementById("hostName").textContent = d.hostName || "Unknown";

    const accessInput = document.getElementById("accessInput");
    if (d.hasPassword) {
      accessInput.style.display = "block";
      accessInput.placeholder = "Enter password";
    } else {
      accessInput.style.display = "none";
    }

    if (d.scheduledAt) {
      const start = new Date(d.scheduledAt).toLocaleString();
      const end = d.scheduledEndAt
        ? " → " + new Date(d.scheduledEndAt).toLocaleString()
        : "";
      document.getElementById("scheduleInfo").textContent = `📅 ${start}${end}`;
    }

    if (d.status === "scheduled") {
      document.getElementById("statusBadge").innerHTML =
        `<span class="badge badge-scheduled">📅 Scheduled for ${new Date(d.scheduledAt).toLocaleString()}</span>`;
      joinBtn.disabled = true;
      joinBtnText.innerHTML = '<i class="fas fa-clock"></i> Wait for host';
      startCountdown(d.scheduledAt, d.scheduledEndAt);
    } else if (d.status === "ended") {
      document.getElementById("statusBadge").innerHTML =
        '<span class="badge badge-ended">⏹️ Ended</span>';
      joinBtn.disabled = true;
      joinBtnText.innerHTML =
        '<i class="fas fa-stop-circle"></i> Session Ended';
    } else if (d.status === "live") {
      document.getElementById("statusBadge").innerHTML =
        '<span class="badge badge-live">🔴 LIVE</span>';
      joinBtn.disabled = false;
      joinBtnText.innerHTML = '<i class="fas fa-play-circle"></i> Join Session';
    } else {
      joinBtn.disabled = true;
      joinBtnText.innerHTML = '<i class="fas fa-clock"></i> Not available';
    }
  })
  .catch(() => {
    document.getElementById("sessionTitle").textContent = "Session Not Found";
    joinBtn.disabled = true;
    joinBtnText.innerHTML =
      '<i class="fas fa-exclamation-circle"></i> Not Found';
  });

function startCountdown(startTime, endTime) {
  const countdownEl = document.createElement("div");
  countdownEl.className = "countdown-timer";
  countdownEl.id = "countdownDisplay";
  document.getElementById("joinForm").appendChild(countdownEl);

  function update() {
    const now = Date.now();
    const start = new Date(startTime).getTime();
    const diff = start - now;
    if (diff <= 0) {
      countdownEl.textContent = "Starting soon…";
      clearInterval(countdownInterval);
      setTimeout(() => location.reload(), 10000);
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    countdownEl.textContent = `Starts in: ${days > 0 ? days + "d " : ""}${hours}h ${mins}m ${secs}s`;
  }
  update();
  let countdownInterval = setInterval(update, 1000);
}
