(function () {
  "use strict";
  const toggleBtn = document.getElementById("mobileToggle");
  const mobileMenu = document.getElementById("mobileMenu");

  if (toggleBtn && mobileMenu) {
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      mobileMenu.classList.toggle("show");
      toggleBtn.classList.toggle("active");
    });

    document.addEventListener("click", (e) => {
      if (!toggleBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
        mobileMenu.classList.remove("show");
        toggleBtn.classList.remove("active");
      }
    });
  }

  const header = document.getElementById("mainHeader");

  if (header) {
    window.addEventListener("scroll", () => {
      header.style.background =
        window.scrollY > 20
          ? "rgba(255,255,255,0.95)"
          : "rgba(255,255,255,0.8)";

      header.style.boxShadow =
        window.scrollY > 20 ? "0 4px 20px rgba(0,0,0,0.04)" : "none";
    });
  }
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");

      if (!href || href === "#") return;

      const target = document.querySelector(href);

      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth" });

        mobileMenu?.classList.remove("show");
        toggleBtn?.classList.remove("active");
      }
    });
  });
})();

function initCTAParticles() {
  const container = document.getElementById("ctaParticles");
  if (!container) return;
  const particleCount = 30;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    const size = Math.random() * 4 + 2;
    particle.style.width = size + "px";
    particle.style.height = size + "px";
    particle.style.left = Math.random() * 100 + "%";
    particle.style.top = Math.random() * 100 + "%";
    particle.style.setProperty("--d", Math.random() * 3 + 3 + "s");
    particle.style.setProperty("--delay", Math.random() * -5 + "s");
    particle.style.background =
      "rgba(255,255,255," + (Math.random() * 0.5 + 0.3) + ")";
    particle.style.borderRadius = "50%";
    particle.style.position = "absolute";
    particle.style.animation =
      "twinkle var(--d) ease-in-out infinite var(--delay)";
    container.appendChild(particle);
  }
}

const style = document.createElement("style");
style.textContent = `
  @keyframes twinkle {
    0%, 100% { opacity: 0; transform: scale(0.5); }
    50%      { opacity: 1; transform: scale(1); }
  }
`;
document.head.appendChild(style);

document.addEventListener("DOMContentLoaded", initCTAParticles);

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

// Delay the call slightly to allow fetches to complete
setTimeout(initScrollReveal, 300); // 300ms is usually enough

function initTickers() {
  const track1 = document.getElementById("tickerTrack1");
  const track2 = document.getElementById("tickerTrack2");

  if (track1 && track1.children.length > 0) {
    track1.innerHTML += track1.innerHTML;
  }

  if (track2 && track2.children.length > 0) {
    track2.innerHTML += track2.innerHTML;
  }
}

async function loadReviews() {
  let tickerTrack1 = document.getElementById("tickerTrack1");
  let tickerTrack2 = document.getElementById("tickerTrack2");

  if (!tickerTrack1 || !tickerTrack2) {
    let attempts = 0;
    while ((!tickerTrack1 || !tickerTrack2) && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      tickerTrack1 = document.getElementById("tickerTrack1");
      tickerTrack2 = document.getElementById("tickerTrack2");
      attempts++;
    }
  }

  if (!tickerTrack1 || !tickerTrack2) {
    console.log("Ticker tracks not found");
    return;
  }

  function getInitials(name) {
    return name
      ? name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : "?";
  }

  function getAvatarHTML(review) {
    if (review.avatar && review.avatar.trim() !== "") {
      return `<img src="${review.avatar}" 
                         alt="${review.userName}" 
                         onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'review-avatar-placeholder\\'>${getInitials(review.userName)}</div>';"
                         class="review-avatar">`;
    } else {
      const initials = getInitials(review.userName);
      const colors = [
        "#3b82f6",
        "#8b5cf6",
        "#10b981",
        "#f59e0b",
        "#ef4444",
        "#ec4899",
        "#06b6d4",
        "#6366f1",
      ];
      const colorIndex = review.userName
        ? review.userName.charCodeAt(0) % colors.length
        : 0;
      const bgColor = colors[colorIndex];

      return `<div class="review-avatar" style="
                background:linear-gradient(135deg, ${bgColor}, ${bgColor}dd);
                color:#fff;display:flex;align-items:center;justify-content:center;
                font-weight:600;font-size:0.85rem;letter-spacing:0.02em;
            ">${initials}</div>`;
    }
  }

  try {
    const res = await fetch("/api/reviews");

    if (!res.ok) {
      console.log("API not available, using fallback");
      renderFallbackReviews(tickerTrack1, tickerTrack2);
      return;
    }

    const reviews = await res.json();
    console.log("Reviews loaded from API:", reviews.length);

    if (!reviews || reviews.length === 0) {
      renderFallbackReviews(tickerTrack1, tickerTrack2);
      return;
    }

    const stars = (rating) => "★".repeat(rating) + "☆".repeat(5 - rating);

    const midPoint = Math.ceil(reviews.length / 2);
    const reviewsRow1 = reviews.slice(0, midPoint);
    const reviewsRow2 = reviews.slice(midPoint);

    function generateCardHTML(r) {
      return `
            <div class="review-card">
                <div class="review-card-top">
                    <div class="review-user">
                        ${getAvatarHTML(r)}
                        <div class="review-user-meta">
                            <span class="review-name">${r.userName || "Anonymous"}</span>
                            <span class="review-role">${r.userRole || "User"}</span>
                        </div>
                    </div>
                    <div class="review-stars">${stars(r.rating || 5)}</div>
                </div>
                <p class="review-text">"${r.text || "Great product!"}"</p>
            </div>`;
    }

    tickerTrack1.innerHTML = reviewsRow1
      .map((r) => generateCardHTML(r))
      .join("");
    tickerTrack2.innerHTML = reviewsRow2
      .map((r) => generateCardHTML(r))
      .join("");

    initTickers();
    console.log("Reviews rendered successfully");
  } catch (err) {
    console.log("Error loading reviews:", err.message);
    renderFallbackReviews(tickerTrack1, tickerTrack2);
  }
}

function renderFallbackReviews(track1, track2) {
  const fallbackReviews1 = [
    {
      userName: "Sarah K.",
      userRole: "Senior Educator",
      rating: 5,
      text: "The best screen recorder I've ever used. The AI captions are a game changer for my online courses and tutorials.",
      avatar: "https://i.pravatar.cc/80?img=1",
    },
    {
      userName: "Marcus T.",
      userRole: "Content Creator",
      rating: 5,
      text: "Super smooth 4K recording. The cloud sharing is instant and the interface is absolutely beautiful.",
      avatar: "https://i.pravatar.cc/80?img=2",
    },
    {
      userName: "Elena R.",
      userRole: "Product Lead",
      rating: 5,
      text: "Our whole team uses it for product demos. The annotation tools save us hours of editing work.",
      avatar: "https://i.pravatar.cc/80?img=3",
    },
    {
      userName: "David L.",
      userRole: "Business Consultant",
      rating: 4,
      text: "Incredible value. The free tier has everything I need for client presentations and reports.",
      avatar: "https://i.pravatar.cc/80?img=4",
    },
    {
      userName: "Priya M.",
      userRole: "Developer Advocate",
      rating: 5,
      text: "I've tried them all — this one has the best balance of features and simplicity.",
      avatar: "https://i.pravatar.cc/80?img=5",
    },
  ];

  const fallbackReviews2 = [
    {
      userName: "Alex N.",
      userRole: "UX Designer",
      rating: 5,
      text: "Recording user testing sessions has never been easier. The quality is outstanding every time.",
      avatar: "https://i.pravatar.cc/80?img=6",
    },
    {
      userName: "Rachel W.",
      userRole: "Marketing Director",
      rating: 5,
      text: "We switched from Loom and never looked back. Better quality, better price, better everything.",
      avatar: "https://i.pravatar.cc/80?img=7",
    },
    {
      userName: "James K.",
      userRole: "Software Engineer",
      rating: 4,
      text: "Clean API, great performance, and the keyboard shortcuts make me feel like a power user.",
      avatar: "https://i.pravatar.cc/80?img=8",
    },
    {
      userName: "Maria G.",
      userRole: "Online Coach",
      rating: 5,
      text: "My students love the video quality. The webcam bubble feature makes my sessions personal.",
      avatar: "https://i.pravatar.cc/80?img=9",
    },
    {
      userName: "Tom B.",
      userRole: "Startup Founder",
      rating: 5,
      text: "From pitch decks to investor demos — this tool has become essential for our startup.",
      avatar: "https://i.pravatar.cc/80?img=10",
    },
  ];

  const stars = (rating) => "★".repeat(rating) + "☆".repeat(5 - rating);
  const colors = [
    "#3b82f6",
    "#8b5cf6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#ec4899",
    "#06b6d4",
    "#6366f1",
  ];

  function generateFallbackHTML(reviews) {
    return reviews
      .map((r, i) => {
        const initials = r.userName
          ? r.userName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)
          : "?";
        const colorIndex = r.userName
          ? r.userName.charCodeAt(0) % colors.length
          : 0;
        const bgColor = colors[colorIndex];

        return `
            <div class="review-card">
                <div class="review-card-top">
                    <div class="review-user">
                        ${
                          r.avatar
                            ? `<img src="${r.avatar}" alt="${r.userName}" class="review-avatar">`
                            : `<div class="review-avatar" style="background:linear-gradient(135deg, ${bgColor}, ${bgColor}dd);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.85rem;">${initials}</div>`
                        }
                        <div class="review-user-meta">
                            <span class="review-name">${r.userName}</span>
                            <span class="review-role">${r.userRole}</span>
                        </div>
                    </div>
                    <div class="review-stars">${stars(r.rating)}</div>
                </div>
                <p class="review-text">"${r.text}"</p>
            </div>`;
      })
      .join("");
  }

  track1.innerHTML = generateFallbackHTML(fallbackReviews1);
  track2.innerHTML = generateFallbackHTML(fallbackReviews2);

  track1.innerHTML += track1.innerHTML;
  track2.innerHTML += track2.innerHTML;

  console.log("Fallback reviews rendered");
}

setTimeout(loadReviews, 1500);
