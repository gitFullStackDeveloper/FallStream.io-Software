const { ipcRenderer } = require("electron");

// ═══ STATE ═══
let currentTool = "laser"; // 'laser' | 'draw' | 'none'
let currentColor = "#ef4444";
let penSize = 4;
let isLaserActive = false;
let isDrawingActive = false;

// ═══ DOM REFS ═══
const btnLaser = document.getElementById("btnLaser");
const btnDraw = document.getElementById("btnDraw");
const btnClear = document.getElementById("btnClear");
const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnClose = document.getElementById("btnClose");
const sizeSlider = document.getElementById("sizeSlider");
const sizeIndicator = document.getElementById("sizeIndicator");
const dragHandle = document.getElementById("dragHandle");

// ═══ FUNCTIONS ═══
function sendCommand(cmd, data = {}) {
  ipcRenderer.send("annotation-command", { command: cmd, ...data });
}

function setActiveTool(tool) {
  currentTool = tool;
  btnLaser.classList.toggle("active", tool === "laser");
  btnDraw.classList.toggle("active", tool === "draw");

  if (tool === "laser") {
    sendCommand("set-tool", { tool: "laser", color: currentColor });
  } else if (tool === "draw") {
    sendCommand("set-tool", {
      tool: "draw",
      color: currentColor,
      size: penSize,
    });
  } else {
    sendCommand("set-tool", { tool: "none" });
  }
}

function updateSizeIndicator() {
  sizeIndicator.style.width = penSize + "px";
  sizeIndicator.style.height = penSize + "px";
  sizeIndicator.style.background = currentColor;
}

// ═══ EVENT LISTENERS ═══
btnLaser.addEventListener("click", () => {
  if (currentTool === "laser") {
    setActiveTool("none");
  } else {
    setActiveTool("laser");
  }
});

btnDraw.addEventListener("click", () => {
  if (currentTool === "draw") {
    setActiveTool("none");
  } else {
    setActiveTool("draw");
  }
});

btnClear.addEventListener("click", () => {
  sendCommand("clear-all");
});

btnUndo.addEventListener("click", () => {
  sendCommand("undo");
});

btnRedo.addEventListener("click", () => {
  sendCommand("redo");
});

btnClose.addEventListener("click", () => {
  ipcRenderer.send("close-teacher-toolbar");
});

// Color selection
document.querySelectorAll(".color-dot").forEach((dot) => {
  dot.addEventListener("click", function () {
    document
      .querySelectorAll(".color-dot")
      .forEach((d) => d.classList.remove("active"));
    this.classList.add("active");
    currentColor = this.dataset.color;
    updateSizeIndicator();

    if (currentTool !== "none") {
      sendCommand("set-tool", {
        tool: currentTool,
        color: currentColor,
        size: penSize,
      });
    }
  });
});

// Size slider
sizeSlider.addEventListener("input", function () {
  penSize = parseInt(this.value);
  updateSizeIndicator();

  if (currentTool === "draw") {
    sendCommand("set-tool", {
      tool: "draw",
      color: currentColor,
      size: penSize,
    });
  }
});

// ═══ DRAG TOOLBAR ═══
let isDragging = false;
let startX, startY;

dragHandle.addEventListener("mousedown", (e) => {
  isDragging = true;
  startX = e.screenX;
  startY = e.screenY;
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const dx = e.screenX - startX;
  const dy = e.screenY - startY;
  startX = e.screenX;
  startY = e.screenY;

  const win = require("electron").remote?.getCurrentWindow();
  if (win) {
    const [wx, wy] = win.getPosition();
    win.setPosition(wx + dx, wy + dy);
  }
});

document.addEventListener("mouseup", () => {
  isDragging = false;
});

// ═══ KEYBOARD SHORTCUTS ═══
document.addEventListener("keydown", (e) => {
  if (e.key === "l" || e.key === "L") {
    setActiveTool(currentTool === "laser" ? "none" : "laser");
  }
  if (e.key === "d" || e.key === "D") {
    setActiveTool(currentTool === "draw" ? "none" : "draw");
  }
  if (e.key === "c" || e.key === "C") {
    sendCommand("clear-all");
  }
  if (e.ctrlKey && e.key === "z") {
    sendCommand("undo");
  }
  if (e.ctrlKey && e.key === "y") {
    sendCommand("redo");
  }
  if (e.key === "Escape") {
    setActiveTool("none");
  }
});

// ═══ INIT ═══
updateSizeIndicator();
console.log("✅ Teacher Toolbar ready");
