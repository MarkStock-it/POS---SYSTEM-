const API_BASE_URL = (window.PHP_API_BASE_URL || '').replace(/\/$/, '');

async function requestJson(url, options = {}) {
  const targetUrl = /^https?:\/\//i.test(url) ? url : `${API_BASE_URL}${url}`;
  const response = await fetch(targetUrl, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload ? payload.error || 'Request failed.' : String(payload || 'Request failed.');
    throw new Error(message);
  }

  return payload;
}

async function loginWithBackend(identifier, password) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

async function registerWithBackend({ fullName, email, username, password, role }) {
  return requestJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName, email, username, password, role }),
  });
}

async function fetchUsersFromBackend() {
  return requestJson('/api/auth/users');
}

window.authApi = {
  loginWithBackend,
  registerWithBackend,
  fetchUsersFromBackend,
};
