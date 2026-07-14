const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 's25103705_Ely',
  password: process.env.DB_PASSWORD || 'Jumong09',
  database: process.env.DB_NAME || 's25103705_Ely',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z'
});

function normalizeParams(params) {
  if (Array.isArray(params)) return params;
  if (params === undefined || params === null) return [];
  return [params];
}

function createResultEnvelope(result) {
  return {
    insertId: result?.insertId ?? result?.affectedRows ?? 0,
    lastID: result?.insertId ?? result?.affectedRows ?? 0,
    changes: result?.affectedRows ?? 0,
    affectedRows: result?.affectedRows ?? 0,
    warningStatus: result?.warningStatus ?? 0
  };
}

function runQuery(sql, params, callback, shapeRows) {
  const effectiveParams = normalizeParams(params);
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const execute = async () => {
    const [rows] = await pool.execute(sql, effectiveParams);
    return shapeRows(rows);
  };

  if (typeof callback === 'function') {
    execute().then((rows) => callback(null, rows)).catch((error) => callback(error, null));
    return null;
  }

  return execute();
}

const db = {
  get(sql, params, callback) {
    return runQuery(sql, params, callback, (rows) => rows[0] || null);
  },
  all(sql, params, callback) {
    return runQuery(sql, params, callback, (rows) => rows);
  },
  run(sql, params, callback) {
    const effectiveParams = normalizeParams(params);
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    if (typeof callback === 'function') {
      pool.execute(sql, effectiveParams)
        .then(([result]) => callback.call(createResultEnvelope(result), null))
        .catch((error) => callback.call({}, error));
      return null;
    }

    return pool.execute(sql, effectiveParams).then(([result]) => createResultEnvelope(result));
  },
  prepare(sql) {
    const queue = [];
    let running = false;
    let finalized = false;

    const runNext = async () => {
      if (finalized && queue.length === 0) {
        return;
      }
      while (queue.length > 0) {
        const pending = queue.shift();
        await pending();
      }
    };

    return {
      run(values) {
        if (finalized) {
          throw new Error('Prepared statement already finalized');
        }

        const effectiveValues = normalizeParams(values);
        queue.push(async () => {
          const [result] = await pool.execute(sql, effectiveValues);
          return createResultEnvelope(result);
        });

        if (!running) {
          running = true;
          runNext().finally(() => {
            running = false;
          });
        }

        return this;
      },
      finalize(callback) {
        finalized = true;
        if (typeof callback === 'function') {
          runNext().then(() => callback(null)).catch(callback);
        }
      }
    };
  }
};

async function initDatabase() {
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    console.error('MySQL connection failed:', error.message);
    throw error;
  }

  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS role (
      role_id INT AUTO_INCREMENT PRIMARY KEY,
      role_type VARCHAR(30) NOT NULL UNIQUE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS user (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role_id INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      email VARCHAR(191) NOT NULL UNIQUE,
      username VARCHAR(100) NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES role(role_id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS category (
      category_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      delete_flag TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS product (
      product_id INT AUTO_INCREMENT PRIMARY KEY,
      product_code VARCHAR(100) NOT NULL UNIQUE,
      category_id INT DEFAULT NULL,
      name VARCHAR(150) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      restock_threshold INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      delete_flag TINYINT(1) NOT NULL DEFAULT 0,
      image_path VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES category(category_id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS stock (
      stock_id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      expiry_date DATE DEFAULT NULL,
      date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_stock_product FOREIGN KEY (product_id) REFERENCES product(product_id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS transaction (
      transaction_id INT AUTO_INCREMENT PRIMARY KEY,
      shift_id INT DEFAULT NULL,
      discount_id INT DEFAULT NULL,
      user_id INT DEFAULT NULL,
      receipt_no VARCHAR(100) DEFAULT NULL UNIQUE,
      payment_method VARCHAR(50) DEFAULT 'Unknown',
      amount_tendered DECIMAL(10,2) NOT NULL DEFAULT 0,
      transaction_status VARCHAR(20) NOT NULL DEFAULT 'completed',
      void_reason TEXT DEFAULT NULL,
      voided_by INT DEFAULT NULL,
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      tax DECIMAL(10,2) NOT NULL DEFAULT 0,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      change_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_transaction_user FOREIGN KEY (user_id) REFERENCES user(user_id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS transaction_item (
      transaction_items_id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      stock_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      line_total DECIMAL(10,2) NOT NULL DEFAULT 0,
      date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_transaction_item_transaction FOREIGN KEY (transaction_id) REFERENCES transaction(transaction_id) ON DELETE CASCADE,
      CONSTRAINT fk_transaction_item_stock FOREIGN KEY (stock_id) REFERENCES stock(stock_id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS cashier_shift (
      shift_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      starting_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
      ending_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
      starting_inventory INT NOT NULL DEFAULT 0,
      ending_inventory INT NOT NULL DEFAULT 0,
      total_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
      shift_date DATE DEFAULT NULL,
      time_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      time_out TIMESTAMP DEFAULT NULL,
      CONSTRAINT fk_shift_user FOREIGN KEY (user_id) REFERENCES user(user_id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS discount_eligibility (
      discount_id INT AUTO_INCREMENT PRIMARY KEY,
      discount_type VARCHAR(30) NOT NULL UNIQUE,
      discount_rate DECIMAL(5,2) NOT NULL DEFAULT 0
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      email VARCHAR(191) NOT NULL UNIQUE,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'cashier',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      sku VARCHAR(100) NOT NULL UNIQUE,
      barcode VARCHAR(100) NOT NULL UNIQUE,
      category VARCHAR(100) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT 0,
      image VARCHAR(255) DEFAULT NULL,
      description TEXT DEFAULT NULL,
      cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      threshold INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      payment_method VARCHAR(50) DEFAULT 'Unknown',
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      discount DECIMAL(10,2) NOT NULL DEFAULT 0,
      tax DECIMAL(10,2) NOT NULL DEFAULT 0,
      total DECIMAL(10,2) NOT NULL DEFAULT 0
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS transaction_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      product_id VARCHAR(100) NOT NULL,
      name VARCHAR(150) NOT NULL,
      sku VARCHAR(100) NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      quantity INT NOT NULL DEFAULT 1,
      line_total DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_tx_items_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    ) ENGINE=InnoDB`
  ];

  for (const statement of schemaStatements) {
    await pool.query(statement);
  }


  await pool.query("INSERT IGNORE INTO role (role_type) VALUES ('cashier'), ('manager'), ('admin'), ('super_admin')");
  await pool.query("INSERT IGNORE INTO category (name, status) VALUES ('General', 'active'), ('Beverages', 'active'), ('Bakery', 'active'), ('Produce', 'active'), ('Dairy', 'active'), ('Snacks', 'active'), ('Household', 'active'), ('Electronics', 'active')");
  await pool.query("INSERT IGNORE INTO discount_eligibility (discount_type, discount_rate) VALUES ('Senior', 20.00), ('PWD', 20.00), ('Student', 20.00)");
  console.log('MySQL schema initialized');
}

async function closePool() {
  await pool.end();
}

module.exports = { db, initDatabase, closePool, pool };
