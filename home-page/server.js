// =============================================================================
// SECURITY POSTURE
// =============================================================================
// 1. Static files: Whitelist-only serving. Only /home-page/, /login-page/,
//    /register-page/, /New_Index/, /images/ directories and root-level
//    index.html, 404.html, favicon.ico are accessible. All other files
//    (including .env, package.json, server.js, db.js, PHP source) are blocked.
// 2. PHP bridge: Uses spawn() with an argv array (not a shell string), so
//    command injection via the script path is not possible. Query strings and
//    request bodies are passed as environment variables (not CLI args), which
//    is safe. Path traversal is blocked by path.resolve() + relative check.
// 3. API routes: Use parameterized queries (mysql2 prepared statements) —
//    no raw SQL concatenation with user input. MongoDB routes use the
//    driver's built-in parameterization.
// 4. Auth: PIN-based checkAuth middleware on sensitive routes. Login uses
//    parameterized queries. Passwords are stored as plaintext in MySQL
//    (legacy) and bcrypt hashes in PHP path.
// =============================================================================

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

// Log which database mode is active at startup
console.log(`[SERVER] MongoDB enabled: ${MONGO_ENABLED}`);
console.log(`[SERVER] MySQL host: ${process.env.DB_HOST || 'localhost'}`);
console.log(`[SERVER] MySQL database: ${process.env.DB_NAME || 's25103705_Ely'}`);
console.log(`[SERVER] PHP bridge root: ${PHP_TEST_ROOT}`);

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
// SECURITY: Whitelist-based static file serving.
// Only explicitly listed directories and files are served — everything else is blocked.
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

// Whitelist of root-level files that are safe to serve.
// Only these exact filenames are accessible at the root URL — everything else is blocked.
const ALLOWED_ROOT_FILES = new Set([
  '/index.html',
  '/404.html',
  '/favicon.ico',
]);
app.use((req, res, next) => {
  // Only intercept GET/HEAD requests to the root
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const pathname = req.path;
  // If it's a root-level file request, check the whitelist
  if (pathname.startsWith('/') && !pathname.includes('/', 1)) {
    if (ALLOWED_ROOT_FILES.has(pathname)) {
      return express.static(path.join(__dirname, '..'), { dotfiles: 'deny', index: false })(req, res, next);
    }
    // Block all other root-level files
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

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
    console.log('[USER-UPDATE] SQL:', `UPDATE users SET ${updates.join(', ')} WHERE id = ?`, 'Values:', JSON.stringify(values));
    const result = await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    console.log('[USER-UPDATE] Result:', JSON.stringify(result));
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ success: true, id });
  } catch (error) {
    console.error('[USER-UPDATE] Failed:', error.message);
    return res.status(500).json({ error: 'Unable to update user.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');

  console.log('[LOGIN] Attempt for identifier:', identifier);

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

      console.log('[LOGIN] MongoDB user found:', user.email, 'role:', user.role);
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
    console.log('[LOGIN] Querying users table for:', identifier.toLowerCase());
    const user = await db.get(
      'SELECT id, full_name AS fullName, email, username, role, password FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [identifier.toLowerCase(), identifier.toLowerCase()]
    );

    if (!user) {
      console.log('[LOGIN] No user found for:', identifier);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (user.password !== password) {
      console.log('[LOGIN] Password mismatch for:', identifier);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    console.log('[LOGIN] Success for:', user.email, 'role:', user.role);
    res.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      role: normalizeRoleValue(user.role, 'cashier'),
    });
  } catch (error) {
    console.error('[LOGIN] Query failed:', error.message);
    return res.status(500).json({ error: 'Unable to authenticate.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const username = String(req.body.username || email.split('@')[0] || '').trim();
  const password = String(req.body.password || '');
  const role = normalizeRoleValue(req.body.role, 'cashier');

  console.log('[REGISTER] Incoming registration:', { fullName, email, username, role });

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

      console.log('[REGISTER] MongoDB insert result:', result.insertedId.toString());
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
    console.log('[REGISTER] Executing INSERT into users table:', { fullName, email, username, role });
    const result = await db.run(
      'INSERT INTO users (full_name, email, username, password, role) VALUES (?, ?, ?, ?, ?)',
      [fullName, email, username, password, role]
    );
    console.log('[REGISTER] INSERT result:', JSON.stringify(result));

    if (!result || result.affectedRows === 0) {
      console.error('[REGISTER] CRITICAL: INSERT returned 0 affectedRows');
      return res.status(500).json({ error: 'Account creation failed — database did not insert row' });
    }

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
    console.error('[REGISTER] Registration failed:', error.message);
    console.error('[REGISTER] Stack:', error.stack);
    return res.status(500).json({ error: 'Unable to create account.' });
  }
});

// =============================================================================
// DUAL-WRITE: Write to both the flat (Node.js) tables AND the normalized
// (PHP) tables so that data is visible regardless of which schema the user
// checks. This is a temporary bridge until the app is unified to one schema.
// =============================================================================
app.post('/api/auth/register/v2', async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const username = String(req.body.username || email.split('@')[0] || '').trim();
  const password = String(req.body.password || '');
  const role = normalizeRoleValue(req.body.role, 'cashier');

  console.log('[REGISTER-V2] Incoming:', { fullName, email, username, role });

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' });
  }

  try {
    // 1. Write to the flat `users` table (Node.js schema)
    console.log('[REGISTER-V2] Writing to flat `users` table');
    const flatResult = await db.run(
      'INSERT INTO users (full_name, email, username, password, role) VALUES (?, ?, ?, ?, ?)',
      [fullName, email, username, password, role]
    );
    console.log('[REGISTER-V2] Flat insert result:', JSON.stringify(flatResult));

    // 2. Write to the normalized `user` table (PHP schema)
    console.log('[REGISTER-V2] Writing to normalized `user` table');
    const roleType = ['manager', 'admin', 'super_admin', 'super-admin'].includes(role)
      ? (role === 'super-admin' ? 'super_admin' : role)
      : 'cashier';

    // Ensure role exists in the `role` table
    await db.run('INSERT IGNORE INTO role (role_type) VALUES (?)', [roleType]);

    // Look up the role_id
    const roleRow = await db.get('SELECT role_id FROM role WHERE role_type = ?', [roleType]);
    if (!roleRow) {
      throw new Error(`Role "${roleType}" not found in role table`);
    }

    const hash = password; // plaintext for consistency with flat table (legacy)
    await db.run(
      'INSERT INTO `user` (full_name, password_hash, role_id, status, email, username) VALUES (?, ?, ?, \'active\', ?, ?)',
      [fullName, hash, roleRow.role_id, email, username]
    );
    console.log('[REGISTER-V2] Normalized insert complete');

    res.status(201).json({
      id: flatResult.insertId,
      fullName,
      email,
      username,
      role,
    });
  } catch (error) {
    if (error.message.includes('Duplicate') || error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'That email or username already exists.' });
    }
    console.error('[REGISTER-V2] Failed:', error.message);
    console.error('[REGISTER-V2] Stack:', error.stack);
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

  console.log('[PRODUCT-CREATE] Incoming:', { normalizedName, normalizedSku, normalizedCategory, price, stock });

  if (!normalizedName || !normalizedSku || !normalizedCategory) {
    return res.status(400).json({ error: 'Name, SKU, and category are required.' });
  }

  const id = Date.now().toString();
  const product = [id, normalizedName, normalizedSku, normalizedBarcode || `${normalizedSku}-${id.slice(-6)}`, normalizedCategory, Number(price) || 0, Number(stock) || 0, image || '/images/placeholder.svg', description || '', Number(cost) || 0, Number(threshold) || 0];

  db.run(
    'INSERT INTO products (id, name, sku, barcode, category, price, stock, image, description, cost, threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    product
  ).then((result) => {
    console.log('[PRODUCT-CREATE] Insert result:', JSON.stringify(result));
    if (!result || result.affectedRows === 0) {
      console.error('[PRODUCT-CREATE] CRITICAL: INSERT returned 0 affectedRows');
      return res.status(500).json({ error: 'Product creation failed — database did not insert row' });
    }
    res.json({ id, name: normalizedName, sku: normalizedSku, barcode: normalizedBarcode || `${normalizedSku}-${id.slice(-6)}`, category: normalizedCategory, price: Number(price) || 0, stock: Number(stock) || 0, image: image || '/images/placeholder.svg', description: description || '', cost: Number(cost) || 0, threshold: Number(threshold) || 0 });
  }).catch((err) => {
    console.error('[PRODUCT-CREATE] Insert failed:', err.message);
    console.error('[PRODUCT-CREATE] Stack:', err.stack);
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

// =============================================================================
// DUAL-WRITE PRODUCT CREATE: Writes to both flat `products` and normalized
// `product` + `stock` + `category` tables.
// =============================================================================
app.post('/api/products/v2', checkAuth, async (req, res) => {
  const { name, sku, barcode, category, price, stock, image, description, cost, threshold } = req.body;

  const normalizedName = String(name || '').trim();
  const normalizedSku = String(sku || '').trim();
  const normalizedBarcode = String(barcode || normalizedSku || '').trim();
  const normalizedCategory = String(category || '').trim();

  console.log('[PRODUCT-CREATE-V2] Incoming:', { normalizedName, normalizedSku, normalizedCategory, price, stock });

  if (!normalizedName || !normalizedSku || !normalizedCategory) {
    return res.status(400).json({ error: 'Name, SKU, and category are required.' });
  }

  try {
    const id = Date.now().toString();

    // 1. Write to flat `products` table
    console.log('[PRODUCT-CREATE-V2] Writing to flat `products` table');
    const flatResult = await db.run(
      'INSERT INTO products (id, name, sku, barcode, category, price, stock, image, description, cost, threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, normalizedName, normalizedSku, normalizedBarcode || `${normalizedSku}-${id.slice(-6)}`, normalizedCategory, Number(price) || 0, Number(stock) || 0, image || '/images/placeholder.svg', description || '', Number(cost) || 0, Number(threshold) || 0]
    );
    console.log('[PRODUCT-CREATE-V2] Flat insert result:', JSON.stringify(flatResult));

    // 2. Write to normalized `product` + `category` + `stock` tables
    console.log('[PRODUCT-CREATE-V2] Writing to normalized tables');

    // Ensure category exists
    await db.run('INSERT IGNORE INTO category (name, status) VALUES (?, \'active\')', [normalizedCategory]);
    const catRow = await db.get('SELECT category_id FROM category WHERE name = ?', [normalizedCategory]);

    // Insert product
    const productCode = normalizedSku;
    const restockThreshold = Number(threshold) || 5;
    await db.run(
      'INSERT INTO `product` (product_code, category_id, name, price, restock_threshold, status, image_path) VALUES (?, ?, ?, ?, ?, \'active\', ?)',
      [productCode, catRow ? catRow.category_id : null, normalizedName, Number(price) || 0, restockThreshold, image || '/images/placeholder.svg']
    );

    // Insert stock
    const prodRow = await db.get('SELECT product_id FROM `product` WHERE product_code = ?', [productCode]);
    if (prodRow) {
      await db.run('INSERT INTO `stock` (product_id, quantity) VALUES (?, ?)', [prodRow.product_id, Number(stock) || 0]);
    }

    console.log('[PRODUCT-CREATE-V2] Complete. ID:', id);
    res.json({
      id,
      name: normalizedName,
      sku: normalizedSku,
      barcode: normalizedBarcode || `${normalizedSku}-${id.slice(-6)}`,
      category: normalizedCategory,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      image: image || '/images/placeholder.svg',
      description: description || '',
      cost: Number(cost) || 0,
      threshold: Number(threshold) || 0,
    });
  } catch (error) {
    console.error('[PRODUCT-CREATE-V2] Failed:', error.message);
    console.error('[PRODUCT-CREATE-V2] Stack:', error.stack);
    if (error.message.includes('Duplicate') || error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A product with this SKU or barcode already exists.' });
    }
    return res.status(500).json({ error: 'Unable to save product.' });
  }
});

app.put('/api/products/:id', checkAuth, async (req, res) => {
  const id = req.params.id;
  const { name, sku, barcode, category, price, stock, image, description, cost, threshold } = req.body;

  console.log('[PRODUCT-UPDATE] Updating product:', id, { name, sku, barcode, category, price, stock });

  if (!name || !sku || !barcode || !category) {
    return res.status(400).json({ error: 'Name, SKU, barcode, and category are required.' });
  }

  try {
    const result = await db.run(
      'UPDATE products SET name = ?, sku = ?, barcode = ?, category = ?, price = ?, stock = ?, image = ?, description = ?, cost = ?, threshold = ? WHERE id = ?',
      [name, sku, barcode, category, Number(price) || 0, Number(stock) || 0, image || '/images/placeholder.svg', description || '', Number(cost) || 0, Number(threshold) || 0, id]
    );
    console.log('[PRODUCT-UPDATE] Result:', JSON.stringify(result));
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ id, ...req.body });
  } catch (error) {
    console.error('[PRODUCT-UPDATE] Failed:', error.message);
    return res.status(500).json({ error: 'Unable to update product.' });
  }
});

app.delete('/api/products/:id', checkAuth, async (req, res) => {
  const id = req.params.id;
  console.log('[PRODUCT-DELETE] Deleting product:', id);
  try {
    const result = await db.run('DELETE FROM products WHERE id = ?', [id]);
    console.log('[PRODUCT-DELETE] Result:', JSON.stringify(result));
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[PRODUCT-DELETE] Failed:', error.message);
    return res.status(500).json({ error: 'Unable to delete product.' });
  }
});

app.post('/api/checkout', checkAuth, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const paymentMethod = String(req.body.paymentMethod || 'Unknown');
  const discountPercent = Number(req.body.discountPercent || 0);

  console.log('[CHECKOUT] Incoming request:', JSON.stringify({ paymentMethod, discountPercent, itemCount: items.length }));

  if (!items.length) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = Math.max(0, Math.min(discountPercent, 100)) * subtotal / 100;
  const tax = Number(((subtotal - discount) * 0.08).toFixed(2));
  const total = Number((subtotal - discount + tax).toFixed(2));

  try {
    console.log('[CHECKOUT] Inserting transaction:', { paymentMethod, subtotal, discount, tax, total });
    const transactionResult = await db.run(
      'INSERT INTO transactions (payment_method, subtotal, discount, tax, total) VALUES (?, ?, ?, ?, ?)',
      [paymentMethod, subtotal, discount, tax, total]
    );
    console.log('[CHECKOUT] Transaction insert result:', JSON.stringify(transactionResult));

    if (!transactionResult || transactionResult.affectedRows === 0) {
      console.error('[CHECKOUT] CRITICAL: Transaction insert returned 0 affectedRows');
      return res.status(500).json({ error: 'Transaction insert failed — 0 rows affected' });
    }

    const transactionId = transactionResult.insertId;
    console.log('[CHECKOUT] Transaction ID:', transactionId);

    for (const item of items) {
      console.log('[CHECKOUT] Inserting transaction_item:', { transactionId, productId: item.productId, name: item.name, sku: item.sku, unitPrice: item.unitPrice, quantity: item.quantity });
      const itemResult = await db.run(
        'INSERT INTO transaction_items (transaction_id, product_id, name, sku, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [transactionId, item.productId, item.name, item.sku, item.unitPrice, item.quantity, Number((item.unitPrice * item.quantity).toFixed(2))]
      );
      console.log('[CHECKOUT] Transaction_item insert result:', JSON.stringify(itemResult));
    }

    for (const item of items) {
      console.log('[CHECKOUT] Updating stock for product:', item.productId, 'quantity:', item.quantity);
      const stockResult = await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.productId]);
      console.log('[CHECKOUT] Stock update result:', JSON.stringify(stockResult));
    }

    console.log('[CHECKOUT] Checkout complete. Transaction ID:', transactionId);
    res.json({ transactionId, total, subtotal, discount, tax });
  } catch (error) {
    console.error('[CHECKOUT] Checkout insert failed:', error.message);
    console.error('[CHECKOUT] Stack:', error.stack);
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

// =============================================================================
// DUAL-WRITE CHECKOUT: Writes to both flat (transactions/transaction_items)
// and normalized (transaction/transaction_item/stock) tables.
// =============================================================================
app.post('/api/checkout/v2', checkAuth, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const paymentMethod = String(req.body.paymentMethod || 'Unknown');
  const discountPercent = Number(req.body.discountPercent || 0);

  console.log('[CHECKOUT-V2] Incoming:', JSON.stringify({ paymentMethod, discountPercent, itemCount: items.length }));

  if (!items.length) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = Math.max(0, Math.min(discountPercent, 100)) * subtotal / 100;
  const tax = Number(((subtotal - discount) * 0.08).toFixed(2));
  const total = Number((subtotal - discount + tax).toFixed(2));

  try {
    // 1. Write to flat `transactions` table
    console.log('[CHECKOUT-V2] Writing to flat `transactions` table');
    const flatResult = await db.run(
      'INSERT INTO transactions (payment_method, subtotal, discount, tax, total) VALUES (?, ?, ?, ?, ?)',
      [paymentMethod, subtotal, discount, tax, total]
    );
    console.log('[CHECKOUT-V2] Flat insert result:', JSON.stringify(flatResult));
    const flatTransactionId = flatResult.insertId;

    // 2. Write to normalized `transaction` table
    console.log('[CHECKOUT-V2] Writing to normalized `transaction` table');
    const receiptNo = 'RCPT-' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 14) + '-' + Math.floor(1000 + Math.random() * 9000);
    const normResult = await db.run(
      'INSERT INTO `transaction` (receipt_no, payment_method, amount_tendered, transaction_status, subtotal, tax, total, change_amount) VALUES (?, ?, ?, \'completed\', ?, ?, ?, ?)',
      [receiptNo, paymentMethod, total, subtotal, tax, total, 0]
    );
    console.log('[CHECKOUT-V2] Normalized insert result:', JSON.stringify(normResult));
    const normTransactionId = normResult.insertId;

    // 3. Write transaction_items to both schemas
    for (const item of items) {
      const lineTotal = Number((item.unitPrice * item.quantity).toFixed(2));

      // Flat table
      await db.run(
        'INSERT INTO transaction_items (transaction_id, product_id, name, sku, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [flatTransactionId, item.productId, item.name, item.sku, item.unitPrice, item.quantity, lineTotal]
      );

      // Normalized table — need stock_id from the `stock` table
      // First, find or create a stock entry for this product
      const productCode = item.sku || item.productId;
      const productRow = await db.get('SELECT product_id FROM `product` WHERE product_code = ?', [productCode]);
      if (productRow) {
        let stockRow = await db.get('SELECT stock_id, quantity FROM `stock` WHERE product_id = ?', [productRow.product_id]);
        if (!stockRow) {
          await db.run('INSERT INTO `stock` (product_id, quantity) VALUES (?, 0)', [productRow.product_id]);
          stockRow = await db.get('SELECT stock_id, quantity FROM `stock` WHERE product_id = ?', [productRow.product_id]);
        }
        if (stockRow) {
          await db.run(
            'INSERT INTO `transaction_item` (transaction_id, stock_id, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?)',
            [normTransactionId, stockRow.stock_id, item.quantity, item.unitPrice, lineTotal]
          );
          // Decrement stock
          await db.run('UPDATE `stock` SET quantity = quantity - ? WHERE stock_id = ?', [item.quantity, stockRow.stock_id]);
        }
      }

      // Also decrement flat stock
      await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.productId]);
    }

    console.log('[CHECKOUT-V2] Complete. Flat ID:', flatTransactionId, 'Norm ID:', normTransactionId);
    res.json({ transactionId: flatTransactionId, total, subtotal, discount, tax });
  } catch (error) {
    console.error('[CHECKOUT-V2] Failed:', error.message);
    console.error('[CHECKOUT-V2] Stack:', error.stack);
    return res.status(500).json({ error: 'Unable to save transaction' });
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
