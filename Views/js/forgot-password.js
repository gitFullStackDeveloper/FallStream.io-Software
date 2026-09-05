// ═══════════════ FETCH CONFIG FROM SERVER ═══════════════
// let API_BASE = 'http://localhost:5000/api';
const API_BASE = window.location.origin + "/api";

let WEB3FORMS_KEY = "";

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const config = await res.json();
      API_BASE = config.API_BASE_URL + "/api";
      WEB3FORMS_KEY = config.WEB3FORMS_KEY;
      console.log("✅ Config loaded securely");
    }
  } catch (err) {
    console.warn("⚠️ Using fallback config");
  }
}

// ======================== STEP MANAGEMENT ========================
function showStep(stepNumber) {
  document
    .querySelectorAll(".step-panel")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById("step" + stepNumber).classList.add("active");

  document
    .querySelectorAll(".step-dot")
    .forEach((d) => d.classList.remove("active", "done"));
  document
    .querySelectorAll(".step-line")
    .forEach((l) => l.classList.remove("done"));

  if (stepNumber >= 1)
    document.getElementById("stepDot1").classList.add("done");
  if (stepNumber >= 2) {
    document
      .getElementById("stepDot2")
      .classList.add(stepNumber === 2 ? "active" : "done");
    document.getElementById("stepLine1").classList.add("done");
  }
  if (stepNumber >= 3) {
    document.getElementById("stepDot3").classList.add("done");
    document.getElementById("stepLine2").classList.add("done");
  } else if (stepNumber === 2) {
    document.getElementById("stepDot2").classList.add("active");
  }
}

// ======================== MESSAGE DISPLAY ========================
function showMessage(message, isError = true) {
  const msgDiv = document.getElementById("forgotMessage");
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
  }, 6000);
}

// ======================== GENERATE RANDOM PASSWORD ========================
function generateRandomPassword(length = 10) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ======================== SEND EMAIL VIA WEB3FORMS ========================
async function sendPasswordEmail(userEmail, userName, newPassword) {
  if (!WEB3FORMS_KEY) {
    console.warn("Web3Forms key not loaded, skipping email");
    return false;
  }

  const formData = {
    access_key: WEB3FORMS_KEY,
    to_email: userEmail,
    subject: "🔐 Your New Password - FallStream.io",
    from_name: "FallStream.io Team",
    message: `
Hello ${userName},

You requested a password reset for your FallStream.io account.

Your new password is: ${newPassword}

Please login with this password and change it immediately from your profile settings for security purposes.

Login here: ${API_BASE.replace("/api", "")}/login

If you did not request this change, please contact our support team immediately.

Best regards,
FallStream.io Team
      `.trim(),
  };

  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    return data.success;
  } catch (err) {
    console.error("Web3Forms error:", err);
    return false;
  }
}

// ======================== FORGOT PASSWORD FORM ========================
const forgotForm = document.getElementById("forgotForm");
if (forgotForm) {
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const submitBtn = document.getElementById("submitBtn");

    if (!email) {
      showMessage("Please enter your email address.");
      return;
    }

    // Show loading
    submitBtn.classList.add("loading");
    submitBtn.innerHTML =
      '<span><i class="fas fa-spinner fa-spin"></i> Checking...</span>';

    try {
      // Step 1: Check if email exists in database
      const checkRes = await fetch(`${API_BASE}/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const checkData = await checkRes.json();

      if (!checkRes.ok) {
        showMessage(
          checkData.message || "Email not found. Please check and try again.",
        );
        submitBtn.classList.remove("loading");
        submitBtn.innerHTML =
          '<i class="fas fa-paper-plane"></i><span>Send Reset Link</span>';
        return;
      }

      // Email exists! Generate new password
      const newPassword = generateRandomPassword(10);
      const userName = checkData.user?.name || "User";

      // Step 2: Show processing
      showStep(2);
      document.getElementById("step2Message").textContent =
        `We found your account (${userName}). Sending new password...`;

      // Step 3: Update password in database
      const updateRes = await fetch(`${API_BASE}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword }),
      });

      if (!updateRes.ok) {
        const updateData = await updateRes.json();
        showStep(1);
        showMessage(
          updateData.message || "Failed to reset password. Please try again.",
        );
        submitBtn.classList.remove("loading");
        submitBtn.innerHTML =
          '<i class="fas fa-paper-plane"></i><span>Send Reset Link</span>';
        return;
      }

      // Step 4: Send email via Web3Forms
      const emailSent = await sendPasswordEmail(email, userName, newPassword);

      // Step 5: Show success
      document.getElementById("sentEmail").textContent = email;
      showStep(3);

      if (!emailSent) {
        console.warn("Email may not have been sent, but password was reset.");
      }
    } catch (err) {
      console.error("Forgot password error:", err);
      showStep(1);
      showMessage("Server error. Please try again later.");
      submitBtn.classList.remove("loading");
      submitBtn.innerHTML =
        '<i class="fas fa-paper-plane"></i><span>Send Reset Link</span>';
    }
  });
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

// ═══════════════ INIT: Load config then enable form ═══════════════
loadConfig();
