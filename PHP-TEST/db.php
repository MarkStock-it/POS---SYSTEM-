<?php
$host = getenv('DB_HOST') ?: 'localhost';
$user = getenv('DB_USER') ?: 'root';
$password = getenv('DB_PASSWORD') ?: '';
$database = getenv('DB_NAME') ?: 'pos_system';

$mysqli = new mysqli($host, $user, $password, $database);

if ($mysqli->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $mysqli->connect_error]);
    exit;
}

$mysqli->set_charset('utf8mb4');

function ensureSchema($mysqli) {
    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            username VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'cashier',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            payment_method VARCHAR(50) DEFAULT 'Unknown',
            subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
            discount DECIMAL(10,2) NOT NULL DEFAULT 0,
            tax DECIMAL(10,2) NOT NULL DEFAULT 0,
            total DECIMAL(10,2) NOT NULL DEFAULT 0
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS transaction_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transaction_id INT NOT NULL,
            product_id INT NOT NULL,
            name VARCHAR(150) NOT NULL,
            sku VARCHAR(100) NOT NULL,
            unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
            quantity INT NOT NULL DEFAULT 1,
            line_total DECIMAL(10,2) NOT NULL DEFAULT 0,
            FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "INSERT IGNORE INTO users (full_name, email, username, password, role) VALUES
        ('Super Admin Demo', 'superadmin@pos.com', 'superadmin', 'superadmin123', 'super-admin'),
        ('Demo User', 'demo@pos.com', 'demouser', 'password', 'cashier')"
    );

    $mysqli->query(
        "INSERT IGNORE INTO products (name, sku, barcode, category, price, stock, image, description, cost, threshold) VALUES
        ('Bottled Water 500ml', '0001', '100000001', 'Beverages', 1.25, 50, '/images/water.jpg', 'Refreshing bottled water', 0.75, 10),
        ('Croissant', '0002', '100000002', 'Bakery', 2.50, 30, '/images/crossaint.jpeg', 'Fresh buttery croissant', 1.80, 8),
        ('Banana (per lb)', '0003', '100000003', 'Produce', 0.69, 100, '/images/bunch-bananas-6175887.jpg.webp', 'Fresh bananas', 0.35, 20),
        ('Whole Milk 1L', '0004', '100000004', 'Dairy', 3.10, 40, '/images/milk.jpeg', 'Whole milk', 2.20, 10),
        ('Potato Chips', '0005', '100000005', 'Snacks', 2.99, 25, '/images/Lays_XL_Classic_Laydown.png', 'Classic potato chips', 1.90, 8),
        ('Coffee Beans 250g', '0006', '100000006', 'Beverages', 6.75, 20, '/images/coffee.jpeg', 'Arabica coffee beans', 4.20, 6),
        ('Dish Soap 750ml', '0007', '100000007', 'Household', 3.45, 35, '/images/soap.jpg', 'Dish cleaning soap', 2.10, 8),
        ('USB-C Cable 1m', '0008', '100000008', 'Electronics', 8.99, 15, '/images/usb-c.jpeg', 'Fast charging cable', 6.50, 5)"
    );
}

ensureSchema($mysqli);
