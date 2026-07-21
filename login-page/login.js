// ============================================
// FORM ELEMENTS
// ============================================
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePassword");
const loginButton = document.getElementById("loginButton");
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

function getStoredUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem("posUsers") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function getUserByIdentifier(identifier) {
  const normalized = identifier.trim().toLowerCase();
  return getStoredUsers().find((user) => {
    return user.email.toLowerCase() === normalized || user.username.toLowerCase() === normalized;
  });
}

const OFFLINE_ACCOUNTS = Object.freeze([
  { id: 'local-super-admin', fullName: 'Local Super Administrator', username: 'localsuperadmin', role: 'super-admin' },
  { id: 'local-admin', fullName: 'Local Administrator', username: 'localadmin', role: 'admin' },
  { id: 'local-manager', fullName: 'Local Manager', username: 'localmanager', role: 'manager' },
  { id: 'local-cashier', fullName: 'Local Cashier', username: 'localcashier', role: 'cashier' },
].map((account) => Object.freeze({
  ...account,
  email: `${account.username}@markstock.local`,
  password: 'Jumong09',
  isLocalAccount: true,
})));

function isOfflineDevelopmentMode() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
    || new URLSearchParams(window.location.search).get('offline') === '1';
}

function getOfflineAccount(identifier, password) {
  if (!isOfflineDevelopmentMode()) return null;
  const normalized = String(identifier || '').trim().toLowerCase();
  const account = OFFLINE_ACCOUNTS.find((candidate) => normalized === candidate.username || normalized === candidate.email);
  return account && String(password) === account.password ? { ...account } : null;
}

function normalizeRoleValue(role, fallback = "cashier") {
  const value = String(role || "").trim().toLowerCase();
  if (!value) return fallback;
  if (["superadmin", "super admin", "super_admin", "super-admin"].includes(value)) return "super-admin";
  if (["administrator", "admin"].includes(value)) return "admin";
  if (["manager"].includes(value)) return "manager";
  return value === "cashier" ? "cashier" : fallback;
}

function inferRoleFromIdentifier(identifier, fallback = "cashier") {
  const value = String(identifier || "").trim().toLowerCase();
  if (value.includes("super") || value.includes("system")) return "super-admin";
  if (value.includes("admin")) return "admin";
  if (value.includes("manager")) return "manager";
  return fallback;
}

function setCurrentUser(user) {
  const normalizedRole = normalizeRoleValue(user.role || inferRoleFromIdentifier(user.email || user.username || "", "cashier"), "cashier");
  localStorage.setItem("posCurrentUser", JSON.stringify({
    ...user,
    role: normalizedRole,
  }));
}


// ============================================
// FORM SUBMISSION
// ============================================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const identifier = emailInput.value.trim();
  const password = passwordInput.value;

  // Validate email / username
  if (!identifier) {
    showFieldError(emailInput, "Email or username is required");
    emailInput.focus();
    return;
  }
  if (!validateEmail(identifier)) {
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

  let user = getUserByIdentifier(identifier);
  let backendUser = null;
  const offlineAccount = getOfflineAccount(identifier, password);

  try {
    backendUser = await window.authApi?.loginWithBackend?.(identifier, password);
    if (backendUser) {
      user = backendUser;
      const normalizedRole = normalizeRoleValue(backendUser.role || inferRoleFromIdentifier(identifier, "cashier"), "cashier");
      const storedUsers = getStoredUsers();
      const existingIndex = storedUsers.findIndex((storedUser) => String(storedUser.email || "").toLowerCase() === String(backendUser.email || "").toLowerCase());
      const syncedUser = {
        fullName: backendUser.fullName || backendUser.full_name || backendUser.name || "",
        firstName: backendUser.firstName || "",
        middleName: backendUser.middleName || "",
        lastName: backendUser.lastName || "",
        email: backendUser.email || "",
        username: backendUser.username || backendUser.email || "",
        role: normalizedRole,
        createdAt: new Date().toISOString(),
      };
      if (existingIndex >= 0) {
        storedUsers[existingIndex] = { ...storedUsers[existingIndex], ...syncedUser };
      } else {
        storedUsers.push(syncedUser);
      }
      localStorage.setItem("posUsers", JSON.stringify(storedUsers));
    }
  } catch (error) {
    if (Number.isInteger(error?.status)) {
      showFieldError(emailInput, error.message || 'Invalid login credentials. Please try again.');
      showFieldError(passwordInput, 'Unable to sign in with these credentials.');
      return;
    }
    if (offlineAccount) {
      user = offlineAccount;
    } else if (!isOfflineDevelopmentMode() || !user || String(user.password || "") !== String(password)) {
      showFieldError(emailInput, "Invalid login credentials. Please try again.");
      showFieldError(passwordInput, "Invalid login credentials.");
      return;
    } else {
      user = { ...user, isLocalAccount: true };
    }
  }

  const normalizedRole = normalizeRoleValue(user.role || inferRoleFromIdentifier(identifier, "cashier"), "cashier");

  // Show loading state
  loginButton.classList.add("loading");
  loginButton.disabled = true;
  const spinner = loginButton.querySelector(".spinner");
  spinner.style.display = "block";

  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setCurrentUser({
      id: user.id,
      fullName: user.fullName || user.full_name || user.name || "",
      firstName: user.firstName || "",
      middleName: user.middleName || "",
      lastName: user.lastName || "",
      email: user.email,
      username: user.username,
      role: normalizedRole,
      isLocalAccount: Boolean(user.isLocalAccount),
      phone: user.phone || "",
      branchLocation: user.branchLocation || "",
      dateHired: user.dateHired || "",
      employmentStatus: user.employmentStatus || "active",
      loginTimestamp: user.loginTimestamp || new Date().toISOString(),
      shiftId: Number(user.shiftId) || null,
    });

    successModal.classList.add("show");
    showToast("Login successful! Redirecting to dashboard...", "success");

    setTimeout(() => {
      const targetPath = window.roleDashboard?.getDashboardPath?.(normalizedRole) || (
        normalizedRole === "super-admin"
          ? "../New_Index/super-admin.html"
          : normalizedRole === "admin"
            ? "../New_Index/admin.html"
            : normalizedRole === "manager"
              ? "../New_Index/manager.html"
              : "../home-page/index.html"
      );
      window.location.href = new URL(targetPath, window.location.href).href;
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
forgotPasswordLink.addEventListener("click", (e) => {
  e.preventDefault();
  showToast("Please contact your system administrator at admin@pos.com to reset your password.", "error");
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
// INITIALIZATION
// ============================================
window.addEventListener("load", () => {
  themeUtils.initTheme();
  document.getElementById('themeToggle')?.addEventListener('click', themeUtils.toggleTheme);
  // Auto-focus email field
  emailInput.focus();
});
