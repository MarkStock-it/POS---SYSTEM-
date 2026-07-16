const checkoutState = {
  cart: [],
  discountPercent: 0,
  totals: {
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
  },
  paymentMethod: 'Cash',
};

const checkoutScriptUrl = document.currentScript?.src || window.location.href;
const checkoutApiUrl = new URL('../PHP-TEST/checkout.php', checkoutScriptUrl).pathname;

function formatCurrency(value) {
  return `$${Number(value).toFixed(2)}`;
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
    if (!response.ok) {
      let message = 'Request failed';
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.error) {
          message = parsed.error;
        }
      } catch (error) {
        if (text) message = text;
      }
      throw new Error(message);
    }
    if (!text) return {};
    return JSON.parse(text);
  });
}

const paginationState = {
  currentPage: 1,
  pageSize: 4,
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

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const buttons = [];
  buttons.push(`
    <button type="button" class="pagination-button" ${paginationState.currentPage === 1 ? 'disabled' : ''} data-page="${paginationState.currentPage - 1}">Prev</button>
  `);

  for (let i = 1; i <= totalPages; i += 1) {
    buttons.push(`
      <button type="button" class="pagination-button${paginationState.currentPage === i ? ' active' : ''}" data-page="${i}">${i}</button>
    `);
  }

  buttons.push(`
    <button type="button" class="pagination-button" ${paginationState.currentPage === totalPages ? 'disabled' : ''} data-page="${paginationState.currentPage + 1}">Next</button>
  `);

  pagination.innerHTML = buttons.join('');
  pagination.querySelectorAll('button[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const page = Number(button.getAttribute('data-page'));
      if (!Number.isFinite(page) || page < 1) return;
      const maxPage = Math.max(1, totalPages);
      paginationState.currentPage = Math.min(Math.max(page, 1), maxPage);
      renderCheckoutItems();
      renderPagination();
    });
  });
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
  document.getElementById('summaryDiscount').textContent = formatCurrency(checkoutState.totals.discount);
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
    checkoutState.discountPercent = Number(payload.discountPercent || 0);
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
  const discount = (Number(checkoutState.discountPercent || 0) / 100) * subtotal;
  const tax = Number(((subtotal - discount) * 0.08).toFixed(2));
  const total = Number((subtotal - discount + tax).toFixed(2));
  return { subtotal, discount, tax, total };
}

function disableCheckoutActions() {
  document.getElementById('confirmButton')?.setAttribute('disabled', 'disabled');
  document.getElementById('paymentMethodSelect')?.setAttribute('disabled', 'disabled');
}

function submitCheckout() {
  if (!checkoutState.cart.length) {
    showToast('No items to submit for checkout.', 'danger');
    return;
  }

  const payload = {
    paymentMethod: checkoutState.paymentMethod,
    discountPercent: Number(checkoutState.discountPercent || 0),
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
      sessionStorage.removeItem('posDiscountPercent');
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
  document.getElementById('paymentMethodSelect')?.addEventListener('change', (event) => {
    checkoutState.paymentMethod = event.target.value;
  });

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
