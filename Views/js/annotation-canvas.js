const { ipcRenderer } = require("electron");

let active = false;
let tool = "laser";
let color = "#ef4444";
let penSize = 4;
let drawing = false;
let startX = 0,
  startY = 0;
let lastMX = 0,
  lastMY = 0;
let paths = [],
  undone = [],
  currentPath = [];

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const laserDot = document.getElementById("laserDot");
const cursorDot = document.getElementById("cursorDot");

function resize() {
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.putImageData(img, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paths.forEach((item) => {
    if (item.type === "freehand") {
      if (item.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(item.points[0].x, item.points[0].y);
      for (let i = 1; i < item.points.length; i++) {
        ctx.lineTo(item.points[i].x, item.points[i].y);
      }
      ctx.stroke();
    } else if (item.type === "rect") {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.size;
      ctx.strokeRect(item.x, item.y, item.w, item.h);
    } else if (item.type === "circle") {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.size;
      ctx.beginPath();
      ctx.ellipse(item.cx, item.cy, item.rx, item.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function updateLaser() {
  laserDot.style.background = `radial-gradient(circle, ${color}dd 0%, ${color}44 40%, transparent 70%)`;
  laserDot.style.boxShadow = `0 0 28px 10px ${color}88`;
  laserDot.style.animation = "laserPulse 1.5s ease-in-out infinite";
}
updateLaser();

// Eraser: check if mouse is near any path and remove it
function eraseAtPoint(x, y) {
  const threshold = 18;
  let erased = false;
  paths = paths.filter((item) => {
    let near = false;
    if (item.type === "freehand") {
      near = item.points.some((p) => Math.hypot(p.x - x, p.y - y) < threshold);
    } else if (item.type === "rect") {
      near =
        x >= item.x - threshold &&
        x <= item.x + item.w + threshold &&
        y >= item.y - threshold &&
        y <= item.y + item.h + threshold;
    } else if (item.type === "circle") {
      const dist = Math.hypot(x - item.cx, y - item.cy);
      near = dist < item.rx + threshold;
    }
    if (near) erased = true;
    return !near;
  });
  if (erased) {
    undone = [];
    redraw();
  }
}

// ═══ SINGLE mousemove handler ═══
document.addEventListener("mousemove", (e) => {
  // Track last position for shapes
  lastMX = e.clientX;
  lastMY = e.clientY;

  if (!active) return;

  // Update cursor visuals
  if (tool === "laser") {
    laserDot.style.display = "block";
    cursorDot.style.display = "none";
    laserDot.style.left = e.clientX + "px";
    laserDot.style.top = e.clientY + "px";
  } else if (tool === "draw" || tool === "rect" || tool === "circle") {
    laserDot.style.display = "none";
    cursorDot.style.display = "block";
    cursorDot.style.left = e.clientX + "px";
    cursorDot.style.top = e.clientY + "px";
    cursorDot.style.background = color;
    cursorDot.style.width = penSize + "px";
    cursorDot.style.height = penSize + "px";
    cursorDot.style.border = "2px solid #fff";
    cursorDot.style.borderRadius = "50%";
  } else if (tool === "eraser") {
    laserDot.style.display = "none";
    cursorDot.style.display = "block";
    cursorDot.style.left = e.clientX + "px";
    cursorDot.style.top = e.clientY + "px";
    cursorDot.style.background = "rgba(255,255,255,0.3)";
    cursorDot.style.width = "22px";
    cursorDot.style.height = "22px";
    cursorDot.style.border = "2px dashed #fff";
    cursorDot.style.borderRadius = "50%";
  } else {
    laserDot.style.display = "none";
    cursorDot.style.display = "none";
  }

  // Eraser drag
  if (tool === "eraser" && drawing) {
    eraseAtPoint(e.clientX, e.clientY);
    return;
  }

  // Freehand drawing
  if (drawing && tool === "draw") {
    const pt = { x: e.clientX, y: e.clientY };
    currentPath.push(pt);
    const last = currentPath[currentPath.length - 2];
    if (last) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = penSize;
      ctx.lineCap = "round";
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    return;
  }

  // Shape preview (rect/circle)
  if (drawing && (tool === "rect" || tool === "circle")) {
    redraw();
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    ctx.strokeStyle = color;
    ctx.lineWidth = penSize;
    if (tool === "rect") {
      ctx.strokeRect(x, y, w, h);
    } else if (tool === "circle") {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
});

document.addEventListener("mousedown", (e) => {
  if (!active) return;
  startX = e.clientX;
  startY = e.clientY;

  if (tool === "draw") {
    drawing = true;
    currentPath = [{ x: e.clientX, y: e.clientY }];
    undone = [];
  } else if (tool === "eraser") {
    drawing = true;
    eraseAtPoint(e.clientX, e.clientY);
  } else if (tool === "rect" || tool === "circle") {
    drawing = true;
    undone = [];
  }
});

document.addEventListener("mouseup", () => {
  if (!active || !drawing) return;

  if (tool === "draw" && currentPath.length > 0) {
    paths.push({
      type: "freehand",
      points: [...currentPath],
      color,
      size: penSize,
    });
  } else if (tool === "rect") {
    const x = Math.min(startX, lastMX);
    const y = Math.min(startY, lastMY);
    const w = Math.abs(lastMX - startX);
    const h = Math.abs(lastMY - startY);
    if (w > 3 && h > 3) {
      paths.push({ type: "rect", x, y, w, h, color, size: penSize });
    }
  } else if (tool === "circle") {
    const cx = startX + (lastMX - startX) / 2;
    const cy = startY + (lastMY - startY) / 2;
    const rx = Math.abs(lastMX - startX) / 2;
    const ry = Math.abs(lastMY - startY) / 2;
    if (rx > 3 && ry > 3) {
      paths.push({ type: "circle", cx, cy, rx, ry, color, size: penSize });
    }
  }

  drawing = false;
  currentPath = [];
  redraw();
});

// ═══ IPC commands from toolbar ═══
ipcRenderer.on("annotation-cmd", (event, data) => {
  console.log("📨 Canvas received cmd:", data.cmd, data);

  switch (data.cmd) {
    case "tool":
      tool = data.tool;
      if (tool !== "laser") laserDot.style.display = "none";
      if (tool === "none") cursorDot.style.display = "none";
      document.body.style.cursor =
        tool === "draw"
          ? "crosshair"
          : tool === "eraser"
            ? "default"
            : tool === "laser"
              ? "none"
              : "default";
      break;
    case "color":
      color = data.color;
      updateLaser();
      break;
    case "undo":
      if (paths.length > 0) {
        undone.push(paths.pop());
        redraw();
      }
      break;
    case "redo":
      if (undone.length > 0) {
        paths.push(undone.pop());
        redraw();
      }
      break;
    case "clear":
      paths = [];
      undone = [];
      redraw();
      break;
  }
});

ipcRenderer.on("annotation-mode", (event, isActive) => {
  console.log("📨 Canvas mode:", isActive ? "ACTIVE" : "INACTIVE");
  active = isActive;
  if (!active) {
    laserDot.style.display = "none";
    cursorDot.style.display = "none";
    drawing = false;
    document.body.style.cursor = "default";
  }
});

console.log("✅ Canvas ready — waiting for commands");
