const _rawApiBase = window.PHP_API_BASE_URL;
const API_BASE_URL = typeof _rawApiBase === 'string' ? _rawApiBase.replace(/\/$/, '') : '';

async function requestJson(url, options = {}) {
  // If url is absolute (http/https) use it as-is.
  if (/^https?:\/\//i.test(url)) {
    return await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options })
      .then(async (response) => {
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await response.json() : await response.text();
        if (!response.ok) {
          const message = typeof payload === 'object' && payload ? payload.error || 'Request failed.' : String(payload || 'Request failed.');
          throw new Error(message);
        }
        return payload;
      });
  }

  // Build target URL using configured API base when provided.
  // If API_BASE_URL is empty and the provided `url` starts with '/',
  // convert it to a relative path (`./...`) so the request targets the
  // current app subdirectory instead of the absolute server root.
  let targetUrl;
  if (API_BASE_URL) {
    targetUrl = url.startsWith('/') ? `${API_BASE_URL}${url}` : `${API_BASE_URL}/${url}`;
  } else {
    targetUrl = url.startsWith('/') ? `.${url}` : url;
  }

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
