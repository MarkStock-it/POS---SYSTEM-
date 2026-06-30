(function () {
  const ROLE_DASHBOARD_PATHS = {
    'super-admin': '../New_Index/super-admin.html',
    admin: '../New_Index/admin.html',
    manager: '../New_Index/manager.html',
    cashier: '../home-page/index.html',
  };

  function normalizeRole(role) {
    const value = String(role || '').trim().toLowerCase();
    const aliases = {
      'superadmin': 'super-admin',
      'super admin': 'super-admin',
      'super-admin': 'super-admin',
      'administrator': 'admin',
      'admin': 'admin',
      'manager': 'manager',
      'cashier': 'cashier',
    };

    return aliases[value] || (Object.prototype.hasOwnProperty.call(ROLE_DASHBOARD_PATHS, value) ? value : 'cashier');
  }

  function getDashboardPath(role) {
    return ROLE_DASHBOARD_PATHS[normalizeRole(role)] || ROLE_DASHBOARD_PATHS.cashier;
  }

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('posCurrentUser') || 'null') || {};
    } catch (error) {
      return {};
    }
  }

  function setCurrentUser(user) {
    localStorage.setItem('posCurrentUser', JSON.stringify({
      ...(user || {}),
      role: normalizeRole(user && user.role),
    }));
  }

  function initRoleDashboard(options = {}) {
    const currentUser = getCurrentUser();
    const role = normalizeRole(currentUser.role || options.defaultRole || 'cashier');
    const allowedRoles = (options.allowedRoles || [role]).map(normalizeRole);

    const hasSession = Boolean(currentUser && (currentUser.fullName || currentUser.email || currentUser.username));

    if (!hasSession) {
      window.location.href = '../login-page/login.html';
      return null;
    }

    if (allowedRoles.length && !allowedRoles.includes(role)) {
      window.location.href = getDashboardPath(currentUser.role || options.defaultRole || 'cashier');
      return null;
    }

    if (options.userNameId) {
      const nameNode = document.getElementById(options.userNameId);
      if (nameNode && currentUser.fullName) {
        nameNode.textContent = currentUser.fullName;
      }
    }

    if (options.roleId) {
      const roleNode = document.getElementById(options.roleId);
      if (roleNode) {
        roleNode.textContent = role.toUpperCase();
      }
    }

    return { currentUser, role };
  }

  function logout() {
    localStorage.removeItem('posCurrentUser');
    window.location.href = '../login-page/login.html';
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-pos-pin': '1234', ...(options.headers || {}) },
      ...options,
    });

    const text = await response.text();
    if (!response.ok) {
      let message = 'Request failed';
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.error) message = parsed.error;
      } catch (error) {
        if (text) message = text;
      }
      throw new Error(message);
    }

    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('Invalid JSON response');
    }
  }

  async function loadTransactions(targetTableId) {
    try {
      const transactions = await fetchJson('/api/transactions');
      const tableBody = document.getElementById(targetTableId);
      if (!tableBody) return;
      if (!Array.isArray(transactions) || !transactions.length) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No transactions found.</td></tr>';
        return;
      }

      tableBody.innerHTML = transactions.map((txn) => `
        <tr>
          <td>#${txn.id}</td>
          <td>${txn.created_at || '-'}</td>
          <td>${Number(txn.total || 0).toFixed(2)}</td>
          <td>${txn.payment_method || 'Unknown'}</td>
          <td><span class="status-dot online">Completed</span></td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  }

  async function loadInventory(targetTableId) {
    try {
      const products = await fetchJson('/api/products');
      const tableBody = document.getElementById(targetTableId);
      if (!tableBody) return;
      if (!Array.isArray(products) || !products.length) {
        tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No inventory found.</td></tr>';
        return;
      }

      tableBody.innerHTML = products.map((product) => `
        <tr>
          <td>${product.name}</td>
          <td>${product.category || '-'}</td>
          <td>${product.sku || '-'}</td>
          <td>${product.stock ?? 0}</td>
          <td>${Number(product.price || 0).toFixed(2)}</td>
          <td>${product.stock <= 0 ? 'Out of stock' : product.stock <= 10 ? 'Low stock' : 'In stock'}</td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  }

  window.roleDashboard = {
    normalizeRole,
    getDashboardPath,
    getCurrentUser,
    setCurrentUser,
    initRoleDashboard,
    logout,
    fetchJson,
    loadTransactions,
    loadInventory,
  };
})();
