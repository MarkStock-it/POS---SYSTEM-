const authApiScriptUrl = document.currentScript && document.currentScript.src
  ? document.currentScript.src
  : window.location.href;

function getApiBaseUrl() {
  const rawBase = typeof window !== 'undefined' ? window.PHP_API_BASE_URL : '';
  if (typeof rawBase === 'string' && rawBase.trim() && rawBase.trim() !== '/') {
    return rawBase.trim();
  }
  return new URL('.', authApiScriptUrl).pathname;
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

function mapEndpointToApiPath(url) {
  const [path, query = ''] = String(url || '').split('?');
  const routes = {
    '/api/auth/login': 'PHP-TEST/auth/login.php',
    '/api/auth/logout': 'PHP-TEST/auth/logout.php',
    '/api/auth/register': 'PHP-TEST/auth/register.php',
    '/api/auth/register/v2': 'PHP-TEST/auth/register.php',
    '/api/auth/users': 'PHP-TEST/auth/users.php',
    '/api/auth/profile': 'PHP-TEST/auth/profile.php',
    '/api/branches': 'PHP-TEST/branches.php',
    '/api/settings': 'PHP-TEST/settings.php',
  };
  const mapped = routes[path] || path;
  return query ? `${mapped}?${query}` : mapped;
}

async function makeApiRequest(endpoint, options = {}) {
  const targetUrl = joinApiUrl(getApiBaseUrl(), mapEndpointToApiPath(endpoint));
  const response = await fetch(targetUrl, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload ? payload.error || 'Request failed.' : String(payload || 'Request failed.');
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function loginWithBackend(identifier, password) {
  return makeApiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

async function registerWithBackend({ fullName, email, username, password, role, phone, branchId, dateHired, employmentStatus, pin }) {
  return makeApiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName, email, username, password, role, phone, branchId, dateHired, employmentStatus, pin }),
  });
}

async function fetchUsersFromBackend() {
  return makeApiRequest('/api/auth/users');
}

async function logoutFromBackend() {
  return makeApiRequest('/api/auth/logout', { method: 'POST', body: '{}' });
}

async function fetchBranchesFromBackend(activeOnly = true) {
  return makeApiRequest(`/api/branches?active=${activeOnly ? '1' : '0'}`);
}

window.authApi = {
  loginWithBackend,
  registerWithBackend,
  fetchUsersFromBackend,
  logoutFromBackend,
  fetchBranchesFromBackend,
};
