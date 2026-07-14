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
const roleInput = document.getElementById("role");
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

function getStoredUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem("posUsers") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function setStoredUsers(users) {
  localStorage.setItem("posUsers", JSON.stringify(users));
}

function userExists(email) {
  const normalizedEmail = email.trim().toLowerCase();
  return getStoredUsers().some((user) => String(user.email || "").toLowerCase() === normalizedEmail);
}

function createUser(payload) {
  const users = getStoredUsers();
  const nextUser = {
    id: payload.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fullName: payload.fullName,
    email: payload.email,
    username: payload.username || payload.email,
    password: payload.password,
    role: payload.role || "cashier",
    createdAt: payload.createdAt || new Date().toISOString(),
  };

  users.push(nextUser);
  setStoredUsers(users);
  return nextUser;
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
  const role = roleInput.value || "cashier";

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

  try {
    if (userExists(email)) {
      registerButton.classList.remove("loading");
      registerButton.disabled = false;
      spinner.style.display = "none";
      showToast("An account with that email already exists.", "error");
      emailInput.focus();
      return;
    }

    await window.authApi?.registerWithBackend?.({
      fullName,
      email,
      username: email.split("@")[0],
      password,
      role,
    });

    createUser({
      fullName,
      email,
      username: email.split("@")[0],
      password,
      role,
      createdAt: new Date().toISOString(),
    });

    successModal.classList.add("show");
    showToast("Account created successfully! Redirecting to login...", "success");

    const loginUrl = new URL("../login-page/login.html", window.location.href).href;
    setTimeout(() => {
      window.location.href = loginUrl;
    }, 800);
  } catch (error) {
    registerButton.classList.remove("loading");
    registerButton.disabled = false;
    spinner.style.display = "none";
    showToast(error.message || "Registration failed. Please try again.");
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
// INITIALIZATION
// ============================================
window.addEventListener("load", () => {
  themeUtils.initTheme();
  document.getElementById('themeToggle')?.addEventListener('click', themeUtils.toggleTheme);
  // Auto-focus full name field
  fullNameInput.focus();
});

