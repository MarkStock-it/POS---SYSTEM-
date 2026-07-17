(function () {
  const scriptUrl = document.currentScript?.src || window.location.href;
  const projectRoot = new URL('../', scriptUrl);
  const phpApi = (path, params = '') => `${new URL(`PHP-TEST/${path}`, projectRoot).pathname}${params}`;
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

  function showDashboardToast(message, type = 'info', duration = 4200) {
    let stack = document.getElementById('dashboardToastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'dashboardToastStack';
      stack.className = 'dashboard-toast-stack';
      stack.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
      stack.setAttribute('aria-label', 'System notifications');
      document.body.appendChild(stack);
    }

    const toast = document.createElement('div');
    toast.className = `dashboard-toast dashboard-toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const icon = document.createElement('span');
    icon.className = 'dashboard-toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '!' : type === 'warning' ? '△' : 'i';
    const text = document.createElement('span');
    text.className = 'dashboard-toast-message';
    text.textContent = String(message || 'Done');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dashboard-toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    toast.append(icon, text, close);
    stack.appendChild(toast);

    let timer;
    const dismiss = () => {
      window.clearTimeout(timer);
      toast.classList.add('leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      window.setTimeout(() => toast.remove(), 350);
    };
    const startTimer = () => { timer = window.setTimeout(dismiss, duration); };
    close.addEventListener('click', dismiss);
    toast.addEventListener('mouseenter', () => window.clearTimeout(timer));
    toast.addEventListener('mouseleave', startTimer);
    requestAnimationFrame(() => toast.classList.add('visible'));
    startTimer();

    const visibleToasts = stack.querySelectorAll('.dashboard-toast');
    if (visibleToasts.length > 4) visibleToasts[0].remove();
    return toast;
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

  async function recordActivity(actionText, entityType = '', entityId = '') {
    const user = getCurrentUser();
    try {
      await fetchJson(phpApi('audit-log.php'), {
        method: 'POST',
        body: JSON.stringify({
          actorUserId: Number(user.id) || null,
          actorName: user.fullName || user.username || user.email || 'Unknown user',
          actorRole: normalizeRole(user.role),
          actionText,
          entityType,
          entityId: String(entityId || ''),
        }),
      });
    } catch (error) {
      console.error('Failed to record activity:', error);
    }
  }

  function relativeTime(value) {
    const timestamp = new Date(String(value || '').replace(' ', 'T')).getTime();
    if (!Number.isFinite(timestamp)) return 'Recently';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  async function loadActivityFeed(targetId = 'activityFeed') {
    const feed = document.getElementById(targetId);
    if (!feed) return;
    try {
      const activities = await fetchJson(phpApi('audit-log.php', '?limit=12'));
      feed.replaceChildren();
      if (!Array.isArray(activities) || !activities.length) {
        const empty = document.createElement('div');
        empty.className = 'activity-item';
        empty.textContent = 'No recorded activity yet.';
        feed.appendChild(empty);
        return;
      }
      activities.forEach((activity) => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        const dot = document.createElement('div');
        dot.className = 'activity-dot';
        const content = document.createElement('div');
        const textNode = document.createElement('div');
        textNode.className = 'activity-text';
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = activity.actorName || 'System';
        textNode.append(who, document.createTextNode(` ${activity.actionText || 'performed an action'}`));
        const time = document.createElement('div');
        time.className = 'activity-time';
        time.textContent = relativeTime(activity.createdAt);
        time.title = activity.createdAt || '';
        content.append(textNode, time);
        item.append(dot, content);
        feed.appendChild(item);
      });
    } catch (error) {
      feed.textContent = 'Unable to load system activity.';
      console.error('Failed to load activity:', error);
    }
  }

  async function loadDashboardSummary() {
    try {
      const summary = await fetchJson(phpApi('dashboard.php'));
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
      const transactions = await fetchJson(phpApi('transactions.php'));
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
      const products = await fetchJson(phpApi('products.php'));
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
            <td><div class="row-actions"><button class="icon-btn" type="button" aria-label="Adjust stock for ${product.name}" onclick="window.roleDashboard?.adjustStock?.('${product.id}', this)">✎</button></div></td>
          </tr>
        `;
      }).join('');
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  }

  async function loadUsers(targetTableId) {
    const tableBody = document.getElementById(targetTableId);
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading users...</td></tr>';

    try {
      const users = await fetchJson(phpApi('auth/users.php'));

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
              <button class="icon-btn" type="button" aria-label="Change role for ${user.fullName || user.username || user.id}" onclick="window.roleDashboard?.editUser?.('${user.id}', this)">✎</button>
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

  let rolePickerOutsideHandler = null;

  function closeRolePicker() {
    document.querySelector('.role-picker-popover')?.remove();
    document.removeEventListener('keydown', handleRolePickerEscape);
    if (rolePickerOutsideHandler) {
      document.removeEventListener('pointerdown', rolePickerOutsideHandler);
      rolePickerOutsideHandler = null;
    }
  }

  function handleRolePickerEscape(event) {
    if (event.key === 'Escape') closeRolePicker();
  }

  async function editUser(userId, anchorButton) {
    closeRolePicker();
    try {
      const user = await fetchJson(phpApi('auth/users.php', `?id=${encodeURIComponent(userId)}`));
      const roles = [
        { value: 'super-admin', label: 'Super Admin', icon: '★' },
        { value: 'admin', label: 'Admin', icon: '⚙' },
        { value: 'manager', label: 'Manager', icon: '◆' },
        { value: 'cashier', label: 'Cashier', icon: '●' },
      ];
      const popover = document.createElement('div');
      popover.className = 'role-picker-popover';
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-label', `Choose a role for ${user.fullName || user.username || userId}`);

      const heading = document.createElement('div');
      heading.className = 'role-picker-heading';
      const title = document.createElement('strong');
      title.textContent = 'Choose role';
      const person = document.createElement('span');
      person.textContent = user.fullName || user.username || `User #${userId}`;
      heading.append(title, person);

      const choices = document.createElement('div');
      choices.className = 'role-picker-choices';
      roles.forEach((role, index) => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = `role-choice-bubble${normalizeRole(user.role) === role.value ? ' selected' : ''}`;
        choice.style.setProperty('--bubble-index', index);
        choice.setAttribute('aria-pressed', normalizeRole(user.role) === role.value ? 'true' : 'false');
        const icon = document.createElement('span');
        icon.className = 'role-choice-icon';
        icon.textContent = role.icon;
        const label = document.createElement('span');
        label.textContent = role.label;
        choice.append(icon, label);
        choice.addEventListener('click', async () => {
          if (normalizeRole(user.role) === role.value) {
            closeRolePicker();
            return;
          }
          choices.querySelectorAll('button').forEach((button) => { button.disabled = true; });
          popover.classList.add('saving');
          try {
            await fetchJson(phpApi('auth/users.php', `?id=${encodeURIComponent(userId)}`), {
              method: 'PUT',
              body: JSON.stringify({ role: role.value }),
            });
            await Promise.all([
              loadUsers('staffTableBody'),
              loadUsers('accountsTableBody'),
              loadDashboardSummary(),
              recordActivity(`changed ${user.fullName || user.username || `user #${userId}`} role to ${role.label}`, 'user', userId),
            ]);
            closeRolePicker();
            showDashboardToast(`${user.fullName || user.username || 'User'} is now ${role.label}.`, 'success');
          } catch (error) {
            choices.querySelectorAll('button').forEach((button) => { button.disabled = false; });
            popover.classList.remove('saving');
            showDashboardToast(error.message || 'Unable to update user role.', 'error');
          }
        });
        choices.appendChild(choice);
      });
      popover.append(heading, choices);
      document.body.appendChild(popover);

      const anchor = anchorButton instanceof Element ? anchorButton : document.activeElement;
      const rect = anchor?.getBoundingClientRect?.() || { left: window.innerWidth / 2, right: window.innerWidth / 2, top: 80, bottom: 80 };
      const popoverRect = popover.getBoundingClientRect();
      const left = Math.min(window.innerWidth - popoverRect.width - 12, Math.max(12, rect.right - popoverRect.width));
      const roomBelow = window.innerHeight - rect.bottom;
      const top = roomBelow >= popoverRect.height + 12 ? rect.bottom + 8 : Math.max(12, rect.top - popoverRect.height - 8);
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
      requestAnimationFrame(() => popover.classList.add('open'));
      document.addEventListener('keydown', handleRolePickerEscape);
      setTimeout(() => {
        rolePickerOutsideHandler = (event) => {
          if (!popover.contains(event.target) && event.target !== anchor) closeRolePicker();
        };
        document.addEventListener('pointerdown', rolePickerOutsideHandler);
      }, 0);
    } catch (error) {
      showDashboardToast(error.message || 'Unable to load user roles.', 'error');
    }
  }

  async function toggleUserStatus(userId, currentStatus) {
    try {
      const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
      await fetchJson(phpApi('auth/users.php', `?id=${encodeURIComponent(userId)}`), {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadUsers('staffTableBody');
      await loadUsers('accountsTableBody');
      await recordActivity(`${nextStatus === 'active' ? 'reactivated' : 'suspended'} user #${userId}`, 'user', userId);
      showDashboardToast(`User status updated to ${nextStatus}.`, 'success');
    } catch (error) {
      showDashboardToast(error.message || 'Unable to update user status.', 'error');
    }
  }

  async function adjustStock(productId, anchorButton) {
    document.querySelector('.stock-adjust-popover')?.remove();
    try {
      const products = await fetchJson(phpApi('products.php'));
      const product = products.find((entry) => String(entry.id) === String(productId));
      if (!product) {
        showDashboardToast('Product not found.', 'error');
        return;
      }

      const popover = document.createElement('form');
      popover.className = 'stock-adjust-popover';
      popover.setAttribute('aria-label', `Adjust stock for ${product.name}`);
      const heading = document.createElement('div');
      heading.className = 'stock-adjust-heading';
      const title = document.createElement('strong');
      title.textContent = 'Adjust stock';
      const name = document.createElement('span');
      name.textContent = product.name;
      heading.append(title, name);
      const field = document.createElement('label');
      field.className = 'stock-adjust-field';
      const fieldLabel = document.createElement('span');
      fieldLabel.textContent = 'New quantity';
      const inputWrap = document.createElement('div');
      inputWrap.className = 'stock-adjust-input-wrap';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.required = true;
      input.value = String(Math.max(0, Number(product.stock) || 0));
      input.setAttribute('aria-label', 'New stock quantity');
      const unit = document.createElement('span');
      unit.textContent = 'pcs';
      inputWrap.append(input, unit);
      field.append(fieldLabel, inputWrap);
      const actions = document.createElement('div');
      actions.className = 'stock-adjust-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'stock-adjust-cancel';
      cancel.textContent = 'Cancel';
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'stock-adjust-save';
      save.textContent = 'Save stock';
      actions.append(cancel, save);
      popover.append(heading, field, actions);
      document.body.appendChild(popover);

      const close = () => {
        document.removeEventListener('pointerdown', outsideHandler);
        document.removeEventListener('keydown', escapeHandler);
        popover.classList.add('closing');
        window.setTimeout(() => popover.remove(), 180);
      };
      const outsideHandler = (event) => {
        if (!popover.contains(event.target) && event.target !== anchorButton) close();
      };
      const escapeHandler = (event) => { if (event.key === 'Escape') close(); };
      cancel.addEventListener('click', close);
      popover.addEventListener('submit', async (event) => {
        event.preventDefault();
        const parsed = Number(input.value);
        if (!Number.isInteger(parsed) || parsed < 0) {
          input.focus();
          showDashboardToast('Stock must be a whole number of zero or more.', 'warning');
          return;
        }
        input.disabled = true;
        cancel.disabled = true;
        save.disabled = true;
        save.textContent = 'Saving…';
        try {
          await fetchJson(phpApi('products.php', `?id=${encodeURIComponent(productId)}`), {
            method: 'PUT',
            body: JSON.stringify({ ...product, stock: parsed }),
          });
          await loadInventory('inventoryTableBody');
          await recordActivity(`set ${product.name} stock to ${parsed}`, 'product', productId);
          close();
          showDashboardToast(`${product.name} stock updated to ${parsed}.`, 'success');
        } catch (error) {
          input.disabled = false;
          cancel.disabled = false;
          save.disabled = false;
          save.textContent = 'Save stock';
          showDashboardToast(error.message || 'Unable to update stock.', 'error');
        }
      });

      const anchor = anchorButton instanceof Element ? anchorButton : document.activeElement;
      const rect = anchor?.getBoundingClientRect?.() || { left: window.innerWidth / 2, right: window.innerWidth / 2, top: 80, bottom: 80 };
      const popoverRect = popover.getBoundingClientRect();
      popover.style.left = `${Math.min(window.innerWidth - popoverRect.width - 12, Math.max(12, rect.right - popoverRect.width))}px`;
      popover.style.top = `${window.innerHeight - rect.bottom >= popoverRect.height + 12 ? rect.bottom + 8 : Math.max(12, rect.top - popoverRect.height - 8)}px`;
      requestAnimationFrame(() => popover.classList.add('open'));
      window.setTimeout(() => {
        document.addEventListener('pointerdown', outsideHandler);
        document.addEventListener('keydown', escapeHandler);
        input.select();
      }, 0);
    } catch (error) {
      showDashboardToast(error.message || 'Unable to update stock.', 'error');
    }
  }

  function createAccount() {
    window.location.href = '../register-page/register.html';
  }

  function viewTransaction(transactionId) {
    showDashboardToast(`Loading transaction #${transactionId} from the live backend.`, 'info');
  }

  function generateReport() {
    recordActivity('generated a system report', 'report');
    showDashboardToast('Report generated from the latest POS data.', 'success');
  }

  function openNotifications() {
    showDashboardToast('You have no new notifications.', 'info');
  }

  function openProfileMenu() {
    showDashboardToast('Profile options are not available yet.', 'info');
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
    showDashboardToast,
    recordActivity,
    loadActivityFeed,
  };
})();
