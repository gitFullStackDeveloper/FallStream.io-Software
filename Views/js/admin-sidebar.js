(function () {
  "use strict";

  async function loadSidebar() {
    try {
      const response = await fetch("../admin/sidebar.html");
      const html = await response.text();
      const container = document.getElementById("sidebar-container");
      if (container) container.innerHTML = html;
      initSidebar();
    } catch (err) {
      console.error("Failed to load admin sidebar:", err);
    }
  }

  function initSidebar() {
    const sidebar = document.getElementById("sidebar");
    const toggleBtn = document.getElementById("sidebarToggle");
    const mainContent = document.getElementById("mainContent");

    if (!sidebar || !toggleBtn) return;

    // ── Collapse state from localStorage ──
    if (localStorage.getItem("adminSidebarCollapsed") === "true") {
      sidebar.classList.add("collapsed");
      mainContent?.classList.add("sidebar-collapsed");
    }

    // ── Toggle button ──
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      sidebar.classList.toggle("collapsed");
      mainContent?.classList.toggle("sidebar-collapsed");
      localStorage.setItem(
        "adminSidebarCollapsed",
        sidebar.classList.contains("collapsed"),
      );
    });

    // ── Active page highlighting ──
    highlightActivePage();

    // ── Mobile menu setup ──
    initMobileMenu(sidebar, mainContent);
  }

  function highlightActivePage() {
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach((item) => item.classList.remove("active"));

    for (const item of navItems) {
      const link = item.querySelector("a");
      const href = link ? link.getAttribute("href") : "";
      const page = item.dataset.page;
      if (page && currentPath.includes(page)) {
        item.classList.add("active");
        break;
      } else if (
        href &&
        (currentPath === href || currentPath.startsWith(href))
      ) {
        item.classList.add("active");
        break;
      }
    }
  }

  function initMobileMenu(sidebar, mainContent) {
    const mobileBtn = document.createElement("button");
    mobileBtn.className = "mobile-menu-btn";
    mobileBtn.innerHTML = '<i class="fas fa-bars"></i>';
    mobileBtn.style.cssText = `
      display: none;
      position: fixed;
      top: 15px;
      left: 15px;
      z-index: 99;
      background: var(--white, #fff);
      border: 1px solid var(--gray-200, #e2e8f0);
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 1.2rem;
      color: var(--gray-700, #334155);
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    document.body.appendChild(mobileBtn);

    const checkSize = () => {
      if (window.innerWidth <= 768) {
        mobileBtn.style.display = "block";
      } else {
        mobileBtn.style.display = "none";
        sidebar.classList.remove("open-mobile");
      }
    };
    checkSize();
    window.addEventListener("resize", checkSize);

    mobileBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open-mobile");
    });

    document.addEventListener("click", (e) => {
      if (
        window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        e.target !== mobileBtn &&
        !mobileBtn.contains(e.target)
      ) {
        sidebar.classList.remove("open-mobile");
      }
    });
  }

  // ── Boot ──
  document.addEventListener("DOMContentLoaded", loadSidebar);
})();
