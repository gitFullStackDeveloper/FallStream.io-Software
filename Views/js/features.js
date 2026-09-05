(function () {
  const toggle = document.getElementById("mobileToggle");
  const menu = document.getElementById("mobileMenu");
  if (toggle && menu)
    toggle.addEventListener("click", () => menu.classList.toggle("show"));
})();

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

(function () {
  const track = document.getElementById("tickerTrack");
  if (track) {
    const clone = track.innerHTML;
    track.innerHTML += clone;
  }
})();

setTimeout(() => {
  if (typeof initScrollReveal === "function") initScrollReveal();
}, 400);
