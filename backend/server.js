/**
 * MEGA WORST MART — Backend Server
 * =================================
 * The World's Worst E-Commerce Website: hilariously terrible, but functional.
 * The CODE is clean and excellent — every annoyance is a designed joke.
 *
 * Console message for devs:
 * "Yahan kya dekh raha hai? Code mein bhi bugs hain (jhooth, sab sahi hai)."
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'bekaar-mart-super-secret-key-2026-worst-ever';
const JWT_EXPIRY = '7d';
const DATA_DIR = path.join(__dirname, 'data');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// ─────────────────────────────────────────────
// EXPRESS SETUP
// ─────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(FRONTEND_DIR));
app.use('/public_image', express.static(path.join(__dirname, '../public_image')));

// ─────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────

/** Random integer between min and max (inclusive) */
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Pick a random element from an array */
const pick = (arr) => arr[rand(0, arr.length - 1)];

/** Shuffle an array (Fisher-Yates) */
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Hash password with scrypt (Node built-in) */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${key}`;
}

/** Verify password against stored hash */
function verifyPassword(password, stored) {
  const [salt, key] = stored.split(':');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derivedKey, 'hex'));
}

/** Atomic write: write to temp file, then rename */
function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp.' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/** Load a JSON file safely, return fallback if missing or corrupt */
function loadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      atomicWrite(filePath, fallback);
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    atomicWrite(filePath, fallback);
    return fallback;
  }
}

/** Consistent API response format */
function apiResponse(res, statusCode, success, data, message) {
  return res.status(statusCode).json({ success, data, message });
}

/** Generate a unique order ID */
function generateOrderId() {
  return 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + rand(1000, 9999);
}

// Funny Hinglish error messages mapped by type
const funnyErrors = {
  notFound: [
    'Ye cheez exist nahi karti. Jaise aapki productivity.',
    'Dhundh liya? Nahi? Hum bhi nahi dhundh paye. 🔍',
    '404: Item ghar chala gaya. Uska bhi WFH hai.',
  ],
  badInput: [
    'Yeh kya bhej diya? Data nahi, puzzle hai. 🧩',
    'Input galat hai. Bilkul aapke life choices jaisa.',
    'Validation fail. Ek kaam dhang se karo bhai.',
  ],
  unauthorized: [
    'Pehle login karo. Yahan free ka kuch nahi milta. Except bugs.',
    'Authentication fail: aap kaun ho? Hum kaun hain? Existential crisis.',
    'Token expired ya galat. Jaise aapki gym membership.',
  ],
  serverError: [
    'Server ko chai pila rahe hain. Ek minute ruko. ☕',
    'Kuch toot gaya. Hamara server bhi, hamara dil bhi. 💔',
    'Error 500: Server ne strike kar diya. Salary nahi mili.',
  ],
};

// ─────────────────────────────────────────────
// DATA FILES — auto-created if missing
// ─────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const COUPONS_FILE = path.join(DATA_DIR, 'coupons.json');

const productsData = loadJSON(PRODUCTS_FILE, []);
const couponsData = loadJSON(COUPONS_FILE, []);

function loadDB() {
  return loadJSON(DB_FILE, { users: [], orders: [], reviews: [], complaints: [] });
}

function saveDB(db) {
  atomicWrite(DB_FILE, db);
}

// ─────────────────────────────────────────────
// IN-MEMORY STORES (carts, chaos)
// ─────────────────────────────────────────────
const carts = {};          // sessionId -> [{ productId, qty }]
const deleteTries = {};    // "sessionId:productId" -> count
let chaosLevel = 0;

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────

/** Extract session ID from header or generate one */
function getSessionId(req) {
  return req.headers['x-session-id'] || 'anonymous';
}

/** Increment chaos on every API call */
app.use('/api', (req, res, next) => {
  chaosLevel = Math.min(chaosLevel + rand(1, 3), 10000);
  next();
});

/** Auth middleware — attaches req.user if valid token present */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    req.user = null;
    next();
  }
}

/** Require authentication — returns 401 if not logged in */
function requireAuth(req, res, next) {
  if (!req.user) {
    return apiResponse(res, 401, false, null, pick(funnyErrors.unauthorized));
  }
  next();
}

// Apply auth middleware to all API routes
app.use('/api', authMiddleware);

// ─────────────────────────────────────────────
// ROUTES: HEALTH
// ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  apiResponse(res, 200, true, {
    status: 'alive (unfortunately)',
    uptime: process.uptime(),
    chaos: chaosLevel,
    timestamp: new Date().toISOString(),
  }, 'Server zinda hai. Kab tak? Pata nahi.');
});

// ─────────────────────────────────────────────
// ROUTES: PRODUCTS
// ─────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  let { search, category, sort, page, limit } = req.query;

  let results = [...productsData];

  // Search filter
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }

  // Category filter
  if (category && category !== 'all') {
    results = results.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  // Sorting
  switch (sort) {
    case 'price_low':
      results.sort((a, b) => a.price - b.price);
      break;
    case 'price_high':
      results.sort((a, b) => b.price - a.price);
      break;
    case 'name_az':
      results.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name_za':
      results.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'rating':
      results.sort((a, b) => b.rating - a.rating);
      break;
    case 'random':
      results = shuffle(results);
      break;
    default:
      // Default: shuffle for the "terrible" experience
      results = shuffle(results);
  }

  // Pagination
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(50, Math.max(1, parseInt(limit) || 24));
  const startIdx = (page - 1) * limit;
  const paged = results.slice(startIdx, startIdx + limit);
  const total = results.length;

  // Add dynamic price variation (±15%) and anomaly-driven display quirks
  const enriched = paged.map(p => {
    const variation = 0.85 + Math.random() * 0.30; // 0.85 to 1.15
    const displayPrice = Math.round(p.price * variation);
    const fakeDiscount = pick(['90% OFF!', '99% OFF!!', '120% OFF!!!', 'FREE* (*not free)', 'MEGA SALE!', 'LOOT LO']);

    let displayStock = p.stock;
    let displayRating = p.rating;

    // Anomaly-driven display tweaks
    if (p.anomaly === 'negative_stock') {
      displayStock = -rand(1, 10);
    } else if (p.anomaly === 'rating_above_5') {
      displayRating = (5 + Math.random() * 4).toFixed(1);
    } else if (p.anomaly === 'out_of_stock_still_works') {
      displayStock = 0;
    }

    return {
      id: p.id,
      name: p.name,
      price: displayPrice,
      mrp: p.mrp,
      category: p.category,
      image: `/public_image/${p.id}.webp`,
      description: p.description,
      rating: displayRating,
      stock: displayStock,
      anomaly: p.anomaly,
      fakeDiscount,
    };
  });

  apiResponse(res, 200, true, {
    products: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, `${total} products mile. Sab bekaar hain.`);
});

app.get('/api/products/:id', (req, res) => {
  const product = productsData.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    return apiResponse(res, 404, false, null, pick(funnyErrors.notFound));
  }

  // Dynamic price ±15%
  const variation = 0.85 + Math.random() * 0.30;
  const displayPrice = Math.round(product.price * variation);

  let displayStock = product.stock;
  let displayRating = product.rating;

  if (product.anomaly === 'negative_stock') displayStock = -rand(1, 10);
  else if (product.anomaly === 'rating_above_5') displayRating = (5 + Math.random() * 4).toFixed(1);
  else if (product.anomaly === 'out_of_stock_still_works') displayStock = 0;

  const enriched = {
    ...product,
    price: displayPrice,
    rating: displayRating,
    stock: displayStock,
    fakeDiscount: pick(['90% OFF!', '99% OFF!!', '120% OFF!!!', 'FREE* (*not free)']),
    fakeViewers: rand(1000, 9999),
  };

  apiResponse(res, 200, true, enriched, 'Product mil gaya. Ab khareed bhi lo.');
});

// ─────────────────────────────────────────────
// ROUTES: CATEGORIES
// ─────────────────────────────────────────────
app.get('/api/categories', (req, res) => {
  const categories = [...new Set(productsData.map(p => p.category))];
  apiResponse(res, 200, true, categories, 'Categories mil gayi. Sab bekaar hain.');
});

// ─────────────────────────────────────────────
// ROUTES: AUTH
// ─────────────────────────────────────────────
const veggies = ['aloo', 'gobhi', 'bhindi', 'palak', 'tamatar', 'baingan', 'mooli', 'karela'];

app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return apiResponse(res, 400, false, null, 'Email aur password dono chahiye. Dimaag nahi, bas ye.');
  }

  if (typeof email !== 'string' || !email.includes('@') || email.length > 200) {
    return apiResponse(res, 400, false, null, 'Ye email hai ya novel? Sahi email dalo.');
  }

  if (typeof password !== 'string') {
    return apiResponse(res, 400, false, null, 'Password string hona chahiye. Ye kya bhej diya?');
  }

  // Funny password rules
  const rules = [
    [password.length >= 10, 'Password kam se kam 10 characters ka ho. Jitni lambi aapki complaints utna lamba.'],
    [/\p{Extended_Pictographic}/u.test(password), 'Password mein ek emoji zaroor ho. 😎 Bina emoji ke password kya, zindagi kya.'],
    [veggies.some(v => password.toLowerCase().includes(v)), `Password mein kisi sabzi ka naam ho (jaise ${pick(veggies)}). Healthy password.`],
  ];

  const failed = rules.find(([ok]) => !ok);
  if (failed) {
    return apiResponse(res, 400, false, { rules: rules.map(([ok, msg]) => ({ passed: ok, hint: msg })) }, failed[1]);
  }

  const db = loadDB();
  if (db.users.find(u => u.email === email.toLowerCase())) {
    return apiResponse(res, 409, false, null, 'Ye email pehle se hai. Kisi aur ka naam chura ke aaye ho?');
  }

  const user = {
    id: 'user-' + Date.now().toString(36),
    email: email.toLowerCase(),
    name: name || 'Bekaar Customer',
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  db.users.push(user);
  saveDB(db);

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

  apiResponse(res, 201, true, {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  }, 'Account ban gaya! Ab pachtao. 🎊');
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return apiResponse(res, 400, false, null, 'Email aur password dono do. Aise kaise chalega?');
  }

  const db = loadDB();
  const user = db.users.find(u => u.email === email.toLowerCase());

  if (!user) {
    return apiResponse(res, 401, false, null, 'Galat email ya password. Ya dono. Ya aap.');
  }

  try {
    if (!verifyPassword(password, user.passwordHash)) {
      return apiResponse(res, 401, false, null, 'Password galat hai. Yaad karo. Sochna. Concentrate.');
    }
  } catch {
    return apiResponse(res, 401, false, null, 'Password galat hai. Yaad karo. Sochna. Concentrate.');
  }

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

  apiResponse(res, 200, true, {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  }, 'Login ho gaya. Hum bhi hairan hain. 🎉');
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return apiResponse(res, 404, false, null, 'User nahi mila. Shayad delete ho gaya. Ya kabhi tha hi nahi.');
  }
  apiResponse(res, 200, true, {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  }, 'Aap mil gaye. Kaash na milte.');
});

// ─────────────────────────────────────────────
// ROUTES: CART
// ─────────────────────────────────────────────
app.get('/api/cart', (req, res) => {
  const sid = req.user ? req.user.id : getSessionId(req);
  const cart = carts[sid] || [];
  const detailed = cart.map(c => {
    const product = productsData.find(p => p.id === c.productId);
    return { ...c, product: product ? { id: product.id, name: product.name, image: `/public_image/${product.id}.webp`, price: product.price, mrp: product.mrp } : null };
  }).filter(c => c.product);

  const total = detailed.reduce((sum, c) => sum + c.product.price * c.qty, 0);
  apiResponse(res, 200, true, { items: detailed, total, count: detailed.reduce((s, c) => s + c.qty, 0) },
    cart.length ? 'Cart mein sab bekaar hai, bilkul aapki choices jaisa.' : 'Cart khaali hai. Jaise aapka wallet.');
});

app.post('/api/cart', (req, res) => {
  const sid = req.user ? req.user.id : getSessionId(req);
  let { productId, qty = 1 } = req.body;

  productId = parseInt(productId);
  qty = Math.max(1, parseInt(qty) || 1);

  if (!productsData.find(p => p.id === productId)) {
    return apiResponse(res, 404, false, null, pick(funnyErrors.notFound));
  }

  let message = 'Cart mein daal diya. Probably. 🛒';
  let bonusItem = null;

  // 15% chance: add a random extra item (with undo info)
  const product = productsData.find(p => p.id === productId);
  if (product && product.anomaly === 'adds_random_item' && Math.random() < 0.5) {
    const extra = pick(productsData.filter(p => p.id !== productId));
    bonusItem = { productId: extra.id, name: extra.name, image: `/public_image/${extra.id}.webp` };
    carts[sid] = carts[sid] || [];
    const existingExtra = carts[sid].find(c => c.productId === extra.id);
    if (existingExtra) existingExtra.qty += 1;
    else carts[sid].push({ productId: extra.id, qty: 1 });
    message = `Aapne ${product.name || 'product'} liya, humne "${extra.name}" bhi daal diya. Gift samjho. 🎁`;
  }

  carts[sid] = carts[sid] || [];
  const existing = carts[sid].find(c => c.productId === productId);
  if (existing) existing.qty += qty;
  else carts[sid].push({ productId, qty });

  apiResponse(res, 200, true, {
    cartSize: carts[sid].reduce((s, c) => s + c.qty, 0),
    bonusItem,
  }, message);
});

app.patch('/api/cart', (req, res) => {
  const sid = req.user ? req.user.id : getSessionId(req);
  const { productId, qty } = req.body;
  const pid = parseInt(productId);
  const newQty = parseInt(qty);

  if (!pid || isNaN(newQty) || newQty < 0) {
    return apiResponse(res, 400, false, null, pick(funnyErrors.badInput));
  }

  carts[sid] = carts[sid] || [];
  if (newQty === 0) {
    carts[sid] = carts[sid].filter(c => c.productId !== pid);
    return apiResponse(res, 200, true, null, 'Item hataya. Usne aapko maaf nahi kiya. 😢');
  }

  const item = carts[sid].find(c => c.productId === pid);
  if (item) {
    item.qty = newQty;
    apiResponse(res, 200, true, null, `Quantity ${newQty} kar di. Kyun? Pata nahi. Par kar di.`);
  } else {
    apiResponse(res, 404, false, null, 'Ye item cart mein hai hi nahi. Pehle daalo toh sahi.');
  }
});

app.delete('/api/cart', (req, res) => {
  const sid = req.user ? req.user.id : getSessionId(req);
  const { productId } = req.body || {};

  if (productId) {
    const pid = parseInt(productId);
    const key = `${sid}:${pid}`;
    deleteTries[key] = (deleteTries[key] || 0) + 1;

    const excuses = [
      'Item remove nahi hona chahta. Usne aapse attachment kar liya hai. 💔',
      'Error 418: Main teapot hoon, delete nahi kar sakta. ☕',
      'Item ne kaha: "Pehle mujhse baat karo." 🗣️',
    ];

    if (deleteTries[key] < 3) {
      return apiResponse(res, 200, true, { removed: false, tries: deleteTries[key], maxTries: 3 },
        `${pick(excuses)} (Try ${deleteTries[key]}/3)`);
    }

    carts[sid] = (carts[sid] || []).filter(c => c.productId !== pid);
    deleteTries[key] = 0;
    return apiResponse(res, 200, true, { removed: true }, 'Item gaya. Usne aapko maaf nahi kiya. 😢');
  }

  // Clear entire cart
  carts[sid] = [];
  apiResponse(res, 200, true, null, 'Cart saaf. Jaise kuch hua hi nahi. 🧹');
});

// ─────────────────────────────────────────────
// ROUTES: COUPONS
// ─────────────────────────────────────────────
app.post('/api/coupons/apply', (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return apiResponse(res, 400, false, null, 'Coupon code toh dalo. Khali haath kya aaye ho?');
  }

  const coupon = couponsData.find(c => c.code === code.toUpperCase().trim());

  if (!coupon) {
    return apiResponse(res, 404, false, null, `"${code}" kya hai? Humne toh ye coupon kabhi banaya hi nahi. 🤷`);
  }

  if (!coupon.active) {
    return apiResponse(res, 400, false, null, `Coupon "${code}" expire ho chuka hai. 2020 mein chalata toh accha hota. Time travel karo. ⏰`);
  }

  apiResponse(res, 200, true, {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    description: coupon.description,
  }, `Coupon laga diya! ${coupon.description}`);
});

// ─────────────────────────────────────────────
// ROUTES: ORDERS
// ─────────────────────────────────────────────
app.post('/api/orders', (req, res) => {
  const sid = req.user ? req.user.id : getSessionId(req);
  const cart = carts[sid] || [];
  const { address, paymentMethod, couponCode } = req.body;

  if (cart.length === 0) {
    return apiResponse(res, 400, false, null, 'Cart utna hi khaali hai jitne aapke vaade. 🛒');
  }

  if (!address || typeof address !== 'object' || !address.name || !address.line1 || !address.city || !address.pincode) {
    return apiResponse(res, 400, false, null, 'Address toh do. Hum telepathy se deliver nahi karte. 📦');
  }

  // Calculate subtotal
  const orderItems = cart.map(c => {
    const product = productsData.find(p => p.id === c.productId);
    return {
      productId: c.productId,
      name: product ? product.name : 'Unknown Bekaar Item',
      image: product ? `/public_image/${product.id}.webp` : '',
      qty: c.qty,
      price: product ? product.price : 0,
      lineTotal: product ? product.price * c.qty : 0,
    };
  });

  let subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);

  // Apply coupon if provided
  let discount = 0;
  let couponApplied = null;
  if (couponCode) {
    const coupon = couponsData.find(c => c.code === couponCode.toUpperCase().trim() && c.active);
    if (coupon) {
      if (coupon.type === 'percentage') {
        discount = Math.round(subtotal * coupon.value / 100);
      } else {
        discount = coupon.value;
      }
      couponApplied = coupon.code;
    }
  }

  // Funny fees
  const fees = [
    { name: 'Emotional Damage Fee', amount: Math.round(subtotal * 0.13) },
    { name: 'Thank You Fee', amount: 49 },
    { name: 'Fee for Calculating Fees', amount: 29 },
    { name: 'Tax on Tax', amount: Math.round(subtotal * 0.05) },
    { name: 'Server Chai Fund', amount: 11 },
  ];

  const feesTotal = fees.reduce((s, f) => s + f.amount, 0);
  const total = Math.max(0, subtotal - discount + feesTotal);

  // Reduce stock (never below a joke-level minimum)
  cart.forEach(c => {
    const product = productsData.find(p => p.id === c.productId);
    if (product && typeof product.stock === 'number' && product.stock > 0) {
      product.stock = Math.max(0, product.stock - c.qty);
    }
  });
  atomicWrite(PRODUCTS_FILE, productsData);

  // Tracking statuses with funny progression
  const trackingStatuses = [
    { status: 'Order liya ✅', timestamp: new Date().toISOString() },
  ];

  const order = {
    id: generateOrderId(),
    userId: req.user ? req.user.id : sid,
    items: orderItems,
    address,
    paymentMethod: paymentMethod || 'Dil se payment',
    subtotal,
    discount,
    couponApplied,
    fees,
    feesTotal,
    total,
    currency: 'INR',
    displayCurrency: pick(['Moon Rupees 🌙', 'Dogecoin 🐕', 'Monopoly Money 🎲', 'Exposure Bucks 📸']),
    eta: pick(['Pichle hafte', '3 din ya 3 saal', 'Jab mood aayega', 'Mercury retrograde ke baad', 'Kal (kal kabhi nahi aata)']),
    tracking: trackingStatuses,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };

  const db = loadDB();
  db.orders.push(order);
  saveDB(db);

  // Clear cart after successful order
  carts[sid] = [];

  apiResponse(res, 201, true, order, 'Order ho gaya! 🎉 Confetti barsa lo. Delivery? Inshallah.');
});

app.get('/api/orders', (req, res) => {
  const sid = req.user ? req.user.id : getSessionId(req);
  const db = loadDB();
  const userOrders = db.orders
    .filter(o => o.userId === sid || o.userId === (req.user && req.user.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  apiResponse(res, 200, true, userOrders,
    userOrders.length ? `${userOrders.length} orders mile. Sab yaad hai humko.` : 'Koi order nahi. Kharcha karo thoda.');
});

app.get('/api/orders/:id', (req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) {
    return apiResponse(res, 404, false, null, 'Order nahi mila. Shayad sapne mein order kiya tha?');
  }

  // Auto-progress tracking statuses based on time elapsed
  const elapsed = (Date.now() - new Date(order.createdAt).getTime()) / 1000;
  const allStatuses = [
    { status: 'Order liya ✅', delay: 0 },
    { status: 'Bhool gaye 🤔', delay: 30 },
    { status: 'Yaad aaya 💡', delay: 60 },
    { status: 'Packing ho raha hai 📦', delay: 120 },
    { status: 'Rasta bhatak gaya 🗺️', delay: 180 },
    { status: 'GPS ne dhoka diya 📍', delay: 240 },
    { status: 'Delivery boy chai pe ruka ☕', delay: 300 },
    { status: 'Almost there... shayad 🤞', delay: 360 },
    { status: 'Delivered? 📬', delay: 420 },
  ];

  const currentTracking = allStatuses
    .filter(s => elapsed >= s.delay)
    .map(s => ({
      status: s.status,
      timestamp: new Date(new Date(order.createdAt).getTime() + s.delay * 1000).toISOString(),
    }));

  order.tracking = currentTracking;

  apiResponse(res, 200, true, order, 'Order ka haal-chaal batate hain.');
});

// ─────────────────────────────────────────────
// ROUTES: REVIEWS
// ─────────────────────────────────────────────
app.get('/api/reviews/:productId', (req, res) => {
  const pid = parseInt(req.params.productId);
  const db = loadDB();
  const reviews = db.reviews.filter(r => r.productId === pid);

  apiResponse(res, 200, true, reviews,
    reviews.length ? `${reviews.length} reviews mile. Sab satya hain. Shayad.` : 'Koi review nahi. Pehle aap likho.');
});

app.post('/api/reviews', (req, res) => {
  const { productId, text, rating } = req.body;
  const pid = parseInt(productId);

  if (!pid || !productsData.find(p => p.id === pid)) {
    return apiResponse(res, 404, false, null, pick(funnyErrors.notFound));
  }

  if (!text || typeof text !== 'string' || text.trim().length < 3) {
    return apiResponse(res, 400, false, null, 'Khaali review? Bilkul hamari service jaisa. Kam se kam 3 characters likho.');
  }

  if (text.length > 1000) {
    return apiResponse(res, 400, false, null, 'Itna lamba review? Novel likh rahe ho? 1000 characters max.');
  }

  const db = loadDB();
  const review = {
    id: 'rev-' + Date.now().toString(36),
    productId: pid,
    text: text.trim(),
    rating: Math.min(5, Math.max(0, parseFloat(rating) || 3)),
    author: req.user ? req.user.name : 'Anonymous Sufferer',
    date: new Date().toISOString(),
  };

  db.reviews.push(review);
  saveDB(db);

  apiResponse(res, 201, true, review, 'Review mil gaya. Hum ise padhenge. Shayad. Ulta.');
});

// ─────────────────────────────────────────────
// ROUTES: COMPLAINTS
// ─────────────────────────────────────────────
app.post('/api/complaints', (req, res) => {
  const { text, email } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length < 5) {
    return apiResponse(res, 400, false, null, 'Complaint toh likho. 5 characters minimum. Hum padh toh nahi rahe, par file toh karo.');
  }

  const db = loadDB();
  const complaint = {
    id: 'cmp-' + Date.now().toString(36),
    text: text.trim(),
    email: email || (req.user ? req.user.email : 'anonymous@bekaar.com'),
    status: 'Ignored with love ❤️',
    createdAt: new Date().toISOString(),
  };

  db.complaints.push(complaint);
  saveDB(db);

  apiResponse(res, 201, true, { id: complaint.id },
    'Complaint register ho gayi! Hum ise ignore karenge pyaar se. ❤️ Ticket: ' + complaint.id);
});

// ─────────────────────────────────────────────
// ROUTES: BEKAARBOT CHAT
// ─────────────────────────────────────────────
const botResponses = {
  greetings: [
    'Namaste! Main BekaarBot hoon. Meri advice mat lena. 🤖',
    'Hello! Kya madad chahiye? (Madad milegi nahi, par pooch lo) 👋',
    'Aadaab! Kaise barbaad kar sakta hoon aapka din? 🙏',
  ],
  order: [
    'Order track karne ke liye "My Orders" section dekho. Wahan sab milega... shayad.',
    'Aapka order aa raha hai. Kab? Yeh toh delivery boy ko bhi nahi pata. 📦',
  ],
  coupon: [
    'Coupon codes try karo: BEKAAR50, SIRFAAJ, NAHICHALEGA. EXPIRED2020 bhi try karo, maza aayega.',
    'BEKAAR50 se 50% off milega. Actually milega. Sach mein. We\'re surprised too.',
  ],
  checkout: [
    'Checkout karne ke liye: Cart mein jaao → Address do → Payment method chuno → Done!',
    'Payment options: Cash on Delivery, Dil se Payment, ya Kal kar denge. Sab kaam karte hain.',
  ],
  return: [
    'Return policy: Return nahi hoga. Refund bhi nahi. Bas pyaar milega. ❤️',
    'Refund chahiye? Haha. Hahahaha. HAHAHAHA. No.',
  ],
  random: [
    'Kya aapne aaj subah apni chai mein shakkar daali? Galat kiya. Namak daalo. 🧂',
    'Mera suggestion: is website se kuch mat kharido. Par kharido toh maza aayega. 😈',
    'Aap bohot acche insaan ho. Website bekaar hai, aap nahi. ❤️',
    'Fun fact: yeh website 100% bugs se bani hai. Lekin woh bugs features hain. 🐛',
    'Aapka din kaisa hai? Mera toh bekaar hai. Main ek chatbot hoon. 🤖',
    'Tip: Konami code try karo (↑↑↓↓←→←→BA). Kuch hoga. Ya nahi hoga.',
    'Is website ko 5 star rating do. Kyun? Kyunki 7.2/5 already hai. 🌟',
    'Aaj ka gyan: Jo dikhta hai woh bikta hai. Yahan kuch dikhta nahi, phir bhi bikta hai.',
  ],
};

app.post('/api/chat', (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return apiResponse(res, 400, false, null, 'Kuch toh bolo. Khamoshi se kaam nahi chalta. 🤫');
  }

  const msg = message.toLowerCase().trim();
  let reply;

  if (msg.includes('hello') || msg.includes('hi') || msg.includes('namaste') || msg.includes('hey')) {
    reply = pick(botResponses.greetings);
  } else if (msg.includes('order') || msg.includes('track') || msg.includes('delivery') || msg.includes('kahan')) {
    reply = pick(botResponses.order);
  } else if (msg.includes('coupon') || msg.includes('code') || msg.includes('discount') || msg.includes('offer')) {
    reply = pick(botResponses.coupon);
  } else if (msg.includes('checkout') || msg.includes('pay') || msg.includes('buy') || msg.includes('khareed')) {
    reply = pick(botResponses.checkout);
  } else if (msg.includes('return') || msg.includes('refund') || msg.includes('cancel') || msg.includes('wapas')) {
    reply = pick(botResponses.return);
  } else {
    reply = pick(botResponses.random);
  }

  apiResponse(res, 200, true, { reply }, reply);
});

// ─────────────────────────────────────────────
// ROUTES: CHAOS METER
// ─────────────────────────────────────────────
app.get('/api/chaos', (req, res) => {
  const pct = Math.min(100, Math.round((chaosLevel / 500) * 100));
  let levelName;
  if (pct < 15) levelName = 'Suspiciously Calm 😇';
  else if (pct < 30) levelName = 'Thoda Weird 🤨';
  else if (pct < 50) levelName = 'Mildly Cursed 👹';
  else if (pct < 70) levelName = 'Bohot Garbar 🔥';
  else if (pct < 90) levelName = 'Total Mayhem 💀';
  else levelName = 'ENTROPY ACHIEVED 🌌';

  apiResponse(res, 200, true, { chaosLevel: pct, level: levelName }, `Chaos: ${pct}%`);
});

// ─────────────────────────────────────────────
// SPA FALLBACK — serve index.html for all non-API routes
// ─────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return apiResponse(res, 404, false, null, 'API route nahi mila. Jaise aapka career path. 🤷');
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ─────────────────────────────────────────────
// CENTRAL ERROR HANDLER
// ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('💥 Error:', err.message);
  apiResponse(res, 500, false, null, pick(funnyErrors.serverError));
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🔥 MEGA WORST MART running on http://localhost:${PORT}`);
  console.log(`📦 Products: ${productsData.length}`);
  console.log(`🏷️  Coupons: ${couponsData.length}`);
  console.log(`\nYahan kya dekh raha hai? Code mein bhi bugs hain (jhooth, sab sahi hai). 😏\n`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${PORT} is already in use.`);
    console.error(`To fix this in PowerShell, run:`);
    console.error(`  Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`);
    console.error(`Then restart the server.\n`);
    process.exit(1);
  }
});