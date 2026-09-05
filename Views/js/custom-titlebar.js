(function () {
  "use strict";

  if (!window.electronAPI?.isElectron) return;

  const titlebar = document.createElement("div");
  titlebar.id = "customTitlebar";
  titlebar.innerHTML = `
    <div class="tb-left">
      <span class="tb-title">FallStream.io</span>
    </div>
    <div class="tb-center"></div>
    <div class="tb-right">
      <button class="tb-btn tb-refresh" id="tbRefresh" title="Refresh Page">
        <i class="fas fa-redo-alt"></i>
      </button>
      <div class="tb-zoom-group" id="tbZoomGroup">
        <button class="tb-btn tb-zoom-btn" id="tbZoomOutBtn" title="Zoom Out">−</button>
        <span class="tb-zoom-value" id="tbZoomValue">100%</span>
        <button class="tb-btn tb-zoom-btn" id="tbZoomInBtn" title="Zoom In">+</button>
      </div>
      <div class="tb-menu-wrap" id="tbMenuWrap">
        <button class="tb-btn tb-menu-btn" id="tbMenuBtn" title="More options">
          <i class="fas fa-ellipsis-v"></i>
        </button>
        <div class="tb-dropdown" id="tbDropdown">
          <button class="tb-drop-item" id="tbZoomInDD"><i class="fas fa-search-plus"></i> Zoom In</button>
          <button class="tb-drop-item" id="tbZoomOutDD"><i class="fas fa-search-minus"></i> Zoom Out</button>
          <button class="tb-drop-item" id="tbZoomResetDD"><i class="fas fa-compress-arrows-alt"></i> Reset Zoom (100%)</button>
          <div class="tb-drop-divider"></div>
          <button class="tb-drop-item" id="tbFullscreenDD"><i class="fas fa-expand"></i> Full Screen</button>
          <div class="tb-drop-divider"></div>
          <button class="tb-drop-item tb-drop-danger" id="tbCloseApp"><i class="fas fa-power-off"></i> Close App</button>
        </div>
      </div>
      <button class="tb-btn" id="tbMinimize" title="Minimize"><i class="fas fa-window-minimize"></i></button>
      <button class="tb-btn" id="tbMaximize" title="Maximize"><i class="far fa-square"></i></button>
      <button class="tb-btn tb-close" id="tbClose" title="Close"><i class="fas fa-times"></i></button>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #customTitlebar {
      position: fixed; top: 0; left: 0; right: 0;
      height: 38px; z-index: 9999;
      background: #0a0a0a;
      display: flex; align-items: center;
      padding: 0 10px;
      -webkit-app-region: drag;
      user-select: none;
      font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
      border-bottom: 1px solid #1a1a1a;
    }
    .tb-left {
      display: flex; align-items: center;
      -webkit-app-region: no-drag;
      padding-left: 4px;
    }
    .tb-title {
      font-size: 0.82rem; font-weight: 700;
      color: #e5e7eb; letter-spacing: 0.02em;
    }
    .tb-center { flex: 1; -webkit-app-region: drag; }
    .tb-right {
      display: flex; align-items: center; gap: 4px;
      -webkit-app-region: no-drag;
    }
    .tb-btn {
      width: 34px; height: 28px;
      border: none; border-radius: 6px;
      background: transparent; color: #9ca3af;
      font-size: 0.7rem; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    .tb-btn:hover { background: #1f1f1f; color: #e5e7eb; }
    .tb-refresh:hover { color: #60a5fa; }
    .tb-refresh:active i { animation: tbSpin 0.6s ease; }
    @keyframes tbSpin { to { transform: rotate(360deg); } }
    .tb-close:hover { background: #ef4444; color: #fff; }
    .tb-zoom-group {
      display: flex; align-items: center;
      gap: 0; margin: 0 6px;
      background: #141414; border-radius: 8px;
      border: 1px solid #2a2a2a;
      overflow: hidden;
    }
    .tb-zoom-btn {
      width: 28px; height: 26px;
      border-radius: 0 !important;
      font-size: 0.85rem; font-weight: 600;
      color: #d1d5db; background: transparent;
      transition: all 0.15s;
    }
    .tb-zoom-btn:hover { background: #2a2a2a; color: #fff; }
    .tb-zoom-value {
      font-size: 0.7rem; font-weight: 600;
      color: #d1d5db; padding: 0 10px;
      min-width: 44px; text-align: center;
      cursor: pointer; transition: all 0.15s;
      border-left: 1px solid #2a2a2a;
      border-right: 1px solid #2a2a2a;
      line-height: 26px;
    }
    .tb-zoom-value:hover { background: #1f1f1f; color: #fff; }
    .tb-menu-wrap { position: relative; }
    .tb-dropdown {
      display: none; position: absolute;
      top: 100%; right: 0;
      background: #1a1a1a; border: 1px solid #2a2a2a;
      border-radius: 12px; min-width: 200px;
      padding: 6px 0; z-index: 10000;
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      animation: tbDropIn 0.15s ease;
    }
    @keyframes tbDropIn { from{opacity:0;transform:translateY(-6px);} to{opacity:1;transform:translateY(0);} }
    .tb-dropdown.show { display: block; }
    .tb-drop-item {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 8px 16px; border: none;
      background: transparent; color: #d1d5db;
      font-family: inherit; font-size: 0.8rem; font-weight: 500;
      cursor: pointer; transition: background 0.15s;
      white-space: nowrap;
    }
    .tb-drop-item:hover { background: #2a2a2a; color: #fff; }
    .tb-drop-item i { width: 16px; font-size: 0.75rem; color: #6b7280; }
    .tb-drop-item:hover i { color: #9ca3af; }
    .tb-drop-divider { height: 1px; background: #2a2a2a; margin: 4px 0; }
    .tb-drop-danger { color: #f87171 !important; }
    .tb-drop-danger:hover { background: rgba(239,68,68,0.15) !important; color: #ef4444 !important; }
    .tb-drop-danger i { color: #f87171 !important; }
     /* ═══ GLOBAL PAGE ADJUSTMENTS ═══ */
    .dashboard-header { top: 38px !important; }
    .sidebar { top: 38px !important; height: calc(100vh - 38px) !important; }
    .main-content { margin-top: 38px !important; }
    .app-container { margin-top: 0 !important; }
  `;
  document.head.appendChild(style);
  document.body.prepend(titlebar);

  // ═══ BUTTON HANDLERS ═══
  document
    .getElementById("tbMinimize")
    .addEventListener("click", () => window.electronAPI.minimizeWindow());
  document.getElementById("tbMaximize").addEventListener("click", () => {
    window.electronAPI.maximizeWindow();
    updateMaxIcon();
  });
  document
    .getElementById("tbClose")
    .addEventListener("click", () => window.electronAPI.closeWindow());
  document
    .getElementById("tbCloseApp")
    .addEventListener("click", () => window.electronAPI.closeWindow());

  document.getElementById("tbRefresh").addEventListener("click", () => {
    const icon = document.querySelector("#tbRefresh i");
    icon.style.animation = "none";
    icon.offsetHeight;
    icon.style.animation = "tbSpin 0.6s ease";
    setTimeout(() => location.reload(), 150);
  });

  function zoomLevelToPercent(level) {
    return Math.round(Math.pow(2, level) * 100);
  }

  function updateZoomDisplay() {
    window.electronAPI.getZoomLevel().then((level) => {
      document.getElementById("tbZoomValue").textContent =
        zoomLevelToPercent(level) + "%";
    });
  }

  document.getElementById("tbZoomInBtn").addEventListener("click", () => {
    window.electronAPI.zoomIn();
    setTimeout(updateZoomDisplay, 100);
  });
  document.getElementById("tbZoomOutBtn").addEventListener("click", () => {
    window.electronAPI.zoomOut();
    setTimeout(updateZoomDisplay, 100);
  });
  document.getElementById("tbZoomValue").addEventListener("click", () => {
    window.electronAPI.zoomReset();
    setTimeout(updateZoomDisplay, 100);
  });

  document.getElementById("tbZoomInDD").addEventListener("click", () => {
    window.electronAPI.zoomIn();
    closeDropdown();
    setTimeout(updateZoomDisplay, 100);
  });
  document.getElementById("tbZoomOutDD").addEventListener("click", () => {
    window.electronAPI.zoomOut();
    closeDropdown();
    setTimeout(updateZoomDisplay, 100);
  });
  document.getElementById("tbZoomResetDD").addEventListener("click", () => {
    window.electronAPI.zoomReset();
    closeDropdown();
    setTimeout(updateZoomDisplay, 100);
  });

  document.getElementById("tbFullscreenDD").addEventListener("click", () => {
    window.electronAPI.maximizeWindow();
    closeDropdown();
  });

  document.getElementById("tbMenuBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("tbDropdown").classList.toggle("show");
  });
  document.addEventListener("click", closeDropdown);
  function closeDropdown() {
    document.getElementById("tbDropdown").classList.remove("show");
  }

  function updateMaxIcon() {
    const icon = document.getElementById("tbMaximize").querySelector("i");
    if (icon.classList.contains("fa-square")) {
      icon.className = "far fa-copy";
    } else {
      icon.className = "far fa-square";
    }
  }

  if (window.electronAPI.onZoomChanged) {
    window.electronAPI.onZoomChanged((level) => {
      document.getElementById("tbZoomValue").textContent =
        zoomLevelToPercent(level) + "%";
    });
  }

  updateZoomDisplay();
  console.log("✅ Custom titlebar loaded");
})();
