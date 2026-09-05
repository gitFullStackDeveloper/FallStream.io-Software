// ======================== PASSWORD TOGGLE ========================
function setupPasswordToggles() {
  document.querySelectorAll(".toggle-password").forEach((icon) => {
    icon.addEventListener("click", function () {
      const input = this.closest(".field-wrap").querySelector("input");
      if (input) {
        const type =
          input.getAttribute("type") === "password" ? "text" : "password";
        input.setAttribute("type", type);
        this.classList.toggle("fa-eye");
        this.classList.toggle("fa-eye-slash");
      }
    });
  });
  document.querySelectorAll(".toggle-password-confirm").forEach((icon) => {
    icon.addEventListener("click", function () {
      const input = this.closest(".field-wrap").querySelector("input");
      if (input) {
        const type =
          input.getAttribute("type") === "password" ? "text" : "password";
        input.setAttribute("type", type);
        this.classList.toggle("fa-eye");
        this.classList.toggle("fa-eye-slash");
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupPasswordToggles);
} else {
  setupPasswordToggles();
}

// ======================== DETECT PAGE ========================
const isLoginPage =
  window.location.pathname.includes("login.html") ||
  window.location.pathname === "/login" ||
  window.location.pathname === "/";
const isSignupPage =
  window.location.pathname.includes("signup.html") ||
  window.location.pathname === "/signup";
// const API_BASE = 'http://localhost:5000/api';
const API_BASE = window.location.origin + "/api";

// ======================== MESSAGE DISPLAY ========================
function showMessage(elementId, message, isError = true) {
  const msgDiv = document.getElementById(elementId);
  if (!msgDiv) {
    console.error("❌ Message div not found:", elementId);
    return;
  }

  const bgColor = isError ? "#fef2f2" : "#f0fdf4";
  const borderColor = isError ? "#fecaca" : "#bbf7d0";
  const textColor = isError ? "#991b1b" : "#065f46";
  const iconColor = isError ? "#ef4444" : "#22c55e";
  const icon = isError ? "fa-exclamation-circle" : "fa-check-circle";

  msgDiv.innerHTML = `
        <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 18px;
            border-radius: 14px;
            background: ${bgColor};
            border: 1px solid ${borderColor};
            color: ${textColor};
            font-size: 0.9rem;
            font-weight: 500;
            margin-bottom: 1rem;
            animation: msgSlideDown 0.3s ease;
        ">
            <i class="fas ${icon}" style="font-size: 1.1rem; color: ${iconColor}; flex-shrink: 0;"></i>
            <span>${message}</span>
        </div>
    `;

  setTimeout(() => {
    if (msgDiv) msgDiv.innerHTML = "";
  }, 6000);
}

const animStyle = document.createElement("style");
animStyle.textContent = `
    @keyframes msgSlideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(animStyle);

// ======================== RESET BUTTON HELPER ========================
function resetButton(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const btnText = btn.querySelector(".btn-text");
  const btnSpinner = btn.querySelector(".btn-spinner");
  if (btnText) btnText.style.display = "inline";
  if (btnSpinner) btnSpinner.style.display = "none";
  btn.disabled = false;
}

// ======================== LOGIN ========================
if (isLoginPage) {
  const form = document.getElementById("loginForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const btn = document.getElementById("loginBtn");
      const email = document.getElementById("email")?.value?.trim() || "";
      const password = document.getElementById("password")?.value || "";

      // Validate empty fields
      if (!email || !password) {
        showMessage("loginMessage", "Please fill in all fields.", true);
        return;
      }

      // Show loading
      if (btn) {
        const btnText = btn.querySelector(".btn-text");
        const btnSpinner = btn.querySelector(".btn-spinner");
        if (btnText) btnText.style.display = "none";
        if (btnSpinner) btnSpinner.style.display = "inline";
        btn.disabled = true;
      }

      try {
        const response = await fetch(`${API_BASE}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        if (response.ok) {
          // Success!
          sessionStorage.setItem("token", data.token);
          sessionStorage.setItem("user", JSON.stringify(data.user));

          // ⬅️ NEW: Save persistent login for 15 days
          const loginData = {
            token: data.token,
            user: data.user,
            expiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days
          };
          localStorage.setItem("persistentLogin", JSON.stringify(loginData));

          showMessage("loginMessage", " Login successful! Redirecting…", false);

          setTimeout(() => {
            if (data.user.onboardingCompleted) {
              window.location.href = "../tool/dashboard.html";
            } else {
              window.location.href = "../tool/onboarding.html";
            }
          }, 1000);
        } else {
          const errorMsg = data.message || "Login failed. Please try again.";
          showMessage("loginMessage", errorMsg, true);
          resetButton("loginBtn");
        }
      } catch (error) {
        console.error("Login fetch error:", error);
        showMessage(
          "loginMessage",
          "❌ Unable to connect to server. Please check if server is running.",
          true,
        );
        resetButton("loginBtn");
      }
    });
  }
}

// ======================== SIGNUP ========================
if (isSignupPage) {
  const form = document.getElementById("signupForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const btn = document.getElementById("signupBtn");
      const name = document.getElementById("name")?.value?.trim() || "";
      const email = document.getElementById("email")?.value?.trim() || "";
      const password = document.getElementById("password")?.value || "";
      const confirmPassword =
        document.getElementById("confirmPassword")?.value || "";

      // Validate
      if (!name || !email || !password || !confirmPassword) {
        showMessage("signupMessage", "All fields are required.", true);
        return;
      }
      if (password !== confirmPassword) {
        showMessage("signupMessage", "Passwords do not match.", true);
        return;
      }
      if (password.length < 6) {
        showMessage(
          "signupMessage",
          "Password must be at least 6 characters.",
          true,
        );
        return;
      }

      // Show loading
      if (btn) {
        const btnText = btn.querySelector(".btn-text");
        const btnSpinner = btn.querySelector(".btn-spinner");
        if (btnText) btnText.style.display = "none";
        if (btnSpinner) btnSpinner.style.display = "inline";
        btn.disabled = true;
      }

      try {
        const response = await fetch(`${API_BASE}/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await response.json();

        if (response.ok) {
          showMessage(
            "signupMessage",
            "✅ Account created! Redirecting…",
            false,
          );
          setTimeout(() => {
            window.location.href = `/verify-email?email=${encodeURIComponent(email)}`;
          }, 1500);
        } else {
          showMessage("signupMessage", data.message || "Signup failed.", true);
          resetButton("signupBtn");
        }
      } catch (error) {
        console.error("Signup error:", error);
        showMessage("signupMessage", "❌ Unable to connect to server.", true);
        resetButton("signupBtn");
      }
    });
  }
}

// ======================== PARTICLE GENERATOR ========================
(function () {
  const c = document.getElementById("particles");
  if (!c) return;
  const sizes = [2, 2, 3, 3, 2, 4, 2, 3];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const s = sizes[i % sizes.length];
    p.style.cssText = `
            width:${s}px;height:${s}px;
            top:${Math.random() * 100}%;
            left:${Math.random() * 100}%;
            --d:${3 + Math.random() * 5}s;
            --delay:${Math.random() * 4}s;
        `;
    c.appendChild(p);
  }
})();
