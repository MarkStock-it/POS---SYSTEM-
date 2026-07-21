const checkoutState = {
  cart: [],
  totals: {
    subtotal: 0,
    tax: 0,
    total: 0,
  },
  paymentMethod: 'Cash',
};

const checkoutScriptUrl = document.currentScript?.src || window.location.href;
const checkoutApiUrl = new URL('../PHP-TEST/checkout.php', checkoutScriptUrl).pathname;

function getPosSettings() {
  try { return JSON.parse(localStorage.getItem('markstockSystemSettings') || '{}') || {}; }
  catch (error) { return {}; }
}

function formatCurrency(value) {
  const currency = getPosSettings().currency || 'PHP';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(Number(value) || 0);
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toastMessage');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast visible ${type}`;

  clearTimeout(window.checkoutToastTimeout);
  window.checkoutToastTimeout = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 3200);
}

function getApiHeaders(extraHeaders = {}) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-pos-pin': '1234',
    ...extraHeaders,
  };
}

function parseJsonResponse(response) {
  return response.text().then((text) => {
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch (error) {
      const plainText = text
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      throw new Error(plainText || `Server returned an invalid response (${response.status}).`);
    }
    if (!response.ok) {
      throw new Error(parsed.error || `Checkout request failed (${response.status}).`);
    }
    return parsed;
  });
}

const paginationState = {
  currentPage: 1,
  pageSize: 5,
};

function getVisibleCheckoutItems() {
  const start = (paginationState.currentPage - 1) * paginationState.pageSize;
  return checkoutState.cart.slice(start, start + paginationState.pageSize);
}

function renderPagination() {
  const pagination = document.getElementById('paginationControls');
  if (!pagination) return;

  const totalItems = checkoutState.cart.length;
  const totalPages = Math.ceil(totalItems / paginationState.pageSize);

  const maxPage = Math.max(1, totalPages);
  paginationState.currentPage = Math.min(Math.max(paginationState.currentPage, 1), maxPage);
  pagination.replaceChildren();
  const setExpanded = (expanded) => {
    pagination.dataset.expanded = expanded ? 'true' : 'false';
    pagination.classList.toggle('expanded', expanded);
    renderPagination();
  };
  if (pagination.dataset.expanded !== 'true') {
    pagination.classList.remove('expanded');
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'pagination-toggle';
    toggle.setAttribute('aria-label', 'Show pagination controls'); toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>'; toggle.addEventListener('click', () => setExpanded(true));
    pagination.appendChild(toggle); return;
  }
  const backButton = document.createElement('button'); backButton.type = 'button'; backButton.className = 'pagination-back';
  backButton.textContent = '← Back'; backButton.setAttribute('aria-label', 'Collapse pagination controls');
  backButton.addEventListener('click', () => setExpanded(false)); pagination.appendChild(backButton);
  const changePage = (page) => { paginationState.currentPage = page; renderCheckoutItems(); };
  const addButton = (label, page, disabled, active = false) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `pagination-button${active ? ' active' : ''}`;
    button.textContent = label; button.disabled = disabled; button.addEventListener('click', () => changePage(page)); pagination.appendChild(button);
  };
  const addEllipsis = () => {
    const ellipsis = document.createElement('span'); ellipsis.className = 'pagination-ellipsis'; ellipsis.textContent = '…';
    ellipsis.setAttribute('aria-hidden', 'true'); pagination.appendChild(ellipsis);
  };
  addButton('Prev', paginationState.currentPage - 1, paginationState.currentPage <= 1);
  if (maxPage <= 4) {
    for (let page = 1; page <= maxPage; page += 1) addButton(String(page), page, false, paginationState.currentPage === page);
  } else {
    const visiblePages = [...new Set([1, paginationState.currentPage - 1, paginationState.currentPage, paginationState.currentPage + 1, paginationState.currentPage + 2])]
      .filter((page) => page >= 1 && page < maxPage).sort((a, b) => a - b);
    let previous = 0;
    visiblePages.forEach((page) => { if (page - previous > 1) addEllipsis(); addButton(String(page), page, false, paginationState.currentPage === page); previous = page; });
    if (maxPage - previous > 1) addEllipsis();
    const jumpInput = document.createElement('input');
    jumpInput.className = `pagination-jump${paginationState.currentPage === maxPage ? ' active' : ''}`;
    jumpInput.type = 'number'; jumpInput.min = '1'; jumpInput.max = String(maxPage); jumpInput.value = String(maxPage);
    jumpInput.setAttribute('aria-label', `Go to page, maximum ${maxPage}`); jumpInput.title = `Enter a page from 1 to ${maxPage}`;
    const submitJump = () => {
      const page = Number(jumpInput.value);
      if (!Number.isInteger(page) || page < 1 || page > maxPage) {
        showToast(`Enter a page number from 1 to ${maxPage}.`, 'danger'); jumpInput.value = String(maxPage); jumpInput.focus(); jumpInput.select(); return;
      }
      changePage(page);
    };
    jumpInput.addEventListener('focus', () => jumpInput.select());
    jumpInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submitJump(); } });
    jumpInput.addEventListener('change', submitJump);
    pagination.appendChild(jumpInput);
  }
  addButton('Next', paginationState.currentPage + 1, paginationState.currentPage >= maxPage);
}

function renderCheckoutItems() {
  const container = document.getElementById('checkoutItems');
  if (!container) return;

  if (!checkoutState.cart.length) {
    container.innerHTML = '<div class="empty-state">No order items were found. Return to POS to start a sale.</div>';
    document.getElementById('paginationControls')?.replaceChildren();
    return;
  }

  const itemsToRender = getVisibleCheckoutItems();
  container.innerHTML = itemsToRender
    .map((item) => `
      <article class="checkout-item">
        <div class="item-meta">
          <p class="item-name">${item.name}</p>
          <p class="item-details">SKU: ${item.sku} · Qty: ${item.quantity}</p>
        </div>
        <div class="item-price">
          <span>${formatCurrency(item.unitPrice * item.quantity)}</span>
          <p>${formatCurrency(item.unitPrice)} each</p>
        </div>
      </article>
    `)
    .join('');

  renderPagination();
}

function renderTotals() {
  document.getElementById('summarySubtotal').textContent = formatCurrency(checkoutState.totals.subtotal);
  document.getElementById('summaryTax').textContent = formatCurrency(checkoutState.totals.tax);
  document.getElementById('summaryTotal').textContent = formatCurrency(checkoutState.totals.total);
}

function loadCheckoutData() {
  const raw = sessionStorage.getItem('posCheckoutData');
  if (!raw) {
    showToast('Checkout data is missing. Return to POS to start again.', 'danger');
    disableCheckoutActions();
    return;
  }

  try {
    const payload = JSON.parse(raw);
    checkoutState.cart = Array.isArray(payload.cart) ? payload.cart : [];
    checkoutState.totals = payload.totals || calculateTotalsFromCart();
    renderCheckoutItems();
    renderTotals();
  } catch (error) {
    console.error('Unable to parse checkout data', error);
    showToast('Unable to load checkout data. Return to POS.', 'danger');
    disableCheckoutActions();
  }
}

function calculateTotalsFromCart() {
  const subtotal = checkoutState.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const taxRate = Math.max(0, Math.min(100, Number(getPosSettings().taxRate ?? 8)));
  const tax = Number((subtotal * (taxRate / 100)).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));
  return { subtotal, tax, total };
}

function disableCheckoutActions() {
  document.getElementById('confirmButton')?.setAttribute('disabled', 'disabled');
}

function submitCheckout() {
  if (!checkoutState.cart.length) {
    showToast('No items to submit for checkout.', 'danger');
    return;
  }

  const payload = {
    paymentMethod: 'Cash',
    taxRate: Number(getPosSettings().taxRate ?? 8),
    items: checkoutState.cart.map((item) => ({
      productId: item.productId,
      name: item.name,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
  };

  fetch(checkoutApiUrl, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(payload),
  })
    .then(parseJsonResponse)
    .then((result) => {
      if (result.error) {
        throw new Error(result.error);
      }
      showToast(`Checkout completed. Total ${formatCurrency(result.total)}`);
      sessionStorage.removeItem('posCheckoutData');
      sessionStorage.removeItem('posCart');
      document.getElementById('confirmButton')?.setAttribute('disabled', 'disabled');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1800);
    })
    .catch((error) => {
      console.error('Checkout failed:', error);
      showToast(error.message || 'Checkout failed', 'danger');
    });
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('backButton')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('confirmButton')?.addEventListener('click', submitCheckout);
  document.getElementById('themeToggle')?.addEventListener('click', themeUtils.toggleTheme);
  document.getElementById('editButton')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  themeUtils.initTheme();
  loadCheckoutData();
});
