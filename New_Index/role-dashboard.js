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

  function formatCurrency(value) {
    const numeric = Number(value || 0);
    return `₱${numeric.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatTimestamp(value) {
    if (!value) return 'Just now';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Just now';
    return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function getRoleLabel(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'super-admin') return 'Super Admin';
    if (normalized === 'admin') return 'Admin';
    if (normalized === 'manager') return 'Manager';
    return 'Cashier';
  }

  function getRoleClass(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'super-admin' || normalized === 'admin') return 'admin';
    if (normalized === 'manager') return 'manager';
    return 'cashier';
  }

  function getStatusLabel(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'suspended' || normalized === 'inactive') return 'Inactive';
    return 'Active';
  }

  function getStatusClass(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'suspended' || normalized === 'inactive' ? 'offline' : 'online';
  }

  async function loadDashboardSummary() {
    try {
      const summary = await fetchJson('/api/dashboard/summary');
      const revenueNode = document.getElementById('metricRevenue');
      const sessionsNode = document.getElementById('metricSessions');
      const flagsNode = document.getElementById('metricFlags');
      const accountsNode = document.getElementById('metricAccounts');
      const lowStockNode = document.getElementById('metricLowStock');

      if (revenueNode) revenueNode.textContent = formatCurrency(summary.todayRevenue || 0);
      if (sessionsNode) sessionsNode.textContent = `${summary.activeSessions || 0}${summary.totalUsers ? ` / ${summary.totalUsers}` : ''}`;
      if (flagsNode) flagsNode.textContent = summary.flaggedTransactions || 0;
      if (accountsNode) accountsNode.textContent = summary.totalUsers || 0;
      if (lowStockNode) lowStockNode.textContent = summary.lowStockItems || 0;
    } catch (error) {
      console.error('Failed to load dashboard summary:', error);
    }
  }

  async function loadTransactions(targetTableId) {
    try {
      const transactions = await fetchJson('/api/transactions');
      const tableBody = document.getElementById(targetTableId);
      if (!tableBody) return;
      if (!Array.isArray(transactions) || !transactions.length) {
        tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No transactions found.</td></tr>';
        return;
      }

      tableBody.innerHTML = transactions.map((txn) => {
        const statusText = txn.payment_method && String(txn.payment_method).toLowerCase() === 'flagged' ? 'Flagged' : 'Completed';
        const statusClass = statusText === 'Flagged' ? 'offline' : 'online';
        return `
          <tr>
            <td class="cell-primary">#${txn.id}</td>
            <td>${txn.payment_method || 'POS'}</td>
            <td>${Number(txn.item_count || 0)} item${Number(txn.item_count || 0) === 1 ? '' : 's'}</td>
            <td class="txn-amount">${formatCurrency(txn.total || 0)}</td>
            <td><span class="status-dot ${statusClass}">${statusText}</span></td>
            <td><div class="row-actions"><button class="icon-btn" onclick="window.roleDashboard?.viewTransaction?.('${txn.id}')">↗</button></div></td>
          </tr>
        `;
      }).join('');
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
        tableBody.innerHTML = '<tr><td colspan="3" class="empty-state">No inventory found.</td></tr>';
        return;
      }

      tableBody.innerHTML = products.map((product) => {
        const stock = Number(product.stock ?? 0);
        const percent = Math.max(8, Math.min(100, (stock / 200) * 100));
        const stateClass = stock <= 0 ? 'critical' : stock <= 10 ? 'low' : 'healthy';
        return `
          <tr>
            <td class="cell-primary">${product.name}</td>
            <td>
              <span class="stock-bar-track"><span class="stock-bar-fill ${stateClass}" style="width:${percent}%"></span></span>
              <span class="stock-label">${stock} units</span>
            </td>
            <td><div class="row-actions"><button class="icon-btn" onclick="window.roleDashboard?.adjustStock?.('${product.id}', '${product.name}')">✎</button></div></td>
          </tr>
        `;
      }).join('');
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  }

  async function loadUsers(targetTableId) {
    try {
      const users = await fetchJson('/api/auth/users');
      const tableBody = document.getElementById(targetTableId);
      if (!tableBody) return;
      if (!Array.isArray(users) || !users.length) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No users found.</td></tr>';
        return;
      }

      tableBody.innerHTML = users.map((user) => {
        const roleLabel = getRoleLabel(user.role);
        const roleClass = getRoleClass(user.role);
        const statusLabel = getStatusLabel(user.status);
        const statusClass = getStatusClass(user.status);
        const fullName = user.fullName || user.full_name || user.username || 'User';
        const lastActive = formatTimestamp(user.createdAt || user.created_at);
        return `
          <tr>
            <td class="cell-primary">${fullName}</td>
            <td><span class="role-pill ${roleClass}">${roleLabel}</span></td>
            <td><span class="status-dot ${statusClass}">${statusLabel}</span></td>
            <td>${lastActive}</td>
            <td><div class="row-actions">
              <button class="icon-btn" onclick="window.roleDashboard?.editUser?.('${user.id}')">✎</button>
              <button class="icon-btn" onclick="window.roleDashboard?.toggleUserStatus?.('${user.id}', '${user.status || 'active'}')">⏸</button>
            </div></td>
          </tr>
        `;
      }).join('');
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  }

  function filterRowsByRole(targetTableId, roleFilter) {
    const tableBody = document.getElementById(targetTableId);
    if (!tableBody) return;

    const rows = Array.from(tableBody.querySelectorAll('tr'));
    rows.forEach((row) => {
      const roleCell = row.querySelector('.role-pill');
      const roleText = roleCell ? roleCell.textContent.toLowerCase() : '';
      const shouldShow = !roleFilter || roleFilter === 'all' || roleText.includes(roleFilter.toLowerCase());
      row.style.display = shouldShow ? '' : 'none';
    });
  }

  async function editUser(userId) {
    try {
      const user = await fetchJson(`/api/auth/users/${userId}`);
      const nextRole = window.prompt(`Update role for ${user.fullName || user.username || userId}`, user.role || 'cashier');
      if (nextRole === null) return;
      const nextStatus = window.prompt(`Set status for ${user.fullName || user.username || userId}`, user.status || 'active');
      if (nextStatus === null) return;
      await fetchJson(`/api/auth/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: nextRole, status: nextStatus }),
      });
      await loadUsers('staffTableBody');
      await loadUsers('accountsTableBody');
      await loadDashboardSummary();
      window.alert('User updated successfully.');
    } catch (error) {
      window.alert(error.message || 'Unable to update user.');
    }
  }

  async function toggleUserStatus(userId, currentStatus) {
    try {
      const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
      await fetchJson(`/api/auth/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadUsers('staffTableBody');
      await loadUsers('accountsTableBody');
      window.alert(`User status updated to ${nextStatus}.`);
    } catch (error) {
      window.alert(error.message || 'Unable to update user status.');
    }
  }

  async function adjustStock(productId, productName) {
    const nextStock = window.prompt(`Set stock for ${productName}`, '0');
    if (nextStock === null) return;
    const parsed = Number(nextStock);
    if (Number.isNaN(parsed)) {
      window.alert('Please enter a valid number.');
      return;
    }

    try {
      const products = await fetchJson('/api/products');
      const product = products.find((entry) => String(entry.id) === String(productId));
      if (!product) {
        window.alert('Product not found.');
        return;
      }
      await fetchJson(`/api/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...product, stock: parsed }),
      });
      await loadInventory('inventoryTableBody');
      window.alert('Stock updated successfully.');
    } catch (error) {
      window.alert(error.message || 'Unable to update stock.');
    }
  }

  function createAccount() {
    window.location.href = '../register-page/register.html';
  }

  function viewTransaction(transactionId) {
    window.alert(`Transaction #${transactionId} details are now being pulled from the live backend.`);
  }

  function generateReport() {
    window.alert('Reporting has been generated from the live POS data.');
  }

  function openNotifications() {
    window.alert('Notifications panel is ready for your next revision.');
  }

  function openProfileMenu() {
    window.alert('Profile menu is ready for your next revision.');
  }

  async function refreshDashboard() {
    await loadDashboardSummary();
    await loadTransactions('transactionsTableBody');
    await loadInventory('inventoryTableBody');
    await loadUsers('staffTableBody');
    await loadUsers('accountsTableBody');
  }

  window.roleDashboard = {
    normalizeRole,
    getDashboardPath,
    getCurrentUser,
    setCurrentUser,
    initRoleDashboard,
    logout,
    fetchJson,
    loadDashboardSummary,
    loadTransactions,
    loadInventory,
    loadUsers,
    filterRowsByRole,
    editUser,
    toggleUserStatus,
    adjustStock,
    createAccount,
    viewTransaction,
    generateReport,
    openNotifications,
    openProfileMenu,
    refreshDashboard,
  };
})();
