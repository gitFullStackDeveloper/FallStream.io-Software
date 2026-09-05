(function () {
  function canonicalKey(path) {
    if (!path || path === "/" || path === "") return "home";
    let clean = path.split("?")[0].split("#")[0];
    let segment = clean.split("/").filter(Boolean).pop() || "";
    segment = segment.replace(/\.html$/i, "");
    segment = segment.toLowerCase();

    if (segment === "" || segment === "index") return "home";
    if (/^featur/.test(segment)) return "features";
    if (
      /^pric/.test(segment) ||
      /^plan/.test(segment) ||
      segment === "price" ||
      segment === "pricing" ||
      segment === "prices"
    )
      return "pricing";
    if (/^about/.test(segment)) return "about";
    if (/^contact/.test(segment)) return "contact";
    return segment;
  }

  function getCurrentPageKey() {
    return canonicalKey(window.location.pathname);
  }

  function getLinkKey(link) {
    const href = link.getAttribute("href");
    return canonicalKey(href);
  }

  function setActiveByKey(key) {
    const links = document.querySelectorAll(".nav-link");
    let target = null;
    for (const link of links) {
      if (getLinkKey(link) === key) {
        target = link;
        break;
      }
    }
    links.forEach((l) => l.classList.remove("active"));
    if (target) {
      target.classList.add("active");
    }
  }

  let aggressiveInterval = null;
  function startAggressiveCorrector(key) {
    if (aggressiveInterval) clearInterval(aggressiveInterval);
    let attempts = 0;
    const maxAttempts = 30; // 30 * 100ms = 3 seconds
    aggressiveInterval = setInterval(() => {
      attempts++;
      const activeLink = document.querySelector(".nav-link.active");
      if (!activeLink || getLinkKey(activeLink) !== key) {
        setActiveByKey(key);
      }
      if (attempts >= maxAttempts) {
        clearInterval(aggressiveInterval);
        aggressiveInterval = null;
      }
    }, 100);
  }
  let longTermObserver = null;
  function startLongTermCorrector() {
    if (longTermObserver) longTermObserver.disconnect();
    const observer = new MutationObserver(() => {
      const currentKey = getCurrentPageKey();
      const activeLink = document.querySelector(".nav-link.active");
      if (activeLink && getLinkKey(activeLink) !== currentKey) {
        setActiveByKey(currentKey);
      }
    });
    document.querySelectorAll(".nav-link").forEach((link) => {
      observer.observe(link, { attributes: true, attributeFilter: ["class"] });
    });
    longTermObserver = observer;
  }

  function onHeaderReady() {
    const key = getCurrentPageKey();
    setActiveByKey(key);
    startAggressiveCorrector(key);
    startLongTermCorrector();
  }

  function waitForHeader() {
    const domObserver = new MutationObserver(() => {
      if (document.querySelectorAll(".nav-link").length > 0) {
        domObserver.disconnect();
        onHeaderReady();
      }
    });
    domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function onNavClick(e) {
    const link = e.target.closest(".nav-link");
    if (!link) return;
    const key = getLinkKey(link);
    setActiveByKey(key);
    sessionStorage.setItem("activeNavKey", key);
    startAggressiveCorrector(key);
  }

  // ── Init ──
  function init() {
    if (document.querySelectorAll(".nav-link").length > 0) {
      onHeaderReady();
    }
    waitForHeader();
    document.addEventListener("click", onNavClick);
    sessionStorage.removeItem("activeNavKey");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
