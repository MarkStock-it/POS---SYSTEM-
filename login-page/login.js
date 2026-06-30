// ============================================
// FORM ELEMENTS
// ============================================
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePassword");
const loginButton = document.getElementById("loginButton");
const signupButton = document.getElementById("signupButton");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const successModal = document.getElementById("successModal");
const toast = document.getElementById("toast");

// ============================================
// PASSWORD TOGGLE
// ============================================
togglePasswordBtn.addEventListener("click", (e) => {
  e.preventDefault();
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePasswordBtn.setAttribute("aria-pressed", isPassword);
  const eyeOpen = document.getElementById("eyeOpenIcon");
  const eyeClosed = document.getElementById("eyeClosedIcon");
  if (isPassword) {
    eyeOpen.style.display = "none";
    eyeClosed.style.display = "block";
  } else {
    eyeOpen.style.display = "block";
    eyeClosed.style.display = "none";
  }
});

// ============================================
// FORM VALIDATION
// ============================================
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$|^[a-zA-Z0-9_]{3,}$/;
  return emailRegex.test(email);
}

function validatePassword(password) {
  return password.length >= 3;
}

function clearFieldError(field) {
  const formGroup = field.closest(".form-group");
  formGroup.classList.remove("error", "success");
  field.setAttribute("aria-invalid", "false");
}

function showFieldError(field, message) {
  const formGroup = field.closest(".form-group");
  const errorEl = formGroup.querySelector(".error-message");
  formGroup.classList.remove("success");
  formGroup.classList.add("error");
  field.setAttribute("aria-invalid", "true");
  errorEl.textContent = message;
}

function showFieldSuccess(field) {
  const formGroup = field.closest(".form-group");
  formGroup.classList.remove("error");
  formGroup.classList.add("success");
  field.setAttribute("aria-invalid", "false");
}

// Real-time validation
emailInput.addEventListener("blur", () => {
  const value = emailInput.value.trim();
  if (!value) {
    showFieldError(emailInput, "Email or username is required");
  } else if (!validateEmail(value)) {
    showFieldError(emailInput, "Please enter a valid email or username");
  } else {
    showFieldSuccess(emailInput);
  }
});

emailInput.addEventListener("input", () => {
  if (emailInput.classList.contains("error")) {
    clearFieldError(emailInput);
  }
});

passwordInput.addEventListener("blur", () => {
  const value = passwordInput.value;
  if (!value) {
    showFieldError(passwordInput, "Password is required");
  } else if (!validatePassword(value)) {
    showFieldError(passwordInput, "Password must be at least 3 characters");
  } else {
    showFieldSuccess(passwordInput);
  }
});

passwordInput.addEventListener("input", () => {
  if (passwordInput.classList.contains("error")) {
    clearFieldError(passwordInput);
  }
});

// ============================================
// TOAST NOTIFICATION
// ============================================
function showToast(message, type = "error") {
  toast.textContent = message;
  toast.classList.add("show");
  if (type === "success") {
    toast.classList.add("success");
  } else {
    toast.classList.remove("success");
  }
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// ============================================
// FORM SUBMISSION
// ============================================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Validate email
  if (!email) {
    showFieldError(emailInput, "Email or username is required");
    emailInput.focus();
    return;
  }
  if (!validateEmail(email)) {
    showFieldError(emailInput, "Please enter a valid email or username");
    emailInput.focus();
    return;
  }

  // Validate password
  if (!password) {
    showFieldError(passwordInput, "Password is required");
    passwordInput.focus();
    return;
  }
  if (!validatePassword(password)) {
    showFieldError(passwordInput, "Password must be at least 3 characters");
    passwordInput.focus();
    return;
  }

  // Show loading state
  loginButton.classList.add("loading");
  loginButton.disabled = true;
  const spinner = loginButton.querySelector(".spinner");
  spinner.style.display = "block";

  // Simulate API call
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Show success modal
    successModal.classList.add("show");
    showToast("Login successful! Redirecting to dashboard...", "success");

    // Redirect immediately to the homepage relative to the current repo path
    const homeUrl = new URL("../home-page/index.html", window.location.href).href;
    setTimeout(() => {
      window.location.href = homeUrl;
    }, 800);
  } catch (error) {
    loginButton.classList.remove("loading");
    loginButton.disabled = false;
    spinner.style.display = "none";
    showToast("Login failed. Please try again.");
  }
});

// ============================================
// SIGNUP & FORGOT PASSWORD
// ============================================
signupButton.addEventListener("click", () => {
  showToast("Sign up feature coming soon!", "error");
});

forgotPasswordLink.addEventListener("click", (e) => {
  e.preventDefault();
  showToast("Password reset feature coming soon!", "error");
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener("keydown", (e) => {
  // Ctrl+Enter to submit
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    loginForm.dispatchEvent(new Event("submit"));
  }
});

// ============================================
// FOCUS MANAGEMENT
// ============================================
emailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    passwordInput.focus();
  }
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    loginForm.dispatchEvent(new Event("submit"));
  }
});

// ============================================
// THEME MANAGEMENT
// ============================================
const themeToggle = document.getElementById("themeToggle");
const sunIcon = document.getElementById("sunIcon");
const moonIcon = document.getElementById("moonIcon");
const htmlElement = document.documentElement;

function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  htmlElement.setAttribute("data-theme", savedTheme);
  updateThemeIcons(savedTheme);
}

function updateThemeIcons(theme) {
  if (theme === "light") {
    sunIcon.style.display = "block";
    moonIcon.style.display = "none";
  } else {
    sunIcon.style.display = "none";
    moonIcon.style.display = "block";
  }
}

function toggleTheme() {
  const currentTheme = htmlElement.getAttribute("data-theme") || "dark";
  const newTheme = currentTheme === "light" ? "dark" : "light";
  htmlElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcons(newTheme);
}

themeToggle.addEventListener("click", toggleTheme);

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener("load", () => {
  initTheme();
  // Auto-focus email field
  emailInput.focus();
});

// Demo credentials hint (remove in production)
console.log("📝 Demo Login Available:");
console.log('   Email: demo@pos.com or "demouser"');
console.log("   Password: password (any 3+ characters)");
