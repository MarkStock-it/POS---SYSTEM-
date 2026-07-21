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
      'super_admin': 'super-admin',
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

  async function logout() {
    try {
      await fetchJson('../PHP-TEST/auth/logout.php', { method: 'POST', body: '{}' });
    } catch (error) {
      showDashboardToast(error.message || 'Unable to end the current session.', 'error');
      return;
    }
    localStorage.removeItem('posCurrentUser');
    window.location.href = '../login-page/login.html';
  }

  async function fetchJson(url, options = {}) {
    const currentUser = getCurrentUser();
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-pos-pin': '1234',
        'x-pos-user-id': String(currentUser.id || ''),
        ...(options.headers || {}),
      },
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

  const LOCAL_AUDIT_KEY = 'markstockLocalAuditLog';
  function getLocalAuditRecords() {
    try {
      const records = JSON.parse(localStorage.getItem(LOCAL_AUDIT_KEY) || '[]');
      return Array.isArray(records) ? records : [];
    } catch (error) { return []; }
  }
  function saveLocalAuditRecord(record) {
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify([record, ...getLocalAuditRecords()].slice(0, 100)));
  }

  async function recordActivity(actionText, entityType = '', entityId = '') {
    const user = getCurrentUser();
    const localRecord = {
      id: `local-${Date.now()}`,
      actorName: user.fullName || user.username || user.email || 'Unknown user',
      actorRole: normalizeRole(user.role), actionText, entityType, entityId: String(entityId || ''),
      createdAt: new Date().toISOString(), local: true,
    };
    if (user.isLocalAccount) {
      saveLocalAuditRecord(localRecord);
      return;
    }
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
      saveLocalAuditRecord(localRecord);
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

  const DEFAULT_PAGE_SIZE = 5;

  function paginateRecords(records, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    const items = Array.isArray(records) ? records : [];
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
    const start = (currentPage - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), page: currentPage, pageSize, total: items.length, totalPages };
  }

  function populatePagination(pagination, pageData, onPageChange) {
    pagination.replaceChildren();
    if (!pageData) return;
    const addButton = (label, destination, disabled, active = false) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `app-page-button${active ? ' active' : ''}`;
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener('click', () => onPageChange(destination));
      pagination.appendChild(button);
    };
    const addEllipsis = () => {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'app-page-ellipsis'; ellipsis.textContent = '…'; ellipsis.setAttribute('aria-hidden', 'true');
      pagination.appendChild(ellipsis);
    };
    addButton('Prev', pageData.page - 1, pageData.page <= 1);
    if (pageData.totalPages <= 4) {
      for (let index = 1; index <= pageData.totalPages; index += 1) addButton(String(index), index, false, index === pageData.page);
    } else {
      const visiblePages = [...new Set([1, pageData.page - 1, pageData.page, pageData.page + 1, pageData.page + 2])]
        .filter((index) => index >= 1 && index < pageData.totalPages).sort((a, b) => a - b);
      let previous = 0;
      visiblePages.forEach((index) => { if (index - previous > 1) addEllipsis(); addButton(String(index), index, false, index === pageData.page); previous = index; });
      if (pageData.totalPages - previous > 1) addEllipsis();
      const jumpInput = document.createElement('input');
      jumpInput.className = `app-page-jump${pageData.page === pageData.totalPages ? ' active' : ''}`;
      jumpInput.type = 'number'; jumpInput.min = '1'; jumpInput.max = String(pageData.totalPages); jumpInput.value = String(pageData.totalPages);
      jumpInput.setAttribute('aria-label', `Go to page, maximum ${pageData.totalPages}`); jumpInput.title = `Enter a page from 1 to ${pageData.totalPages}`;
      const submitJump = () => {
        const destination = Number(jumpInput.value);
        if (!Number.isInteger(destination) || destination < 1 || destination > pageData.totalPages) {
          showDashboardToast(`Enter a page number from 1 to ${pageData.totalPages}.`, 'warning'); jumpInput.value = String(pageData.totalPages); jumpInput.focus(); jumpInput.select(); return;
        }
        onPageChange(destination);
      };
      jumpInput.addEventListener('focus', () => jumpInput.select());
      jumpInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submitJump(); } });
      jumpInput.addEventListener('change', submitJump);
      pagination.appendChild(jumpInput);
    }
    addButton('Next', pageData.page + 1, pageData.page >= pageData.totalPages);
  }

  function renderPagination(targetId, pageData, onPageChange) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const anchor = target.closest('table') || target;
    let pagination = document.getElementById(`${targetId}Pagination`);
    if (!pagination) {
      pagination = document.createElement('nav'); pagination.id = `${targetId}Pagination`; pagination.className = 'app-pagination';
      pagination.setAttribute('aria-label', `${targetId} pagination`); anchor.insertAdjacentElement('afterend', pagination);
    }
    populatePagination(pagination, pageData, onPageChange);
  }

  async function loadActivityFeed(targetId = 'activityFeed', page = 1) {
    const feed = document.getElementById(targetId);
    if (!feed) return;
    try {
      const activities = getCurrentUser().isLocalAccount
        ? getLocalAuditRecords()
        : await fetchJson(phpApi('audit-log.php', '?limit=5000'));
      const pageData = paginateRecords(activities, page);
      feed.replaceChildren();
      if (!Array.isArray(activities) || !activities.length) {
        const empty = document.createElement('div');
        empty.className = 'activity-item';
        empty.textContent = 'No recorded activity yet.';
        feed.appendChild(empty);
        return;
      }
      pageData.items.forEach((activity) => {
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
      renderPagination(targetId, pageData, (nextPage) => loadActivityFeed(targetId, nextPage));
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

  async function loadTransactions(targetTableId, page = 1) {
    try {
      const transactions = await fetchJson(phpApi('transactions.php'));
      const tableBody = document.getElementById(targetTableId);
      if (!tableBody) return;
      if (!Array.isArray(transactions) || !transactions.length) {
        tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No transactions found.</td></tr>';
        return;
      }

      const pageData = paginateRecords(transactions, page);
      tableBody.innerHTML = pageData.items.map((txn) => {
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
      renderPagination(targetTableId, pageData, (nextPage) => loadTransactions(targetTableId, nextPage));
    } catch (error) {
      console.error('Failed to load transactions:', error);
      const tableBody = document.getElementById(targetTableId);
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Transactions are unavailable while the database is offline.</td></tr>';
    }
  }

  async function loadInventory(targetTableId, page = 1) {
    try {
      const products = await fetchJson(phpApi('products.php'));
      const tableBody = document.getElementById(targetTableId);
      if (!tableBody) return;
      if (!Array.isArray(products) || !products.length) {
        tableBody.innerHTML = '<tr><td colspan="3" class="empty-state">No inventory found.</td></tr>';
        return;
      }

      const pageData = paginateRecords(products, page);
      tableBody.innerHTML = pageData.items.map((product) => {
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
      renderPagination(targetTableId, pageData, (nextPage) => loadInventory(targetTableId, nextPage));
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  }

  const userRoleFilters = {};

  async function loadUsers(targetTableId, page = 1) {
    const tableBody = document.getElementById(targetTableId);
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading users...</td></tr>';

    try {
      const users = await fetchJson(phpApi('auth/users.php'));

      if (!Array.isArray(users) || !users.length) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No users found.</td></tr>';
        return;
      }

      const currentRole = normalizeRole(getCurrentUser().role);
      let visibleUsers = currentRole === 'admin'
        ? users.filter((user) => ['manager', 'cashier'].includes(normalizeRole(user.role)))
        : users;
      const roleFilter = userRoleFilters[targetTableId] || 'all';
      if (roleFilter !== 'all') visibleUsers = visibleUsers.filter((user) => normalizeRole(user.role) === normalizeRole(roleFilter));

      if (!visibleUsers.length) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No manageable users found.</td></tr>';
        renderPagination(targetTableId, paginateRecords([], 1), () => {});
        return;
      }

      const pageData = paginateRecords(visibleUsers, page);
      tableBody.innerHTML = pageData.items.map((user) => {
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
      renderPagination(targetTableId, pageData, (nextPage) => loadUsers(targetTableId, nextPage));
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  }

  function filterRowsByRole(targetTableId, roleFilter) {
    userRoleFilters[targetTableId] = roleFilter || 'all';
    loadUsers(targetTableId, 1);
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
      const currentRole = normalizeRole(getCurrentUser().role);
      const allRoles = [
        { value: 'super-admin', label: 'Super Admin', icon: '★' },
        { value: 'admin', label: 'Admin', icon: '⚙' },
        { value: 'manager', label: 'Manager', icon: '◆' },
        { value: 'cashier', label: 'Cashier', icon: '●' },
      ];
      if (currentRole !== 'super-admin' && normalizeRole(user.role) === 'super-admin') {
        throw new Error('Only a super admin can modify a super admin account.');
      }
      const roles = currentRole === 'super-admin'
        ? allRoles
        : allRoles.filter((role) => role.value === 'manager' || role.value === 'cashier');
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

  function formatShiftDuration(totalSeconds) {
    const seconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  async function loadReports(containerId = 'reportsList', paginationId = 'reportsPagination', page = 1) {
    const container = document.getElementById(containerId);
    const pagination = document.getElementById(paginationId);
    if (!container) return;
    container.innerHTML = '<div class="empty-state">Loading reports…</div>';
    try {
      const result = await fetchJson(`../PHP-TEST/reports.php?page=${encodeURIComponent(page)}&pageSize=5`);
      const reports = Array.isArray(result.reports) ? result.reports : [];
      if (!reports.length) {
        container.innerHTML = '<div class="empty-state">No end-of-day reports are available yet.</div>';
      } else {
        container.replaceChildren(...reports.map((report) => {
          const item = document.createElement('article');
          item.className = 'report-item';
          const amount = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(report.grossSales) || 0);
          item.innerHTML = `<div><div class="report-name"></div><div class="report-meta"></div></div>`;
          item.querySelector('.report-name').textContent = `EOD Summary · ${report.reportDate}`;
          item.querySelector('.report-meta').textContent = `${report.transactionCount} sales · ${amount} · ${report.shiftCount} shifts (${formatShiftDuration(report.totalShiftSeconds)})`;
          return item;
        }));
      }

      if (!pagination) return;
      const totalPages = Math.max(1, Number(result.totalPages) || 1);
      populatePagination(pagination, { page, pageSize: 5, total: Number(result.total) || 0, totalPages }, (targetPage) => loadReports(containerId, paginationId, targetPage));
    } catch (error) {
      container.innerHTML = '<div class="empty-state">Unable to load reports.</div>';
      if (pagination) pagination.replaceChildren();
      showDashboardToast(error.message || 'Unable to load reports.', 'error');
    }
  }

  async function loadShifts(targetTableId = 'shiftsTableBody', page = 1) {
    const body = document.getElementById(targetTableId);
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6" class="empty-state">Loading shifts…</td></tr>';
    try {
      const result = await fetchJson(`../PHP-TEST/shifts.php?page=${encodeURIComponent(page)}&pageSize=${DEFAULT_PAGE_SIZE}`);
      const records = Array.isArray(result.records) ? result.records : [];
      if (!records.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-state">No cashier shifts found.</td></tr>';
      } else {
        body.innerHTML = records.map((shift) => `<tr><td class="cell-primary">#${shift.id}</td><td>${shift.cashierName || `User #${shift.userId}`}</td><td>${formatTimestamp(shift.loginTimestamp)}</td><td>${shift.logoutTimestamp ? formatTimestamp(shift.logoutTimestamp) : 'Active'}</td><td>${shift.shiftDurationSeconds == null ? 'In progress' : formatShiftDuration(shift.shiftDurationSeconds)}</td><td class="txn-amount">${formatCurrency(shift.totalSales || 0)}</td></tr>`).join('');
      }
      renderPagination(targetTableId, { page: Number(result.page) || page, pageSize: DEFAULT_PAGE_SIZE, total: Number(result.total) || 0, totalPages: Number(result.totalPages) || 1 }, (nextPage) => loadShifts(targetTableId, nextPage));
    } catch (error) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">Unable to load cashier shifts.</td></tr>';
      showDashboardToast(error.message || 'Unable to load cashier shifts.', 'error');
    }
  }

  function openNotifications() {
    showDashboardToast('You have no new notifications.', 'info');
  }

  const PROFILE_STYLE_ID = 'accountProfileModalStyles';
  let profileModalReturnFocus = null;

  function injectProfileModalStyles() {
    if (document.getElementById(PROFILE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PROFILE_STYLE_ID;
    style.textContent = `
      body.profile-modal-open { overflow: hidden; }
      .profile-modal-backdrop { --profile-overlay: rgba(15,23,42,.38); --profile-surface: #fff; --profile-body: #f8fafc; --profile-card: #fff; --profile-header-start: #eff6ff; --profile-header-end: #fff; --profile-control: #fff; --profile-control-hover: #eff6ff; --profile-editor: #f8fafc; position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 24px; background: var(--profile-overlay); backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px); opacity: 0; transition: opacity .18s ease; }
      html[data-theme="dark"] .profile-modal-backdrop { --profile-overlay: rgba(2,6,23,.74); --profile-surface: #0f1a2b; --profile-body: #0b1424; --profile-card: #111d30; --profile-header-start: #132747; --profile-header-end: #0f1a2b; --profile-control: #0b1424; --profile-control-hover: rgba(37,99,235,.2); --profile-editor: #0b1424; }
      .profile-modal-backdrop.open { opacity: 1; }
      .profile-modal { width: min(860px, 100%); max-height: min(90vh, 820px); overflow: hidden; display: flex; flex-direction: column; color: var(--text-primary, #0f172a); background: var(--profile-surface); border: 1px solid var(--border-hairline, rgba(15,23,42,.1)); border-radius: 22px; box-shadow: var(--shadow-layered, 0 32px 100px rgba(15,23,42,.2)); transform: translateY(12px) scale(.985); transition: transform .18s ease; }
      .profile-modal-backdrop.open .profile-modal { transform: none; }
      .profile-modal-header { position: relative; display: flex; align-items: center; gap: 18px; padding: 27px 30px; border-bottom: 1px solid var(--border-hairline, rgba(15,23,42,.08)); background: radial-gradient(circle at 14% 0, rgba(37,99,235,.14), transparent 34%), linear-gradient(135deg, var(--profile-header-start), var(--profile-header-end) 68%); }
      .profile-modal-header::after { content: ''; position: absolute; left: 30px; right: 30px; bottom: -1px; height: 1px; background: linear-gradient(90deg, #3f83ff, transparent 60%); }
      .profile-modal-avatar { width: 74px; height: 74px; flex: 0 0 74px; display: grid; place-items: center; border-radius: 20px; border: 1px solid rgba(103,157,255,.55); background: linear-gradient(145deg, #2d6fe7, #17376d); color: #fff; box-shadow: 0 12px 28px rgba(24,78,177,.3); font: 750 22px var(--font-display, inherit); }
      .profile-modal-identity { min-width: 0; }
      .profile-modal-name { margin: 0 0 5px; font: 750 23px var(--font-display, inherit); letter-spacing: -.02em; }
      .profile-modal-username { color: var(--text-tertiary, #91a0b7); font-size: 12px; }
      .profile-modal-meta { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
      .profile-chip { padding: 4px 8px; border: 1px solid var(--border-hairline, rgba(15,23,42,.1)); border-radius: 999px; color: var(--text-secondary, #475569); background: var(--profile-control); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
      .profile-chip.role { color: var(--primary, #2563eb); border-color: rgba(37,99,235,.28); background: rgba(37,99,235,.09); }
      .profile-modal-close { position: absolute; top: 18px; right: 18px; width: 36px; height: 36px; border: 1px solid var(--border-hairline, rgba(15,23,42,.1)); border-radius: 50%; color: var(--text-secondary, #475569); background: var(--profile-control); font-size: 21px; cursor: pointer; }
      .profile-modal-close:hover { color: var(--text-primary, #0f172a); border-color: rgba(37,99,235,.3); background: var(--profile-control-hover); }
      .profile-modal-body { overflow: auto; padding: 22px 26px 27px; background: var(--profile-body); }
      .profile-modal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .profile-card { padding: 18px; border: 1px solid var(--border-hairline, rgba(15,23,42,.08)); border-radius: 14px; background: var(--profile-card); box-shadow: var(--shadow-soft, 0 9px 22px rgba(15,23,42,.06)); }
      .profile-card.wide { grid-column: 1 / -1; }
      .profile-card-title { display: flex; align-items: center; gap: 8px; margin: 0 0 15px; color: var(--text-primary, #0f172a); font: 700 11px var(--font-display, inherit); letter-spacing: .1em; text-transform: uppercase; }
      .profile-card-title::before { content: ''; width: 7px; height: 7px; border-radius: 2px; background: #4d8dff; box-shadow: 0 0 12px rgba(77,141,255,.7); }
      .profile-info-list { display: grid; gap: 11px; }
      .profile-info-row { display: grid; grid-template-columns: 120px minmax(0,1fr); align-items: center; gap: 12px; min-height: 29px; }
      .profile-info-label { color: var(--text-tertiary, #91a0b7); font-size: 11px; }
      .profile-info-value { min-width: 0; color: var(--text-secondary, #d5dbe6); font-size: 12px; overflow-wrap: anywhere; }
      .profile-inline-edit { display: flex; align-items: center; gap: 7px; }
      .profile-inline-edit input { min-width: 0; width: 100%; padding: 8px 9px; border: 1px solid var(--border-hairline, rgba(15,23,42,.12)); border-radius: 6px; outline: none; color: var(--text-primary, #0f172a); background: var(--profile-control); font: inherit; }
      .profile-inline-edit input:focus { border-color: var(--accent, #4f8cff); box-shadow: 0 0 0 3px rgba(79,140,255,.12); }
      .profile-btn { border: 1px solid var(--border-hairline, rgba(15,23,42,.12)); border-radius: 6px; padding: 8px 11px; color: var(--text-secondary, #475569); background: var(--profile-control); font: 600 11px inherit; cursor: pointer; white-space: nowrap; }
      .profile-btn:hover { color: var(--primary, #2563eb); border-color: rgba(37,99,235,.4); background: var(--profile-control-hover); }
      .profile-security-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
      .profile-security-editor { display: none; margin: 2px 0 16px; padding: 14px; border: 1px solid rgba(37,99,235,.2); border-radius: 10px; background: var(--profile-editor); }
      .profile-security-editor.open { display: block; }
      .profile-security-form { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
      .profile-security-form label { display: grid; gap: 6px; color: var(--text-tertiary, #91a0b7); font-size: 10px; }
      .profile-security-form input { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid var(--border-hairline, rgba(15,23,42,.11)); border-radius: 7px; outline: none; color: var(--text-primary, #0f172a); background: var(--profile-control); }
      .profile-security-form input:focus { border-color: #4d8dff; }
      .profile-security-form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
      .profile-device { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border-hairline, rgba(255,255,255,.08)); }
      .profile-device-name { color: var(--text-secondary, #d5dbe6); font-size: 12px; font-weight: 600; }
      .profile-device-meta, .profile-empty { margin-top: 3px; color: var(--text-tertiary, #91a0b7); font-size: 10px; }
      .profile-unlink { color: #ff9b9b; }
      .profile-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
      .profile-stat { padding: 12px; border-radius: 8px; background: rgba(79,140,255,.07); border: 1px solid rgba(79,140,255,.12); }
      .profile-stat-value { color: var(--text-primary, #0f172a); font: 700 18px var(--font-display, inherit); }
      .profile-stat-label { margin-top: 4px; color: var(--text-tertiary, #91a0b7); font-size: 10px; }
      .profile-permissions { display: flex; flex-wrap: wrap; gap: 7px; }
      .profile-permission { padding: 6px 9px; border-radius: 6px; color: var(--primary, #2563eb); background: rgba(37,99,235,.09); border: 1px solid rgba(37,99,235,.18); font-size: 10px; }
      @media (max-width: 680px) { .profile-modal-backdrop { padding: 8px; } .profile-modal { max-height: 96vh; border-radius: 17px; } .profile-modal-grid { grid-template-columns: 1fr; } .profile-card.wide { grid-column: auto; } .profile-modal-header, .profile-modal-body { padding-left: 17px; padding-right: 17px; } .profile-modal-avatar { width: 62px; height: 62px; flex-basis: 62px; border-radius: 17px; } .profile-info-row { grid-template-columns: 96px minmax(0,1fr); } .profile-stat-grid, .profile-security-form { grid-template-columns: 1fr; } }
      @media (prefers-reduced-motion: reduce) { .profile-modal-backdrop, .profile-modal { transition: none; } }
    `;
    document.head.appendChild(style);
  }

  function profileInitials(user) {
    const source = user.fullName || user.username || user.email || 'User';
    return source.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  }

  function closeProfileModal() {
    const backdrop = document.querySelector('.profile-modal-backdrop');
    if (!backdrop) return;
    backdrop.classList.remove('open');
    document.body.classList.remove('profile-modal-open');
    window.setTimeout(() => backdrop.remove(), 180);
    profileModalReturnFocus?.focus?.();
  }

  function makeProfileInfoRow(label, value) {
    const row = document.createElement('div');
    row.className = 'profile-info-row';
    const key = document.createElement('span');
    key.className = 'profile-info-label';
    key.textContent = label;
    const content = document.createElement('span');
    content.className = 'profile-info-value';
    content.textContent = value || 'Not provided';
    row.append(key, content);
    return row;
  }

  async function loadProfileStats(container, user) {
    const role = normalizeRole(user.role);
    let values = role === 'cashier'
      ? [['—', 'Transactions processed'], ['—', 'Items sold'], ['—', 'Sales handled']]
      : [['—', 'Approvals made'], ['—', 'Reports generated'], ['—', 'Actions recorded']];
    try {
      if (role === 'cashier') {
        const transactions = await fetchJson(phpApi('transactions.php'));
        const own = Array.isArray(transactions) ? transactions.filter((item) => !item.cashier_id || String(item.cashier_id) === String(user.id)) : [];
        values = [[own.length, 'Transactions processed'], [own.reduce((sum, item) => sum + Number(item.item_count || 0), 0), 'Items sold'], [formatCurrency(own.reduce((sum, item) => sum + Number(item.total || 0), 0)), 'Sales handled']];
      } else {
        const activities = await fetchJson(phpApi('audit-log.php', '?limit=100'));
        const own = Array.isArray(activities) ? activities.filter((item) => String(item.actorUserId || item.actor_user_id || '') === String(user.id || '')) : [];
        values = [[own.filter((item) => /approv/i.test(item.actionText || '')).length, 'Approvals made'], [own.filter((item) => /report/i.test(item.actionText || '')).length, 'Reports generated'], [own.length, 'Actions recorded']];
      }
    } catch (error) {
      console.error('Unable to load profile activity summary:', error);
    }
    container.replaceChildren(...values.map(([value, label]) => {
      const stat = document.createElement('div');
      stat.className = 'profile-stat';
      const number = document.createElement('div');
      number.className = 'profile-stat-value';
      number.textContent = String(value);
      const text = document.createElement('div');
      text.className = 'profile-stat-label';
      text.textContent = label;
      stat.append(number, text);
      return stat;
    }));
  }

  async function openProfileMenu() {
    closeProfileModal();
    injectProfileModalStyles();
    let user = getCurrentUser();
    if (user.isLocalAccount) {
      user = {
        ...user,
        branchLocation: user.branchLocation || 'Offline workstation',
        employmentStatus: user.employmentStatus || 'Local access',
        lastLogin: user.loggedAt,
        devices: [],
        permissions: [
          { key: 'local_dashboard', label: 'Access local dashboard' },
          { key: 'local_inventory', label: 'View cached inventory' },
        ],
      };
    } else {
      try {
        user = { ...user, ...(await fetchJson(phpApi('auth/profile.php'))) };
      } catch (error) {
        showDashboardToast(error.message || 'Unable to load the account profile.', 'error');
        return;
      }
    }
    const role = normalizeRole(user.role);
    const roleLabel = getRoleLabel(role);
    const devices = Array.isArray(user.devices) ? user.devices : [];
    const profile = user;
    profileModalReturnFocus = document.activeElement;

    const backdrop = document.createElement('div');
    backdrop.className = 'profile-modal-backdrop';
    const modal = document.createElement('section');
    modal.className = 'profile-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'profileModalTitle');
    modal.innerHTML = `
      <header class="profile-modal-header">
        <div class="profile-modal-avatar" aria-hidden="true"></div>
        <div class="profile-modal-identity">
          <h2 class="profile-modal-name" id="profileModalTitle"></h2>
          <div class="profile-modal-username"></div>
          <div class="profile-modal-meta"><span class="profile-chip role"></span><span class="profile-chip profile-branch"></span></div>
        </div>
        <button class="profile-modal-close" type="button" aria-label="Close account profile">×</button>
      </header>
      <div class="profile-modal-body"><div class="profile-modal-grid"></div></div>`;
    modal.querySelector('.profile-modal-avatar').textContent = profileInitials(profile);
    modal.querySelector('.profile-modal-name').textContent = profile.fullName || profile.username || 'MarkStock-it User';
    modal.querySelector('.profile-modal-username').textContent = `@${profile.username || String(profile.email || 'user').split('@')[0]}`;
    modal.querySelector('.profile-chip.role').textContent = roleLabel;
    modal.querySelector('.profile-branch').textContent = profile.branchLocation || 'Branch not assigned';
    const grid = modal.querySelector('.profile-modal-grid');

    const employment = document.createElement('section');
    employment.className = 'profile-card';
    employment.innerHTML = '<h3 class="profile-card-title">Employment info</h3><div class="profile-info-list"></div>';
    employment.querySelector('.profile-info-list').append(
      makeProfileInfoRow('Date hired', profile.dateHired ? new Date(`${profile.dateHired}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not provided'),
      makeProfileInfoRow('Status', profile.employmentStatus || getStatusLabel(profile.status)),
      makeProfileInfoRow('Employee ID', profile.employeeId || (profile.id ? `MS-${String(profile.id).padStart(4, '0')}` : 'Not assigned')),
    );

    const contact = document.createElement('section');
    contact.className = 'profile-card';
    contact.innerHTML = '<h3 class="profile-card-title">Contact info</h3><div class="profile-info-list"></div>';
    contact.querySelector('.profile-info-list').append(makeProfileInfoRow('Email', profile.email || 'Not provided'));
    const phoneRow = document.createElement('div');
    phoneRow.className = 'profile-info-row';
    phoneRow.innerHTML = '<span class="profile-info-label">Phone number</span><div class="profile-inline-edit"><input type="tel" autocomplete="tel" aria-label="Phone number"><button class="profile-btn" type="button">Save</button></div>';
    phoneRow.querySelector('input').value = profile.phone || '';
    if (profile.isLocalAccount) {
      phoneRow.querySelector('input').disabled = true;
      phoneRow.querySelector('input').placeholder = 'Unavailable offline';
      phoneRow.querySelector('button').disabled = true;
      phoneRow.querySelector('button').textContent = 'Offline';
    }
    phoneRow.querySelector('button').addEventListener('click', async () => {
      const phone = phoneRow.querySelector('input').value.trim();
      const saveButton = phoneRow.querySelector('button');
      saveButton.disabled = true;
      try {
        await fetchJson(phpApi('auth/profile.php'), { method: 'PUT', body: JSON.stringify({ phone }) });
        showDashboardToast('Phone number updated.', 'success');
      } catch (error) {
        showDashboardToast(error.message || 'Unable to update phone number.', 'error');
      } finally {
        saveButton.disabled = false;
      }
    });
    contact.querySelector('.profile-info-list').append(phoneRow);

    const security = document.createElement('section');
    security.className = 'profile-card wide';
    security.innerHTML = '<h3 class="profile-card-title">Security</h3><div class="profile-security-actions"><button class="profile-btn" data-action="pin" type="button">Change PIN</button><button class="profile-btn" data-action="password" type="button">Change Password</button></div><div class="profile-security-editor"></div><div class="profile-info-list"></div><div class="profile-devices"></div>';
    security.querySelector('.profile-info-list').append(makeProfileInfoRow('Last login', profile.lastLogin ? formatTimestamp(profile.lastLogin) : 'First recorded login'));
    if (profile.isLocalAccount) {
      security.querySelectorAll('[data-action]').forEach((button) => {
        button.disabled = true;
        button.title = 'Security changes require the database connection.';
      });
    }
    security.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
      const isPassword = button.dataset.action === 'password';
      const editor = security.querySelector('.profile-security-editor');
      editor.classList.add('open');
      editor.innerHTML = `<form class="profile-security-form">
        <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label>
        <label>${isPassword ? 'New password' : 'New PIN'}<input name="newValue" type="password" ${isPassword ? 'autocomplete="new-password" minlength="8"' : 'inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6"'} required></label>
        <label>Confirm ${isPassword ? 'password' : 'PIN'}<input name="confirmation" type="password" ${isPassword ? 'autocomplete="new-password" minlength="8"' : 'inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6"'} required></label>
        <div class="profile-security-form-actions"><button class="profile-btn" data-cancel type="button">Cancel</button><button class="profile-btn" type="submit">Save ${isPassword ? 'password' : 'PIN'}</button></div>
      </form>`;
      const form = editor.querySelector('form');
      editor.querySelector('[data-cancel]').addEventListener('click', () => { editor.classList.remove('open'); editor.replaceChildren(); });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = new FormData(form);
        const newValue = String(values.get('newValue') || '');
        if (newValue !== String(values.get('confirmation') || '')) {
          showDashboardToast(`${isPassword ? 'Passwords' : 'PINs'} do not match.`, 'warning');
          return;
        }
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          await fetchJson(phpApi('auth/profile.php'), {
            method: 'POST',
            body: JSON.stringify({ action: isPassword ? 'change-password' : 'change-pin', currentPassword: values.get('currentPassword'), [isPassword ? 'newPassword' : 'newPin']: newValue }),
          });
          editor.classList.remove('open');
          editor.replaceChildren();
          showDashboardToast(`${isPassword ? 'Password' : 'PIN'} changed successfully.`, 'success');
        } catch (error) {
          showDashboardToast(error.message || `Unable to change ${isPassword ? 'password' : 'PIN'}.`, 'error');
          submit.disabled = false;
        }
      });
      form.querySelector('input').focus();
    }));
    const deviceList = security.querySelector('.profile-devices');
    deviceList.id = 'profileDevicesList';
    if (!devices.length) {
      const empty = document.createElement('div');
      empty.className = 'profile-empty';
      empty.textContent = 'No paired devices linked to this account.';
      deviceList.appendChild(empty);
    } else {
      const renderDevices = (page = 1) => {
        deviceList.replaceChildren();
        const pageData = paginateRecords(devices, page);
        pageData.items.forEach((device) => {
        const item = document.createElement('div');
        item.className = 'profile-device';
        item.innerHTML = `<div><div class="profile-device-name"></div><div class="profile-device-meta"></div></div><button class="profile-btn profile-unlink" type="button">Unlink</button>`;
        item.querySelector('.profile-device-name').textContent = device.name || 'Paired device';
        item.querySelector('.profile-device-meta').textContent = `Last active ${device.lastActive ? formatTimestamp(device.lastActive) : 'recently'}`;
        item.querySelector('button').addEventListener('click', async () => {
          const unlinkButton = item.querySelector('button');
          unlinkButton.disabled = true;
          try {
            await fetchJson(phpApi('auth/profile.php'), { method: 'POST', body: JSON.stringify({ action: 'unlink-device', deviceId: device.id }) });
            const deviceIndex = devices.findIndex((entry) => String(entry.id) === String(device.id));
            if (deviceIndex >= 0) devices.splice(deviceIndex, 1);
            renderDevices(pageData.page);
            showDashboardToast('Device unlinked.', 'success');
          } catch (error) {
            unlinkButton.disabled = false;
            showDashboardToast(error.message || 'Unable to unlink device.', 'error');
          }
        });
        deviceList.appendChild(item);
      });
        renderPagination('profileDevicesList', pageData, renderDevices);
      };
      renderDevices();
    }

    const activity = document.createElement('section');
    activity.className = 'profile-card wide';
    activity.innerHTML = '<h3 class="profile-card-title">Activity summary</h3><div class="profile-stat-grid"><div class="profile-empty">Loading activity…</div></div>';
    loadProfileStats(activity.querySelector('.profile-stat-grid'), profile);
    grid.append(employment, contact, security, activity);

    const permissions = Array.isArray(profile.permissions) ? profile.permissions : [];
    if ((role === 'admin' || role === 'super-admin') && permissions.length) {
      const permissionCard = document.createElement('section');
      permissionCard.className = 'profile-card wide';
      permissionCard.innerHTML = '<h3 class="profile-card-title">Assigned permissions</h3><div class="profile-permissions"></div>';
      const permissionList = permissionCard.querySelector('.profile-permissions');
      permissionList.id = 'profilePermissionsList';
      const renderPermissions = (page = 1) => {
        const pageData = paginateRecords(permissions, page);
        permissionList.replaceChildren(...pageData.items.map((permission) => {
          const chip = document.createElement('span');
          chip.className = 'profile-permission';
          chip.textContent = permission.label || permission.key || permission;
          return chip;
        }));
        renderPagination('profilePermissionsList', pageData, renderPermissions);
      };
      renderPermissions();
      grid.appendChild(permissionCard);
    }

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.classList.add('profile-modal-open');
    backdrop.addEventListener('pointerdown', (event) => { if (event.target === backdrop) closeProfileModal(); });
    modal.querySelector('.profile-modal-close').addEventListener('click', closeProfileModal);
    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeProfileModal();
      if (event.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')].filter((node) => !node.disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    requestAnimationFrame(() => backdrop.classList.add('open'));
    modal.querySelector('.profile-modal-close').focus();
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
    loadReports,
    loadShifts,
    openNotifications,
    openProfileMenu,
    refreshDashboard,
    showDashboardToast,
    recordActivity,
    loadActivityFeed,
    getLocalAuditRecords,
    paginateRecords,
    renderPagination,
  };
})();
