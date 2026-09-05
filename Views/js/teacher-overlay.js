// ⬅️ Direct require — no preload needed
const { ipcRenderer } = require("electron");

// ═══ STATE ═══
let isPoweredOn = false;
let currentTool = "laser";
let currentColor = "#ef4444";
let penSize = 4;
let isDrawing = false;
let paths = [];
let undonePaths = [];
let currentPath = [];
let isCollapsed = false;

// ═══ DOM ═══
const canvas = document.getElementById("annotationCanvas");
const ctx = canvas.getContext("2d");
const laserDot = document.getElementById("laserDot");
const toolbar = document.getElementById("toolbar");
const toolbarWrapper = document.getElementById("toolbarWrapper");
const btnPower = document.getElementById("btnPower");

// ═══ CANVAS SETUP ═══
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  redrawAll();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ═══ POWER ON/OFF ═══
function setPowerState(on) {
  isPoweredOn = on;
  console.log("🔌 Power:", on ? "ON" : "OFF");

  if (on) {
    btnPower.classList.add("on");
    btnPower.title = "ON — Click or press P to turn OFF";
    toolbar.classList.remove("disabled");
    ipcRenderer.send("teacher-overlay-set-ignore-mouse", false);
    setTool(currentTool);
  } else {
    btnPower.classList.remove("on");
    btnPower.title = "OFF — Click or press P to turn ON";
    toolbar.classList.add("disabled");
    ipcRenderer.send("teacher-overlay-set-ignore-mouse", true);

    canvas.classList.remove("drawing-mode");
    laserDot.style.display = "none";
    document.body.style.cursor = "default";
    isDrawing = false;

    document.getElementById("btnLaser").classList.remove("active");
    document.getElementById("btnDraw").classList.remove("active");
  }
}

// ═══ DRAWING ═══
function redrawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paths.forEach(({ points, color, size }) => {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  });
}

function clearAll() {
  paths = [];
  undonePaths = [];
  redrawAll();
}
function undo() {
  if (paths.length > 0) {
    undonePaths.push(paths.pop());
    redrawAll();
  }
}
function redo() {
  if (undonePaths.length > 0) {
    paths.push(undonePaths.pop());
    redrawAll();
  }
}

// ═══ TOOL SELECTION ═══
function setTool(tool) {
  if (!isPoweredOn) {
    currentTool = "none";
    document.getElementById("btnLaser").classList.remove("active");
    document.getElementById("btnDraw").classList.remove("active");
    return;
  }
  currentTool = tool;
  document
    .getElementById("btnLaser")
    .classList.toggle("active", tool === "laser");
  document
    .getElementById("btnDraw")
    .classList.toggle("active", tool === "draw");

  if (tool === "draw") {
    canvas.classList.add("drawing-mode");
    laserDot.style.display = "none";
    document.body.style.cursor = "crosshair";
  } else if (tool === "laser") {
    canvas.classList.remove("drawing-mode");
    document.body.style.cursor = "none";
    updateLaserColor();
  } else {
    canvas.classList.remove("drawing-mode");
    laserDot.style.display = "none";
    document.body.style.cursor = "default";
  }
}

function updateLaserColor() {
  laserDot.style.background = `radial-gradient(circle, ${currentColor}dd 0%, ${currentColor}44 40%, transparent 70%)`;
  laserDot.style.boxShadow = `0 0 28px 10px ${currentColor}88`;
}

// ═══ MOUSE EVENTS ═══
document.addEventListener("mousemove", (e) => {
  if (!isPoweredOn) return;

  if (currentTool === "laser") {
    laserDot.style.display = "block";
    laserDot.style.left = e.clientX + "px";
    laserDot.style.top = e.clientY + "px";
  }

  if (!isDrawing || currentTool !== "draw") return;

  const point = { x: e.clientX, y: e.clientY };
  currentPath.push(point);
  const last = currentPath[currentPath.length - 2];
  if (last) {
    ctx.beginPath();
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = penSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
});

document.addEventListener("mousedown", (e) => {
  if (!isPoweredOn) return;
  if (e.target.closest("#toolbarWrapper") || e.target.closest("#toolbar"))
    return;
  if (currentTool !== "draw") return;

  isDrawing = true;
  currentPath = [{ x: e.clientX, y: e.clientY }];
  undonePaths = [];
});

document.addEventListener("mouseup", () => {
  if (!isPoweredOn) return;
  if (isDrawing && currentPath.length > 0) {
    paths.push({
      points: [...currentPath],
      color: currentColor,
      size: penSize,
    });
  }
  isDrawing = false;
  currentPath = [];
});

// ═══ BUTTON HANDLERS ═══
btnPower.addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  console.log("⚡ Power button clicked");
  setPowerState(!isPoweredOn);
});

document.getElementById("btnLaser").addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  if (!isPoweredOn) return;
  setTool(currentTool === "laser" ? "none" : "laser");
});

document.getElementById("btnDraw").addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  if (!isPoweredOn) return;
  setTool(currentTool === "draw" ? "none" : "draw");
});

document.getElementById("btnClear").addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  if (!isPoweredOn) return;
  clearAll();
});

document.getElementById("btnUndo").addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  if (!isPoweredOn) return;
  undo();
});

document.getElementById("btnRedo").addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  if (!isPoweredOn) return;
  redo();
});

document.getElementById("closeBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  console.log("✕ Close clicked");
  ipcRenderer.send("close-teacher-overlay");
});

document.getElementById("collapseBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  isCollapsed = !isCollapsed;
  toolbar.classList.toggle("collapsed", isCollapsed);
  const icon = document.querySelector("#collapseBtn i");
  icon.className = isCollapsed ? "fas fa-chevron-left" : "fas fa-chevron-right";
});

// ═══ COLORS ═══
document.querySelectorAll(".color-dot").forEach((dot) => {
  dot.addEventListener("click", function (e) {
    e.stopPropagation();
    e.preventDefault();
    if (!isPoweredOn) return;
    document
      .querySelectorAll(".color-dot")
      .forEach((d) => d.classList.remove("active"));
    this.classList.add("active");
    currentColor = this.dataset.color;
    updateLaserColor();
  });
});

// ═══ DRAG ═══
let isDragging = false,
  startX,
  startY,
  tx,
  ty;
document.getElementById("dragHandle").addEventListener("mousedown", (e) => {
  e.stopPropagation();
  e.preventDefault();
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  const r = toolbar.getBoundingClientRect();
  tx = r.left;
  ty = r.top;
  toolbar.style.transition = "none";
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  let nx = tx + (e.clientX - startX);
  let ny = ty + (e.clientY - startY);
  nx = Math.max(0, Math.min(window.innerWidth - toolbar.offsetWidth, nx));
  ny = Math.max(0, Math.min(window.innerHeight - toolbar.offsetHeight, ny));
  toolbar.style.right = "auto";
  toolbar.style.top = ny + "px";
  toolbar.style.left = nx + "px";
  toolbar.style.transform = "none";
});

document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    toolbar.style.transition = "all 0.3s ease";
  }
});

// ═══ KEYBOARD ═══
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    setPowerState(!isPoweredOn);
    return;
  }

  if (!isPoweredOn) return;

  switch (e.key.toLowerCase()) {
    case "l":
      setTool(currentTool === "laser" ? "none" : "laser");
      break;
    case "d":
      setTool(currentTool === "draw" ? "none" : "draw");
      break;
    case "c":
      clearAll();
      break;
    case "escape":
      setTool("none");
      break;
  }
  if (e.ctrlKey && e.key === "z") {
    e.preventDefault();
    undo();
  }
  if (e.ctrlKey && e.key === "y") {
    e.preventDefault();
    redo();
  }
});

// ═══ INIT ═══
console.log("✅ Teacher Overlay script started");
console.log('   require("electron") =', require("electron") ? "OK" : "FAIL");
setPowerState(false);
console.log("✅ Toolbar initialized — Press P or click ⚡ to turn ON");
