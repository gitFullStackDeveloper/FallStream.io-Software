const {
  app,
  BrowserWindow,
  Menu,
  shell,
  desktopCapturer,
  session,
  ipcMain,
  screen,
} = require("electron");
const path = require("path");

let mainWindow;
let webcamBubbleWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "FallStream.io",
    icon: path.join(__dirname, "..", "assets", "icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    backgroundColor: "#f1f5f9",
    show: false,
    frame: false,
    autoHideMenuBar: false,
  });
  mainWindow.setContentProtection(false);

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = [
        "media",
        "mediaKeySystem",
        "geolocation",
        "notifications",
        "midiSysex",
        "pointerLock",
        "fullscreen",
        "openExternal",
        "video",
        "audio",
        "camera",
        "microphone",
        "desktopCapturer",
      ];
      callback(allowedPermissions.includes(permission));
    },
  );

  mainWindow.loadURL("http://localhost:5000/login");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ═══ WEBCAM BUBBLE WINDOW ═══
function createWebcamBubble(bounds) {
  if (webcamBubbleWindow && !webcamBubbleWindow.isDestroyed()) {
    webcamBubbleWindow.close();
  }

  const bubbleSize = bounds?.size || 180;

  webcamBubbleWindow = new BrowserWindow({
    width: bubbleSize + 60,
    height: bubbleSize + 80,
    x: bounds?.x || undefined,
    y: bounds?.y || undefined,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  webcamBubbleWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowed = ["media", "video", "audio", "mediaKeySystem"];
      callback(allowed.includes(permission));
    },
  );

  webcamBubbleWindow.loadFile(
    path.join(__dirname, "..", "Views", "tool", "webcam-bubble.html"),
  );

  webcamBubbleWindow.setAlwaysOnTop(true, "screen-saver", 1);
  webcamBubbleWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  webcamBubbleWindow.on("closed", () => {
    webcamBubbleWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("webcam-bubble-closed");
    }
  });
}

// ═══ WEBCAM IPC ═══
ipcMain.on("move-webcam-bubble", (event, { pos, size }) => {
  if (webcamBubbleWindow && !webcamBubbleWindow.isDestroyed()) {
    const { screen: electronScreen } = require("electron");
    const primaryDisplay = electronScreen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } =
      primaryDisplay.workAreaSize;

    const winWidth = size + 60;
    const winHeight = size + 80;
    const offset = 20;

    webcamBubbleWindow.setSize(winWidth, winHeight);

    let x, y;
    if (pos === "br") {
      x = screenWidth - winWidth - offset;
      y = screenHeight - winHeight - offset;
    } else if (pos === "bl") {
      x = offset;
      y = screenHeight - winHeight - offset;
    } else if (pos === "tr") {
      x = screenWidth - winWidth - offset;
      y = offset;
    } else if (pos === "tl") {
      x = offset;
      y = offset;
    }

    webcamBubbleWindow.setPosition(x, y);
  }
});

ipcMain.on("open-webcam-bubble", (event, bounds) => {
  createWebcamBubble(bounds);
});

ipcMain.on("close-webcam-bubble", () => {
  if (webcamBubbleWindow && !webcamBubbleWindow.isDestroyed()) {
    webcamBubbleWindow.close();
  }
});

ipcMain.on("update-webcam-bubble", (event, styles) => {
  if (webcamBubbleWindow && !webcamBubbleWindow.isDestroyed()) {
    const newWidth = (styles.size || 150) + 60;
    const newHeight = (styles.size || 150) + 80;
    webcamBubbleWindow.setSize(newWidth, newHeight);
    webcamBubbleWindow.webContents.send("update-bubble-style", styles);
  }
});

// ═══════════════ TEACHER TOOLBAR ═══════════════
let teacherToolbarWindow = null;
let annotationCanvasWindow = null;
let isAnnotationActive = false;

function createToolbarWindow() {
  if (teacherToolbarWindow && !teacherToolbarWindow.isDestroyed()) {
    teacherToolbarWindow.close();
  }

  const { screen: electronScreen } = require("electron");
  const primaryDisplay = electronScreen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  teacherToolbarWindow = new BrowserWindow({
    width: 50,
    height: 565,
    x: screenWidth - 70,
    y: Math.round((screenHeight - 460) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const toolbarPath = path.join(
    __dirname,
    "..",
    "Views",
    "tool",
    "teacher-toolbar-mini.html",
  );
  teacherToolbarWindow.loadFile(toolbarPath);
  teacherToolbarWindow.setAlwaysOnTop(true, "screen-saver", 1);
  teacherToolbarWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  teacherToolbarWindow.on("closed", () => {
    teacherToolbarWindow = null;
  });
}

function createAnnotationWindow() {
  if (annotationCanvasWindow && !annotationCanvasWindow.isDestroyed()) {
    annotationCanvasWindow.close();
  }

  const { screen: electronScreen } = require("electron");
  const primaryDisplay = electronScreen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  annotationCanvasWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const canvasPath = path.join(
    __dirname,
    "..",
    "Views",
    "tool",
    "annotation-canvas.html",
  );
  annotationCanvasWindow.loadFile(canvasPath);
  annotationCanvasWindow.setAlwaysOnTop(true, "screen-saver", 2);
  annotationCanvasWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
  annotationCanvasWindow.setIgnoreMouseEvents(true, { forward: true });

  annotationCanvasWindow.on("closed", () => {
    annotationCanvasWindow = null;
  });
}

// ═══ TOOLBAR IPC ═══
ipcMain.on("open-teacher-overlay", () => {
  createToolbarWindow();
  createAnnotationWindow();
});

ipcMain.on("close-teacher-overlay", () => {
  if (teacherToolbarWindow && !teacherToolbarWindow.isDestroyed())
    teacherToolbarWindow.close();
  if (annotationCanvasWindow && !annotationCanvasWindow.isDestroyed())
    annotationCanvasWindow.close();
});

ipcMain.on("toggle-annotation-mode", (event, active) => {
  isAnnotationActive = active;

  if (annotationCanvasWindow && !annotationCanvasWindow.isDestroyed()) {
    annotationCanvasWindow.setIgnoreMouseEvents(!active, { forward: true });
    annotationCanvasWindow.webContents.send("annotation-mode", active);
  }

  if (teacherToolbarWindow && !teacherToolbarWindow.isDestroyed()) {
    if (active) {
      teacherToolbarWindow.setAlwaysOnTop(true, "screen-saver", 2);
      teacherToolbarWindow.showInactive();
      teacherToolbarWindow.moveTop();
    } else {
      teacherToolbarWindow.setAlwaysOnTop(true, "screen-saver", 1);
    }
  }
});

ipcMain.on("annotation-cmd", (event, data) => {
  if (annotationCanvasWindow && !annotationCanvasWindow.isDestroyed()) {
    annotationCanvasWindow.webContents.send("annotation-cmd", data);
  }
});

// ═══ ZOOM CONTROLS ═══
ipcMain.on("zoom-in", () => {
  if (mainWindow) {
    const currentLevel = mainWindow.webContents.getZoomLevel();
    const currentFactor = Math.pow(2, currentLevel);
    const currentPct = Math.round(currentFactor * 100);
    const presets = [
      25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400,
      500,
    ];
    const nextPct = presets.find((p) => p > currentPct) || 500;
    const newLevel = Math.log2(nextPct / 100);
    mainWindow.webContents.setZoomLevel(newLevel);
    mainWindow.webContents.send("zoom-changed", newLevel);
  }
});

ipcMain.on("zoom-out", () => {
  if (mainWindow) {
    const currentLevel = mainWindow.webContents.getZoomLevel();
    const currentFactor = Math.pow(2, currentLevel);
    const currentPct = Math.round(currentFactor * 100);
    const presets = [
      25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400,
      500,
    ];
    const prevPct = [...presets].reverse().find((p) => p < currentPct) || 25;
    const newLevel = Math.log2(prevPct / 100);
    mainWindow.webContents.setZoomLevel(newLevel);
    mainWindow.webContents.send("zoom-changed", newLevel);
  }
});

ipcMain.on("zoom-reset", () => {
  if (mainWindow) {
    mainWindow.webContents.setZoomLevel(0);
    mainWindow.webContents.send("zoom-changed", 0);
  }
});

ipcMain.handle("get-zoom-level", () => {
  return mainWindow ? mainWindow.webContents.getZoomLevel() : 0;
});

// ═══ WINDOW CONTROLS ═══
ipcMain.on("minimize-window", () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on("maximize-window", () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on("close-window", () => {
  if (mainWindow) mainWindow.close();
});

// ═══ STREAM TRANSFER ═══
let webcamStreamId = null;

ipcMain.on("set-webcam-stream", (event, streamId) => {
  webcamStreamId = streamId;
  if (webcamBubbleWindow && !webcamBubbleWindow.isDestroyed()) {
    webcamBubbleWindow.webContents.send("load-webcam-stream", streamId);
  }
});

ipcMain.on("request-webcam-stream", (event) => {
  if (webcamStreamId) {
    event.reply("load-webcam-stream", webcamStreamId);
  }
});
//////////////////////////////////////////////////
//////////////////////////////////////////////////
// ═══ WEBCAM FULLSCREEN TOGGLE ═══
let webcamPrevBounds = null;
let webcamPrevResizable = false;

ipcMain.on("webcam-fullscreen-toggle", (event, fullscreen) => {
  if (webcamBubbleWindow && !webcamBubbleWindow.isDestroyed()) {
    const { screen: electronScreen } = require("electron");
    const primaryDisplay = electronScreen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    if (fullscreen) {
      // Save previous bounds and settings
      webcamPrevBounds = webcamBubbleWindow.getBounds();
      webcamPrevResizable = webcamBubbleWindow.resizable;
      // Expand to full screen
      webcamBubbleWindow.setResizable(true);
      webcamBubbleWindow.setBounds({ x: 0, y: 0, width, height });
      webcamBubbleWindow.setResizable(false);
      webcamBubbleWindow.setAlwaysOnTop(true, "screen-saver", 1);
      webcamBubbleWindow.moveTop();
    } else if (webcamPrevBounds) {
      // Restore previous size
      webcamBubbleWindow.setBounds(webcamPrevBounds);
      webcamPrevBounds = null;
    }
  }
});
///////////////////////////////////////
/////////////////////////////////////////
// ═══ LIVE SESSION ═══
let liveStream = null;

ipcMain.on("start-live-session", async (event, config) => {
  if (mainWindow) {
    mainWindow.webContents.send("live-session-config", config);
  }
});

ipcMain.on("stop-live-session", () => {
  if (liveStream) {
    liveStream.getTracks().forEach((t) => t.stop());
    liveStream = null;
  }
  if (mainWindow) {
    mainWindow.webContents.send("live-session-stopped");
  }
});

ipcMain.handle("get-live-stream", async () => {
  // Stream is captured in the renderer via getDisplayMedia
  return liveStream ? true : false;
});

///////////////////////////////////////

// ═══ APP LIFECYCLE ═══
app.whenReady().then(() => {
  console.log("✅ App ready");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (webcamBubbleWindow && !webcamBubbleWindow.isDestroyed()) {
    webcamBubbleWindow.close();
  }
});
