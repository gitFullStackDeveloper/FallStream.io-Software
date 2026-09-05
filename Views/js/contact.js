(function () {
  const toggle = document.getElementById("mobileToggle");
  const menu = document.getElementById("mobileMenu");
  if (toggle && menu) {
    toggle.addEventListener("click", () => menu.classList.toggle("show"));
  }
})();

function initFAQ() {
  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const wasActive = item.classList.contains("active");
      document
        .querySelectorAll(".faq-item")
        .forEach((i) => i.classList.remove("active"));
      if (!wasActive) item.classList.add("active");
    });
  });
}

// ── Scroll reveal observer ──
function initScrollReveal() {
  const revealElements = document.querySelectorAll(".reveal");
  if (!revealElements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
      rootMargin: "0px 0px -30px 0px",
    },
  );

  revealElements.forEach((el) => observer.observe(el));
}

window.addEventListener("load", function () {
  setTimeout(() => {
    initFAQ();
    initScrollReveal();
  }, 350);
});
