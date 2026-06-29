// ============================================
// FORM ELEMENTS
// ============================================
const registerForm = document.getElementById("registerForm");
const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const togglePasswordBtn = document.getElementById("togglePassword");
const toggleConfirmPasswordBtn = document.getElementById("toggleConfirmPassword");
const registerButton = document.getElementById("registerButton");
const loginButton = document.getElementById("loginButton");
const successModal = document.getElementById("successModal");
const toast = document.getElementById("toast");

// ============================================
// PASSWORD TOGGLE
// ============================================
function setupPasswordToggle(input, button, openIconId, closedIconId) {
  button.addEventListener("click", (e) => {
    e.preventDefault();
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    button.setAttribute("aria-pressed", isPassword);
    const eyeOpen = document.getElementById(openIconId);
    const eyeClosed = document.getElementById(closedIconId);
    if (isPassword) {
      eyeOpen.style.display = "none";
      eyeClosed.style.display = "block";
    } else {
      eyeOpen.style.display = "block";
      eyeClosed.style.display = "none";
    }
  });
}

setupPasswordToggle(passwordInput, togglePasswordBtn, "eyeOpenIcon", "eyeClosedIcon");
setupPasswordToggle(confirmPasswordInput, toggleConfirmPasswordBtn, "eyeOpenIcon2", "eyeClosedIcon2");

// ============================================
// FORM VALIDATION
// ============================================
function validateFullName(name) {
  return name.trim().length >= 2;
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$|^[a-zA-Z0-9_]{3,}$/;
  return emailRegex.test(email);
}

function validatePassword(password) {
  return password.length >= 6;
}

function validatePasswordMatch(password, confirmPassword) {
  return password === confirmPassword && password.length >= 6;
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
fullNameInput.addEventListener("blur", () => {
  const value = fullNameInput.value.trim();
  if (!value) {
    showFieldError(fullNameInput, "Full name is required");
  } else if (!validateFullName(value)) {
    showFieldError(fullNameInput, "Full name must be at least 2 characters");
  } else {
    showFieldSuccess(fullNameInput);
  }
});

fullNameInput.addEventListener("input", () => {
  if (fullNameInput.classList.contains("error")) {
    clearFieldError(fullNameInput);
  }
});

emailInput.addEventListener("blur", () => {
  const value = emailInput.value.trim();
  if (!value) {
    showFieldError(emailInput, "Email is required");
  } else if (!validateEmail(value)) {
    showFieldError(emailInput, "Please enter a valid email");
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
    showFieldError(passwordInput, "Password must be at least 6 characters");
  } else {
    showFieldSuccess(passwordInput);
  }
});

passwordInput.addEventListener("input", () => {
  if (passwordInput.classList.contains("error")) {
    clearFieldError(passwordInput);
  }
  // Validate confirm password if it has a value
  if (confirmPasswordInput.value) {
    if (!validatePasswordMatch(passwordInput.value, confirmPasswordInput.value)) {
      showFieldError(confirmPasswordInput, "Passwords do not match");
    } else {
      showFieldSuccess(confirmPasswordInput);
    }
  }
});

confirmPasswordInput.addEventListener("blur", () => {
  const value = confirmPasswordInput.value;
  if (!value) {
    showFieldError(confirmPasswordInput, "Please confirm your password");
  } else if (!validatePasswordMatch(passwordInput.value, value)) {
    showFieldError(confirmPasswordInput, "Passwords do not match");
  } else {
    showFieldSuccess(confirmPasswordInput);
  }
});

confirmPasswordInput.addEventListener("input", () => {
  if (confirmPasswordInput.classList.contains("error")) {
    clearFieldError(confirmPasswordInput);
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
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = fullNameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  // Validate full name
  if (!fullName) {
    showFieldError(fullNameInput, "Full name is required");
    fullNameInput.focus();
    return;
  }
  if (!validateFullName(fullName)) {
    showFieldError(fullNameInput, "Full name must be at least 2 characters");
    fullNameInput.focus();
    return;
  }

  // Validate email
  if (!email) {
    showFieldError(emailInput, "Email is required");
    emailInput.focus();
    return;
  }
  if (!validateEmail(email)) {
    showFieldError(emailInput, "Please enter a valid email");
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
    showFieldError(passwordInput, "Password must be at least 6 characters");
    passwordInput.focus();
    return;
  }

  // Validate confirm password
  if (!confirmPassword) {
    showFieldError(confirmPasswordInput, "Please confirm your password");
    confirmPasswordInput.focus();
    return;
  }
  if (!validatePasswordMatch(password, confirmPassword)) {
    showFieldError(confirmPasswordInput, "Passwords do not match");
    confirmPasswordInput.focus();
    return;
  }

  // Show loading state
  registerButton.classList.add("loading");
  registerButton.disabled = true;
  const spinner = registerButton.querySelector(".spinner");
  spinner.style.display = "block";

  // Simulate API call
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Show success modal
    successModal.classList.add("show");
    showToast("Account created successfully!", "success");

    // Redirect after 3 seconds
    setTimeout(() => {
      window.location.href = "../login-page/login.html";
    }, 3000);
  } catch (error) {
    registerButton.classList.remove("loading");
    registerButton.disabled = false;
    spinner.style.display = "none";
    showToast("Registration failed. Please try again.");
  }
});

// ============================================
// LOGIN BUTTON
// ============================================
loginButton.addEventListener("click", () => {
  window.location.href = "../login-page/login.html";
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener("keydown", (e) => {
  // Ctrl+Enter to submit
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    registerForm.dispatchEvent(new Event("submit"));
  }
});

// ============================================
// FOCUS MANAGEMENT
// ============================================
fullNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    emailInput.focus();
  }
});

emailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    passwordInput.focus();
  }
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmPasswordInput.focus();
  }
});

confirmPasswordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    registerForm.dispatchEvent(new Event("submit"));
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
  // Auto-focus full name field
  fullNameInput.focus();
});

// Demo credentials hint (remove in production)
console.log("📝 Demo Registration Available:");
console.log("   Full Name: Demo User (min 2 characters)");
console.log("   Email: demo@pos.com (or valid email format)");
console.log("   Password: (min 6 characters, must match confirmation)");
