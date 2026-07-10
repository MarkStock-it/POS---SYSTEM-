const _rawApiBase = window.PHP_API_BASE_URL;
const API_BASE_URL = typeof _rawApiBase === 'string' ? _rawApiBase.replace(/\/$/, '') : '';

function mapEndpointToPhpPath(url) {
  const endpointMap = {
    '/api/auth/login': '/PHP-TEST/auth/login.php',
    '/api/auth/register': '/PHP-TEST/auth/register.php',
    '/api/auth/users': '/PHP-TEST/auth/users.php',
  };

  return endpointMap[url] || url;
}

function buildCandidateUrls(url) {
  const normalized = mapEndpointToPhpPath(url);
  const candidates = [];

  if (/^https?:\/\//i.test(normalized)) {
    return [normalized];
  }

  if (API_BASE_URL) {
    candidates.push(`${API_BASE_URL}${normalized}`);
  }

  if (normalized.startsWith('/')) {
    candidates.push(`.${normalized}`);
    candidates.push(`..${normalized}`);
  } else {
    candidates.push(normalized);
  }

  return candidates.filter((value, index, arr) => arr.indexOf(value) === index);
}

async function requestJson(url, options = {}) {
  const candidates = buildCandidateUrls(url);
  let lastError = null;

  for (const targetUrl of candidates) {
    try {
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
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Request failed.');
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
