// Resolve navigation from this script instead of the domain root. The school
// server publishes the application from a subdirectory, so root-absolute URLs
// (for example, /login-page/login.html) lead to its 404 page.
const homeScriptUrl = document.currentScript?.src || window.location.href;
const projectRootUrl = new URL('../', homeScriptUrl);
const homePageUrl = new URL('./', homeScriptUrl);

const state = {
  products: [],
  cart: [],
  selectedCategory: 'all',
  activeStockFilter: 'all',
  productSearch: '',
  inventorySearch: '',
  editingProductId: null,
  discountPercent: 0,
  customCategories: [],
  pendingImageDataUrl: '',
  pendingImageFile: null,
  manualPriceMode: false,
};

const fallbackImage = '/images/placeholder.svg';

function formatCurrency(value) {
  return `$${Number(value).toFixed(2)}`;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toastMessage');
  toast.textContent = message;
  toast.className = `toast visible ${type}`;

  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 3200);
}

function getCurrentUserRole() {
  try {
    return String((JSON.parse(localStorage.getItem('posCurrentUser') || '{}') || {}).role || '').trim().toLowerCase();
  } catch (error) {
    return '';
  }
}

function canManageInventory() {
  return ['manager', 'super-admin', 'superadmin', 'super admin'].includes(getCurrentUserRole());
}

async function recordInventoryActivity(actionText, entityType = 'inventory', entityId = '') {
  if (!canManageInventory()) return;
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem('posCurrentUser') || '{}') || {};
  } catch (error) {
    user = {};
  }
  try {
    await fetch(phpApi('audit-log.php'), {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        actorUserId: Number(user.id) || null,
        actorName: user.fullName || user.username || user.email || 'Unknown user',
        actorRole: getCurrentUserRole(),
        actionText,
        entityType,
        entityId: String(entityId || ''),
      }),
    });
  } catch (error) {
    console.error('Unable to record inventory activity:', error);
  }
}

function toggleView(view) {
  const posPage = document.getElementById('posPage');
  const inventoryPage = document.getElementById('inventoryPage');

  if (view === 'inventory') {
    if (!canManageInventory()) {
      showToast('Inventory Management is available only to managers and super admins.', 'danger');
      return;
    }
    posPage.hidden = true;
    posPage.classList.remove('active');
    inventoryPage.hidden = false;
    inventoryPage.classList.add('active');
  } else {
    inventoryPage.hidden = true;
    inventoryPage.classList.remove('active');
    posPage.hidden = false;
    posPage.classList.add('active');
  }
}

function leaveInventoryManager() {
  const role = getCurrentUserRole();
  const dashboardPath = ['super-admin', 'superadmin', 'super admin'].includes(role)
    ? '../New_Index/super-admin.html'
    : '../New_Index/manager.html';
  window.location.href = dashboardPath;
}

function scanBarcode(barcode) {
  const product = state.products.find((item) => item.barcode === barcode || item.sku === barcode);
  if (product) {
    addToCart(product.id);
    showToast(`${product.name} added to cart`);
    return;
  }
  showToast('Barcode not found in inventory', 'danger');
}

function saveCartState() {
  try {
    sessionStorage.setItem('posCart', JSON.stringify(state.cart));
    sessionStorage.setItem('posDiscountPercent', String(state.discountPercent || 0));
  } catch (error) {
    console.warn('Unable to save cart state:', error);
  }
}

function loadCartState() {
  try {
    const savedCart = sessionStorage.getItem('posCart');
    const savedDiscount = sessionStorage.getItem('posDiscountPercent');
    if (savedCart) {
      state.cart = JSON.parse(savedCart) || [];
    }
    if (savedDiscount) {
      state.discountPercent = Number(savedDiscount) || 0;
    }
  } catch (error) {
    console.warn('Unable to restore cart state from session storage', error);
  }
}

const scannerState = {
  sessionId: null,
  socket: null,
  connected: false,
  phoneConnected: false,
  reconnectTimer: null,
};

function generateSessionId() {
  return `scanner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateScannerStatus(status, detail = '') {
  const statusText = document.getElementById('scannerStatusText');
  if (!statusText) return;
  const normalized = String(status || 'Ready to pair').toLowerCase();
  statusText.textContent = status || 'Ready to pair';
  statusText.className = normalized.includes('connected') ? 'status-connected' : normalized.includes('disconnected') ? 'status-disconnected' : '';
  document.getElementById('scannerDetails').classList.toggle('hidden', !scannerState.sessionId);
}

function createScannerQrCode(sessionId) {
  const qrContainer = document.getElementById('scannerQrCode');
  if (!qrContainer) return;
  qrContainer.innerHTML = '';
  const scanUrl = new URL(`mobile-scanner.html?sessionId=${encodeURIComponent(sessionId)}`, homePageUrl).href;
  if (window.QRCode) {
    new QRCode(qrContainer, {
      text: scanUrl,
      width: 240,
      height: 240,
      colorDark: '#111827',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
  } else {
    qrContainer.textContent = scanUrl;
  }
}

function renderScannerInfo() {
  const sessionText = document.getElementById('scannerSessionId');
  const details = document.getElementById('scannerDetails');
  if (scannerState.sessionId) {
    if (sessionText) sessionText.textContent = scannerState.sessionId;
    if (details) details.classList.remove('hidden');
    createScannerQrCode(scannerState.sessionId);
  } else if (details) {
    details.classList.add('hidden');
  }
}

function setScannerPanelCollapsed(collapsed) {
  const panel = document.querySelector('.scanner-panel');
  if (!panel) return;
  panel.classList.toggle('collapsed', collapsed);

  const details = document.getElementById('scannerDetails');
  if (!details) return;
  if (collapsed) {
    details.classList.add('hidden');
  } else {
    details.classList.toggle('hidden', !scannerState.sessionId);
  }
}

function handleScannerMessage(message) {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'device-status') {
    scannerState.phoneConnected = message.status === 'phone-connected';
    updateScannerStatus(scannerState.phoneConnected ? 'Phone connected' : 'Phone disconnected', 'Ready to scan once your phone is paired.');
    setScannerPanelCollapsed(scannerState.phoneConnected);
  } else if (message.type === 'barcode') {
    const barcode = String(message.barcode || '').trim();
    if (barcode) {
      scanBarcode(barcode);
      showToast(`Scanned barcode: ${barcode}`);
    }
  } else if (message.type === 'status') {
    updateScannerStatus(message.status, message.detail || '');
  }
}

function scheduleScannerReconnect() {
  if (!scannerState.sessionId) return;
  if (scannerState.reconnectTimer) return;
  scannerState.reconnectTimer = setTimeout(() => {
    scannerState.reconnectTimer = null;
    if (!scannerState.socket || scannerState.socket.readyState !== WebSocket.OPEN) {
      connectPhoneScanner();
    }
  }, 5000);
}

function connectPhoneScanner() {
  if (scannerState.socket && scannerState.socket.readyState === WebSocket.OPEN) {
    updateScannerStatus('Already connected', 'The pairing socket is already open.');
    return;
  }

  scannerState.sessionId = scannerState.sessionId || generateSessionId();
  renderScannerInfo();
  updateScannerStatus('Connecting...', 'Opening pairing channel...');

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socketUrl = `${protocol}://${location.host}/scanner-socket?role=pos&sessionId=${encodeURIComponent(scannerState.sessionId)}`;
  const socket = new WebSocket(socketUrl);
  scannerState.socket = socket;

  socket.addEventListener('open', () => {
    scannerState.connected = true;
    setScannerPanelCollapsed(false);
    updateScannerStatus('Connected', 'Waiting for phone to pair.');
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    handleScannerMessage(message);
  });

  socket.addEventListener('close', () => {
    scannerState.connected = false;
    scannerState.phoneConnected = false;
    updateScannerStatus('Disconnected', 'Pairing lost. Reconnecting...');
    scheduleScannerReconnect();
  });

  socket.addEventListener('error', () => {
    updateScannerStatus('Connection error', 'Unable to reach the scanner service.');
  });
}

function disconnectPhoneScanner() {
  if (scannerState.socket) {
    scannerState.socket.close();
  }
  scannerState.socket = null;
  scannerState.connected = false;
  scannerState.phoneConnected = false;
  scannerState.sessionId = null;
  if (scannerState.reconnectTimer) {
    clearTimeout(scannerState.reconnectTimer);
    scannerState.reconnectTimer = null;
  }
  setScannerPanelCollapsed(false);
  renderScannerInfo();
  updateScannerStatus('Disconnected', 'Phone scanner pairing ended.');
}

function setButtonActive(buttonGroup, activeValue) {
  buttonGroup.forEach((button) => {
    const value = button.dataset.value || button.textContent.trim().toLowerCase();
    button.classList.toggle('active', value === activeValue);
  });
}

function getFilteredProducts() {
  const searchValue = (state.inventorySearch || state.productSearch).toLowerCase();
  return state.products.filter((product) => {
    const categoryMatch = state.selectedCategory === 'all' || product.category.toLowerCase() === state.selectedCategory;
    const stockMatch = state.activeStockFilter === 'all'
      || (state.activeStockFilter === 'low' && product.stock > 0 && product.stock <= 10)
      || (state.activeStockFilter === 'out' && product.stock === 0);
    const searchMatch = !searchValue || [product.name, product.sku, product.barcode, product.category]
      .some((field) => String(field).toLowerCase().includes(searchValue));
    return categoryMatch && stockMatch && searchMatch;
  });
}

function renderCategoryPills() {
  const categories = Array.from(
    new Set([
      ...state.products.map((product) => product.category.toLowerCase()),
      ...state.customCategories.map((category) => category.toLowerCase()),
    ]),
  ).sort();
  const pillsContainer = document.getElementById('categoryPills');
  pillsContainer.innerHTML = '';

  const createPill = (value, label) => {
    const button = document.createElement('button');
    button.className = 'pill';
    button.type = 'button';
    button.dataset.value = value;
    button.textContent = label;
    button.addEventListener('click', () => filterCategory(value));
    return button;
  };

  pillsContainer.appendChild(createPill('all', 'All Items'));
  categories.forEach((category) => {
    const normalized = category.trim();
    if (!normalized) return;
    const label = normalized.replace(/\b\w/g, (chr) => chr.toUpperCase());
    pillsContainer.appendChild(createPill(normalized.toLowerCase(), label));
  });

  setButtonActive(Array.from(pillsContainer.querySelectorAll('.pill')), state.selectedCategory);
}

function renderProductGrid() {
  const grid = document.getElementById('productGrid');
  const products = getFilteredProducts();

  grid.innerHTML = '';
  if (!products.length) {
    grid.innerHTML = '<div class="table-note">No products match your search or selected category.</div>';
    return;
  }

  products.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <img src="${product.image || fallbackImage}" alt="${product.name}" onerror="this.onerror=null;this.src='${fallbackImage}'" />
      <div class="product-card-body">
        <p class="product-label">${product.name}</p>
        <p class="product-meta">SKU: ${product.sku}</p>
        <div class="product-footer">
          <span class="price">${formatCurrency(product.price)}</span>
          <button class="quick-add-button" type="button">+ Add</button>
        </div>
      </div>
    `;

    card.querySelector('.quick-add-button').addEventListener('click', () => {
      addToCart(product.id);
      showToast(`${product.name} added to cart`);
    });
    grid.appendChild(card);
  });
}

function renderCart() {
  const cartContainer = document.getElementById('cartItemsContainer');
  const cartCount = document.getElementById('cartCount');
  const cartNote = document.getElementById('cartNote');
  const summary = calculateTotals();

  cartCount.textContent = `${state.cart.reduce((sum, item) => sum + item.quantity, 0)} items`;
  cartNote.textContent = state.cart.length ? 'Review the cart before payment.' : 'Add items from the left panel to build an order.';
  document.getElementById('subtotalAmount').textContent = formatCurrency(summary.subtotal);
  document.getElementById('discountAmount').textContent = formatCurrency(summary.discount);
  document.getElementById('taxAmount').textContent = formatCurrency(summary.tax);
  document.getElementById('totalAmount').textContent = formatCurrency(summary.total);

  // Keep discount input in sync if present
  const discountInput = document.getElementById('discountInput');
  if (discountInput) discountInput.value = String(state.discountPercent || 0);

  saveCartState();

  if (!state.cart.length) {
    cartContainer.innerHTML = '<div class="table-note">Your cart is empty. Add items from the product list to begin.</div>';
    return;
  }

  cartContainer.innerHTML = '';
  state.cart.forEach((item) => {
    const cartItem = document.createElement('article');
    cartItem.className = 'cart-item';
    cartItem.innerHTML = `
      <div>
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-meta">${formatCurrency(item.unitPrice)} each</p>
      </div>
      <div class="cart-controls">
        <button type="button" class="qty-button">-</button>
        <span class="qty-value">${item.quantity}</span>
        <button type="button" class="qty-button">+</button>
      </div>
      <button class="remove-button" type="button" aria-label="Remove item">×</button>
    `;

    cartItem.querySelectorAll('.qty-button')[0].addEventListener('click', () => changeItemQuantity(item.productId, -1));
    cartItem.querySelectorAll('.qty-button')[1].addEventListener('click', () => changeItemQuantity(item.productId, 1));
    cartItem.querySelector('.remove-button').addEventListener('click', () => removeCartItem(item.productId));

    // Allow clicking the quantity value to edit it directly for large adjustments
    const qtyValueSpan = cartItem.querySelector('.qty-value');
    qtyValueSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = Number(item.quantity || 0);
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.value = String(current);
      input.className = 'qty-edit-input';
      input.style.width = '72px';
      input.style.padding = '8px';
      input.style.fontWeight = '700';
      input.style.textAlign = 'center';
      input.style.borderRadius = '10px';
      input.style.border = '1px solid rgba(0,0,0,0.08)';

      const commit = () => {
        let v = Number(input.value);
        if (!Number.isFinite(v) || Number.isNaN(v)) v = current;
        v = Math.max(0, Math.floor(v));
        if (v <= 0) {
          removeCartItem(item.productId);
        } else {
          const target = state.cart.find((c) => c.productId === item.productId);
          if (target) {
            target.quantity = v;
          }
          renderCart();
        }
      };

      const cancel = () => {
        renderCart();
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          commit();
        } else if (ev.key === 'Escape') {
          cancel();
        }
      });

      // Replace span with input for editing
      qtyValueSpan.replaceWith(input);
      input.focus();
      input.select();
    });
    cartContainer.appendChild(cartItem);
  });
}

function calculateTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = (Number(state.discountPercent || 0) / 100) * subtotal;
  const tax = Number(((subtotal - discount) * 0.08).toFixed(2));
  const total = Number((subtotal - discount + tax).toFixed(2));
  return { subtotal, discount, tax, total };
}

function addToCart(productId) {
  const product = state.products.find((item) => String(item.id) === String(productId));
  if (!product) {
    showToast('Product not found in inventory', 'danger');
    return;
  }

  const cartItem = state.cart.find((item) => item.productId === productId);
  if (cartItem) {
    cartItem.quantity += 1;
  } else {
    state.cart.push({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unitPrice: product.price,
      quantity: 1,
    });
  }

  renderCart();
}

function changeItemQuantity(productId, change) {
  const item = state.cart.find((entry) => entry.productId === productId);
  if (!item) return;
  item.quantity += change;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((entry) => entry.productId !== productId);
  }
  renderCart();
}

function removeCartItem(productId) {
  state.cart = state.cart.filter((item) => item.productId !== productId);
  renderCart();
}

function clearCart() {
  state.cart = [];
  renderCart();
  showToast('Cart cleared successfully');
}

function goToCheckout() {
  if (!state.cart.length) {
    showToast('Cart is empty. Add products before checkout.', 'danger');
    return;
  }

  const checkoutData = {
    cart: state.cart,
    discountPercent: state.discountPercent || 0,
    totals: calculateTotals(),
    createdAt: new Date().toISOString(),
  };

  sessionStorage.setItem('posCheckoutData', JSON.stringify(checkoutData));
  window.location.href = 'checkout.html';
}

function logoutFromHome() {
  // Stop the scanner first so its close handler cannot leave a reconnect timer
  // running while the browser is navigating away.
  disconnectPhoneScanner();

  try {
    localStorage.removeItem('posCurrentUser');
    sessionStorage.removeItem('posCurrentUser');
  } catch (error) {
    console.warn('Logout cleanup failed:', error);
  }

  window.location.replace(new URL('login-page/login.html', projectRootUrl).href);
}

function getApiHeaders(extraHeaders = {}) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-pos-pin': '1234',
    ...extraHeaders,
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    let message = 'Request failed';
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.error) {
        message = parsed.error;
      }
    } catch (error) {
      if (text) {
        message = text;
      }
    }
    throw new Error(message);
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('The server returned an invalid response.');
  }
}

function holdTransaction() {
  if (!state.cart.length) {
    showToast('No items to hold', 'danger');
    return;
  }
  showToast('Transaction held. Use the same cart to resume later.');
}

const phpApiRoot = new URL('../PHP-TEST/', homeScriptUrl);
const phpApi = (path, params = '') => `${new URL(path, phpApiRoot).pathname}${params}`;

function fetchProducts() {
  const query = new URLSearchParams();
  const searchValue = state.inventorySearch || state.productSearch;
  if (searchValue) query.set('search', searchValue);
  if (state.activeStockFilter && state.activeStockFilter !== 'all') query.set('stock', state.activeStockFilter);

  const paths = [phpApi('products.php', `?${query.toString()}`)];

  const tryFetch = (index) => {
    if (index >= paths.length) {
      return Promise.reject(new Error('No available product endpoints')); 
    }

    const path = paths[index];
    return fetch(path, { headers: getApiHeaders() })
      .then(parseJsonResponse)
      .then((products) => {
        if (!Array.isArray(products)) {
          throw new Error(`Invalid product response from ${path}`);
        }
        return products;
      })
      .catch((error) => {
        console.warn(`Product fetch failed for ${path}:`, error.message || error);
        return tryFetch(index + 1);
      });
  };

  return tryFetch(0)
    .then((products) => {
      state.products = products;
      renderCategoryPills();
      renderProductGrid();
      renderInventoryTable();
      renderInventoryCards();
      renderCategoryList();
      return products;
    })
    .catch((error) => {
      console.error('Unable to fetch products:', error);
      showToast('Unable to load products. Please refresh the page.', 'danger');
      state.products = [];
      renderCategoryPills();
      renderProductGrid();
      renderInventoryTable();
      renderInventoryCards();
      renderCategoryList();
      return [];
    });
}

function searchProducts() {
  state.productSearch = document.getElementById('productSearchInput').value.trim();
  state.inventorySearch = document.getElementById('inventorySearch').value.trim();
  return fetchProducts();
}

function filterCategory(category) {
  state.selectedCategory = category;
  renderCategoryPills();
  renderProductGrid();
  renderInventoryTable();
}

function filterStock(type) {
  state.activeStockFilter = type;
  document.querySelectorAll('#inventoryFilters .pill').forEach((button) => {
    const value = button.dataset.value || button.textContent.trim().toLowerCase().split(' ')[0];
    button.classList.toggle('active', value === type);
  });
  renderProductGrid();
  renderInventoryTable();
}

function renderInventoryTable() {
  const inventoryTable = document.getElementById('inventoryTableBody');
  const filteredProducts = getFilteredProducts();

  if (!filteredProducts.length) {
    inventoryTable.innerHTML = '<tr><td class="table-note" colspan="8">No inventory items match these filters.</td></tr>';
    return;
  }

  inventoryTable.innerHTML = filteredProducts
    .map((product) => `
      <tr>
        <td><img class="table-image" src="${product.image || fallbackImage}" alt="${product.name}" onerror="this.onerror=null;this.src='${fallbackImage}'" /></td>
        <td>${product.name}</td>
        <td>${product.category}</td>
        <td>${product.sku} / ${product.barcode}</td>
        <td>${formatCurrency(product.price)}</td>
        <td>${product.stock}</td>
        <td>
          <div class="stock-check-control">
            <input id="currentStock-${product.id}" class="stock-check-input" data-product-id="${product.id}" type="number" min="0" step="1" value="${product.currentStock ?? ''}" placeholder="Enter count" aria-label="Current physical stock for ${product.name}" oninput="markCurrentStockChanged(this)" />
          </div>
          ${product.stockVariance === null || product.stockVariance === undefined ? '<small class="stock-check-note">Not checked</small>' : `<small class="stock-check-note ${product.stockVariance === 0 ? 'matches' : 'mismatch'}">Variance: ${product.stockVariance > 0 ? '+' : ''}${product.stockVariance}</small>`}
        </td>
        <td class="table-actions">
          <button class="table-button" type="button" onclick="editProduct('${product.id}')">Edit</button>
          <button class="table-button danger" type="button" onclick="deleteProduct('${product.id}')">Delete</button>
        </td>
      </tr>
    `)
    .join('');
}

function updateStockChangesStatus() {
  const changedInputs = document.querySelectorAll('.stock-check-input[data-changed="true"]');
  const status = document.getElementById('stockChangesStatus');
  const saveButton = document.getElementById('saveAllStockButton');
  if (status) status.textContent = changedInputs.length ? `${changedInputs.length} unsaved ${changedInputs.length === 1 ? 'count' : 'counts'}` : 'No unsaved counts';
  if (saveButton) saveButton.disabled = changedInputs.length === 0;
}

function markCurrentStockChanged(input) {
  input.dataset.changed = 'true';
  input.classList.add('has-change');
  updateStockChangesStatus();
}

function saveAllCurrentStock() {
  const changedInputs = Array.from(document.querySelectorAll('.stock-check-input[data-changed="true"]'));
  if (!changedInputs.length) {
    showToast('There are no changed stock counts to save.', 'danger');
    return;
  }

  const invalidInput = changedInputs.find((input) => !Number.isInteger(Number(input.value)) || Number(input.value) < 0);
  if (invalidInput) {
    invalidInput.focus();
    showToast('Every physical stock count must be a whole number of zero or more.', 'danger');
    return;
  }

  let currentUser = {};
  try {
    currentUser = JSON.parse(localStorage.getItem('posCurrentUser') || '{}') || {};
  } catch (error) {
    currentUser = {};
  }

  const saveButton = document.getElementById('saveAllStockButton');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
  }
  changedInputs.forEach((input) => { input.disabled = true; });

  fetch(phpApi('stock-checks.php'), {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      counts: changedInputs.map((input) => ({
        productId: Number(input.dataset.productId),
        countedQuantity: Number(input.value),
      })),
      checkedByUserId: Number(currentUser.id) || null,
      checkedByName: currentUser.fullName || currentUser.username || currentUser.email || 'Unknown staff',
    }),
  })
    .then(parseJsonResponse)
    .then(() => {
      showToast(`${changedInputs.length} physical stock ${changedInputs.length === 1 ? 'count' : 'counts'} saved.`);
      recordInventoryActivity(`saved ${changedInputs.length} physical stock ${changedInputs.length === 1 ? 'count' : 'counts'}`, 'stock_check');
      return loadProducts();
    })
    .catch((error) => {
      changedInputs.forEach((input) => { input.disabled = false; });
      showToast(error.message || 'Unable to save physical stock counts.', 'danger');
    })
    .finally(() => {
      if (saveButton) saveButton.textContent = 'Save Stock Counts';
      updateStockChangesStatus();
    });
}

function renderInventoryCards() {
  document.getElementById('totalProductsCount').textContent = state.products.length;
  const uniqueCategories = new Set(state.products.map((product) => product.category.trim().toLowerCase()));
  document.getElementById('totalCategoriesCount').textContent = uniqueCategories.size;
  document.getElementById('lowStockCount').textContent = state.products.filter((product) => product.stock > 0 && product.stock <= 10).length;
  document.getElementById('outOfStockCount').textContent = state.products.filter((product) => product.stock === 0).length;
}

function renderCategoryList() {
  const categoryList = document.getElementById('categoryList');
  const categories = Array.from(
    new Set([
      ...state.products.map((product) => product.category.trim()).filter(Boolean),
      ...state.customCategories.map((category) => category.trim()).filter(Boolean),
    ]),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  categoryList.innerHTML = '';

  const createCategoryButton = (value, label) => {
    const button = document.createElement('button');
    button.className = 'category-chip';
    button.type = 'button';
    button.dataset.value = value;
    button.textContent = label;
    button.addEventListener('click', () => {
      filterCategory(value);
      renderCategoryPills();
      renderCategoryList();
    });
    return button;
  };

  categoryList.appendChild(createCategoryButton('all', 'All'));
  categories.forEach((category) => {
    const normalized = category.trim();
    if (!normalized) return;
    categoryList.appendChild(createCategoryButton(normalized.toLowerCase(), normalized));
  });

  setButtonActive(Array.from(categoryList.querySelectorAll('.category-chip')), state.selectedCategory);
}

function addCategory() {
  const modal = document.getElementById('categoryModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const input = document.getElementById('newCategoryInput');
  input.value = '';
  input.focus();
}

function saveCategory() {
  const input = document.getElementById('newCategoryInput');
  const normalized = input.value.trim();
  if (!normalized) {
    showToast('Please enter a category name.', 'danger');
    return;
  }

  const normalizedLower = normalized.toLowerCase();
  const alreadyExists = state.customCategories.some((cat) => cat.toLowerCase() === normalizedLower)
    || state.products.some((product) => product.category.trim().toLowerCase() === normalizedLower);

  if (alreadyExists) {
    showToast('This category already exists.', 'warning');
    return;
  }

  state.customCategories.push(normalized);
  renderCategoryList();
  renderCategoryPills();
  closeAddCategoryModal();
  showToast(`Category "${normalized}" added.`);
}

function closeAddCategoryModal() {
  const modal = document.getElementById('categoryModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function openAddProductModal(product = null) {
  const modal = document.getElementById('productModal');
  const title = document.getElementById('modalTitle');
  state.editingProductId = product ? product.id : null;

  title.textContent = product ? 'Edit inventory item' : 'New inventory item';
  document.getElementById('productImageUrl').value = product?.image && !String(product.image).startsWith('data:') ? product.image : '';
  document.getElementById('productName').value = product?.name || '';
  document.getElementById('productDescription').value = product?.description || '';
  document.getElementById('productCategory').value = product?.category || '';
  document.getElementById('productSku').value = product?.sku || '';
  document.getElementById('productCost').value = Number(product?.cost) > 0 ? product.cost : '';
  document.getElementById('productPrice').value = product?.price || '';
  document.getElementById('productStock').value = product?.stock ?? '';
  document.getElementById('productThreshold').value = product?.threshold ?? '';
  state.pendingImageDataUrl = product?.image && String(product.image).startsWith('data:') ? product.image : '';
  state.pendingImageFile = null;
  state.manualPriceMode = Boolean(product && !(Number(product.cost) > 0));
  document.getElementById('markupSlider').value = '30';
  updatePriceModeUi();
  if (state.manualPriceMode) {
    onManualPriceInput();
  } else {
    recalcSellingPrice();
  }
  const preview = document.getElementById('imagePreview');
  if (product?.image) {
    preview.style.backgroundImage = `url('${product.image}')`;
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = 'none';
    preview.textContent = 'Image preview';
  }
  modal.classList.remove('hidden');
}

function updatePriceModeUi() {
  const manualField = document.getElementById('manualPriceField');
  const toggle = document.getElementById('priceModeToggle');
  if (manualField) manualField.style.display = state.manualPriceMode ? '' : 'none';
  if (toggle) toggle.textContent = state.manualPriceMode ? 'use markup' : 'edit manually';
}

function onMarkupSliderInput() {
  state.manualPriceMode = false;
  updatePriceModeUi();
  recalcSellingPrice();
}

function recalcSellingPrice() {
  if (state.manualPriceMode) {
    onManualPriceInput();
    return;
  }
  const cost = Math.max(0, Number(document.getElementById('productCost')?.value) || 0);
  const markup = Math.max(0, Number(document.getElementById('markupSlider')?.value) || 0);
  const margin = cost * (markup / 100);
  const sellingPrice = cost + margin;

  document.getElementById('markupPill').textContent = `${markup}%`;
  document.getElementById('sellingPriceDisplay').textContent = formatCurrency(sellingPrice);
  document.getElementById('marginDisplay').textContent = `+${formatCurrency(margin)}`;
  if (!state.manualPriceMode) document.getElementById('productPrice').value = sellingPrice.toFixed(2);
}

function onManualPriceInput() {
  if (!state.manualPriceMode) return;
  const cost = Math.max(0, Number(document.getElementById('productCost')?.value) || 0);
  const sellingPrice = Math.max(0, Number(document.getElementById('productPrice')?.value) || 0);
  const margin = sellingPrice - cost;
  const markup = cost > 0 ? (margin / cost) * 100 : 0;
  document.getElementById('sellingPriceDisplay').textContent = formatCurrency(sellingPrice);
  document.getElementById('marginDisplay').textContent = `${margin >= 0 ? '+' : '-'}${formatCurrency(Math.abs(margin))}`;
  document.getElementById('markupPill').textContent = `${Math.round(markup)}%`;
}

function toggleManualPrice() {
  state.manualPriceMode = !state.manualPriceMode;
  updatePriceModeUi();
  if (state.manualPriceMode) onManualPriceInput();
  else recalcSellingPrice();
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
  document.getElementById('addProductForm').reset();
  const preview = document.getElementById('imagePreview');
  preview.style.backgroundImage = 'none';
  preview.textContent = 'Image preview';
  state.editingProductId = null;
  state.pendingImageDataUrl = '';
  state.pendingImageFile = null;
}

function previewProductImage(event) {
  const preview = document.getElementById('imagePreview');
  const file = event.target.files && event.target.files[0];

  if (!file) {
    preview.textContent = 'Image preview';
    preview.style.backgroundImage = 'none';
    state.pendingImageDataUrl = '';
    state.pendingImageFile = null;
    return;
  }

  if (!file.type.startsWith('image/')) {
    event.target.value = '';
    showToast('Please choose a valid image file.', 'danger');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    event.target.value = '';
    showToast('Product images must be 5 MB or smaller.', 'danger');
    return;
  }

  state.pendingImageFile = file;

  const reader = new FileReader();
  reader.onload = function () {
    state.pendingImageDataUrl = reader.result;
    preview.style.backgroundImage = `url('${reader.result}')`;
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
    preview.textContent = '';
  };
  reader.readAsDataURL(file);
}

async function uploadProductImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const response = await fetch(phpApi('upload-product-image.php'), {
    method: 'POST',
    headers: { Accept: 'application/json', 'x-pos-pin': '1234' },
    body: formData,
  });
  const result = await parseJsonResponse(response);
  if (!result.path) throw new Error('The image upload did not return a file path.');
  return result.path;
}

async function saveProduct() {
  const name = document.getElementById('productName').value.trim();
  const category = document.getElementById('productCategory').value.trim();
  const sku = document.getElementById('productSku').value.trim();
  const priceValue = document.getElementById('productPrice').value.trim();
  const stockValue = document.getElementById('productStock').value.trim();
  const price = Number(priceValue);
  const stock = Number(stockValue);

  if (!name) {
    showToast('Please enter a product name.', 'danger');
    return;
  }

  if (!category) {
    showToast('Please enter a category.', 'danger');
    return;
  }

  if (!sku) {
    showToast('Please enter a SKU or barcode.', 'danger');
    return;
  }

  if (!Number.isFinite(price) || price < 0) {
    showToast('Please enter a valid selling price.', 'danger');
    return;
  }

  if (!Number.isFinite(stock) || stock < 0) {
    showToast('Please enter a valid stock quantity.', 'danger');
    return;
  }

  const existingProduct = state.products.find((product) => product.sku === sku || product.barcode === sku);
  const barcode = existingProduct ? `${sku}-${Date.now().toString().slice(-6)}` : sku;

  const imageUrl = document.getElementById('productImageUrl').value.trim();
  let savedImagePath = imageUrl || fallbackImage;
  try {
    if (state.pendingImageFile) {
      savedImagePath = await uploadProductImage(state.pendingImageFile);
    }
  } catch (error) {
    console.error('Image upload failed:', error);
    showToast(error.message || 'Unable to upload product image.', 'danger');
    return;
  }

  const payload = {
    name,
    description: document.getElementById('productDescription').value.trim(),
    category,
    sku,
    barcode,
    price,
    stock,
    cost: Number(document.getElementById('productCost').value) || 0,
    threshold: Number(document.getElementById('productThreshold').value) || 0,
    image: savedImagePath,
  };

  // For new products, use the dual-write v2 endpoint
  const editingProductId = state.editingProductId;
  const url = phpApi('products.php', editingProductId ? `?id=${encodeURIComponent(editingProductId)}` : '');
  const method = editingProductId ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: getApiHeaders(),
      body: JSON.stringify(payload),
    });
    const result = await parseJsonResponse(response);
      if (result.error) {
        throw new Error(result.error);
      }
      showToast(editingProductId ? 'Product updated successfully' : 'Product saved successfully');
      recordInventoryActivity(`${editingProductId ? 'updated' : 'created'} product "${name}"`, 'product', result.id || editingProductId);
      closeProductModal();
      loadProducts();
  } catch (error) {
    console.error('Save failed:', error);
    showToast(error.message || 'Unable to save product', 'danger');
  }
}

function editProduct(id) {
  const product = state.products.find((item) => String(item.id) === String(id));
  if (!product) {
    showToast('Product not found', 'danger');
    return;
  }
  openAddProductModal(product);
}

function deleteProduct(id) {
  if (!confirm('Delete this product from inventory?')) return;
  const product = state.products.find((item) => String(item.id) === String(id));

  fetch(phpApi('products.php', `?id=${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: getApiHeaders(),
  })
    .then(parseJsonResponse)
    .then((result) => {
      if (result.error) {
        throw new Error(result.error);
      }
      showToast('Product removed from inventory');
      recordInventoryActivity(`removed product "${product?.name || id}"`, 'product', id);
      loadProducts();
    })
    .catch((error) => {
      console.error('Delete failed:', error);
      showToast(error.message || 'Unable to delete product', 'danger');
    });
}

function processPayment(paymentMethod) {
  if (!state.cart.length) {
    showToast('Cart is empty. Add products before checkout.', 'danger');
    return;
  }

  const payload = {
    paymentMethod,
    discountPercent: Number(state.discountPercent || 0),
    items: state.cart.map((item) => ({
      productId: item.productId,
      name: item.name,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
  };

  fetch(phpApi('checkout.php'), {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(payload),
  })
    .then(parseJsonResponse)
    .then((result) => {
      if (result.error) {
        throw new Error(result.error);
      }
      clearCart();
      showToast(`Payment successful: ${paymentMethod}. Total ${formatCurrency(result.total)}`);
    })
    .catch((error) => {
      console.error('Checkout failed:', error);
      showToast(error.message || 'Payment failed', 'danger');
    });
}

function processCashPayment() {
  processPayment('Cash');
}

function processCardPayment() {
  processPayment('Card');
}

function processDigitalWalletPayment() {
  processPayment('Digital Wallet');
}

function loadProducts() {
  return fetchProducts();
}

window.addEventListener('DOMContentLoaded', () => {
  const inventoryButton = document.getElementById('inventoryButton');
  if (inventoryButton) {
    inventoryButton.addEventListener('click', () => toggleView('inventory'));
  }
  document.getElementById('productSearchInput').addEventListener('input', searchProducts);
  document.getElementById('inventorySearch').addEventListener('input', searchProducts);
  document.getElementById('connectScannerButton')?.addEventListener('click', connectPhoneScanner);
  document.getElementById('disconnectScannerButton')?.addEventListener('click', disconnectPhoneScanner);
  document.getElementById('themeToggle')?.addEventListener('click', themeUtils.toggleTheme);
  themeUtils.initTheme();
  const requestedView = new URLSearchParams(window.location.search).get('view');
  if (requestedView === 'inventory') {
    if (canManageInventory()) {
      toggleView('inventory');
    } else {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('Inventory Management is available only to managers and super admins.', 'danger');
    }
  }
  // Discount input binding (if present)
  const discountInput = document.getElementById('discountInput');
  if (discountInput) {
    discountInput.addEventListener('input', (e) => {
      let v = Number(e.target.value);
      if (Number.isNaN(v)) v = 0;
      v = Math.max(0, Math.min(100, v));
      state.discountPercent = v;
      renderCart();
    });
  }
  renderScannerInfo();
  loadCartState();
  renderCart();
  loadProducts();
});
