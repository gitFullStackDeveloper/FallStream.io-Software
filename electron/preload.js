const { contextBridge, ipcRenderer, desktopCapturer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  // ═══ SCREEN CAPTURE ═══
  getScreenSources: async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
      });
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
      }));
    } catch (err) {
      console.error("getScreenSources error:", err);
      return [];
    }
  },

  getDisplayMedia: async (sourceId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            maxWidth: 3840,
            minHeight: 720,
            maxHeight: 2160,
          },
        },
      });
      return stream;
    } catch (e) {
      console.error("getDisplayMedia error:", e);
      throw e;
    }
  },

  //////////////
  // ═══ WEBCAM STREAM TRANSFER ═══
  setWebcamStream: (stream) => {
    // Get the video track ID to share
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      ipcRenderer.send("set-webcam-stream", videoTrack.id);
    }
  },

  onLoadWebcamStream: (callback) => {
    ipcRenderer.on("load-webcam-stream", (event, streamId) => {
      callback(streamId);
    });
  },

  removeWebcamStreamListener: () => {
    ipcRenderer.removeAllListeners("load-webcam-stream");
  },

  /////

  moveWebcamBubble: (pos, size) => {
    ipcRenderer.send("move-webcam-bubble", { pos, size });
  },

  // ═══ NATIVE WEBCAM BUBBLE ═══
  openWebcamBubble: (bounds) => {
    ipcRenderer.send("open-webcam-bubble", bounds);
  },

  closeWebcamBubble: () => {
    ipcRenderer.send("close-webcam-bubble");
  },

  updateWebcamBubble: (styles) => {
    ipcRenderer.send("update-webcam-bubble", styles);
  },

  onWebcamBubbleClosed: (callback) => {
    ipcRenderer.on("webcam-bubble-closed", () => callback());
  },

  onWebcamBubbleReady: (callback) => {
    ipcRenderer.on("webcam-bubble-ready", () => callback());
  },
  ///////////////////////////////////////////////////////////////////
  // ═══ TEACHER TOOLBAR (SYSTEM-WIDE OVERLAY) ═══
  // ═══ TEACHER TOOLBAR (SYSTEM-WIDE OVERLAY) ═══
  openTeacherOverlay: () => {
    console.log("📢 Preload: openTeacherOverlay called");
    ipcRenderer.send("open-teacher-overlay");
  },

  closeTeacherOverlay: () => {
    console.log("📢 Preload: closeTeacherOverlay called");
    ipcRenderer.send("close-teacher-overlay");
  },

  setTeacherOverlayIgnoreMouse: (ignore) => {
    ipcRenderer.send("teacher-overlay-set-ignore-mouse", ignore);
  },

  onTeacherOverlayClosed: (callback) => {
    ipcRenderer.on("teacher-overlay-closed", () => callback());
  },

  // ═══ ZOOM CONTROLS ═══
  zoomIn: () => ipcRenderer.send("zoom-in"),
  zoomOut: () => ipcRenderer.send("zoom-out"),
  zoomReset: () => ipcRenderer.send("zoom-reset"),
  getZoomLevel: () => ipcRenderer.invoke("get-zoom-level"),
  onZoomChanged: (callback) => {
    ipcRenderer.on("zoom-changed", (event, level) => callback(level));
  },
  ///////////////////////////////////////////////////////
  // ═══ LIVE SESSION ═══
  startLiveSession: (config) => ipcRenderer.send("start-live-session", config),
  stopLiveSession: () => ipcRenderer.send("stop-live-session"),
  getLiveStream: () => ipcRenderer.invoke("get-live-stream"),

  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  maximizeWindow: () => ipcRenderer.send("maximize-window"),
  closeWindow: () => ipcRenderer.send("close-window"),
});
