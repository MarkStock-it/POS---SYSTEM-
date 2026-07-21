// ============================================
// FORM ELEMENTS
// ============================================
const registerForm = document.getElementById("registerForm");
const firstNameInput = document.getElementById("firstName");
const middleNameInput = document.getElementById("middleName");
const lastNameInput = document.getElementById("lastName");
const emailInput = document.getElementById("email");
const usernameInput = document.getElementById("username");
const phoneInput = document.getElementById("phone");
const branchInput = document.getElementById("branchId");
const dateHiredInput = document.getElementById("dateHired");
const employmentStatusInput = document.getElementById("employmentStatus");
const pinInput = document.getElementById("pin");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const togglePasswordBtn = document.getElementById("togglePassword");
const toggleConfirmPasswordBtn = document.getElementById("toggleConfirmPassword");
const registerButton = document.getElementById("registerButton");
const loginButton = document.getElementById("loginButton");
const roleInput = document.getElementById("role");
const successModal = document.getElementById("successModal");
const toast = document.getElementById("toast");
const backDashboardButton = document.getElementById("backDashboardButton");

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
function validateName(name) {
  return name.trim().length >= 2;
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password) {
  return password.length >= 6;
}

function validatePasswordMatch(password, confirmPassword) {
  return password === confirmPassword && password.length >= 6;
}

function validateUsername(username) { return /^[a-zA-Z0-9_.-]{3,100}$/.test(username); }
function validatePhone(phone) { return /^[0-9+()\-\s]{7,30}$/.test(phone); }
function validatePin(pin) { return pin === "" || /^[0-9]{4,6}$/.test(pin); }

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
firstNameInput.addEventListener("blur", () => {
  const value = firstNameInput.value.trim();
  if (!value) {
    showFieldError(firstNameInput, "First name is required");
  } else if (!validateName(value)) {
    showFieldError(firstNameInput, "First name must be at least 2 characters");
  } else {
    showFieldSuccess(firstNameInput);
  }
});

lastNameInput.addEventListener("blur", () => {
  const value = lastNameInput.value.trim();
  if (!value) {
    showFieldError(lastNameInput, "Last name is required");
  } else if (!validateName(value)) {
    showFieldError(lastNameInput, "Last name must be at least 2 characters");
  } else {
    showFieldSuccess(lastNameInput);
  }
});

[firstNameInput, middleNameInput, lastNameInput].forEach((input) => input.addEventListener("input", () => {
  if (input.classList.contains("error")) clearFieldError(input);
}));

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

function userExists(email, username) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim().toLowerCase();
  return getStoredUsers().some((user) => String(user.email || "").toLowerCase() === normalizedEmail || String(user.username || "").toLowerCase() === normalizedUsername);
}

function createUser(payload) {
  const users = getStoredUsers();
  const nextUser = {
    id: payload.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    firstName: payload.firstName,
    middleName: payload.middleName || "",
    lastName: payload.lastName,
    fullName: [payload.firstName, payload.middleName, payload.lastName].filter(Boolean).join(" "),
    email: payload.email,
    username: payload.username || payload.email,
    password: payload.password,
    role: payload.role || "cashier",
    phone: payload.phone || "",
    branchLocation: payload.branchLocation || "",
    dateHired: payload.dateHired || "",
    employmentStatus: payload.employmentStatus || "active",
    pin: payload.pin || "",
    isLocalAccount: Boolean(payload.isLocalAccount),
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

  const firstName = firstNameInput.value.trim();
  const middleName = middleNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const email = emailInput.value.trim();
  const username = usernameInput.value.trim();
  const phone = phoneInput.value.trim();
  const branchId = Number(branchInput.value);
  const branchLocation = branchInput.options[branchInput.selectedIndex]?.textContent || "";
  const dateHired = dateHiredInput.value;
  const employmentStatus = employmentStatusInput.value;
  const pin = pinInput.value;
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const role = roleInput.value || "cashier";

  if (!firstName) {
    showFieldError(firstNameInput, "First name is required");
    firstNameInput.focus();
    return;
  }
  if (!validateName(firstName)) {
    showFieldError(firstNameInput, "First name must be at least 2 characters");
    firstNameInput.focus();
    return;
  }
  if (!lastName || !validateName(lastName)) {
    showFieldError(lastNameInput, lastName ? "Last name must be at least 2 characters" : "Last name is required");
    lastNameInput.focus();
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

  if (!validateUsername(username)) { showFieldError(usernameInput, "Use at least 3 letters, numbers, dots, dashes, or underscores"); usernameInput.focus(); return; }
  if (!validatePhone(phone)) { showFieldError(phoneInput, "Enter a valid phone number"); phoneInput.focus(); return; }
  if (!Number.isInteger(branchId) || branchId <= 0) { showFieldError(branchInput, "Select an active branch"); branchInput.focus(); return; }
  if (!dateHired) { showFieldError(dateHiredInput, "Date hired is required"); dateHiredInput.focus(); return; }
  if (!validatePin(pin)) { showFieldError(pinInput, "PIN must contain 4 to 6 digits"); pinInput.focus(); return; }

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
    if (userExists(email, username)) {
      registerButton.classList.remove("loading");
      registerButton.disabled = false;
      spinner.style.display = "none";
      showToast("That email or username already exists.", "error");
      emailInput.focus();
      return;
    }

    const registrationPayload = { firstName, middleName, lastName, fullName, email, username, password, role, phone, branchId, branchLocation, dateHired, employmentStatus, pin };
    let creator = {};
    try { creator = JSON.parse(localStorage.getItem('posCurrentUser') || '{}') || {}; } catch (error) { creator = {}; }
    let registeredOffline = false;
    try {
      await window.authApi?.registerWithBackend?.(registrationPayload);
    } catch (backendError) {
      if (!creator.isLocalAccount) throw backendError;
      registeredOffline = true;
    }

    createUser({
      ...registrationPayload,
      isLocalAccount: registeredOffline,
      createdAt: new Date().toISOString(),
    });

    successModal.classList.add("show");
    showToast(`Account created successfully${creator.isLocalAccount ? ' and saved offline' : ''}!`, "success");

    const nextUrl = creator.fullName || creator.username
      ? getDashboardUrl(creator.role)
      : new URL("../login-page/login.html", window.location.href).href;
    setTimeout(() => {
      window.location.href = nextUrl;
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

[usernameInput, phoneInput, branchInput, dateHiredInput, pinInput].forEach((input) => {
  input.addEventListener("input", () => clearFieldError(input));
  input.addEventListener("change", () => clearFieldError(input));
});

async function loadActiveBranches() {
  branchInput.disabled = true;
  branchInput.innerHTML = '<option value="">Loading active branches…</option>';
  try {
    const branches = await window.authApi?.fetchBranchesFromBackend?.(true);
    if (!Array.isArray(branches) || !branches.length) throw new Error('No active branches are available.');
    branchInput.innerHTML = '<option value="">Select a branch</option>';
    branches.forEach((branch) => {
      const option = document.createElement('option');
      option.value = String(branch.id);
      option.textContent = branch.name;
      branchInput.appendChild(option);
    });
    branchInput.disabled = false;
  } catch (error) {
    branchInput.innerHTML = '<option value="">No active branches available</option>';
    showToast(error.message || 'Unable to load branches.');
  }
}

loadActiveBranches();

function getDashboardUrl(role) {
  const normalized = String(role || '').toLowerCase().replace('_', '-');
  const path = normalized === 'super-admin' ? '../New_Index/super-admin.html'
    : normalized === 'admin' ? '../New_Index/admin.html'
      : normalized === 'manager' ? '../New_Index/manager.html' : '../home-page/index.html';
  return new URL(path, window.location.href).href;
}

backDashboardButton.addEventListener('click', () => {
  let user = {};
  try { user = JSON.parse(localStorage.getItem('posCurrentUser') || '{}') || {}; } catch (error) { user = {}; }
  window.location.href = user.role ? getDashboardUrl(user.role) : '../login-page/login.html';
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
firstNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    middleNameInput.focus();
  }
});

middleNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lastNameInput.focus(); } });
lastNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); emailInput.focus(); } });

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
  // Auto-focus first name field
  dateHiredInput.max = new Date().toISOString().slice(0, 10);
  if (!dateHiredInput.value) dateHiredInput.value = new Date().toISOString().slice(0, 10);
  firstNameInput.focus();
});
