// ═══════════════ CONFIG ═══════════════
// let API_BASE = 'http://localhost:5000/api';
const API_BASE = window.location.origin + "/api";

let WEB3FORMS_KEY = "";

// Load config from server
async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const config = await res.json();
      API_BASE = config.API_BASE_URL + "/api";
      WEB3FORMS_KEY = config.WEB3FORMS_KEY;
      console.log("✅ Config loaded");
    }
  } catch (err) {
    console.warn("⚠️ Using fallback config");
  }
}

// Get email from URL params
const urlParams = new URLSearchParams(window.location.search);
const userEmail =
  urlParams.get("email") || sessionStorage.getItem("verifyEmail") || "";

if (!userEmail) {
  window.location.href = "/signup";
}

// Save email
sessionStorage.setItem("verifyEmail", userEmail);
document.getElementById("userEmail").textContent = userEmail;

// ═══════════════ SEND VERIFICATION CODE ON PAGE LOAD ═══════════════
async function sendVerificationCode() {
  try {
    // Step 1: Get verification code from server
    const res = await fetch(`${API_BASE}/send-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.message || "Failed to send code");
      return;
    }

    // Step 2: Send email via Web3Forms FROM BROWSER
    if (WEB3FORMS_KEY) {
      const formData = {
        access_key: WEB3FORMS_KEY,
        subject: "🔐 Email Verification - FallStream.io",
        from_name: "FallStream.io Team",
        to_email: userEmail,
        message: `
Hello,

Thank you for creating an account! To complete your registration, please use the verification code below:

🔢 Verification Code: ${data.code || "Check server response"}

⏰ This code will expire in ${data.expiresIn || 10} minutes.

If you did not create this account, please ignore this email.

Best regards,
FallStream.io Team
          `.trim(),
      };

      await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      console.log("📧 Email sent via browser");
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

// ═══════════════ TIMER ═══════════════
let timeLeft = 600;
let timerInterval;
const timerEl = document.getElementById("timer");
const timerDisplay = document.getElementById("timerDisplay");

function startTimer() {
  timeLeft = 600;
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();

    if (timeLeft <= 60) {
      timerDisplay.classList.add("expiring");
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerEl.textContent = "00:00";
      showMessage("Code has expired. Please request a new one.");
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resetTimer() {
  clearInterval(timerInterval);
  timerDisplay.classList.remove("expiring");
  startTimer();
}

// ═══════════════ MESSAGE DISPLAY ═══════════════
function showMessage(message, isError = true) {
  const msgDiv = document.getElementById("verifyMessage");
  if (!msgDiv) return;
  const icon = isError ? "fa-exclamation-circle" : "fa-check-circle";
  const cls = isError ? "error" : "success";
  msgDiv.innerHTML = `
      <div class="msg-box ${cls}">
        <i class="fas ${icon}"></i>
        <span>${message}</span>
      </div>`;
  setTimeout(() => {
    msgDiv.innerHTML = "";
  }, 5000);
}

// ═══════════════ CODE INPUT HANDLING ═══════════════
const codeInputs = document.querySelectorAll(".code-input");

codeInputs.forEach((input, index) => {
  input.addEventListener("input", (e) => {
    const value = e.target.value;
    if (!/^\d$/.test(value)) {
      e.target.value = "";
      return;
    }
    input.classList.add("filled");
    if (index < codeInputs.length - 1) {
      codeInputs[index + 1].focus();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && index > 0) {
      codeInputs[index - 1].focus();
      codeInputs[index - 1].classList.remove("filled");
    }
  });

  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pastedData.length === 6) {
      pastedData.split("").forEach((char, i) => {
        if (codeInputs[i]) {
          codeInputs[i].value = char;
          codeInputs[i].classList.add("filled");
        }
      });
      codeInputs[5].focus();
    }
  });
});

codeInputs[0]?.focus();

function getVerificationCode() {
  return Array.from(codeInputs)
    .map((input) => input.value)
    .join("");
}

// ═══════════════ VERIFY CODE ═══════════════
document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = getVerificationCode();
  const btn = document.getElementById("verifyBtn");
  const btnText = btn.querySelector(".btn-text");
  const btnSpinner = btn.querySelector(".btn-spinner");

  if (code.length !== 6) {
    showMessage("Please enter the complete 6-digit code.");
    shakeInputs();
    return;
  }

  btnText.style.display = "none";
  btnSpinner.style.display = "inline";
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, code }),
    });
    const data = await res.json();

    if (res.ok) {
      markInputsSuccess();
      clearInterval(timerInterval);

      setTimeout(() => {
        document.getElementById("verifyState").classList.add("hidden");
        document.getElementById("successState").classList.remove("hidden");
        sessionStorage.removeItem("verifyEmail");
      }, 800);
    } else {
      showMessage(data.message || "Invalid code. Please try again.");
      shakeInputs();
      clearAllInputs();
      codeInputs[0]?.focus();
      btnText.style.display = "inline";
      btnSpinner.style.display = "none";
      btn.disabled = false;
    }
  } catch (err) {
    console.error("Verification error:", err);
    showMessage("Server error. Please try again.");
    btnText.style.display = "inline";
    btnSpinner.style.display = "none";
    btn.disabled = false;
  }
});

// ═══════════════ RESEND CODE ═══════════════
document.getElementById("resendBtn").addEventListener("click", async () => {
  const btn = document.getElementById("resendBtn");
  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    // Get new code from server
    const res = await fetch(`${API_BASE}/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });
    const data = await res.json();

    if (res.ok) {
      // Send email from browser
      if (WEB3FORMS_KEY) {
        await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_key: WEB3FORMS_KEY,
            subject: "🔐 New Verification Code - FallStream.io",
            from_name: "FallStream.io Team",
            to_email: userEmail,
            message: `
Hello,

You requested a new verification code.

🔢 New code has been generated. Please use it to verify your email.

⏰ This code will expire in 10 minutes.

Best regards,
FallStream.io Team
              `.trim(),
          }),
        });
      }

      showMessage("New code sent! Check your email.", false);
      resetTimer();
      clearAllInputs();
      codeInputs[0]?.focus();
    } else {
      showMessage(data.message || "Failed to resend code.");
    }
  } catch (err) {
    console.error("Resend error:", err);
    showMessage("Server error. Please try again.");
  }

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = "Resend Code";
  }, 30000);
});

// ═══════════════ HELPER FUNCTIONS ═══════════════
function shakeInputs() {
  codeInputs.forEach((input) => {
    input.classList.add("error");
    setTimeout(() => input.classList.remove("error"), 500);
  });
}

function markInputsSuccess() {
  codeInputs.forEach((input) => {
    input.classList.add("success");
  });
}

function clearAllInputs() {
  codeInputs.forEach((input) => {
    input.value = "";
    input.classList.remove("filled", "error", "success");
  });
}

// ═══════════════ PARTICLE GENERATOR ═══════════════
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

// ═══════════════ AUTO-SUBMIT ON 6 DIGITS ═══════════════
codeInputs[5]?.addEventListener("input", () => {
  if (getVerificationCode().length === 6) {
    document.getElementById("verifyBtn").click();
  }
});

// ═══════════════ INIT ═══════════════
async function init() {
  await loadConfig();
  startTimer();
  sendVerificationCode(); // Send email from browser
}

init();
