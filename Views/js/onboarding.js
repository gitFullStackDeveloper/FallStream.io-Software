// const API_BASE = 'http://localhost:5000/api';
const API_BASE = window.location.origin + "/api";

// ═══════════════ STATE ═══════════════
let currentStep = 1;
const totalSteps = 4;
let selectedOccupation = "";
let selectedPurpose = "";

// ═══════════════ LOAD USER INFO ═══════════════
const user = JSON.parse(sessionStorage.getItem("user") || "{}");
const token = sessionStorage.getItem("token");

if (!token) {
  window.location.href = "../tool/login.html";
}

// ═══════════════ STEP MANAGEMENT ═══════════════
function showStep(stepNumber) {
  // Hide all steps
  document
    .querySelectorAll(".step-panel")
    .forEach((p) => p.classList.remove("active"));
  // Show target step
  const targetStep = document.getElementById("step" + stepNumber);
  if (targetStep) targetStep.classList.add("active");

  // Update dots
  document
    .querySelectorAll(".step-dot")
    .forEach((d) => d.classList.remove("active", "done"));
  document
    .querySelectorAll(".step-line")
    .forEach((l) => l.classList.remove("done"));

  if (stepNumber >= 1)
    document
      .getElementById("stepDot1")
      .classList.add(stepNumber === 1 ? "active" : "done");
  if (stepNumber >= 2) {
    document
      .getElementById("stepDot2")
      .classList.add(stepNumber === 2 ? "active" : "done");
    document.getElementById("stepLine1").classList.add("done");
  }
  if (stepNumber >= 3) {
    document
      .getElementById("stepDot3")
      .classList.add(stepNumber === 3 ? "active" : "done");
    document.getElementById("stepLine2").classList.add("done");
  }
  if (stepNumber >= 4) {
    document
      .getElementById("stepDot4")
      .classList.add(stepNumber === 4 ? "active" : "done");
    document.getElementById("stepLine3").classList.add("done");
  }

  currentStep = stepNumber;

  // Set DOB max to today on step 1
  if (stepNumber === 1) {
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("dobInput").setAttribute("max", today);
  }
}

function nextStep() {
  if (currentStep < totalSteps) {
    showStep(currentStep + 1);
  }
}

function prevStep() {
  if (currentStep > 1) {
    showStep(currentStep - 1);
  }
}

// ═══════════════ OPTION SELECTION ═══════════════
function selectOption(card, gridId) {
  document.querySelectorAll(`#${gridId} .option-card`).forEach((c) => {
    c.classList.remove("selected");
  });

  card.classList.add("selected");

  if (gridId === "occupationGrid") {
    selectedOccupation = card.dataset.value;
    document.getElementById("occNextBtn").disabled = false;
  } else if (gridId === "purposeGrid") {
    selectedPurpose = card.dataset.value;
    document.getElementById("purposeNextBtn").disabled = false;
  }
}

// ═══════════════ AGREEMENT CHECKBOX ═══════════════
document
  .getElementById("agreeCheckbox")
  .addEventListener("change", function () {
    document.getElementById("finishBtn").disabled = !this.checked;
  });

// ═══════════════ MESSAGE DISPLAY ═══════════════
function showMessage(message, isError = true) {
  const msgDiv = document.getElementById("onboardingMessage");
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

// ═══════════════ SUBMIT ONBOARDING ═══════════════
async function submitOnboarding() {
  const btn = document.getElementById("finishBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

  const dobInput = document.getElementById("dobInput");
  const dateOfBirth = dobInput ? dobInput.value : "";

  try {
    const res = await fetch(`${API_BASE}/onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        dateOfBirth: dateOfBirth,
        occupation: selectedOccupation,
        heardFrom: selectedPurpose,
        agreedToPolicy: true,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      user.onboardingCompleted = true;
      sessionStorage.setItem("user", JSON.stringify(user));

      showMessage("✅ Setup complete! Redirecting to dashboard...", false);

      setTimeout(() => {
        window.location.href = "../tool/dashboard.html";
      }, 1500);
    } else {
      showMessage(data.message || "Failed to save. Please try again.", true);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> Complete Setup';
    }
  } catch (err) {
    console.error("Onboarding error:", err);
    showMessage("Server error. Please try again.", true);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Complete Setup';
  }
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

// ═══════════════ INIT ═══════════════
showStep(1);
