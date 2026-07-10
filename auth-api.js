function getApiBaseUrl() {
  const rawBase = typeof window !== 'undefined' ? window.PHP_API_BASE_URL : '';
  return typeof rawBase === 'string' && rawBase.trim() ? rawBase.trim() : '';
}

function normalizeApiPath(value) {
  return String(value || '')
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function joinApiUrl(baseUrl, endpoint) {
  const rawBase = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  const rawEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';

  if (!rawEndpoint) {
    return rawBase && rawBase !== '/' ? rawBase : '/';
  }

  if (/^https?:\/\//i.test(rawEndpoint)) {
    return rawEndpoint;
  }

  const base = rawBase && rawBase !== '/' ? rawBase.replace(/\/+$/, '') : '';
  const endpointPath = normalizeApiPath(rawEndpoint);

  if (!base) {
    return endpointPath ? `/${endpointPath}` : '/';
  }

  return `${base}/${endpointPath}`;
}

function mapEndpointToPhpPath(url) {
  const endpointMap = {
    '/api/auth/login': 'PHP-TEST/auth/login.php',
    '/api/auth/register': 'PHP-TEST/auth/register.php',
    '/api/auth/users': 'PHP-TEST/auth/users.php',
  };

  return endpointMap[url] || url;
}

async function makeApiRequest(endpoint, options = {}) {
  const targetUrl = joinApiUrl(getApiBaseUrl(), mapEndpointToPhpPath(endpoint));
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
  return makeApiRequest('/PHP-TEST/auth/login.php', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

async function registerWithBackend({ fullName, email, username, password, role }) {
  return makeApiRequest('/PHP-TEST/auth/register.php', {
    method: 'POST',
    body: JSON.stringify({ fullName, email, username, password, role }),
  });
}

async function fetchUsersFromBackend() {
  return makeApiRequest('/PHP-TEST/auth/users.php');
}

window.authApi = {
  loginWithBackend,
  registerWithBackend,
  fetchUsersFromBackend,
};
