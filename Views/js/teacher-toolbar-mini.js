const { ipcRenderer } = require("electron");

let isOn = false;
let tool = "laser";
let color = "#ef4444";
const toolbar = document.getElementById("toolbar");
const btnPower = document.getElementById("btnPower");

function sendCmd(cmd, data = {}) {
  ipcRenderer.send("annotation-cmd", { cmd, ...data });
}

// Helper to deactivate all tool buttons
function deactivateAllTools() {
  document.getElementById("btnLaser").classList.remove("active");
  document.getElementById("btnDraw").classList.remove("active");
  document.getElementById("btnEraser").classList.remove("active");
  document.getElementById("btnRect").classList.remove("active");
  document.getElementById("btnCircle").classList.remove("active");
}

function selectTool(t) {
  if (!isOn) return;
  tool = t;
  deactivateAllTools();
  if (t === "laser")
    document.getElementById("btnLaser").classList.add("active");
  if (t === "draw") document.getElementById("btnDraw").classList.add("active");
  if (t === "eraser")
    document.getElementById("btnEraser").classList.add("active");
  if (t === "rect") document.getElementById("btnRect").classList.add("active");
  if (t === "circle")
    document.getElementById("btnCircle").classList.add("active");
  sendCmd("tool", { tool: t, color, size: 4 });
}

function setPower(on) {
  isOn = on;
  if (on) {
    btnPower.classList.add("on");
    btnPower.title = "ON - Press P to turn OFF";
    toolbar.classList.remove("disabled");
    ipcRenderer.send("toggle-annotation-mode", true);
  } else {
    btnPower.classList.remove("on");
    btnPower.title = "OFF - Press P to turn ON";
    toolbar.classList.add("disabled");
    ipcRenderer.send("toggle-annotation-mode", false);
    deactivateAllTools();
    tool = "laser";
  }
}

btnPower.addEventListener("click", (e) => {
  e.stopPropagation();
  setPower(!isOn);
});

document.getElementById("btnLaser").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isOn) return;
  selectTool(tool === "laser" ? "none" : "laser");
});

document.getElementById("btnDraw").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isOn) return;
  selectTool(tool === "draw" ? "none" : "draw");
});

document.getElementById("btnEraser").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isOn) return;
  selectTool(tool === "eraser" ? "none" : "eraser");
});

document.getElementById("btnRect").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isOn) return;
  selectTool(tool === "rect" ? "none" : "rect");
});

document.getElementById("btnCircle").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isOn) return;
  selectTool(tool === "circle" ? "none" : "circle");
});

document.getElementById("btnUndo").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isOn) return;
  sendCmd("undo");
});

document.getElementById("btnRedo").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isOn) return;
  sendCmd("redo");
});

document.getElementById("closeBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  ipcRenderer.send("close-teacher-overlay");
});

document.querySelectorAll(".cdot").forEach((d) => {
  d.addEventListener("click", function (e) {
    e.stopPropagation();
    if (!isOn) return;
    document
      .querySelectorAll(".cdot")
      .forEach((c) => c.classList.remove("active"));
    this.classList.add("active");
    color = this.dataset.color;
    sendCmd("color", { color });
  });
});

document.querySelectorAll("button, .cdot, .div").forEach((el) => {
  el.style.webkitAppRegion = "no-drag";
});

// Keyboard
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    setPower(!isOn);
    return;
  }
  if (!isOn) return;
  switch (e.key.toLowerCase()) {
    case "l":
      selectTool("laser");
      break;
    case "d":
      selectTool("draw");
      break;
    case "e":
      selectTool("eraser");
      break;
    case "r":
      selectTool("rect");
      break;
    case "o":
      selectTool("circle");
      break;
    case "escape":
      selectTool("none");
      break;
  }
  if (e.ctrlKey && e.key === "z") {
    e.preventDefault();
    sendCmd("undo");
  }
  if (e.ctrlKey && e.key === "y") {
    e.preventDefault();
    sendCmd("redo");
  }
});

setPower(false);
console.log("✅ Mini toolbar ready");
