/**
 * MEGA WORST MART — Frontend Application
 * ========================================
 * Every annoyance is a designed joke, never an actual bug.
 * Core flow always works: browse → search → product → cart → checkout → tracking.
 *
 * Console easter egg:
 */
console.log(
  '%c🔥 MEGA WORST MART 🔥\n%cYahan kya dekh raha hai? Code mein bhi bugs hain\n(jhooth, sab sahi hai). 😏',
  'font-size:24px; color:#ff0; background:#000; padding:8px;',
  'font-size:14px; color:#0f0;'
);

// ══════════════════════════════════════════════
// SETUP & UTILITIES
// ══════════════════════════════════════════════
const API = '/api';
const $ = (id) => document.getElementById(id);
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];

// Session ID for guest carts
let sid = localStorage.getItem('sid');
if (!sid) {
  sid = 'sid-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem('sid', sid);
}

// Auth state
let authToken = localStorage.getItem('authToken') || null;
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

// App state
let currentProducts = [];
let currentProductId = null;
let selectedPayment = null;
let appliedCoupon = null;
let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
let soundEnabled = false;
let sahiMode = false;
let newsletterShown = false;
let fakeCloseClicks = 0;
let captchaSolved = false;

// ══════════════════════════════════════════════
// API HELPER
// ══════════════════════════════════════════════
async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json', 'x-session-id': sid };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  try {
    const res = await fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty response */ }
    return { ok: res.ok, status: res.status, ...data };
  } catch (err) {
    return { ok: false, status: 0, success: false, data: null, message: 'Network error: ' + err.message };
  }
}

// ══════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════
function toast(msg, duration = 4000) {
  const t = document.createElement('div');
  t.className = 'toast';
  const text = document.createElement('span');
  text.textContent = msg;
  const close = document.createElement('span');
  close.className = 'toast-close';
  close.textContent = '✕';
  close.onclick = () => t.remove();
  t.append(text, close);
  $('toastBox').appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, duration);
  playSound('pop');
  return t;
}

function toastWithUndo(msg, undoCallback) {
  const t = document.createElement('div');
  t.className = 'toast undo-toast';
  const text = document.createElement('span');
  text.innerHTML = msg + ' <span class="undo-btn">UNDO</span>';
  const close = document.createElement('span');
  close.className = 'toast-close';
  close.textContent = '✕';
  close.onclick = () => t.remove();
  text.querySelector('.undo-btn').onclick = () => { undoCallback(); t.remove(); };
  t.append(text, close);
  $('toastBox').appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 6000);
  return t;
}

// ══════════════════════════════════════════════
// SOUND EFFECTS (muted by default)
// ══════════════════════════════════════════════
const audioCtx = typeof AudioContext !== 'undefined' ? new AudioContext() : null;

function playSound(type) {
  if (!soundEnabled || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.value = 0.08;

  if (type === 'pop') {
    osc.frequency.value = 600;
    osc.type = 'sine';
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.start(); osc.stop(audioCtx.currentTime + 0.15);
  } else if (type === 'success') {
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
  } else if (type === 'error') {
    osc.frequency.value = 200;
    osc.type = 'sawtooth';
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.start(); osc.stop(audioCtx.currentTime + 0.2);
  }
}

$('soundToggle').onclick = () => {
  soundEnabled = !soundEnabled;
  $('soundToggle').textContent = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  toast(soundEnabled ? 'Sound ON! Prepare your ears. 🔊' : 'Sound OFF. Peace restored. 🤫');
};

// ══════════════════════════════════════════════
// NAVIGATION (SPA-style)
// ══════════════════════════════════════════════
const pages = ['Home', 'ProductDetail', 'Cart', 'Checkout', 'OrderConfirmation', 'Tracking', 'Orders', 'Auth', 'Return', 'Terms', 'Privacy', 'Contact', '404'];

function navigateTo(page, params) {
  pages.forEach(p => {
    const el = $('page' + p);
    if (el) el.classList.add('hidden');
  });

  const target = $('page' + page.charAt(0).toUpperCase() + page.slice(1));
  if (target) {
    target.classList.remove('hidden');
    window.scrollTo({ top: 0 });
  } else {
    $('page404').classList.remove('hidden');
  }

  // Page-specific initialization
  if (page === 'home') loadProducts();
  else if (page === 'cart') loadCart();
  else if (page === 'orders') loadOrders();
  else if (page === 'productDetail' && params) loadProductDetail(params);
  else if (page === 'tracking' && params) loadTracking(params);
  else if (page === 'auth') initAuth();
}

// Nav link handlers
document.querySelectorAll('.navLink[data-page]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

// Footer link handlers
document.querySelectorAll('.footer-links a[data-page]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

$('navAuth').addEventListener('click', (e) => {
  e.preventDefault();
  if (authToken && currentUser) {
    if (confirm(`Logout karna hai, ${currentUser.name}? Soch lo, wapas aana padega.`)) {
      authToken = null;
      currentUser = null;
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      updateAuthUI();
      toast('Logout ho gaye. Hum miss karenge. Nahi karenge. 😢');
    }
  } else {
    navigateTo('auth');
  }
});

function updateAuthUI() {
  if (authToken && currentUser) {
    $('navAuth').textContent = `👤 ${currentUser.name}`;
  } else {
    $('navAuth').textContent = '🔐 Login';
  }
}

// ══════════════════════════════════════════════
// FAKE LOADER (reaches 99%, finishes at ~3s)
// ══════════════════════════════════════════════
(function initFakeLoader() {
  const loadingTexts = [
    'Server ko chai pila rahe hain... ☕',
    'Products dhundh rahe hain... 🔍',
    'Database jagaa rahe hain... 😴',
    'Bugs count kar rahe hain... 🐛',
    'Hum bhi wait kar rahe hain... ⏳',
    'Almost there... probably... 🤞',
    'Loading bekaar content... 📦',
  ];

  let pct = 0;
  const timer = setInterval(() => {
    pct = Math.min(99, pct + rand(8, 20));
    $('fakeLoaderBar').style.width = pct + '%';
    $('fakeLoaderText').textContent = pct >= 99 ? pick(loadingTexts) : `Loading... ${pct}%`;
  }, 400);

  // Actually finish after ~3 seconds
  setTimeout(() => {
    clearInterval(timer);
    $('fakeLoaderBar').style.width = '100%';
    $('fakeLoaderText').textContent = 'Chal gaya! 🎉';
    setTimeout(() => {
      $('fakeLoader').classList.add('done');
      setTimeout(() => { $('fakeLoader').style.display = 'none'; }, 500);
    }, 300);
  }, 3000);
})();

// ══════════════════════════════════════════════
// COOKIE BANNER
// ══════════════════════════════════════════════
if (localStorage.getItem('cookieAccepted')) {
  $('cookieBanner').classList.add('hidden');
} else {
  let cookieClicks = 0;
  const closeCookie = () => {
    $('cookieBanner').classList.add('hidden');
    localStorage.setItem('cookieAccepted', 'true');
  };

  $('cookieAccept').onclick = () => {
    cookieClicks++;
    if (cookieClicks === 1) {
      toast('Cookies accept ho gayi. Ek aur baar Accept karo, pakka karne ke liye. 🍪');
    } else {
      closeCookie();
      toast('Ab hum aapko dekh rahe hain. 👀');
    }
  };
  $('cookieAccept2').onclick = () => {
    cookieClicks++;
    if (cookieClicks === 1) {
      toast('"Bhi Accept" dabaya — extra cookies kha li gayi. 🍪🍪');
    } else {
      closeCookie();
      toast('Double accept! Aapki privacy ab hamari hai. Not really. 😈');
    }
  };
  $('cookieReject').onclick = () => {
    closeCookie();
    toast('Sahi mein reject kar diya?! Hum toh shocked hain. 😱 (cookies waise bhi nahi thi)');
  };
}

// ══════════════════════════════════════════════
// SALE COUNTDOWN (resets at 0)
// ══════════════════════════════════════════════
(function initCountdown() {
  let totalSeconds = 36000; // 10:00:00
  function updateTimer() {
    if (totalSeconds <= 0) {
      totalSeconds = 36000; // Reset!
      toast('Sale khatam... NAHI! Wapas shuru! 🎉');
    }
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    $('countdownTimer').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    totalSeconds--;
  }
  updateTimer();
  setInterval(updateTimer, 1000);
})();

// ══════════════════════════════════════════════
// PRODUCTS — Load & Render
// ══════════════════════════════════════════════
async function loadProducts() {
  const search = $('searchInput').value.trim();
  const category = $('categoryFilter').value;
  const sort = $('sortFilter').value;

  let url = `/products?sort=${sort}&limit=24`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (category && category !== 'all') url += `&category=${encodeURIComponent(category)}`;

  const res = await api(url);
  if (res.ok && res.data) {
    currentProducts = res.data.products;
    renderProducts(currentProducts);
    showSearchSuggestion(search);
  } else {
    toast(res.message || 'Products nahi mile. Server so gaya. 😴');
  }
}

function showSearchSuggestion(query) {
  const suggestions = $('searchSuggestion');
  if (!query || Math.random() > 0.4) {
    suggestions.style.display = 'none';
    return;
  }
  const sillySuggestions = [
    `"${query}"? Did you mean: "apni zindagi fix karo"?`,
    `"${query}"? Shayad aap "bekaar cheezein" dhundh rahe the?`,
    `Humne "${query}" ke liye kuch nahi dhundha. Phir bhi results de rahe hain.`,
    `"${query}" se behtar search: "why am I on this website"`,
    `Did you mean: "${query}" lekin better spelling ke saath?`,
  ];
  suggestions.textContent = pick(sillySuggestions);
  suggestions.style.display = 'block';
}

function renderProducts(products) {
  const grid = $('productGrid');
  grid.innerHTML = '';

  if (!products.length) {
    grid.innerHTML = '<p style="color:#fff; font-size:18px; padding:20px;">Kuch nahi mila. Bilkul aapki dating life jaisa. 🕳️</p>';
    return;
  }

  products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'listitem');

    // Anomaly-based display adjustments
    let stockText = `Stock: ${p.stock}`;
    let ratingText = `${'★'.repeat(Math.min(5, Math.floor(p.rating)))}${'☆'.repeat(Math.max(0, 5 - Math.floor(p.rating)))} ${p.rating}/5`;

    if (p.anomaly === 'negative_stock') {
      stockText = `Stock: ${p.stock} (hum bhi confuse hain)`;
    } else if (p.anomaly === 'out_of_stock_still_works') {
      stockText = 'Out of Stock (par Add to Cart chalta hai 🤷)';
    } else if (p.anomaly === 'rating_above_5') {
      ratingText = `${'★'.repeat(5)}✦ ${p.rating}/5 (haan, 5 se zyada)`;
    }

    let priceDisplay = `₹${p.price}`;
    if (p.anomaly === 'random_currency') {
      const currencies = ['$', '¥', '€', '₿', '🌙'];
      priceDisplay = `${pick(currencies)}${p.price} (billed in ₹)`;
    }

    const isWishlisted = wishlist.includes(p.id);

    card.innerHTML = `
      <div class="discount">${p.fakeDiscount}</div>
      <img class="product-image" src="${p.image}" onerror="this.onerror=null; this.src='https://placehold.co/400x400?text=No+Image'" alt="${p.name || 'Product'}" />
      <h3>${p.name}</h3>
      <div class="desc">${p.description.substring(0, 80)}${p.description.length > 80 ? '...' : ''}</div>
      <div class="rating">${ratingText}</div>
      <div class="mrp">MRP: ₹${p.mrp}</div>
      <div class="price">${priceDisplay}</div>
      <div class="stock">${stockText}</div>
      <div class="card-buttons">
        <button class="addToCartBtn" data-id="${p.id}">🛒 Add to Cart</button>
        <button class="wishlist-btn" data-id="${p.id}">${isWishlisted ? '❤️' : '🤍'}</button>
        <button class="viewDetailBtn" data-id="${p.id}">👁️ Details</button>
      </div>
    `;

    // Click card to view detail
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      navigateTo('productDetail', p.id);
    });

    grid.appendChild(card);
  });

  // Attach button handlers
  grid.querySelectorAll('.addToCartBtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(parseInt(btn.dataset.id));
    });
  });

  grid.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(parseInt(btn.dataset.id), btn);
    });
  });

  grid.querySelectorAll('.viewDetailBtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateTo('productDetail', parseInt(btn.dataset.id));
    });
  });
}

// Search handlers
$('searchBtn').onclick = () => loadProducts();
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadProducts(); });
$('categoryFilter').addEventListener('change', () => loadProducts());
$('sortFilter').addEventListener('change', () => loadProducts());

// Load categories into filter
async function loadCategories() {
  const res = await api('/categories');
  if (res.ok && res.data) {
    const select = $('categoryFilter');
    res.data.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });
  }
}

// ══════════════════════════════════════════════
// PRODUCT DETAIL PAGE
// ══════════════════════════════════════════════
async function loadProductDetail(productId) {
  currentProductId = productId;
  const res = await api(`/products/${productId}`);
  if (!res.ok || !res.data) {
    toast(res.message || 'Product nahi mila!');
    navigateTo('home');
    return;
  }

  const p = res.data;
  let stockText = `Stock: ${p.stock}`;
  let ratingText = `${p.rating}/5`;

  if (p.anomaly === 'negative_stock') stockText = `Stock: ${p.stock} (hum bhi confuse hain)`;
  else if (p.anomaly === 'out_of_stock_still_works') stockText = 'Out of Stock (par khareed sakte ho 🤷)';
  if (p.anomaly === 'rating_above_5') ratingText = `${p.rating}/5 (limit kya hoti hai?)`;

  let priceHTML = `₹${p.price}`;
  if (p.anomaly === 'random_currency') {
    const cur = pick(['$', '¥', '€', '₿', '🌙']);
    priceHTML = `${cur}${p.price} <span style="font-size:14px;">(billed in ₹, obviously)</span>`;
  }

  const deliveryDate = p.anomaly === 'delivery_in_past'
    ? 'Delivery: Pichle hafte (time travel included)'
    : `Delivery: ${pick(['3-5 din', 'Jab mood aaye', 'Kal (kal kabhi nahi aata)', 'Mercury retrograde ke baad'])}`;

  let description = p.description;
  if (p.anomaly === 'wrong_language_desc') {
    description += '<br><br><em style="color:#888;">Note: Description galat language mein hai. Hum translate karne mein busy hain. Since 2019.</em>';
  }

  // Price change animation for price_changes anomaly
  if (p.anomaly === 'price_changes') {
    priceHTML += ' <span style="font-size:12px; color:#f66;">(price badal raha hai... 👀)</span>';
  }

  $('productDetail').innerHTML = `
    <img class="detail-image" src="${p.image || `/public_image/${p.id}.webp`}" onerror="this.onerror=null; this.src='https://placehold.co/400x400?text=No+Image'" alt="${p.name || 'Product'}" />
    <h2>${p.name}</h2>
    <div class="detail-mrp">MRP: ₹${p.mrp}</div>
    <div class="detail-price" id="detailPrice">${priceHTML}</div>
    <div class="discount" style="position:static; display:inline-block; margin:8px 0;">${p.fakeDiscount}</div>
    <div class="detail-desc">${description}</div>
    <div class="detail-meta">
      <span>⭐ Rating: ${ratingText}</span>
      <span>📦 ${stockText}</span>
      <span>🚚 ${deliveryDate}</span>
      <span>👁️ ${p.fakeViewers || rand(1000, 9999)} log dekh rahe hain</span>
    </div>
    <div style="margin-top:16px;">
      <button id="detailAddToCart">🛒 Add to Cart</button>
      <button id="detailWishlist">${wishlist.includes(p.id) ? '❤️ Wishlisted' : '🤍 Wishlist'}</button>
    </div>
  `;

  $('detailAddToCart').onclick = () => addToCart(p.id);
  $('detailWishlist').onclick = () => {
    toggleWishlist(p.id);
    $('detailWishlist').textContent = wishlist.includes(p.id) ? '❤️ Wishlisted' : '🤍 Wishlist';
  };

  // Price change animation for price_changes anomaly
  if (p.anomaly === 'price_changes') {
    const priceEl = $('detailPrice');
    const basePr = p.price;
    setInterval(() => {
      if ($('pageProductDetail').classList.contains('hidden')) return;
      const newPrice = Math.round(basePr * (0.85 + Math.random() * 0.30));
      priceEl.innerHTML = `₹${newPrice} <span style="font-size:12px; color:#f66;">(abhi abhi badla 👀)</span>`;
    }, 3000);
  }

  loadReviews(productId);
}

$('backToProducts').onclick = () => navigateTo('home');

// ══════════════════════════════════════════════
// REVIEWS
// ══════════════════════════════════════════════
async function loadReviews(productId) {
  const res = await api(`/reviews/${productId}`);
  const list = $('reviewList');
  list.innerHTML = '';

  if (!res.ok || !res.data || !res.data.length) {
    list.innerHTML = '<p style="color:#999; padding:8px;">Koi review nahi. Pehle aap likho. Hum judge nahi karenge. Shayad karenge.</p>';
    return;
  }

  res.data.forEach(r => {
    const div = document.createElement('div');
    div.className = 'review-item';
    div.innerHTML = `
      <span class="review-author">${r.author}</span>
      <span class="review-rating">${'★'.repeat(Math.round(r.rating))}${'☆'.repeat(5 - Math.round(r.rating))}</span>
      <span class="review-date">${new Date(r.date).toLocaleDateString('hi-IN')}</span>
      <div>${r.text}</div>
    `;
    list.appendChild(div);
  });
}

$('submitReview').onclick = async () => {
  const text = $('reviewText').value.trim();
  if (!text) { toast('Review toh likho! Khaali submit mat karo. 📝'); return; }

  const res = await api('/reviews', 'POST', {
    productId: currentProductId,
    text,
    rating: rand(1, 5),
  });
  toast(res.message || 'Review submit hua!');
  if (res.ok) {
    $('reviewText').value = '';
    loadReviews(currentProductId);
  }
};

// ══════════════════════════════════════════════
// CART
// ══════════════════════════════════════════════
async function addToCart(productId) {
  const res = await api('/cart', 'POST', { productId, qty: 1 });
  toast(res.message || 'Cart mein daala!');
  playSound(res.ok ? 'success' : 'error');

  if (res.ok && res.data && res.data.bonusItem) {
    toastWithUndo(
      `Bonus item "${res.data.bonusItem.name}" bhi add hua!`,
      async () => {
        await api('/cart', 'DELETE', { productId: res.data.bonusItem.productId });
        toast('Bonus item hataya. Party spoiler. 😤');
        updateCartCount();
      }
    );
  }

  updateCartCount();
}

async function updateCartCount() {
  const res = await api('/cart');
  if (res.ok && res.data) {
    $('cartCount').textContent = res.data.count || 0;
  }
}

async function loadCart() {
  const res = await api('/cart');
  const list = $('cartList');
  list.innerHTML = '';

  if (!res.ok || !res.data || !res.data.items || res.data.items.length === 0) {
    list.innerHTML = `
      <div class="cart-empty">
        <div style="font-size:80px;">🛒</div>
        <p>Cart utna hi khaali hai jitna aapka fridge month-end pe.</p>
        <button onclick="navigateTo('home')">🛍️ Shopping Karo</button>
      </div>
    `;
    $('cartSummary').classList.add('hidden');
    $('cartCount').textContent = '0';
    return;
  }

  const items = res.data.items;
  let subtotal = 0;

  items.forEach(c => {
    subtotal += c.product.price * c.qty;
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="cart-item-info">
        <img src="${c.product.image}" onerror="this.onerror=null; this.src='https://placehold.co/100x100?text=Img'" alt="${c.product.name}" class="cart-img" />
        <strong>${c.product.name}</strong>
        <div>₹${c.product.price} × ${c.qty} = ₹${c.product.price * c.qty}</div>
      </div>
      <div class="cart-item-actions">
        <button class="qty-minus" data-id="${c.productId}">−</button>
        <span style="padding:0 8px; color:#ff0;">${c.qty}</span>
        <button class="qty-plus" data-id="${c.productId}">+</button>
        <button class="remove-btn" data-id="${c.productId}">🗑️</button>
      </div>
    `;
    list.appendChild(row);
  });

  // Quantity buttons
  list.querySelectorAll('.qty-minus').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id);
      const item = items.find(i => i.productId === id);
      if (item && item.qty > 1) {
        await api('/cart', 'PATCH', { productId: id, qty: item.qty - 1 });
      } else {
        await api('/cart', 'DELETE', { productId: id });
      }
      loadCart();
    };
  });

  list.querySelectorAll('.qty-plus').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id);
      const item = items.find(i => i.productId === id);
      if (item) {
        await api('/cart', 'PATCH', { productId: id, qty: item.qty + 1 });
        loadCart();
      }
    };
  });

  list.querySelectorAll('.remove-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id);
      const r = await api('/cart', 'DELETE', { productId: id });
      toast(r.message || 'Trying to remove...');
      if (r.ok && r.data && r.data.removed) {
        playSound('success');
      } else {
        playSound('error');
      }
      loadCart();
    };
  });

  // Cart summary with funny fees
  const fees = [
    { name: 'Emotional Damage Fee', amount: Math.round(subtotal * 0.13) },
    { name: 'Thank You Fee', amount: 49 },
    { name: 'Fee for Calculating Fees', amount: 29 },
    { name: 'Tax on Tax', amount: Math.round(subtotal * 0.05) },
    { name: 'Server Chai Fund', amount: 11 },
  ];

  let discount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.type === 'percentage') discount = Math.round(subtotal * appliedCoupon.value / 100);
    else discount = appliedCoupon.value;
  }

  const feesTotal = fees.reduce((s, f) => s + f.amount, 0);
  const total = Math.max(0, subtotal - discount + feesTotal);

  const summary = $('cartSummary');
  summary.classList.remove('hidden');
  summary.innerHTML = `
    <div>Subtotal: ₹${subtotal}</div>
    ${fees.map(f => `<div class="fee-line">+ ${f.name}: ₹${f.amount}</div>`).join('')}
    ${discount > 0 ? `<div style="color:#0f0;">- Coupon Discount: -₹${discount}</div>` : ''}
    <hr style="border-color:#444; margin:8px 0;" />
    <div class="total-line">💰 TOTAL: ₹${total}</div>
  `;

  $('cartCount').textContent = items.reduce((s, i) => s + i.qty, 0);
}

// Coupon handling
$('applyCoupon').onclick = async () => {
  const code = $('couponInput').value.trim();
  if (!code) { toast('Coupon code toh dalo!'); return; }

  const res = await api('/coupons/apply', 'POST', { code });
  const msg = $('couponMsg');

  if (res.ok && res.data) {
    appliedCoupon = res.data;
    msg.className = 'coupon-msg success';
    msg.textContent = `✅ ${res.message}`;
    playSound('success');
    loadCart();
  } else {
    appliedCoupon = null;
    msg.className = 'coupon-msg error';
    msg.textContent = `❌ ${res.message}`;
    playSound('error');
  }
};

$('clearCart').onclick = async () => {
  if (!confirm('Pakka cart saaf karna hai? Soch lo, products ko bura lagega. 😢')) return;
  await api('/cart', 'DELETE');
  appliedCoupon = null;
  $('couponInput').value = '';
  $('couponMsg').textContent = '';
  loadCart();
  toast('Cart saaf ho gaya. Jaise kuch hua hi nahi. 🧹');
};

// ══════════════════════════════════════════════
// CHECKOUT
// ══════════════════════════════════════════════
$('goToCheckout').onclick = () => {
  navigateTo('checkout');
  initCheckout();
};

function initCheckout() {
  // Reset steps
  document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
  $('checkoutStep1').classList.add('active');
  selectedPayment = null;
  $('tncCheckbox').checked = false;
  $('placeOrderBtn').disabled = true;

  // Show T&C skip button after 5 seconds
  $('tncSkipBtn').classList.add('hidden');

  // Payment option selection
  document.querySelectorAll('.payment-option').forEach(opt => {
    opt.classList.remove('selected');
    opt.onclick = () => {
      document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedPayment = opt.dataset.method;
    };
  });
}

$('checkoutNext1').onclick = () => {
  // Validate address
  const name = $('addrName').value.trim();
  const line1 = $('addrLine1').value.trim();
  const city = $('addrCity').value.trim();
  const pincode = $('addrPincode').value.trim();

  if (!name) { toast('Naam toh batao! Hum "Hey you" nahi bol sakte.'); return; }
  if (!line1) { toast('Address do! Hum telepathy se deliver nahi karte. 📦'); return; }
  if (!city) { toast('City batao! Hum GPS se nahi dhundh sakte. 🗺️'); return; }
  if (!pincode || pincode.length < 5) { toast('Pincode sahi dalo. 5-6 digits.'); return; }

  document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
  $('checkoutStep2').classList.add('active');
};

$('checkoutBack2').onclick = () => {
  document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
  $('checkoutStep1').classList.add('active');
};

$('checkoutNext2').onclick = () => {
  if (!selectedPayment) { toast('Payment method chuno! Free mein nahi milega. (Actually free bhi nahi hai.)'); return; }

  document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
  $('checkoutStep3').classList.add('active');

  // Show skip button after 5 seconds
  setTimeout(() => { $('tncSkipBtn').classList.remove('hidden'); }, 5000);
};

$('checkoutBack3').onclick = () => {
  document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
  $('checkoutStep2').classList.add('active');
};

// T&C scroll detection — must scroll to bottom
$('tncScroll').addEventListener('scroll', function () {
  const el = this;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
    $('tncCheckbox').disabled = false;
  }
});

$('tncCheckbox').addEventListener('change', function () {
  $('placeOrderBtn').disabled = !this.checked;
});

$('tncSkipBtn').onclick = () => {
  $('tncCheckbox').checked = true;
  $('tncCheckbox').disabled = false;
  $('placeOrderBtn').disabled = false;
  toast('Bas kar bhai, T&C skip kar diya. 😩');
};

$('placeOrderBtn').onclick = async () => {
  $('placeOrderBtn').disabled = true;
  $('placeOrderBtn').textContent = '⏳ Processing...';

  const address = {
    name: $('addrName').value.trim(),
    line1: $('addrLine1').value.trim(),
    line2: $('addrLine2').value.trim(),
    city: $('addrCity').value.trim(),
    pincode: $('addrPincode').value.trim(),
    firstLove: $('addrFirstLove').value.trim() || 'Nahi bataya 💔',
  };

  const res = await api('/orders', 'POST', {
    address,
    paymentMethod: selectedPayment,
    couponCode: appliedCoupon ? appliedCoupon.code : null,
  });

  if (res.ok && res.data) {
    playSound('success');
    showOrderConfirmation(res.data);
    appliedCoupon = null;
    updateCartCount();
  } else {
    toast(res.message || 'Order fail ho gaya! 😭');
    $('placeOrderBtn').disabled = false;
    $('placeOrderBtn').textContent = '🚀 ORDER PLACE KARO';
    playSound('error');
  }
};

// ══════════════════════════════════════════════
// ORDER CONFIRMATION + CONFETTI
// ══════════════════════════════════════════════
function showOrderConfirmation(order) {
  navigateTo('orderConfirmation');

  const conf = $('orderConfirmation');
  conf.innerHTML = `
    <h2>🎉 ORDER HO GAYA! 🎉</h2>
    <p style="font-size:24px; margin:16px 0;">Order ID: <strong style="color:#ff0;">${order.id}</strong></p>
    <div style="text-align:left; display:inline-block; margin:16px 0;">
      <p>📦 Items: ${order.items.map(i => `${i.name || 'Item'} ×${i.qty}`).join(', ')}</p>
      <p>💵 Subtotal: ₹${order.subtotal}</p>
      ${order.fees.map(f => `<p class="fee-line" style="color:#ff6b6b;">+ ${f.name}: ₹${f.amount}</p>`).join('')}
      ${order.discount > 0 ? `<p style="color:#0f0;">- Discount: -₹${order.discount}</p>` : ''}
      <p style="font-size:22px; color:#0f0; font-weight:bold;">💰 Total: ₹${order.total} (${order.displayCurrency})</p>
      <p>💳 Payment: ${order.paymentMethod}</p>
      <p>🚚 Delivery: ${order.eta}</p>
    </div>
    <div class="fake-notice" style="margin:16px 0;">⚠️ Yeh sab nakli hai. Koi asli order nahi hua. Chill karo.</div>
    <div style="margin-top:16px;">
      <button onclick="navigateTo('tracking', '${order.id}')">📍 Track Order</button>
      <button onclick="navigateTo('home')">🛍️ Aur Kharido</button>
    </div>
  `;

  launchConfetti();
}

function launchConfetti() {
  const canvas = $('confettiCanvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const particles = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    vx: (Math.random() - 0.5) * 6,
    vy: Math.random() * 4 + 2,
    color: pick(['#ff0', '#f0f', '#0ff', '#f00', '#0f0', '#ff6600', '#ff3366']),
    size: rand(4, 10),
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 10,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rotation += p.rotSpeed;
    });
    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ══════════════════════════════════════════════
// ORDER TRACKING
// ══════════════════════════════════════════════
async function loadTracking(orderId) {
  const res = await api(`/orders/${orderId}`);
  const content = $('trackingContent');

  if (!res.ok || !res.data) {
    content.innerHTML = '<p>Order nahi mila. Shayad sapne mein order kiya tha? 😴</p>';
    return;
  }

  const order = res.data;
  const trackingHTML = order.tracking.map((t, i) => `
    <div class="tracking-step ${i < order.tracking.length ? 'done' : ''}">
      <div>
        <div class="step-status">${t.status}</div>
        <div class="step-time">${new Date(t.timestamp).toLocaleString('hi-IN')}</div>
      </div>
    </div>
  `).join('');

  content.innerHTML = `
    <h3 style="color:#ff0;">Order: ${order.id}</h3>
    <p>Status: ${order.status}</p>
    <p>Delivery ETA: ${order.eta}</p>
    <div class="tracking-timeline">${trackingHTML}</div>
    <p style="margin-top:12px;">
      <button onclick="loadTracking('${orderId}')">🔄 Refresh Status</button>
      <button onclick="navigateTo('orders')">📦 All Orders</button>
    </p>
  `;
}

// ══════════════════════════════════════════════
// MY ORDERS
// ══════════════════════════════════════════════
async function loadOrders() {
  const res = await api('/orders');
  const list = $('ordersList');
  list.innerHTML = '';

  if (!res.ok || !res.data || !res.data.length) {
    list.innerHTML = '<p style="color:#888;">Koi order nahi. Kharcha karo thoda. Economy ko support karo. 💸</p>';
    return;
  }

  res.data.forEach(order => {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.innerHTML = `
      <h4>${order.id}</h4>
      <div class="order-meta">
        <span>Items: ${order.items.length}</span> |
        <span>Total: ₹${order.total}</span> |
        <span>Date: ${new Date(order.createdAt).toLocaleDateString('hi-IN')}</span> |
        <span>Status: ${order.status}</span>
      </div>
    `;
    card.onclick = () => navigateTo('tracking', order.id);
    list.appendChild(card);
  });
}

// ══════════════════════════════════════════════
// AUTH — Login / Register with Fake Captcha
// ══════════════════════════════════════════════
function initAuth() {
  $('authMsg').classList.add('hidden');
  captchaSolved = false;
  generateCaptcha();

  // Show skip link after 5 seconds
  $('captchaSkip').style.display = 'none';
  setTimeout(() => { $('captchaSkip').style.display = 'block'; }, 5000);
}

// Auth tabs
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.tab === 'login') {
      $('loginForm').classList.remove('hidden');
      $('registerForm').classList.add('hidden');
    } else {
      $('loginForm').classList.add('hidden');
      $('registerForm').classList.remove('hidden');
    }
  });
});

// Fake captcha: "Select all images that are NOT images" (all are emojis, so all are correct)
function generateCaptcha() {
  const emojis = ['🍕', '🐕', '🎸', '🌮', '🎲', '🦄', '🎯', '🍦', '🚀', '🌈', '🎪', '🦋', '🍩', '🎭', '🌺', '🎵'];
  const grid = $('captchaGrid');
  grid.innerHTML = '';
  const selected = new Set();
  const gridEmojis = [];

  for (let i = 0; i < 8; i++) {
    gridEmojis.push(pick(emojis));
  }

  gridEmojis.forEach((emoji, i) => {
    const cell = document.createElement('div');
    cell.className = 'captcha-cell';
    cell.textContent = emoji;
    cell.setAttribute('role', 'checkbox');
    cell.setAttribute('aria-label', `Select emoji ${emoji}`);
    cell.onclick = () => {
      cell.classList.toggle('selected');
      if (selected.has(i)) selected.delete(i);
      else selected.add(i);

      // Any selection of 3+ solves it (they're all "not images")
      if (selected.size >= 3) {
        captchaSolved = true;
        toast('Captcha solved! Aap insaan nahi hain, par chalega. 🤖✅');
        $('captchaSection').style.opacity = '0.5';
      }
    };
    grid.appendChild(cell);
  });
}

$('captchaSkip').onclick = () => {
  captchaSolved = true;
  toast('Robot ho? Koi baat nahi. Yahan sab welcome hain. 🤖');
  $('captchaSection').style.opacity = '0.5';
};

$('loginBtn').onclick = async () => {
  if (!captchaSolved) { toast('Pehle captcha solve karo! Ya "I\'m a robot" click karo.'); return; }

  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;

  if (!email || !password) { showAuthMsg('Email aur password dono do!', true); return; }

  const res = await api('/auth/login', 'POST', { email, password });
  showAuthMsg(res.message, !res.ok);

  if (res.ok && res.data) {
    authToken = res.data.token;
    currentUser = res.data.user;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateAuthUI();
    playSound('success');
    setTimeout(() => navigateTo('home'), 1000);
  } else {
    playSound('error');
  }
};

$('registerBtn').onclick = async () => {
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const password = $('regPassword').value;

  if (!email || !password) { showAuthMsg('Email aur password chahiye!', true); return; }

  const res = await api('/auth/register', 'POST', { name, email, password });
  showAuthMsg(res.message, !res.ok);

  if (res.ok && res.data) {
    authToken = res.data.token;
    currentUser = res.data.user;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateAuthUI();
    playSound('success');
    setTimeout(() => navigateTo('home'), 1000);
  } else {
    playSound('error');
  }
};

function showAuthMsg(msg, isError) {
  const el = $('authMsg');
  el.classList.remove('hidden');
  el.className = `auth-msg ${isError ? 'error' : 'success'}`;
  el.textContent = msg;
}

// ══════════════════════════════════════════════
// WISHLIST
// ══════════════════════════════════════════════
function toggleWishlist(productId, btnEl) {
  const idx = wishlist.indexOf(productId);
  if (idx >= 0) {
    wishlist.splice(idx, 1);
    toast('Wishlist se hataya. Product dukhi hai. 😢');
    if (btnEl) btnEl.textContent = '🤍';
  } else {
    wishlist.push(productId);
    toast(`Wishlist full hai, par ek aur add kar dete hain. Ab ${wishlist.length} items hain. ❤️`);
    if (btnEl) btnEl.textContent = '❤️';
  }
  localStorage.setItem('wishlist', JSON.stringify(wishlist));
}

// ══════════════════════════════════════════════
// COMPLAINTS
// ══════════════════════════════════════════════
$('submitComplaint').onclick = async () => {
  const text = $('complaintText').value.trim();
  if (!text) { toast('Complaint toh likho!'); return; }

  const res = await api('/complaints', 'POST', { text });
  const msg = $('complaintMsg');
  msg.classList.remove('hidden');
  msg.className = `auth-msg ${res.ok ? 'success' : 'error'}`;
  msg.textContent = res.message || 'Complaint bhej di.';
  if (res.ok) $('complaintText').value = '';
};

// ══════════════════════════════════════════════
// BEKAARBOT CHAT
// ══════════════════════════════════════════════
$('chatHeader').onclick = () => {
  $('chatWidget').classList.toggle('collapsed');
  $('chatToggle').textContent = $('chatWidget').classList.contains('collapsed') ? '▲' : '▼';
};

async function sendChat() {
  const input = $('chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  appendChat(msg, 'user');
  input.value = '';

  const res = await api('/chat', 'POST', { message: msg });
  setTimeout(() => {
    appendChat(res.data ? res.data.reply : (res.message || 'Error. Main bhi confused hoon.'), 'bot');
  }, 500 + rand(200, 800));
}

function appendChat(text, sender) {
  const body = $('chatBody');
  const div = document.createElement('div');
  div.className = `chatMsg ${sender}`;
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

$('chatSend').onclick = sendChat;
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// Initial bot message
setTimeout(() => {
  appendChat('Namaste! Main BekaarBot hoon. Meri advice mat lena. 🤖', 'bot');
}, 4000);

// ══════════════════════════════════════════════
// CHAOS METER
// ══════════════════════════════════════════════
async function updateChaos() {
  const res = await api('/chaos');
  if (res.ok && res.data) {
    $('chaosBarMiniInner').style.width = res.data.chaosLevel + '%';
    $('chaosLevelText').textContent = res.data.chaosLevel + '%';
    $('chaosMeter').title = `Chaos: ${res.data.level}`;
  }
}
setInterval(updateChaos, 10000);

// ══════════════════════════════════════════════
// SOCIAL PROOF TOASTS
// ══════════════════════════════════════════════
const socialProofNames = ['Rahul', 'Priya', 'Amit', 'Neha', 'Vijay', 'Anita', 'Rohit', 'Sneha', 'Deepak', 'Pooja'];
const socialProofCities = ['Patna', 'Mumbai', 'Delhi', 'Jaipur', 'Lucknow', 'Kolkata', 'Chennai', 'Pune', 'Ranchi', 'Bhopal'];

function showSocialProof() {
  if (sahiMode) return;
  if (document.querySelector('.social-proof-toast')) return; // Max 1 at a time

  const product = currentProducts.length ? pick(currentProducts) : null;
  if (!product) return;

  const name = pick(socialProofNames);
  const city = pick(socialProofCities);
  const actions = ['abhi abhi khareed raha hai', 'ne cart mein daala', 'dekh raha hai', 'ne wishlist kiya'];

  const div = document.createElement('div');
  div.className = 'social-proof-toast';
  div.innerHTML = `
    <span>${name} from ${city} ${pick(actions)} "${product.name || 'Product'}" 🔥</span>
    <span class="close-sp">✕</span>
  `;
  div.querySelector('.close-sp').onclick = () => div.remove();
  document.body.appendChild(div);
  setTimeout(() => { if (div.parentNode) div.remove(); }, 8000);
}

setInterval(showSocialProof, 25000);
setTimeout(showSocialProof, 8000);

// ══════════════════════════════════════════════
// VIEWERS COUNTER
// ══════════════════════════════════════════════
setInterval(() => {
  const el = $('viewersCount');
  if (el) {
    const current = parseInt(el.textContent) || 7392;
    el.textContent = current + rand(-50, 80);
  }
}, 5000);

// ══════════════════════════════════════════════
// NEWSLETTER POPUP (once per session)
// ══════════════════════════════════════════════
setTimeout(() => {
  if (newsletterShown || sessionStorage.getItem('newsletterDismissed')) return;
  newsletterShown = true;
  $('newsletterPopup').classList.remove('hidden');
}, 15000);

$('fakeCloseNewsletter').onclick = (e) => {
  e.stopPropagation();
  fakeCloseClicks++;
  if (fakeCloseClicks === 1) {
    toast('Ye X button kaam nahi karta. Try again. 😈');
    $('fakeCloseNewsletter').style.left = rand(10, 80) + '%';
  } else {
    // After 2 clicks, show the real X
    $('fakeCloseNewsletter').style.display = 'none';
    const realX = $('realCloseNewsletter');
    realX.style.display = 'block';
    realX.style.fontSize = '20px';
    realX.style.color = '#f00';
    toast('Ab asli X dikh raha hai. Click karo. 👆');
  }
};

$('realCloseNewsletter').onclick = () => {
  $('newsletterPopup').classList.add('hidden');
  sessionStorage.setItem('newsletterDismissed', 'true');
  toast('Newsletter se bach gaye. Iss baar. 😏');
};

$('newsletterSubmit').onclick = () => {
  $('newsletterPopup').classList.add('hidden');
  sessionStorage.setItem('newsletterDismissed', 'true');
  toast('Subscribe ho gaye! Spam incoming. Just kidding. Ya nahi. 📧');
};

// ══════════════════════════════════════════════
// TAB TITLE CHANGE
// ══════════════════════════════════════════════
const originalTitle = document.title;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    document.title = 'Wapas aao 🥺 | MEGA WORST MART';
  } else {
    document.title = originalTitle;
  }
});

// ══════════════════════════════════════════════
// RUNAWAY BUTTON (only on homepage hero CTA)
// ══════════════════════════════════════════════
(function initRunawayBtn() {
  const btn = $('heroBuyBtn');
  if (!btn) return;
  let dodges = 0;

  btn.addEventListener('mouseenter', () => {
    if (dodges < 3) {
      dodges++;
      btn.style.transform = `translate(${rand(-120, 120)}px, ${rand(-40, 40)}px) rotate(${rand(-20, 20)}deg)`;
      btn.style.transition = 'transform 0.2s';
    }
  });

  btn.addEventListener('click', () => {
    if (dodges < 3) {
      dodges++;
      btn.style.transform = `translate(${rand(-120, 120)}px, ${rand(-40, 40)}px)`;
      return;
    }
    btn.style.transform = 'none';
    dodges = 0;
    navigateTo('home');
    toast('Finally pakad liya! Ab shopping karo. 🛒');
  });
})();

// ══════════════════════════════════════════════
// SCROLL TO TOP (wrong direction joke, then works)
// ══════════════════════════════════════════════
let scrollJokeDone = false;

window.addEventListener('scroll', () => {
  $('scrollTopBtn').style.display = window.scrollY > 400 ? 'block' : 'none';
});

$('scrollTopBtn').onclick = () => {
  if (!scrollJokeDone) {
    // First click: scroll DOWN instead
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    $('scrollTopBtn').textContent = '⬆️';
    toast('Oops, galat direction! Ab sahi chalega. ⬆️');
    scrollJokeDone = true;
  } else {
    // Second click: actually scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('scrollTopBtn').textContent = '⬇️';
    scrollJokeDone = false;
  }
};

// ══════════════════════════════════════════════
// KONAMI CODE: ↑↑↓↓←→←→BA
// ══════════════════════════════════════════════
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
  if (e.key === konamiSequence[konamiIndex]) {
    konamiIndex++;
    if (konamiIndex === konamiSequence.length) {
      konamiIndex = 0;
      activateKonami();
    }
  } else {
    konamiIndex = 0;
  }
});

function activateKonami() {
  toast('🎮 KONAMI CODE ACTIVATED! "Sahi Mode" unlocked! 🎉', 6000);
  playSound('success');

  const flash = document.createElement('div');
  flash.className = 'konami-unlocked';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1500);

  toggleSahiMode();
}

// ══════════════════════════════════════════════
// SAHI MODE (BORING MODE)
// ══════════════════════════════════════════════
$('sahiModeToggle').onclick = () => {
  toggleSahiMode();
};

function toggleSahiMode() {
  sahiMode = !sahiMode;
  document.body.classList.toggle('sahi-mode', sahiMode);
  $('sahiModeToggle').textContent = sahiMode ? '🔧 Bekaar Mode (Fun)' : '🔧 Sahi Mode (Boring)';
  toast(sahiMode ? 'Sahi Mode ON. Boring, par functional. 😐' : 'Bekaar Mode ON! Chaos restored! 🌪️');
}

// ══════════════════════════════════════════════
// FUNNY CONFIRM DIALOGS
// ══════════════════════════════════════════════
// Override used in cart delete - handled inline above

// ══════════════════════════════════════════════
// FUNNY LOADING TEXTS (for any async operations)
// ══════════════════════════════════════════════
const funnyLoadingTexts = [
  'Server ko chai pila rahe hain... ☕',
  'Pigeons se data bhejwa rahe hain... 🐦',
  'Loading... bas 99% aur... 📊',
  'Database ko jagaa rahe hain... 😴',
  'Hamsters ko wheel pe daud rahi hai... 🐹',
  'Bytes count kar rahe hain... 1, 2, skip, 5...',
  'Aapka patience test ho raha hai... ⏳',
];

// ══════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════
(async function init() {
  updateAuthUI();
  await loadCategories();
  await loadProducts();
  updateCartCount();
  updateChaos();

  // Verify auth token if exists
  if (authToken) {
    const res = await api('/auth/me');
    if (!res.ok) {
      authToken = null;
      currentUser = null;
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      updateAuthUI();
    }
  }
})();