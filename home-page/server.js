const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { MongoClient, ObjectId } = require('mongodb');
const { db, initDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB = process.env.MONGO_DB || 'pos_system';
const MONGO_ENABLED = process.env.MONGO_ENABLED === 'true' || process.env.MONGO_URI;
const PHP_TEST_ROOT = path.resolve(__dirname, '..', 'PHP-TEST');
const PHP_BRIDGE_ROOT = path.resolve(__dirname, '..', 'php-bridge');
const PHP_BOOTSTRAP_PATH = path.join(PHP_BRIDGE_ROOT, 'bootstrap.php');

function ensurePhpBootstrapFile() {
  fs.mkdirSync(PHP_BRIDGE_ROOT, { recursive: true });

  if (!fs.existsSync(PHP_BOOTSTRAP_PATH) || fs.statSync(PHP_BOOTSTRAP_PATH).size === 0) {
    const bootstrapContent = `<?php
class PhpCliInputStream {
  private static $data = '';
  private static $position = 0;

  public static function setData($data) {
    self::$data = (string) $data;
    self::$position = 0;
  }

  public function stream_open($path, $mode, $options, &$opened_path) {
    return true;
  }

  public function stream_read($count) {
    $chunk = substr(self::$data, self::$position, $count);
    self::$position += strlen($chunk);
    return $chunk;
  }

  public function stream_eof() {
    return self::$position >= strlen(self::$data);
  }

  public function stream_stat() {
    return [];
  }

  public function stream_seek($offset, $whence) {
    if ($whence === SEEK_SET) {
      self::$position = $offset;
    } elseif ($whence === SEEK_CUR) {
      self::$position += $offset;
    } elseif ($whence === SEEK_END) {
      self::$position = strlen(self::$data) + $offset;
    } else {
      return false;
    }
    return true;
  }

  public function stream_tell() {
    return self::$position;
  }

  public function stream_write($data) {
    return 0;
  }

  public function stream_flush() {
    return true;
  }
}

$rawBody = getenv('PHP_CLI_INPUT_BODY');
if ($rawBody !== false) {
  PhpCliInputStream::setData($rawBody);
  stream_wrapper_unregister('php');
  stream_wrapper_register('php', 'PhpCliInputStream');
}

$_SERVER['REQUEST_METHOD'] = getenv('REQUEST_METHOD') ?: 'GET';
$_SERVER['REQUEST_URI'] = getenv('REQUEST_URI') ?: '/';
$_SERVER['QUERY_STRING'] = getenv('QUERY_STRING') ?: '';
$_SERVER['CONTENT_TYPE'] = getenv('CONTENT_TYPE') ?: '';
$_SERVER['CONTENT_LENGTH'] = getenv('CONTENT_LENGTH') ?: '';
$_SERVER['PHP_SELF'] = $_SERVER['REQUEST_URI'];
$_SERVER['SCRIPT_NAME'] = $_SERVER['REQUEST_URI'];
$_SERVER['SCRIPT_FILENAME'] = $_SERVER['REQUEST_URI'];

$_GET = [];
if ($_SERVER['QUERY_STRING'] !== '') {
  parse_str($_SERVER['QUERY_STRING'], $_GET);
}

$_POST = [];
if ($rawBody !== false && $rawBody !== '') {
  $contentType = strtolower((string) $_SERVER['CONTENT_TYPE']);
  if (str_contains($contentType, 'application/json')) {
    $decodedJson = json_decode($rawBody, true);
    if (is_array($decodedJson)) {
      $_POST = $decodedJson;
    }
  } elseif (str_contains($contentType, 'application/x-www-form-urlencoded')) {
    parse_str($rawBody, $_POST);
  }
}

$_REQUEST = array_merge($_GET, $_POST);
?>`;

    fs.writeFileSync(PHP_BOOTSTRAP_PATH, bootstrapContent, 'utf8');
    console.log(`[php-bridge] Created bootstrap file at ${PHP_BOOTSTRAP_PATH}`);
  }

  return PHP_BOOTSTRAP_PATH;
}

ensurePhpBootstrapFile();

function phpCliMiddleware(req, res, next) {
  let requestTarget = '';
  try {
    requestTarget = decodeURIComponent(req.originalUrl || req.url || req.path || '/');
  } catch (error) {
    return res.status(400).json({ error: 'Invalid request URL' });
  }

  const queryIndex = requestTarget.indexOf('?');
  const pathname = queryIndex >= 0 ? requestTarget.slice(0, queryIndex) : requestTarget;
  const rawPathWithoutQuery = pathname.split('?')[0];
  const hasDotSegments = rawPathWithoutQuery.includes('/../') || rawPathWithoutQuery === '/..' || rawPathWithoutQuery.startsWith('../') || rawPathWithoutQuery.includes('..\\');
  if (hasDotSegments) {
    return res.status(400).json({ error: 'Invalid PHP script path' });
  }

  if (!pathname.startsWith('/PHP-TEST/')) {
    return next();
  }

  const relativePath = pathname.replace(/^\/PHP-TEST\//, '').replace(/^\/+/, '');

  if (!relativePath.endsWith('.php')) {
    return next();
  }

  const requestedPath = path.resolve(PHP_TEST_ROOT, relativePath);
  const relativeToRoot = path.relative(PHP_TEST_ROOT, requestedPath);
  const isSafePath = relativeToRoot === '' || (!relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot));

  if (!isSafePath || path.extname(requestedPath).toLowerCase() !== '.php') {
    return res.status(400).json({ error: 'Invalid PHP script path' });
  }

  if (!fs.existsSync(requestedPath) || !fs.statSync(requestedPath).isFile()) {
    return res.status(404).json({ error: 'PHP script not found' });
  }

  const chunks = [];
  const queryString = queryIndex >= 0 ? requestTarget.slice(queryIndex + 1) : '';

  req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const bootstrapPath = ensurePhpBootstrapFile();

    if (!fs.existsSync(bootstrapPath) || !fs.statSync(bootstrapPath).isFile()) {
      console.error(`[php-bridge] Bootstrap file missing at ${bootstrapPath}`);
      return res.status(500).json({ error: 'PHP bridge bootstrap is missing', details: `Expected bootstrap file at ${bootstrapPath}` });
    }

    const env = {
      ...process.env,
      REQUEST_METHOD: req.method,
      CONTENT_TYPE: req.headers['content-type'] || '',
      CONTENT_LENGTH: String(body.length),
      QUERY_STRING: queryString,
      REQUEST_URI: requestTarget,
      PHP_CLI_INPUT_BODY: body.toString('utf8')
    };

    let settled = false;
    const finishWithError = (statusCode, payload) => {
      if (settled) return;
      settled = true;
      return res.status(statusCode).json(payload);
    };

    const child = spawn('php', ['-d', `auto_prepend_file=${bootstrapPath}`, requestedPath], {
      cwd: PHP_TEST_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdin.write(body);
    child.stdin.end();

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      console.error('[php-bridge] PHP CLI spawn failed:', error.message);
      return finishWithError(500, { error: 'PHP execution failed', details: error.message });
    });

    child.on('close', (code) => {
      if (settled) return;

      if (code !== 0) {
        const phpDetails = stderr.trim() || `PHP exited with code ${code}`;
        console.error(`[php-bridge] PHP script failed (${code}):`, phpDetails);
        return finishWithError(500, { error: 'PHP script failed', details: phpDetails });
      }

      const output = stdout.trim();
      if (/^HTTP\/[0-9.]+\s+[0-9]{3}/i.test(output) || /^Status:\s+/i.test(output)) {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        settled = true;
        return res.send(output);
      }

      res.set('Content-Type', 'application/json');
      settled = true;
      return res.send(output || '{}');
    });
  });

  req.on('error', (error) => {
    console.error('Request stream error:', error.message);
    return res.status(400).json({ error: 'Request stream error' });
  });
}

function normalizeRoleValue(role, fallback = 'cashier') {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return fallback;
  if (['superadmin', 'super admin', 'super_admin', 'super-admin'].includes(value)) return 'super-admin';
  if (['administrator', 'admin'].includes(value)) return 'admin';
  if (['manager'].includes(value)) return 'manager';
  return value === 'cashier' ? 'cashier' : fallback;
}

let mongoClient = null;
let mongoDb = null;

async function connectMongo() {
  if (!MONGO_ENABLED) return;
  try {
    mongoClient = await MongoClient.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    mongoDb = mongoClient.db(MONGO_DB);
    console.log(`MongoDB connected to ${MONGO_URI}/${MONGO_DB}`);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    mongoClient = null;
    mongoDb = null;
  }
}

connectMongo();

async function initializeDatabase() {
  try {
    await initDatabase();
  } catch (error) {
    console.error('Database initialization failed:', error.message);
  }
}

initializeDatabase();

app.use(phpCliMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
  return res.redirect('/login-page/login.html');
});
app.get('/home-page', (req, res) => {
  return res.redirect('/home-page/index.html');
});
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, x-pos-pin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
// SECURITY: Deny-list middleware runs BEFORE static serving to block sensitive files.
// This prevents clients from downloading .env, package.json, server.js, db.js, PHP source, etc.
const SENSITIVE_PATTERNS = [
  '/.env', '/package.json', '/package-lock.json', '/server.js',
  '/auth-api.js', '/theme-utils.js', '/render.yaml',
  '/php-bridge/', '/PHP-TEST/', '/tests/',
  '/home-page/server.js', '/home-page/db.js',
  '/home-page/.env',
];
app.use((req, res, next) => {
  const lowerPath = req.path.toLowerCase();
  for (const pattern of SENSITIVE_PATTERNS) {
    if (lowerPath.startsWith(pattern)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  next();
});

// SECURITY: Serve only specific public directories — NOT the entire project root.
// This prevents clients from downloading .env, package.json, server.js, db.js, PHP source, etc.
const PUBLIC_DIRS = [
  { mount: '/home-page', dir: path.join(__dirname) },
  { mount: '/login-page', dir: path.join(__dirname, '..', 'login-page') },
  { mount: '/register-page', dir: path.join(__dirname, '..', 'register-page') },
  { mount: '/New_Index', dir: path.join(__dirname, '..', 'New_Index') },
  { mount: '/images', dir: path.join(__dirname, '..', 'images') },
];
for (const { mount, dir } of PUBLIC_DIRS) {
  app.use(mount, express.static(dir, { dotfiles: 'deny' }));
}
// Serve only root-level public files (index.html, 404.html) explicitly — no subdirectories.
app.use(express.static(path.join(__dirname, '..'), {
  dotfiles: 'deny',
  index: false,
}));

// Simple PIN-based middleware for protected routes
const POS_PIN = process.env.POS_PIN || '1234';
function checkAuth(req, res, next) {
  const pin = String(req.headers['x-pos-pin'] || '');
  if (pin !== POS_PIN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/scanner-socket' });
const scannerSessions = new Map();

function getScannerSession(sessionId) {
  if (!scannerSessions.has(sessionId)) {
    scannerSessions.set(sessionId, { posClient: null, phoneClient: null });
  }
  return scannerSessions.get(sessionId);
}

function sendJson(socket, data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(data));
}

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const role = params.get('role');
  const sessionId = params.get('sessionId');

  if (!sessionId || !['pos', 'phone'].includes(role)) {
    ws.close(1008, 'Invalid session or role');
    return;
  }

  const session = getScannerSession(sessionId);
  const peer = role === 'pos' ? 'posClient' : 'phoneClient';
  // If there's an existing open socket for this role, close it to avoid
  // silently overwriting connections (e.g., multiple tabs with same sessionId)
  if (session[peer] && session[peer].readyState === WebSocket.OPEN) {
    try {
      session[peer].close(1000, 'Replaced by new connection');
    } catch (closeErr) {
      // ignore errors when closing the old socket
    }
  }
  session[peer] = ws;

  if (role === 'pos') {
    sendJson(ws, { type: 'status', status: 'pos-connected' });
    if (session.phoneClient && session.phoneClient.readyState === WebSocket.OPEN) {
      sendJson(ws, { type: 'device-status', status: 'phone-connected' });
      sendJson(session.phoneClient, { type: 'pos-status', status: 'connected' });
    }
  } else {
    sendJson(ws, { type: 'status', status: 'phone-connected' });
    if (session.posClient && session.posClient.readyState === WebSocket.OPEN) {
      sendJson(session.posClient, { type: 'device-status', status: 'phone-connected' });
      sendJson(ws, { type: 'pos-status', status: 'connected' });
    }
  }

  ws.on('message', (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch (error) {
      return;
    }

    if (message.type === 'barcode' && role === 'phone') {
      if (session.posClient && session.posClient.readyState === WebSocket.OPEN) {
        sendJson(session.posClient, { type: 'barcode', barcode: String(message.barcode || '').trim() });
        sendJson(ws, { type: 'scan-ack', barcode: message.barcode });
      }
    }
  });

  ws.on('close', () => {
    if (role === 'pos') {
      session.posClient = null;
      if (session.phoneClient && session.phoneClient.readyState === WebSocket.OPEN) {
        sendJson(session.phoneClient, { type: 'pos-status', status: 'disconnected' });
      }
    } else {
      session.phoneClient = null;
      if (session.posClient && session.posClient.readyState === WebSocket.OPEN) {
        sendJson(session.posClient, { type: 'device-status', status: 'phone-disconnected' });
      }
    }
  });
});

app.get('/api/dashboard/summary', checkAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [revenueRow] = await db.all('SELECT COALESCE(SUM(total), 0) AS todayRevenue FROM transactions WHERE DATE(created_at) = ?', [today]);
    const [flagRow] = await db.all('SELECT COUNT(*) AS flaggedTransactions FROM transactions WHERE LOWER(payment_method) = "flagged"');
    const [stockRow] = await db.all('SELECT COUNT(*) AS lowStockItems FROM products WHERE stock > 0 AND stock <= 10');
    const [userRow] = await db.all(`SELECT COUNT(*) AS totalUsers,
      SUM(CASE WHEN LOWER(role) = 'admin' THEN 1 ELSE 0 END) AS adminCount,
      SUM(CASE WHEN LOWER(role) = 'manager' THEN 1 ELSE 0 END) AS managerCount,
      SUM(CASE WHEN LOWER(role) = 'cashier' THEN 1 ELSE 0 END) AS cashierCount,
      SUM(CASE WHEN LOWER(status) = 'active' THEN 1 ELSE 0 END) AS activeUsers
    FROM users`);

    res.json({
      todayRevenue: Number(revenueRow?.todayRevenue || 0),
      flaggedTransactions: Number(flagRow?.flaggedTransactions || 0),
      lowStockItems: Number(stockRow?.lowStockItems || 0),
      totalUsers: Number(userRow?.totalUsers || 0),
      activeSessions: Number(userRow?.activeUsers || 0),
      roleCounts: {
        admin: Number(userRow?.adminCount || 0),
        manager: Number(userRow?.managerCount || 0),
        cashier: Number(userRow?.cashierCount || 0),
      },
    });
  } catch (error) {
    console.error('Failed to load summary:', error.message);
    return res.status(500).json({ error: 'Unable to load summary' });
  }
});

app.get('/api/auth/users', async (req, res) => {
  if (mongoDb) {
    try {
      const users = await mongoDb.collection('users').find({}, { projection: { _id: 0, password: 0 } }).sort({ createdAt: 1 }).toArray();
      return res.json(users);
    } catch (error) {
      console.error('Failed to load users from MongoDB:', error.message);
      return res.status(500).json({ error: 'Unable to load users' });
    }
  }

  try {
    const rows = await db.all('SELECT id, full_name AS fullName, email, username, role, status, created_at AS createdAt FROM users ORDER BY id ASC');
    res.json(rows);
  } catch (error) {
    console.error('Failed to load users:', error.message);
    return res.status(500).json({ error: 'Unable to load users' });
  }
});

app.get('/api/auth/users/:id', checkAuth, async (req, res) => {
  if (mongoDb) {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid user id.' });
      }

      const user = await mongoDb.collection('users').findOne(
        { _id: new ObjectId(req.params.id) },
        { projection: { password: 0 } }
      );

      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      return res.json({
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status || 'active',
        createdAt: user.createdAt,
      });
    } catch (error) {
      console.error('Failed to load user from MongoDB:', error.message);
      return res.status(500).json({ error: 'Unable to load user' });
    }
  }

  try {
    const row = await db.get('SELECT id, full_name AS fullName, email, username, role, status, created_at AS createdAt FROM users WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(row);
  } catch (error) {
    console.error('Failed to load user:', error.message);
    return res.status(500).json({ error: 'Unable to load user' });
  }
});

app.put('/api/auth/users/:id', checkAuth, async (req, res) => {
  if (mongoDb) {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid user id.' });
      }

      const updates = {};
      if (req.body.fullName !== undefined) {
        updates.fullName = String(req.body.fullName || '').trim();
      }
      if (req.body.email !== undefined) {
        updates.email = String(req.body.email || '').trim().toLowerCase();
      }
      if (req.body.username !== undefined) {
        updates.username = String(req.body.username || '').trim();
      }
      if (req.body.password !== undefined && String(req.body.password || '').trim()) {
        updates.password = String(req.body.password || '');
      }
      if (req.body.role !== undefined) {
        updates.role = normalizeRoleValue(req.body.role, 'cashier');
      }
      if (req.body.status !== undefined) {
        updates.status = String(req.body.status || 'active').trim().toLowerCase();
      }

      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'No fields provided.' });
      }

      const result = await mongoDb.collection('users').updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updates }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }

      return res.json({ success: true, id: req.params.id });
    } catch (error) {
      console.error('Failed to update user in MongoDB:', error.message);
      return res.status(500).json({ error: 'Unable to update user.' });
    }
  }

  const id = req.params.id;
  const updates = [];
  const values = [];

  if (req.body.fullName !== undefined) {
    updates.push('full_name = ?');
    values.push(String(req.body.fullName || '').trim());
  }
  if (req.body.email !== undefined) {
    updates.push('email = ?');
    values.push(String(req.body.email || '').trim().toLowerCase());
  }
  if (req.body.username !== undefined) {
    updates.push('username = ?');
    values.push(String(req.body.username || '').trim());
  }
  if (req.body.password !== undefined && String(req.body.password || '').trim()) {
    updates.push('password = ?');
    values.push(String(req.body.password || ''));
  }
  if (req.body.role !== undefined) {
    updates.push('role = ?');
    values.push(normalizeRoleValue(req.body.role, 'cashier'));
  }
  if (req.body.status !== undefined) {
    updates.push('status = ?');
    values.push(String(req.body.status || 'active').trim().toLowerCase());
  }

  if (!updates.length) {
    return res.status(400).json({ error: 'No fields provided.' });
  }

  values.push(id);
  try {
    const result = await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ success: true, id });
  } catch (error) {
    console.error('Failed to update user:', error.message);
    return res.status(500).json({ error: 'Unable to update user.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifier and password are required.' });
  }

  if (mongoDb) {
    try {
      const user = await mongoDb.collection('users').findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { username: identifier }
        ]
      });

      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      return res.json({
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        role: user.role,
      });
    } catch (error) {
      console.error('MongoDB login failed:', error.message);
      return res.status(500).json({ error: 'Unable to authenticate.' });
    }
  }

  try {
    const user = await db.get(
      'SELECT id, full_name AS fullName, email, username, role, password FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [identifier.toLowerCase(), identifier.toLowerCase()]
    );

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    res.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      role: normalizeRoleValue(user.role, 'cashier'),
    });
  } catch (error) {
    console.error('Login query failed:', error.message);
    return res.status(500).json({ error: 'Unable to authenticate.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const username = String(req.body.username || email.split('@')[0] || '').trim();
  const password = String(req.body.password || '');
  const role = normalizeRoleValue(req.body.role, 'cashier');

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' });
  }

  if (mongoDb) {
    try {
      const existing = await mongoDb.collection('users').findOne({ $or: [{ email }, { username }] });
      if (existing) {
        return res.status(409).json({ error: 'That email or username already exists.' });
      }

      const result = await mongoDb.collection('users').insertOne({
        fullName,
        email,
        username,
        password,
        role,
        createdAt: new Date()
      });

      return res.status(201).json({
        id: result.insertedId.toString(),
        fullName,
        email,
        username,
        role,
      });
    } catch (error) {
      console.error('MongoDB registration failed:', error.message);
      return res.status(500).json({ error: 'Unable to create account.' });
    }
  }

  try {
    const result = await db.run(
      'INSERT INTO users (full_name, email, username, password, role) VALUES (?, ?, ?, ?, ?)',
      [fullName, email, username, password, role]
    );

    res.status(201).json({
      id: result.insertId,
      fullName,
      email,
      username,
      role,
    });
  } catch (error) {
    if (error.message.includes('Duplicate') || error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'That email or username already exists.' });
    }
    console.error('Registration failed:', error.message);
    return res.status(500).json({ error: 'Unable to create account.' });
  }
});

function handleProductsRequest(req, res) {
  const search = String(req.query.search || '').trim();
  const category = String(req.query.category || 'all').trim().toLowerCase();
  const barcode = String(req.query.barcode || '').trim();
  const stockFilter = String(req.query.stock || 'all').trim().toLowerCase();

  let sql = 'SELECT * FROM products';
  const conditions = [];
  const params = [];

  if (barcode) {
    conditions.push('barcode = ?');
    params.push(barcode);
  }

  if (search) {
    conditions.push('(name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR category LIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  if (category && category !== 'all') {
    conditions.push('LOWER(category) = ?');
    params.push(category);
  }

  if (stockFilter === 'low') {
    conditions.push('stock > 0 AND stock <= 10');
  } else if (stockFilter === 'out') {
    conditions.push('stock = 0');
  }

  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY name COLLATE NOCASE';

  if (mongoDb) {
    (async () => {
      try {
        const filter = {};
        if (barcode) filter.barcode = barcode;
        if (search) {
          filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { sku: { $regex: search, $options: 'i' } },
            { barcode: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } }
          ];
        }
        if (category && category !== 'all') {
          filter.category = new RegExp(`^${category}$`, 'i');
        }
        if (stockFilter === 'low') {
          filter.stock = { $gt: 0, $lte: 10 };
        } else if (stockFilter === 'out') {
          filter.stock = { $eq: 0 };
        }

        const rows = await mongoDb.collection('products').find(filter).sort({ name: 1 }).toArray();
        return res.json(rows.map((row) => ({ ...row, id: row._id.toString() })));
      } catch (error) {
        console.error('MongoDB product query failed:', error.message);
        return res.status(500).json({ error: 'Unable to load products' });
      }
    })();
    return;
  }

  db.all(sql, params)
    .then((rows) => res.json(rows))
    .catch((err) => {
      console.error('Product query failed:', err.message);
      return res.status(500).json({ error: 'Unable to load products' });
    });
}

function createProduct(req, res) {
  const { name, sku, barcode, category, price, stock, image, description, cost, threshold } = req.body;

  const normalizedName = String(name || '').trim();
  const normalizedSku = String(sku || '').trim();
  const normalizedBarcode = String(barcode || normalizedSku || '').trim();
  const normalizedCategory = String(category || '').trim();

  if (!normalizedName || !normalizedSku || !normalizedCategory) {
    return res.status(400).json({ error: 'Name, SKU, and category are required.' });
  }

  const id = Date.now().toString();
  const product = [id, normalizedName, normalizedSku, normalizedBarcode || `${normalizedSku}-${id.slice(-6)}`, normalizedCategory, Number(price) || 0, Number(stock) || 0, image || '/images/placeholder.svg', description || '', Number(cost) || 0, Number(threshold) || 0];

  db.run(
    'INSERT INTO products (id, name, sku, barcode, category, price, stock, image, description, cost, threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    product
  ).then(() => {
    res.json({ id, name: normalizedName, sku: normalizedSku, barcode: normalizedBarcode || `${normalizedSku}-${id.slice(-6)}`, category: normalizedCategory, price: Number(price) || 0, stock: Number(stock) || 0, image: image || '/images/placeholder.svg', description: description || '', cost: Number(cost) || 0, threshold: Number(threshold) || 0 });
  }).catch((err) => {
    console.error('Insert product failed:', err.message);
    if (err.message.includes('Duplicate') || err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A product with this SKU or barcode already exists. Please choose a different value.' });
    }
    return res.status(500).json({ error: 'Unable to save product.' });
  });
}

function handleProductsCollectionRoute(req, res) {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  if (req.method === 'GET') {
    return handleProductsRequest(req, res);
  }

  if (req.method === 'POST') {
    return checkAuth(req, res, () => createProduct(req, res));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

app.all('/api/products', handleProductsCollectionRoute);
app.all('/products', handleProductsCollectionRoute);

app.put('/api/products/:id', checkAuth, async (req, res) => {
  const id = req.params.id;
  const { name, sku, barcode, category, price, stock, image, description, cost, threshold } = req.body;

  if (!name || !sku || !barcode || !category) {
    return res.status(400).json({ error: 'Name, SKU, barcode, and category are required.' });
  }

  try {
    const result = await db.run(
      'UPDATE products SET name = ?, sku = ?, barcode = ?, category = ?, price = ?, stock = ?, image = ?, description = ?, cost = ?, threshold = ? WHERE id = ?',
      [name, sku, barcode, category, Number(price) || 0, Number(stock) || 0, image || '/images/placeholder.svg', description || '', Number(cost) || 0, Number(threshold) || 0, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ id, ...req.body });
  } catch (error) {
    console.error('Update product failed:', error.message);
    return res.status(500).json({ error: 'Unable to update product.' });
  }
});

app.delete('/api/products/:id', checkAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.run('DELETE FROM products WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete product failed:', error.message);
    return res.status(500).json({ error: 'Unable to delete product.' });
  }
});

app.post('/api/checkout', checkAuth, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const paymentMethod = String(req.body.paymentMethod || 'Unknown');
  const discountPercent = Number(req.body.discountPercent || 0);

  if (!items.length) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = Math.max(0, Math.min(discountPercent, 100)) * subtotal / 100;
  const tax = Number(((subtotal - discount) * 0.08).toFixed(2));
  const total = Number((subtotal - discount + tax).toFixed(2));

  try {
    const transactionResult = await db.run(
      'INSERT INTO transactions (payment_method, subtotal, discount, tax, total) VALUES (?, ?, ?, ?, ?)',
      [paymentMethod, subtotal, discount, tax, total]
    );

    const transactionId = transactionResult.insertId;

    for (const item of items) {
      await db.run(
        'INSERT INTO transaction_items (transaction_id, product_id, name, sku, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [transactionId, item.productId, item.name, item.sku, item.unitPrice, item.quantity, Number((item.unitPrice * item.quantity).toFixed(2))]
      );
    }

    for (const item of items) {
      await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.productId]);
    }

    res.json({ transactionId, total, subtotal, discount, tax });
  } catch (error) {
    console.error('Checkout insert failed:', error.message);
    return res.status(500).json({ error: 'Unable to save transaction' });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const rows = await db.all(`SELECT t.id, t.created_at, t.payment_method, t.subtotal, t.discount, t.tax, t.total,
        (SELECT COUNT(*) FROM transaction_items WHERE transaction_id = t.id) AS item_count
      FROM transactions t
      ORDER BY t.created_at DESC LIMIT 20`);
    res.json(rows);
  } catch (error) {
    console.error('Failed to load transactions:', error.message);
    return res.status(500).json({ error: 'Unable to load transactions' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`POS backend listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  server,
  ensurePhpBootstrapFile,
  phpCliMiddleware,
  normalizeRoleValue,
};
