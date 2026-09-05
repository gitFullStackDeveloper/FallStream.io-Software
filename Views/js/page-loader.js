(function () {
  function initLoader() {
    if (!document.body) {
      requestAnimationFrame(initLoader);
      return;
    }

    if (document.getElementById("globalPageLoader")) return;

    const loader = document.createElement("div");
    loader.id = "globalPageLoader";
    loader.innerHTML = `
            <div class="gl-overlay" style="
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.6);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                transition: opacity 0.3s ease;
            ">
                <!-- Spinner Container -->
                <div class="gl-spinner-box" style="
                    position: relative;
                    width: 110px;
                    height: 110px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <!-- Outer spinning ring (FAST) -->
                    <div class="gl-ring" style="
                        position: absolute;
                        inset: -6px;
                        border-radius: 50%;
                        border: 3px solid transparent;
                        border-top-color: #3b82f6;
                        border-right-color: #60a5fa;
                        border-bottom-color: #2563eb;
                        border-left-color: #93c5fd;
                        animation: glSpin 0.6s linear infinite;
                        filter: drop-shadow(0 0 10px rgba(59,130,246,0.5));
                    "></div>
                    
                    <!-- Second ring (FAST reverse) -->
                    <div class="gl-ring2" style="
                        position: absolute;
                        inset: -18px;
                        border-radius: 50%;
                        border: 2px solid transparent;
                        border-top-color: rgba(56,189,248,0.6);
                        border-bottom-color: rgba(37,99,235,0.6);
                        animation: glSpin 0.9s linear infinite reverse;
                        filter: drop-shadow(0 0 8px rgba(59,130,246,0.3));
                    "></div>
                    
                    <!-- Center Logo (SVG - no black background) -->
                    <div class="gl-logo" style="
                        width: 65px;
                        height: 65px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 2;
                        position: relative;
                    ">
                        <svg width="65" height="65" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 12px rgba(59,130,246,0.4));">
                          <defs>
                            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stop-color="#2856F6"/>
                              <stop offset="100%" stop-color="#43C5FF"/>
                            </linearGradient>
                          </defs>
                          <rect x="2" y="2" width="116" height="116" rx="18" fill="url(#bg)"/>
                          <rect x="28" y="32" width="64" height="44" rx="6" fill="none" stroke="#fff" stroke-width="4"/>
                          <circle cx="76" cy="44" r="4" fill="#fff"/>
                          <line x1="60" y1="76" x2="60" y2="86" stroke="#fff" stroke-width="4"/>
                          <line x1="46" y1="86" x2="74" y2="86" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
                        </svg>
                    </div>
                    
                    <!-- Pulsing blue glow behind logo -->
                    <div class="gl-glow" style="
                        position: absolute;
                        width: 65px;
                        height: 65px;
                        border-radius: 18px;
                        background: radial-gradient(circle, rgba(59,130,246,0.5) 0%, rgba(37,99,235,0.2) 40%, transparent 70%);
                        animation: glPulse 1.2s ease-in-out infinite;
                    "></div>
                </div>
            </div>
        `;

    const style = document.createElement("style");
    style.textContent = `
            @keyframes glSpin {
                to { transform: rotate(360deg); }
            }
            @keyframes glPulse {
                0%, 100% { transform: scale(1); opacity: 0.5; }
                50% { transform: scale(1.5); opacity: 1; }
            }
        `;
    document.head.appendChild(style);

    document.body.insertBefore(loader, document.body.firstChild);

    const startTime = Date.now();
    const MIN_LOAD_TIME = 800;

    function hideLoader() {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_LOAD_TIME - elapsed);

      setTimeout(() => {
        const overlay = loader.querySelector(".gl-overlay");
        if (overlay) {
          overlay.style.opacity = "0";
        }
        setTimeout(() => {
          if (loader.parentNode) {
            loader.parentNode.removeChild(loader);
          }
        }, 300);
      }, remaining);
    }

    if (document.readyState === "complete") {
      hideLoader();
    } else {
      window.addEventListener("load", hideLoader);
    }

    setTimeout(() => {
      if (loader.parentNode) hideLoader();
    }, 6000);
  }

  initLoader();
})();

// Load custom titlebar
(function loadTitlebar() {
  if (window.electronAPI?.isElectron) {
    const script = document.createElement("script");
    const basePath = window.location.pathname.includes("/tool/")
      ? "../js/custom-titlebar.js"
      : "js/custom-titlebar.js";
    script.src = basePath;
    script.onerror = () => {
      const fallback = document.createElement("script");
      fallback.src = window.location.pathname.includes("/tool/")
        ? "js/custom-titlebar.js"
        : "../js/custom-titlebar.js";
      document.head.appendChild(fallback);
    };
    document.head.appendChild(script);
  }
})();






if ('serviceWorker' in navigator) {
navigator.serviceWorker.register('/js/sw.js')
        .then(() => console.log('✅ Service Worker registered'))
        .catch((err) => console.warn('Service Worker registration failed:', err));
}


