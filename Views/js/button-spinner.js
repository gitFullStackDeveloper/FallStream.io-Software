(function () {
  const spinnerStyles = document.createElement("style");
  spinnerStyles.textContent = `
        /* Button with spinner — smooth transition */
        .btn-with-spinner {
            position: relative;
            transition: all 0.3s ease !important;
        }

        .btn-with-spinner.btn-loading {
            pointer-events: none !important;
            cursor: wait !important;
            opacity: 0.85 !important;
        }

        .btn-with-spinner.btn-loading .btn-spinner-icon {
            display: inline-flex !important;
        }

        .btn-with-spinner.btn-loading .btn-original-text {
            opacity: 0.6;
        }

        /* Spinner icon */
        .btn-spinner-icon {
            display: none !important;
            animation: btnSpin 0.7s linear infinite;
            font-size: inherit;
            margin-right: 0.3em;
        }

        @keyframes btnSpin {
            to { transform: rotate(360deg); }
        }

        /* Spinner dots for small buttons */
        .btn-spinner-dots {
            display: none !important;
            gap: 3px;
            align-items: center;
        }

        .btn-loading .btn-spinner-dots {
            display: inline-flex !important;
        }

        .btn-spinner-dot {
            width: 5px;
            height: 5px;
            background: currentColor;
            border-radius: 50%;
            animation: btnDotBounce 1s ease-in-out infinite;
        }

        .btn-spinner-dot:nth-child(2) { animation-delay: 0.15s; }
        .btn-spinner-dot:nth-child(3) { animation-delay: 0.3s; }

        @keyframes btnDotBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-6px); opacity: 1; }
        }
    `;
  document.head.appendChild(spinnerStyles);

  // Icon spinner SVG (cute spinning circle)
  function getSpinnerHTML(type) {
    if (type === "icon") {
      return '<i class="fas fa-circle-notch btn-spinner-icon"></i>';
    }
    if (type === "dots") {
      return `
                <span class="btn-spinner-dots">
                    <span class="btn-spinner-dot"></span>
                    <span class="btn-spinner-dot"></span>
                    <span class="btn-spinner-dot"></span>
                </span>`;
    }
    return "";
  }

  function enhanceButton(btn) {
    if (btn.classList.contains("btn-enhanced") || btn.tagName === "INPUT")
      return;

    btn.classList.add("btn-enhanced", "btn-with-spinner");

    const btnWidth = btn.offsetWidth || btn.clientWidth || 100;
    const spinnerType = btnWidth < 80 ? "dots" : "icon";

    if (!btn.querySelector(".btn-original-text")) {
      const originalHTML = btn.innerHTML;
      btn.dataset.originalHtml = originalHTML;
    }

    btn.addEventListener("click", function (e) {
      if (
        btn.tagName === "A" &&
        btn.getAttribute("href") &&
        !btn.getAttribute("href").startsWith("#") &&
        !btn.getAttribute("href").startsWith("javascript")
      ) {
        btn.classList.add("btn-loading");
        return;
      }

      const form = btn.closest("form");
      if (form && btn.type === "submit") {
        if (!form.checkValidity()) return; // Let browser show validation
      }

      // Show spinner
      btn.classList.add("btn-loading");

      if (spinnerType === "icon") {
        btn.insertAdjacentHTML("afterbegin", getSpinnerHTML("icon"));
      } else {
        btn.innerHTML = getSpinnerHTML("dots");
      }

      // Auto-remove spinner after 3 seconds (fallback)
      setTimeout(() => {
        btn.classList.remove("btn-loading");
        const spinner = btn.querySelector(".btn-spinner-icon");
        if (spinner) spinner.remove();
        const dots = btn.querySelector(".btn-spinner-dots");
        if (dots) dots.remove();
      }, 3000);
    });

    const form = btn.closest("form");
    if (form && btn.type === "submit") {
      form.addEventListener("submit", function () {
        setTimeout(() => {
          btn.classList.remove("btn-loading");
          const spinner = btn.querySelector(".btn-spinner-icon");
          if (spinner) spinner.remove();
          const dots = btn.querySelector(".btn-spinner-dots");
          if (dots) dots.remove();
        }, 3500);
      });
    }
  }

  // Find all buttons and enhance them
  function enhanceAllButtons() {
    const buttons = document.querySelectorAll(
      'button, .btn, .btn-primary, .btn-outline, .btn-gradient, .btn-danger, .btn-success, .btn-sm, [role="button"], input[type="submit"]',
    );
    buttons.forEach((btn) => enhanceButton(btn));
  }

  // Watch for dynamically added buttons
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) {
          if (
            node.matches &&
            node.matches(
              'button, .btn, .btn-primary, .btn-outline, .btn-gradient, .btn-danger, .btn-success, .btn-sm, [role="button"], input[type="submit"]',
            )
          ) {
            enhanceButton(node);
          }
          if (node.querySelectorAll) {
            const childButtons = node.querySelectorAll(
              'button, .btn, .btn-primary, .btn-outline, .btn-gradient, .btn-danger, .btn-success, .btn-sm, [role="button"], input[type="submit"]',
            );
            childButtons.forEach((btn) => enhanceButton(btn));
          }
        }
      });
    });
  });

  // Start observing
  observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceAllButtons);
  } else {
    enhanceAllButtons();
  }

  window.enhanceButtons = enhanceAllButtons;
})();
