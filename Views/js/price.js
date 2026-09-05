(function () {
  const toggle = document.getElementById("mobileToggle");
  const menu = document.getElementById("mobileMenu");
  if (toggle && menu)
    toggle.addEventListener("click", () => menu.classList.toggle("show"));
})();

function initFAQ() {
  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const isActive = item.classList.contains("active");
      document
        .querySelectorAll(".faq-item")
        .forEach((el) => el.classList.remove("active"));
      if (!isActive) item.classList.add("active");
    });
  });
}

function initBillingToggle() {
  const toggleBtns = document.querySelectorAll(".toggle-btn");
  const saveBadge = document.getElementById("saveBadge");
  const proPriceEl = document.getElementById("proPrice");
  const proPeriodEl = document.getElementById("proPeriod");
  const proOriginalEl = document.getElementById("proOriginal");
  if (!toggleBtns.length || !proPriceEl) return;

  const monthlyPrice = 12;
  const yearlyDiscount = 0.2;
  const yearlyPrice = (monthlyPrice * (1 - yearlyDiscount)).toFixed(2);

  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const period = btn.dataset.period;

      if (period === "yearly") {
        if (saveBadge) saveBadge.style.display = "inline-flex";
        proPriceEl.textContent = "$" + yearlyPrice;
        proPeriodEl.textContent = "month (billed annually)";
        if (proOriginalEl) proOriginalEl.style.display = "inline";
      } else {
        if (saveBadge) saveBadge.style.display = "none";
        proPriceEl.textContent = "$" + monthlyPrice;
        proPeriodEl.textContent = "month";
        if (proOriginalEl) proOriginalEl.style.display = "none";
      }
    });
  });
}

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

window.addEventListener("load", () => {
  setTimeout(() => {
    initFAQ();
    initBillingToggle();
    initScrollReveal();
  }, 400);
});
