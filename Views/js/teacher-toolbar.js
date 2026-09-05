(function () {
  "use strict";

  // ═══════════════ STATE ═══════════════
  let isDrawingMode = false;
  let isLaserMode = false;
  let currentColor = "#ef4444";
  let penSize = 3;
  let isToolbarVisible = true;
  let isToolbarCollapsed = false;

  // Drawing state
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let currentPath = [];
  let allPaths = [];
  let undonePaths = [];

  // DOM elements
  let toolbar = null;
  let annotationCanvas = null;
  let ctx = null;
  let laserElement = null;

  // ═══════════════ COLORS ═══════════════
  const COLORS = [
    { color: "#ef4444", name: "Red" },
    { color: "#f59e0b", name: "Yellow" },
    { color: "#22c55e", name: "Green" },
    { color: "#3b82f6", name: "Blue" },
    { color: "#a855f7", name: "Purple" },
    { color: "#ffffff", name: "White" },
  ];

  // ═══════════════ CREATE TOOLBAR HTML ═══════════════
  function createToolbar() {
    const existing = document.querySelector(".teacher-toolbar");
    if (existing) existing.remove();

    const existingCanvas = document.querySelector(".annotation-canvas");
    if (existingCanvas) existingCanvas.remove();

    const existingLaser = document.querySelector(".laser-pointer");
    if (existingLaser) existingLaser.remove();

    annotationCanvas = document.createElement("canvas");
    annotationCanvas.className = "annotation-canvas";
    annotationCanvas.width = window.innerWidth;
    annotationCanvas.height = window.innerHeight;
    document.body.appendChild(annotationCanvas);
    ctx = annotationCanvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    laserElement = document.createElement("div");
    laserElement.className = "laser-pointer";
    laserElement.style.display = "none";
    document.body.appendChild(laserElement);

    toolbar = document.createElement("div");
    toolbar.className = "teacher-toolbar";
    toolbar.innerHTML = `
      <!-- Drag Handle -->
      <div class="toolbar-drag-handle" id="toolbarDragHandle">
        <i class="fas fa-grip-lines-vertical"></i>
      </div>

      <!-- Laser Pointer -->
      <button class="tool-btn" id="toolLaser" data-tooltip="Laser Pointer">
        <i class="fas fa-circle"></i>
      </button>

      <!-- Drawing Mode -->
      <button class="tool-btn" id="toolDraw" data-tooltip="Drawing">
        <i class="fas fa-pencil-alt"></i>
      </button>

      <!-- Eraser -->
      <button class="tool-btn" id="toolEraser" data-tooltip="Clear All">
        <i class="fas fa-eraser"></i>
      </button>

      <div class="tool-divider"></div>

      <!-- Color Swatches -->
      <div id="colorSwatches">
        ${COLORS.map(
          (c, i) => `
          <div class="color-swatch ${i === 0 ? "active" : ""}" 
               data-color="${c.color}" 
               data-tooltip="${c.name}"
               style="background: ${c.color};"></div>
        `,
        ).join("")}
      </div>

      <div class="tool-divider"></div>

      <!-- Pen Size Slider -->
      <input type="range" class="tool-size-slider" id="penSizeSlider" 
             min="1" max="12" value="3" data-tooltip="Pen Size">

      <!-- Undo -->
      <button class="tool-btn" id="toolUndo" data-tooltip="Undo">
        <i class="fas fa-undo"></i>
      </button>

      <!-- Redo -->
      <button class="tool-btn" id="toolRedo" data-tooltip="Redo">
        <i class="fas fa-redo"></i>
      </button>

      <div class="tool-divider"></div>

      <!-- Collapse -->
      <button class="tool-collapse-btn" id="toolCollapse" data-tooltip="Collapse">
        <i class="fas fa-chevron-right"></i>
      </button>
    `;

    document.body.appendChild(toolbar);

    // Add event listeners
    attachEventListeners();
  }

  // ═══════════════ EVENT LISTENERS ═══════════════
  function attachEventListeners() {
    // Laser pointer
    document
      .getElementById("toolLaser")
      ?.addEventListener("click", toggleLaser);

    // Drawing mode
    document
      .getElementById("toolDraw")
      ?.addEventListener("click", toggleDrawing);

    // Clear all
    document.getElementById("toolEraser")?.addEventListener("click", clearAll);

    // Undo
    document.getElementById("toolUndo")?.addEventListener("click", undoPath);

    // Redo
    document.getElementById("toolRedo")?.addEventListener("click", redoPath);

    // Collapse
    document
      .getElementById("toolCollapse")
      ?.addEventListener("click", toggleCollapse);

    // Colors
    document.querySelectorAll(".color-swatch").forEach((swatch) => {
      swatch.addEventListener("click", function () {
        currentColor = this.dataset.color;
        document
          .querySelectorAll(".color-swatch")
          .forEach((s) => s.classList.remove("active"));
        this.classList.add("active");
      });
    });

    // Pen size
    document
      .getElementById("penSizeSlider")
      ?.addEventListener("input", function () {
        penSize = parseInt(this.value);
        if (ctx) ctx.lineWidth = penSize;
      });

    // Drawing on canvas
    annotationCanvas?.addEventListener("mousedown", startDrawing);
    annotationCanvas?.addEventListener("mousemove", draw);
    annotationCanvas?.addEventListener("mouseup", stopDrawing);
    annotationCanvas?.addEventListener("mouseleave", stopDrawing);

    // Touch events
    annotationCanvas?.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      startDrawing({ clientX: touch.clientX, clientY: touch.clientY });
    });
    annotationCanvas?.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      draw({ clientX: touch.clientX, clientY: touch.clientY });
    });
    annotationCanvas?.addEventListener("touchend", stopDrawing);

    // Laser follow mouse
    document.addEventListener("mousemove", updateLaserPosition);

    // Drag toolbar
    initDrag();

    // Resize canvas
    window.addEventListener("resize", resizeCanvas);
  }

  // ═══════════════ LASER POINTER ═══════════════
  function toggleLaser() {
    isLaserMode = !isLaserMode;
    const btn = document.getElementById("toolLaser");

    if (isLaserMode) {
      btn?.classList.add("active");
      laserElement.style.display = "block";
      // Turn off drawing mode
      if (isDrawingMode) toggleDrawing();
    } else {
      btn?.classList.remove("active");
      laserElement.style.display = "none";
    }
  }

  function updateLaserPosition(e) {
    if (!isLaserMode || !laserElement) return;
    laserElement.style.left = e.clientX + "px";
    laserElement.style.top = e.clientY + "px";
  }

  // ═══════════════ DRAWING ═══════════════
  function toggleDrawing() {
    isDrawingMode = !isDrawingMode;
    const btn = document.getElementById("toolDraw");

    if (isDrawingMode) {
      btn?.classList.add("active");
      annotationCanvas?.classList.add("drawing");
      ctx.lineWidth = penSize;
      ctx.strokeStyle = currentColor;
      // Turn off laser mode
      if (isLaserMode) toggleLaser();
    } else {
      btn?.classList.remove("active");
      annotationCanvas?.classList.remove("drawing");
    }
  }

  function startDrawing(e) {
    if (!isDrawingMode) return;
    isDrawing = true;
    lastX = e.clientX;
    lastY = e.clientY;
    currentPath = [{ x: lastX, y: lastY }];
    undonePaths = [];
  }

  function draw(e) {
    if (!isDrawing || !isDrawingMode) return;

    const x = e.clientX;
    const y = e.clientY;

    currentPath.push({ x, y });

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = penSize;
    ctx.stroke();

    lastX = x;
    lastY = y;
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentPath.length > 0) {
      allPaths.push({
        path: [...currentPath],
        color: currentColor,
        size: penSize,
      });
    }
    currentPath = [];
  }

  function clearAll() {
    allPaths = [];
    undonePaths = [];
    redrawCanvas();
  }

  function undoPath() {
    if (allPaths.length === 0) return;
    undonePaths.push(allPaths.pop());
    redrawCanvas();
  }

  function redoPath() {
    if (undonePaths.length === 0) return;
    allPaths.push(undonePaths.pop());
    redrawCanvas();
  }

  function redrawCanvas() {
    if (!ctx || !annotationCanvas) return;
    ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

    allPaths.forEach(({ path, color, size }) => {
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    });
  }

  // ═══════════════ TOOLBAR COLLAPSE ═══════════════
  function toggleCollapse() {
    isToolbarCollapsed = !isToolbarCollapsed;
    const btn = document.getElementById("toolCollapse");
    const icon = btn?.querySelector("i");

    if (isToolbarCollapsed) {
      toolbar?.classList.add("collapsed");
      if (icon) {
        icon.classList.remove("fa-chevron-right");
        icon.classList.add("fa-chevron-left");
      }
    } else {
      toolbar?.classList.remove("collapsed");
      if (icon) {
        icon.classList.remove("fa-chevron-left");
        icon.classList.add("fa-chevron-right");
      }
    }
  }

  // ═══════════════ DRAG ═══════════════
  function initDrag() {
    const handle = document.getElementById("toolbarDragHandle");
    if (!handle || !toolbar) return;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    handle.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = toolbar.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      toolbar.style.transition = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newX = initialX + dx;
      let newY = initialY + dy;

      // Keep within viewport
      newX = Math.max(
        0,
        Math.min(window.innerWidth - toolbar.offsetWidth, newX),
      );
      newY = Math.max(
        0,
        Math.min(window.innerHeight - toolbar.offsetHeight, newY),
      );

      toolbar.style.right = "auto";
      toolbar.style.top = "auto";
      toolbar.style.left = newX + "px";
      toolbar.style.top = newY + "px";
      toolbar.style.transform = "none";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        toolbar.style.transition = "all 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)";
      }
    });
  }

  // ═══════════════ RESIZE ═══════════════
  function resizeCanvas() {
    if (!annotationCanvas) return;
    const imageData = ctx.getImageData(
      0,
      0,
      annotationCanvas.width,
      annotationCanvas.height,
    );
    annotationCanvas.width = window.innerWidth;
    annotationCanvas.height = window.innerHeight;
    ctx.putImageData(imageData, 0, 0);
  }

  // ═══════════════ PUBLIC API ═══════════════
  window.TeacherToolbar = {
    show: () => {
      if (!toolbar) createToolbar();
      toolbar.style.display = "flex";
      annotationCanvas.style.display = "block";
      isToolbarVisible = true;
    },

    hide: () => {
      if (toolbar) toolbar.style.display = "none";
      if (annotationCanvas) annotationCanvas.style.display = "none";
      if (laserElement) laserElement.style.display = "none";
      isToolbarVisible = false;
      isLaserMode = false;
      isDrawingMode = false;
    },

    destroy: () => {
      if (toolbar) toolbar.remove();
      if (annotationCanvas) annotationCanvas.remove();
      if (laserElement) laserElement.remove();
      toolbar = null;
      annotationCanvas = null;
      laserElement = null;
    },

    toggle: () => {
      if (isToolbarVisible) {
        window.TeacherToolbar.hide();
      } else {
        window.TeacherToolbar.show();
      }
    },
  };

  // ═══════════════ KEYBOARD SHORTCUTS ═══════════════
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "T") {
      e.preventDefault();
      window.TeacherToolbar.toggle();
    }
  });

  console.log("✅ Teacher Toolbar loaded");
})();
