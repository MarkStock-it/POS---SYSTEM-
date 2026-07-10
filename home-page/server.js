const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'pos.db');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB = process.env.MONGO_DB || 'pos_system';
const MONGO_ENABLED = process.env.MONGO_ENABLED === 'true' || process.env.MONGO_URI;
const PHP_TEST_ROOT = path.resolve(__dirname, '..', 'PHP-TEST');
const PHP_BOOTSTRAP_PATH = path.join(os.tmpdir(), 'php-test-bootstrap.php');

fs.writeFileSync(
  PHP_BOOTSTRAP_PATH,
  `<?php
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
PhpCliInputStream::setData(getenv('PHP_CLI_INPUT_BODY') ?: '');
if (getenv('PHP_CLI_INPUT_BODY') !== false) {
  stream_wrapper_unregister('php');
  stream_wrapper_register('php', 'PhpCliInputStream');
}
$_SERVER['REQUEST_METHOD'] = getenv('REQUEST_METHOD') ?: 'GET';
$_SERVER['REQUEST_URI'] = getenv('REQUEST_URI') ?: '/';
$_SERVER['QUERY_STRING'] = getenv('QUERY_STRING') ?: '';
$_SERVER['CONTENT_TYPE'] = getenv('CONTENT_TYPE') ?: '';
$_SERVER['CONTENT_LENGTH'] = getenv('CONTENT_LENGTH') ?: '';
$_GET = [];
if ($_SERVER['QUERY_STRING'] !== '') {
  parse_str($_SERVER['QUERY_STRING'], $_GET);
}
$_POST = [];
?>`
);

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
    const env = {
      ...process.env,
      REQUEST_METHOD: req.method,
      CONTENT_TYPE: req.headers['content-type'] || '',
      CONTENT_LENGTH: String(body.length),
      QUERY_STRING: queryString,
      REQUEST_URI: requestTarget,
      PHP_CLI_INPUT_BODY: body.toString('utf8')
    };

    const child = spawn('php', ['-d', `auto_prepend_file=${PHP_BOOTSTRAP_PATH}`, requestedPath], {
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
      console.error('PHP CLI spawn failed:', error.message);
      return res.status(500).json({ error: 'PHP execution failed', details: error.message });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`PHP script failed (${code}):`, stderr.trim());
        return res.status(500).json({ error: 'PHP script failed', details: stderr.trim() || 'Unknown PHP error' });
      }

      const output = stdout.trim();
      if (/^HTTP\/[0-9.]+\s+[0-9]{3}/i.test(output) || /^Status:\s+/i.test(output)) {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        return res.send(output);
      }

      res.set('Content-Type', 'application/json');
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

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Unable to open SQLite database:', err.message);
    process.exit(1);
  }
});

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

const sampleProducts = [
  { id: '0001', name: 'Bottled Water 500ml', sku: '0001', barcode: '100000001', category: 'Beverages', price: 1.25, stock: 50, image: '/images/water.jpg' },
  { id: '0002', name: 'Croissant', sku: '0002', barcode: '100000002', category: 'Bakery', price: 2.50, stock: 30, image: '/images/crossaint.jpeg' },
  { id: '0003', name: 'Banana (per lb)', sku: '0003', barcode: '100000003', category: 'Produce', price: 0.69, stock: 100, image: '/images/bunch-bananas-6175887.jpg.webp' },
  { id: '0004', name: 'Whole Milk 1L', sku: '0004', barcode: '100000004', category: 'Dairy', price: 3.10, stock: 40, image: '/images/milk.jpeg' },
  { id: '0005', name: 'Potato Chips', sku: '0005', barcode: '100000005', category: 'Snacks', price: 2.99, stock: 25, image: '/images/Lays_XL_Classic_Laydown.png' },
  { id: '0006', name: 'Coffee Beans 250g', sku: '0006', barcode: '100000006', category: 'Beverages', price: 6.75, stock: 20, image: '/images/coffee.jpeg' },
  { id: '0007', name: 'Dish Soap 750ml', sku: '0007', barcode: '100000007', category: 'Household', price: 3.45, stock: 35, image: '/images/soap.jpg' },
  { id: '0008', name: 'USB-C Cable 1m', sku: '0008', barcode: '100000008', category: 'Electronics', price: 8.99, stock: 15, image: '/images/usb-c.jpeg' },
];

function initDatabase() {
  db.serialize(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sku TEXT UNIQUE NOT NULL,
        barcode TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER NOT NULL,
        image TEXT
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT DEFAULT (datetime('now')),
        payment_method TEXT,
        subtotal REAL,
        discount REAL,
        tax REAL,
        total REAL
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'cashier',
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER,
        product_id TEXT,
        name TEXT,
        sku TEXT,
        unit_price REAL,
        quantity INTEGER,
        line_total REAL,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
      );
    `, (execErr) => {
      if (execErr) {
        console.error('Failed to initialize database schema:', execErr.message);
        return;
      }

      const ensureColumns = (callback) => {
        db.all('PRAGMA table_info(products)', (err, columns) => {
          if (err) return callback(err);

          const existingNames = columns.map((column) => column.name);
          const tasks = [];

          if (!existingNames.includes('description')) {
            tasks.push((next) => db.run('ALTER TABLE products ADD COLUMN description TEXT', next));
          }
          if (!existingNames.includes('cost')) {
            tasks.push((next) => db.run('ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0', next));
          }
          if (!existingNames.includes('threshold')) {
            tasks.push((next) => db.run('ALTER TABLE products ADD COLUMN threshold INTEGER DEFAULT 0', next));
          }

          db.all('PRAGMA table_info(users)', (userErr, userColumns) => {
            if (userErr) return callback(userErr);
            const existingUserColumns = userColumns.map((column) => column.name);
            if (!existingUserColumns.includes('status')) {
              tasks.push((next) => db.run('ALTER TABLE users ADD COLUMN status TEXT DEFAULT "active"', next));
            }

            const runNext = () => {
              if (!tasks.length) return callback(null);
              const task = tasks.shift();
              task((taskErr) => {
                if (taskErr) return callback(taskErr);
                runNext();
              });
            };

            runNext();
          });
        });
      };

      ensureColumns((ensureErr) => {
        if (ensureErr) {
          console.error('Failed to update product columns:', ensureErr.message);
        }

        db.run(`
          INSERT OR IGNORE INTO users (full_name, email, username, password, role, status)
          VALUES ('Super Admin Demo', 'superadmin@pos.com', 'superadmin', 'superadmin123', 'super-admin', 'active')
        `);

        db.run(`
          INSERT OR IGNORE INTO users (full_name, email, username, password, role, status)
          VALUES ('Demo User', 'demo@pos.com', 'demouser', 'password', 'cashier', 'active')
        `);

        db.run(`
          INSERT OR IGNORE INTO transactions (id, created_at, payment_method, subtotal, discount, tax, total)
          VALUES (1, '2026-07-06 06:30:00', 'card', 25.50, 0, 2.04, 27.54)
        `);

        db.run(`
          INSERT OR IGNORE INTO transaction_items (transaction_id, product_id, name, sku, unit_price, quantity, line_total)
          VALUES (1, '0001', 'Bottled Water 500ml', '0001', 1.25, 2, 2.50)
        `);

        db.run(`
          INSERT OR IGNORE INTO transaction_items (transaction_id, product_id, name, sku, unit_price, quantity, line_total)
          VALUES (1, '0005', 'Potato Chips', '0005', 2.99, 1, 2.99)
        `);

        const insertOrReplace = db.prepare(
          'INSERT OR REPLACE INTO products (id, name, sku, barcode, category, price, stock, image, description, cost, threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        sampleProducts.forEach((product) => {
          insertOrReplace.run(
            product.id,
            product.name,
            product.sku,
            product.barcode,
            product.category,
            product.price,
            product.stock,
            product.image || null,
            product.description || null,
            product.cost || 0,
            product.threshold || 0
          );
        });

        insertOrReplace.finalize((finalizeErr) => {
          if (finalizeErr) {
            console.error('Failed to seed products:', finalizeErr.message);
          }
        });
      });
    });
  });
}

initDatabase();

app.use(phpCliMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
  return res.redirect('/home-page/index.html');
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
app.use(express.static(path.join(__dirname, '..')));

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

app.get('/api/dashboard/summary', checkAuth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  db.get('SELECT COALESCE(SUM(total), 0) AS todayRevenue FROM transactions WHERE date(created_at) = ?', [today], (revenueErr, revenueRow) => {
    if (revenueErr) {
      console.error('Failed to load revenue summary:', revenueErr.message);
      return res.status(500).json({ error: 'Unable to load summary' });
    }

    db.get('SELECT COUNT(*) AS flaggedTransactions FROM transactions WHERE LOWER(payment_method) = "flagged"', (flagErr, flagRow) => {
      if (flagErr) {
        console.error('Failed to load flagged transactions:', flagErr.message);
        return res.status(500).json({ error: 'Unable to load summary' });
      }

      db.get('SELECT COUNT(*) AS lowStockItems FROM products WHERE stock > 0 AND stock <= 10', (stockErr, stockRow) => {
        if (stockErr) {
          console.error('Failed to load stock summary:', stockErr.message);
          return res.status(500).json({ error: 'Unable to load summary' });
        }

        db.get(`SELECT COUNT(*) AS totalUsers,
          SUM(CASE WHEN LOWER(role) = 'admin' THEN 1 ELSE 0 END) AS adminCount,
          SUM(CASE WHEN LOWER(role) = 'manager' THEN 1 ELSE 0 END) AS managerCount,
          SUM(CASE WHEN LOWER(role) = 'cashier' THEN 1 ELSE 0 END) AS cashierCount,
          SUM(CASE WHEN LOWER(status) = 'active' THEN 1 ELSE 0 END) AS activeUsers
        FROM users`, (userErr, userRow) => {
          if (userErr) {
            console.error('Failed to load user summary:', userErr.message);
            return res.status(500).json({ error: 'Unable to load summary' });
          }

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
        });
      });
    });
  });
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

  db.all('SELECT id, full_name AS fullName, email, username, role, status, created_at AS createdAt FROM users ORDER BY id ASC', [], (err, rows) => {
    if (err) {
      console.error('Failed to load users:', err.message);
      return res.status(500).json({ error: 'Unable to load users' });
    }
    res.json(rows);
  });
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

  db.get('SELECT id, full_name AS fullName, email, username, role, status, created_at AS createdAt FROM users WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error('Failed to load user:', err.message);
      return res.status(500).json({ error: 'Unable to load user' });
    }
    if (!row) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(row);
  });
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
  db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values, function (err) {
    if (err) {
      console.error('Failed to update user:', err.message);
      return res.status(500).json({ error: 'Unable to update user.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ success: true, id });
  });
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

  db.get(
    'SELECT id, full_name AS fullName, email, username, role, password FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
    [identifier.toLowerCase(), identifier.toLowerCase()],
    (err, user) => {
      if (err) {
        console.error('Login query failed:', err.message);
        return res.status(500).json({ error: 'Unable to authenticate.' });
      }

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
    }
  );
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

  db.run(
    'INSERT INTO users (full_name, email, username, password, role) VALUES (?, ?, ?, ?, ?)',
    [fullName, email, username, password, role],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(409).json({ error: 'That email or username already exists.' });
        }
        console.error('Registration failed:', err.message);
        return res.status(500).json({ error: 'Unable to create account.' });
      }

      res.status(201).json({
        id: this.lastID,
        fullName,
        email,
        username,
        role,
      });
    }
  );
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

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Product query failed:', err.message);
      return res.status(500).json({ error: 'Unable to load products' });
    }
    res.json(rows);
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
    product,
    function (err) {
      if (err) {
        console.error('Insert product failed:', err.message);
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(409).json({ error: 'A product with this SKU or barcode already exists. Please choose a different value.' });
        }
        return res.status(500).json({ error: 'Unable to save product.' });
      }
      res.json({ id, name: normalizedName, sku: normalizedSku, barcode: normalizedBarcode || `${normalizedSku}-${id.slice(-6)}`, category: normalizedCategory, price: Number(price) || 0, stock: Number(stock) || 0, image: image || '/images/placeholder.svg', description: description || '', cost: Number(cost) || 0, threshold: Number(threshold) || 0 });
    }
  );
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

app.put('/api/products/:id', checkAuth, (req, res) => {
  const id = req.params.id;
  const { name, sku, barcode, category, price, stock, image, description, cost, threshold } = req.body;

  if (!name || !sku || !barcode || !category) {
    return res.status(400).json({ error: 'Name, SKU, barcode, and category are required.' });
  }

  db.run(
    'UPDATE products SET name = ?, sku = ?, barcode = ?, category = ?, price = ?, stock = ?, image = ?, description = ?, cost = ?, threshold = ? WHERE id = ?',
    [name, sku, barcode, category, Number(price) || 0, Number(stock) || 0, image || '/images/placeholder.svg', description || '', Number(cost) || 0, Number(threshold) || 0, id],
    function (err) {
      if (err) {
        console.error('Update product failed:', err.message);
        return res.status(500).json({ error: 'Unable to update product.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Product not found.' });
      }
      res.json({ id, ...req.body });
    }
  );
});

app.delete('/api/products/:id', checkAuth, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM products WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('Delete product failed:', err.message);
      return res.status(500).json({ error: 'Unable to delete product.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ success: true });
  });
});

app.post('/api/checkout', checkAuth, (req, res) => {
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

  db.run(
    'INSERT INTO transactions (payment_method, subtotal, discount, tax, total) VALUES (?, ?, ?, ?, ?)',
    [paymentMethod, subtotal, discount, tax, total],
    function (err) {
      if (err) {
        console.error('Checkout insert failed:', err.message);
        return res.status(500).json({ error: 'Unable to save transaction' });
      }

      const transactionId = this.lastID;
      const insertItem = db.prepare(
        'INSERT INTO transaction_items (transaction_id, product_id, name, sku, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      items.forEach((item) => {
        insertItem.run(
          transactionId,
          item.productId,
          item.name,
          item.sku,
          item.unitPrice,
          item.quantity,
          Number((item.unitPrice * item.quantity).toFixed(2))
        );
      });

      insertItem.finalize((err2) => {
        if (err2) {
          console.error('Checkout items insert failed:', err2.message);
          return res.status(500).json({ error: 'Unable to save transaction items' });
        }

        // Decrement stock for each item sold
        items.forEach((item) => {
          db.run(
            'UPDATE products SET stock = stock - ? WHERE id = ?',
            [item.quantity, item.productId],
            (stockErr) => {
              if (stockErr) {
                console.error(`Failed to update stock for product ${item.productId}:`, stockErr.message);
              }
            }
          );
        });

        res.json({ transactionId, total, subtotal, discount, tax });
      });
    }
  );
});

app.get('/api/transactions', (req, res) => {
  db.all(`SELECT t.id, t.created_at, t.payment_method, t.subtotal, t.discount, t.tax, t.total,
      (SELECT COUNT(*) FROM transaction_items WHERE transaction_id = t.id) AS item_count
    FROM transactions t
    ORDER BY t.created_at DESC LIMIT 20`, [], (err, rows) => {
    if (err) {
      console.error('Failed to load transactions:', err.message);
      return res.status(500).json({ error: 'Unable to load transactions' });
    }
    res.json(rows);
  });
});

server.listen(PORT, () => {
  console.log(`POS backend listening on http://localhost:${PORT}`);
});
