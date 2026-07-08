<?php
$host = getenv('DB_HOST') ?: 'localhost';
$user = getenv('DB_USER') ?: 's25103705_POSSYSTER';
$password = getenv('DB_PASSWORD') ?: 'Jumong09';
$database = getenv('DB_NAME') ?: 's25103705_POSSYSTER';
$port = (int) (getenv('DB_PORT') ?: 3306);
$socket = getenv('DB_SOCKET') ?: null;

$mysqli = new mysqli($host, $user, $password, $database, $port, $socket);

if ($mysqli->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $mysqli->connect_error]);
    exit;
}

$mysqli->set_charset('utf8mb4');

function ensureSchema($mysqli) {
    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS `role` (
            `role_id` INT AUTO_INCREMENT PRIMARY KEY,
            `role_type` VARCHAR(30) NOT NULL UNIQUE
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS `user` (
            `user_id` INT AUTO_INCREMENT PRIMARY KEY,
            `full_name` VARCHAR(150) NOT NULL,
            `password_hash` VARCHAR(255) NOT NULL,
            `role_id` INT NOT NULL,
            `status` VARCHAR(20) NOT NULL DEFAULT 'active',
            `email` VARCHAR(191) NOT NULL UNIQUE,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `role`(`role_id`)
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS `category` (
            `category_id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(150) NOT NULL,
            `status` VARCHAR(20) NOT NULL DEFAULT 'active',
            `delete_flag` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS `product` (
            `product_id` INT AUTO_INCREMENT PRIMARY KEY,
            `product_code` VARCHAR(100) NOT NULL UNIQUE,
            `category_id` INT DEFAULT NULL,
            `name` VARCHAR(150) NOT NULL,
            `price` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `restock_threshold` INT NOT NULL DEFAULT 0,
            `status` VARCHAR(20) NOT NULL DEFAULT 'active',
            `delete_flag` TINYINT(1) NOT NULL DEFAULT 0,
            `image_path` VARCHAR(255) DEFAULT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT `fk_product_category` FOREIGN KEY (`category_id`) REFERENCES `category`(`category_id`)
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS `stock` (
            `stock_id` INT AUTO_INCREMENT PRIMARY KEY,
            `product_id` INT NOT NULL,
            `quantity` INT NOT NULL DEFAULT 0,
            `expiry_date` DATE DEFAULT NULL,
            `date_added` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT `fk_stock_product` FOREIGN KEY (`product_id`) REFERENCES `product`(`product_id`) ON DELETE CASCADE
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS `transaction` (
            `transaction_id` INT AUTO_INCREMENT PRIMARY KEY,
            `shift_id` INT DEFAULT NULL,
            `discount_id` INT DEFAULT NULL,
            `user_id` INT DEFAULT NULL,
            `receipt_no` VARCHAR(100) DEFAULT NULL UNIQUE,
            `payment_method` VARCHAR(50) DEFAULT 'Unknown',
            `amount_tendered` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `transaction_status` VARCHAR(20) NOT NULL DEFAULT 'completed',
            `void_reason` TEXT DEFAULT NULL,
            `voided_by` INT DEFAULT NULL,
            `subtotal` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `tax` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `total` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `change_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `transaction_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT `fk_transaction_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`)
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS `transaction_item` (
            `transaction_items_id` INT AUTO_INCREMENT PRIMARY KEY,
            `transaction_id` INT NOT NULL,
            `stock_id` INT NOT NULL,
            `quantity` INT NOT NULL DEFAULT 1,
            `unit_price` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `line_total` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `date_added` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT `fk_transaction_item_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `transaction`(`transaction_id`) ON DELETE CASCADE,
            CONSTRAINT `fk_transaction_item_stock` FOREIGN KEY (`stock_id`) REFERENCES `stock`(`stock_id`)
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS `cashier_shift` (
            `shift_id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `starting_cash` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `ending_cash` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `starting_inventory` INT NOT NULL DEFAULT 0,
            `ending_inventory` INT NOT NULL DEFAULT 0,
            `total_sales` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `shift_date` DATE DEFAULT NULL,
            `time_in` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `time_out` TIMESTAMP DEFAULT NULL,
            CONSTRAINT `fk_shift_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`)
        ) ENGINE=InnoDB"
    );

    $mysqli->query(
        "CREATE TABLE IF NOT EXISTS `discount_eligibility` (
            `discount_id` INT AUTO_INCREMENT PRIMARY KEY,
            `discount_type` VARCHAR(30) NOT NULL UNIQUE,
            `discount_rate` DECIMAL(5,2) NOT NULL DEFAULT 0
        ) ENGINE=InnoDB"
    );

    $mysqli->query("INSERT IGNORE INTO `role` (`role_type`) VALUES ('cashier'), ('manager'), ('admin'), ('super_admin')");
    $mysqli->query("INSERT IGNORE INTO `category` (`name`, `status`) VALUES ('General', 'active')");

    $adminHash = password_hash('superadmin123', PASSWORD_DEFAULT);
    $adminStmt = $mysqli->prepare(
        "INSERT IGNORE INTO `user` (`full_name`, `password_hash`, `role_id`, `status`, `email`) SELECT ?, ?, `role_id`, 'active', ? FROM `role` WHERE `role_type` = 'super_admin'"
    );
    $adminStmt->bind_param('sss', $fullName, $adminHash, $email);
    $fullName = 'Super Admin Demo';
    $email = 'superadmin@pos.com';
    $adminStmt->execute();

    $cashierHash = password_hash('password', PASSWORD_DEFAULT);
    $cashierStmt = $mysqli->prepare(
        "INSERT IGNORE INTO `user` (`full_name`, `password_hash`, `role_id`, `status`, `email`) SELECT ?, ?, `role_id`, 'active', ? FROM `role` WHERE `role_type` = 'cashier'"
    );
    $cashierStmt->bind_param('sss', $cashierName, $cashierHash, $cashierEmail);
    $cashierName = 'Demo User';
    $cashierEmail = 'demo@pos.com';
    $cashierStmt->execute();

    $mysqli->query(
        "INSERT IGNORE INTO `product` (`product_code`, `category_id`, `name`, `price`, `restock_threshold`, `status`, `image_path`) VALUES
        ('0001', 1, 'Bottled Water 500ml', 1.25, 10, 'active', '/images/water.jpg'),
        ('0002', 1, 'Croissant', 2.50, 8, 'active', '/images/crossaint.jpeg'),
        ('0003', 1, 'Banana (per lb)', 0.69, 20, 'active', '/images/bunch-bananas-6175887.jpg.webp'),
        ('0004', 1, 'Whole Milk 1L', 3.10, 10, 'active', '/images/milk.jpeg')"
    );

    $mysqli->query(
        "INSERT IGNORE INTO `stock` (`product_id`, `quantity`) SELECT `product_id`, 50 FROM `product` WHERE `product_code` = '0001'"
    );
    $mysqli->query(
        "INSERT IGNORE INTO `stock` (`product_id`, `quantity`) SELECT `product_id`, 30 FROM `product` WHERE `product_code` = '0002'"
    );
    $mysqli->query(
        "INSERT IGNORE INTO `stock` (`product_id`, `quantity`) SELECT `product_id`, 100 FROM `product` WHERE `product_code` = '0003'"
    );
    $mysqli->query(
        "INSERT IGNORE INTO `stock` (`product_id`, `quantity`) SELECT `product_id`, 40 FROM `product` WHERE `product_code` = '0004'"
    );

    $mysqli->query("INSERT IGNORE INTO `discount_eligibility` (`discount_type`, `discount_rate`) VALUES ('Senior', 20.00), ('PWD', 20.00), ('Student', 20.00)");
}

ensureSchema($mysqli);
