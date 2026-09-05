(function () {
  "use strict";
  (function checkLogin() {
    if (sessionStorage.getItem("token")) return;
    const p = localStorage.getItem("persistentLogin");
    if (!p) {
      window.location.replace("/login");
      return;
    }
    try {
      const d = JSON.parse(p);
      if (Date.now() > d.expiresAt) {
        localStorage.removeItem("persistentLogin");
        sessionStorage.clear();
        window.location.replace("/login");
        return;
      }
      sessionStorage.setItem("token", d.token);
      sessionStorage.setItem("user", JSON.stringify(d.user));
      d.expiresAt = Date.now() + 15 * 24 * 60 * 60 * 1000;
      localStorage.setItem("persistentLogin", JSON.stringify(d));
    } catch (e) {
      localStorage.removeItem("persistentLogin");
      window.location.replace("/login");
    }
  })();

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  let pdfDoc = null,
    currentPage = 1,
    totalPages = 0,
    scale = 1.3,
    isFullscreen = false;
  let documents = JSON.parse(localStorage.getItem("pdfDocuments") || "[]"),
    activeId = null;
  let annTool = "none",
    annColor = "#ef4444",
    drawing = false,
    paths = [],
    undone = [],
    cpath = [],
    shapeStart = null;
  let annCanvas, annCtx;

  const uploadZone = document.getElementById("uploadZone"),
    fileInput = document.getElementById("fileInput");
  // ═══ UPLOAD BUTTON IN SEARCH BAR ═══
  const uploadBtnInline = document.getElementById("uploadBtnInline");
  uploadBtnInline?.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  const overlay = document.getElementById("viewerOverlay"),
    viewerContainer = document.getElementById("viewerContainer");
  const pdfCanvas = document.getElementById("pdfCanvas"),
    annoLayer = document.getElementById("annotationLayer");
  const grid = document.getElementById("documentGrid"),
    searchInput = document.getElementById("searchInput");
  const searchClear = document.getElementById("searchClear"),
    searchIcon = document.getElementById("searchIcon");

  uploadZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });
  uploadZone.addEventListener("dragleave", () =>
    uploadZone.classList.remove("drag-over"),
  );
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");
    const f = e.dataTransfer.files[0];
    f?.type === "application/pdf"
      ? handleFile(f)
      : toast("Please upload a PDF", true);
  });

  function handleFile(file) {
    if (!file || file.type !== "application/pdf") {
      toast("Only PDFs supported", true);
      return;
    }
    const r = new FileReader();
    r.onload = function (e) {
      documents.unshift({
        id: Date.now().toString(),
        name: file.name,
        size: file.size,
        data: e.target.result.split(",")[1],
        uploadedAt: new Date().toISOString(),
      });
      save();
      renderGrid();
      updateStats();
      toast("📄 Document uploaded!");
    };
    r.readAsDataURL(file);
  }
  function save() {
    localStorage.setItem("pdfDocuments", JSON.stringify(documents));
  }
  function deleteDoc(id) {
    documents = documents.filter((d) => d.id !== id);
    save();
    renderGrid();
    updateStats();
    if (activeId === id) closeViewer();
    toast("Document deleted");
  }

  function openViewer(id) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    activeId = id;
    const bytes = Uint8Array.from(atob(doc.data), (c) => c.charCodeAt(0));
    pdfjsLib
      .getDocument({ data: bytes })
      .promise.then((pdf) => {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        currentPage = 1;
        document.getElementById("totalPages").textContent = totalPages;
        overlay.classList.add("show");
        renderPage(currentPage);
        renderGrid();
        annCanvas = annoLayer;
        annCtx = annCanvas.getContext("2d");
      })
      .catch(() => toast("Failed to load PDF", true));
  }

  function renderPage(num) {
    if (!pdfDoc) return;
    pdfDoc.getPage(num).then((page) => {
      const vp = page.getViewport({ scale });
      pdfCanvas.width = vp.width;
      pdfCanvas.height = vp.height;
      pdfCanvas.style.width = vp.width + "px";
      pdfCanvas.style.height = vp.height + "px";
      page
        .render({ canvasContext: pdfCanvas.getContext("2d"), viewport: vp })
        .promise.then(() => {
          document.getElementById("currentPage").textContent = num;
          document.getElementById("btnPrev").disabled = num <= 1;
          document.getElementById("btnNext").disabled = num >= totalPages;
          if (annCanvas) {
            annCanvas.width = vp.width;
            annCanvas.height = vp.height;
            annCanvas.style.width = vp.width + "px";
            annCanvas.style.height = vp.height + "px";
            redraw();
          }
        });
    });
  }
  function closeViewer() {
    overlay.classList.remove("show");
    overlay.classList.remove("fullscreen");
    isFullscreen = false;
    pdfDoc = null;
    activeId = null;
    currentPage = 1;
    scale = 1.3;
    paths = [];
    undone = [];
    renderGrid();
  }

  // ═══ ANNOTATIONS ═══
  function redraw() {
    if (!annCtx) return;
    annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
    paths.forEach((item) => {
      if (item.type === "freehand") {
        if (item.points.length < 2) return;
        annCtx.beginPath();
        annCtx.strokeStyle = item.color;
        annCtx.lineWidth = item.size;
        annCtx.lineCap = "round";
        annCtx.lineJoin = "round";
        annCtx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++)
          annCtx.lineTo(item.points[i].x, item.points[i].y);
        annCtx.stroke();
      } else if (item.type === "rect") {
        annCtx.strokeStyle = item.color;
        annCtx.lineWidth = item.size;
        annCtx.strokeRect(item.x, item.y, item.w, item.h);
      } else if (item.type === "circle") {
        annCtx.strokeStyle = item.color;
        annCtx.lineWidth = item.size;
        annCtx.beginPath();
        annCtx.ellipse(item.cx, item.cy, item.rx, item.ry, 0, 0, Math.PI * 2);
        annCtx.stroke();
      }
    });
  }

  function setTool(t) {
    annTool = t;
    ["vtLaser", "vtDraw", "vtRect", "vtCircle", "vtEraser"].forEach((id) =>
      document.getElementById(id).classList.remove("active"),
    );
    if (t === "laser")
      document.getElementById("vtLaser").classList.add("active");
    if (t === "draw") document.getElementById("vtDraw").classList.add("active");
    if (t === "rect") document.getElementById("vtRect").classList.add("active");
    if (t === "circle")
      document.getElementById("vtCircle").classList.add("active");
    if (t === "eraser")
      document.getElementById("vtEraser").classList.add("active");
    annoLayer.classList.toggle(
      "drawing",
      t === "draw" || t === "rect" || t === "circle" || t === "eraser",
    );
  }

  function getPos(e) {
    const r = annCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  annoLayer.addEventListener("mousedown", (e) => {
    if (annTool === "none" || annTool === "laser") return;
    const p = getPos(e);
    shapeStart = p;
    drawing = true;
    undone = [];
    if (annTool === "draw") cpath = [p];
  });
  annoLayer.addEventListener("mousemove", (e) => {
    if (!drawing) return;
    const p = getPos(e);
    if (annTool === "draw") {
      cpath.push(p);
      const l = cpath[cpath.length - 2];
      if (l) {
        annCtx.beginPath();
        annCtx.strokeStyle = annColor;
        annCtx.lineWidth = 3;
        annCtx.lineCap = "round";
        annCtx.moveTo(l.x, l.y);
        annCtx.lineTo(p.x, p.y);
        annCtx.stroke();
      }
    } else if (annTool === "rect" || annTool === "circle") {
      redraw();
      const x = Math.min(shapeStart.x, p.x),
        y = Math.min(shapeStart.y, p.y),
        w = Math.abs(p.x - shapeStart.x),
        h = Math.abs(p.y - shapeStart.y);
      annCtx.strokeStyle = annColor;
      annCtx.lineWidth = 3;
      if (annTool === "rect") annCtx.strokeRect(x, y, w, h);
      else {
        annCtx.beginPath();
        annCtx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        annCtx.stroke();
      }
    } else if (annTool === "eraser") {
      const th = 18;
      paths = paths.filter((item) => {
        let near = false;
        if (item.type === "freehand")
          near = item.points.some(
            (pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < th,
          );
        else if (item.type === "rect")
          near =
            p.x >= item.x - th &&
            p.x <= item.x + item.w + th &&
            p.y >= item.y - th &&
            p.y <= item.y + item.h + th;
        else if (item.type === "circle")
          near = Math.hypot(p.x - item.cx, p.y - item.cy) < item.rx + th;
        return !near;
      });
      redraw();
    }
  });
  annoLayer.addEventListener("mouseup", (e) => {
    if (!drawing) return;
    const p = getPos(e);
    if (annTool === "draw" && cpath.length > 0)
      paths.push({
        type: "freehand",
        points: [...cpath],
        color: annColor,
        size: 3,
      });
    else if (annTool === "rect") {
      const x = Math.min(shapeStart.x, p.x),
        y = Math.min(shapeStart.y, p.y),
        w = Math.abs(p.x - shapeStart.x),
        h = Math.abs(p.y - shapeStart.y);
      if (w > 3 && h > 3)
        paths.push({ type: "rect", x, y, w, h, color: annColor, size: 3 });
    } else if (annTool === "circle") {
      const cx = shapeStart.x + (p.x - shapeStart.x) / 2,
        cy = shapeStart.y + (p.y - shapeStart.y) / 2,
        rx = Math.abs(p.x - shapeStart.x) / 2,
        ry = Math.abs(p.y - shapeStart.y) / 2;
      if (rx > 3 && ry > 3)
        paths.push({
          type: "circle",
          cx,
          cy,
          rx,
          ry,
          color: annColor,
          size: 3,
        });
    }
    drawing = false;
    cpath = [];
    redraw();
  });

  // ═══ BUTTONS ═══
  document.getElementById("btnPrev").addEventListener("click", () => {
    if (currentPage > 1) renderPage(--currentPage);
  });
  document.getElementById("btnNext").addEventListener("click", () => {
    if (currentPage < totalPages) renderPage(++currentPage);
  });
  document.getElementById("btnZoomIn").addEventListener("click", () => {
    scale += 0.2;
    renderPage(currentPage);
  });
  document.getElementById("btnZoomOut").addEventListener("click", () => {
    if (scale > 0.5) {
      scale -= 0.2;
      renderPage(currentPage);
    }
  });
  document
    .getElementById("btnCloseViewer")
    .addEventListener("click", closeViewer);
  document.getElementById("btnFullscreen").addEventListener("click", () => {
    isFullscreen = !isFullscreen;
    overlay.classList.toggle("fullscreen", isFullscreen);
    document.getElementById("btnFullscreen").innerHTML = isFullscreen
      ? '<i class="fas fa-compress"></i>'
      : '<i class="fas fa-expand"></i>';
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeViewer();
  });

  document
    .getElementById("vtLaser")
    .addEventListener("click", () =>
      setTool(annTool === "laser" ? "none" : "laser"),
    );
  document
    .getElementById("vtDraw")
    .addEventListener("click", () =>
      setTool(annTool === "draw" ? "none" : "draw"),
    );
  document
    .getElementById("vtRect")
    .addEventListener("click", () =>
      setTool(annTool === "rect" ? "none" : "rect"),
    );
  document
    .getElementById("vtCircle")
    .addEventListener("click", () =>
      setTool(annTool === "circle" ? "none" : "circle"),
    );
  document
    .getElementById("vtEraser")
    .addEventListener("click", () =>
      setTool(annTool === "eraser" ? "none" : "eraser"),
    );
  document.getElementById("vtClear").addEventListener("click", () => {
    paths = [];
    undone = [];
    redraw();
  });
  document.getElementById("vtUndo").addEventListener("click", () => {
    if (paths.length > 0) {
      undone.push(paths.pop());
      redraw();
    }
  });
  document.getElementById("vtRedo").addEventListener("click", () => {
    if (undone.length > 0) {
      paths.push(undone.pop());
      redraw();
    }
  });
  document.querySelectorAll("#colorGroup .vt-color").forEach((d) => {
    d.addEventListener("click", function () {
      document
        .querySelectorAll("#colorGroup .vt-color")
        .forEach((c) => c.classList.remove("active"));
      this.classList.add("active");
      annColor = this.dataset.color;
    });
  });

  // ═══ SEARCH ═══
  searchInput.addEventListener("input", () => {
    renderGrid();
    toggleClearBtn();
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    renderGrid();
    toggleClearBtn();
    searchInput.focus();
  });

  function toggleClearBtn() {
    searchClear.classList.toggle("visible", searchInput.value.length > 0);
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    if (
      !pdfDoc ||
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA"
    )
      return;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        if (currentPage > 1) renderPage(--currentPage);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (currentPage < totalPages) renderPage(++currentPage);
        break;
      case "Escape":
        closeViewer();
        break;
      case "f":
        document.getElementById("btnFullscreen").click();
        break;
      case "l":
        setTool(annTool === "laser" ? "none" : "laser");
        break;
      case "d":
        setTool(annTool === "draw" ? "none" : "draw");
        break;
      case "r":
        setTool(annTool === "rect" ? "none" : "rect");
        break;
      case "o":
        setTool(annTool === "circle" ? "none" : "circle");
        break;
      case "e":
        setTool(annTool === "eraser" ? "none" : "eraser");
        break;
      case "c":
        paths = [];
        undone = [];
        redraw();
        break;
    }
    if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      if (paths.length > 0) {
        undone.push(paths.pop());
        redraw();
      }
    }
    if (e.ctrlKey && e.key === "y") {
      e.preventDefault();
      if (undone.length > 0) {
        paths.push(undone.pop());
        redraw();
      }
    }
  });

  function renderGrid() {
    const q = searchInput.value.toLowerCase();
    const filtered = q
      ? documents.filter((d) => d.name.toLowerCase().includes(q))
      : documents;
    document.getElementById("resultCount").textContent =
      filtered.length + " document" + (filtered.length !== 1 ? "s" : "");
    if (!filtered.length) {
      grid.innerHTML =
        '<div class="empty-state"><i class="fas fa-search"></i><h3>No documents found</h3><p>' +
        (q ? "Try a different search term" : "Upload a PDF to get started") +
        "</p></div>";
      updateStats();
      return;
    }
    grid.innerHTML = filtered
      .map(
        (doc) => `
      <div class="doc-card${doc.id === activeId ? " active" : ""}" data-id="${doc.id}">
        <div class="doc-icon"><i class="fas fa-file-pdf"></i></div>
        <div class="doc-info"><div class="doc-name">${esc(doc.name)}</div><div class="doc-meta"><span><i class="far fa-hdd"></i>${fsize(doc.size)}</span><span><i class="far fa-calendar-alt"></i>${new Date(doc.uploadedAt).toLocaleDateString()}</span></div></div>
        <div class="actions-cell"><button class="actions-dots" data-act="${doc.id}"><i class="fas fa-ellipsis-v"></i></button><div class="actions-dropdown" id="dd-${doc.id}"><button class="open-btn" data-open="${doc.id}"><i class="fas fa-eye"></i> Open</button><button class="delete-btn" data-del="${doc.id}"><i class="fas fa-trash-alt"></i> Delete</button></div></div>
      </div>`,
      )
      .join("");
    grid.querySelectorAll(".doc-card").forEach((c) => {
      c.addEventListener("click", (e) => {
        if (
          e.target.closest(".actions-cell") ||
          e.target.closest(".actions-dropdown")
        )
          return;
        openViewer(c.dataset.id);
      });
    });
    grid.querySelectorAll(".actions-dots").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        document
          .querySelectorAll(".actions-dropdown.show")
          .forEach((d) => d.classList.remove("show"));
        document.getElementById("dd-" + b.dataset.act).classList.toggle("show");
      });
    });
    grid.querySelectorAll(".open-btn").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        openViewer(b.dataset.open);
      });
    });
    grid.querySelectorAll(".delete-btn").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Delete this document?")) deleteDoc(b.dataset.del);
      });
    });
    updateStats();
  }

  function updateStats() {
    document.getElementById("statTotal").textContent = documents.length;
    document.getElementById("statSize").textContent = fsize(
      documents.reduce((s, d) => s + d.size, 0),
    );
    document.getElementById("statRecent").textContent = documents.length
      ? new Date(documents[0].uploadedAt).toLocaleDateString()
      : "—";
  }

  document.addEventListener("click", () =>
    document
      .querySelectorAll(".actions-dropdown.show")
      .forEach((d) => d.classList.remove("show")),
  );
  function fsize(b) {
    return b < 1024
      ? b + " B"
      : b < 1048576
        ? (b / 1024).toFixed(1) + " KB"
        : (b / 1048576).toFixed(1) + " MB";
  }
  function esc(t) {
    const d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
  }
  function toast(m, e) {
    const t = document.getElementById("toast");
    document.getElementById("toastMsg").textContent = m;
    t.querySelector("i").style.color = e ? "#ef4444" : "#22c55e";
    t.querySelector("i").className = e
      ? "fas fa-times-circle"
      : "fas fa-check-circle";
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
  }

  document
    .getElementById("profileDropdown")
    ?.addEventListener("click", function (e) {
      e.stopPropagation();
      this.classList.toggle("active");
    });
  document.addEventListener("click", () =>
    document.getElementById("profileDropdown")?.classList.remove("active"),
  );
  setTimeout(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      if (u.name) {
        document.getElementById("headerName").textContent = u.name;
        document.getElementById("headerAvatar").src =
          u.profile_image ||
          `https://ui-avatars.com/api/?background=2563eb&color=fff&name=${encodeURIComponent(u.name)}&size=80`;
      }
    } catch (e) {}
  }, 300);
  document.addEventListener("click", function (e) {
    if (e.target.closest("#logoutBtn")) {
      e.preventDefault();
      sessionStorage.clear();
      localStorage.removeItem("persistentLogin");
      window.location.replace("/login");
    }
  });

  renderGrid();
  console.log("✅ Document Viewer ready");
})();
