<?php
$envFile = dirname(__DIR__) . '/.env';
if (is_readable($envFile)) {
    $env = parse_ini_file($envFile, false, INI_SCANNER_RAW);
    if (is_array($env)) {
        foreach ($env as $key => $value) {
            putenv($key . '=' . $value);
        }
    }
}

$host = getenv('DB_HOST') ?: 'localhost';
$user = getenv('DB_USER') ?: 's25103705_Ely';
$password = getenv('DB_PASSWORD') ?: '';
$database = getenv('DB_NAME') ?: 's25103705_Ely';
$port = (int) (getenv('DB_PORT') ?: 3306);
$socket = getenv('DB_SOCKET') ?: null;

// Enable MySQLi exceptions for robust error handling instead of silent failures
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    $mysqli = new mysqli($host, $user, $password, $database, $port, $socket);
    $mysqli->set_charset('utf8mb4');
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

function ensureSchema($mysqli) {
    try {
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
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY `uq_category_name` (`name`)
            ) ENGINE=InnoDB"
        );

        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `product` (
                `product_id` INT AUTO_INCREMENT PRIMARY KEY,
                `product_code` VARCHAR(100) NOT NULL UNIQUE,
                `barcode` VARCHAR(100) DEFAULT NULL UNIQUE,
                `category_id` INT DEFAULT NULL,
                `name` VARCHAR(150) NOT NULL,
                `description` TEXT DEFAULT NULL,
                `price` DECIMAL(10,2) NOT NULL DEFAULT 0,
                `cost_price` DECIMAL(10,2) NOT NULL DEFAULT 0,
                `restock_threshold` INT NOT NULL DEFAULT 0,
                `status` VARCHAR(20) NOT NULL DEFAULT 'active',
                `delete_flag` TINYINT(1) NOT NULL DEFAULT 0,
                `image_path` VARCHAR(255) DEFAULT NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT `fk_product_category` FOREIGN KEY (`category_id`) REFERENCES `category`(`category_id`)
            ) ENGINE=InnoDB"
        );

        $costColumn = $mysqli->query("SHOW COLUMNS FROM `product` LIKE 'cost_price'");
        if ($costColumn && $costColumn->num_rows === 0) {
            $mysqli->query("ALTER TABLE `product` ADD COLUMN `cost_price` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `price`");
        }
        $mysqli->query("ALTER TABLE `product` ADD COLUMN IF NOT EXISTS `barcode` VARCHAR(100) DEFAULT NULL UNIQUE AFTER `product_code`");
        $mysqli->query("ALTER TABLE `product` ADD COLUMN IF NOT EXISTS `description` TEXT DEFAULT NULL AFTER `name`");

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
            "CREATE TABLE IF NOT EXISTS `stock_check` (
                `stock_check_id` INT AUTO_INCREMENT PRIMARY KEY,
                `product_id` INT NOT NULL,
                `counted_quantity` INT NOT NULL,
                `expected_quantity` INT NOT NULL,
                `checked_by_user_id` INT DEFAULT NULL,
                `checked_by_name` VARCHAR(150) DEFAULT NULL,
                `checked_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_stock_check_product_time` (`product_id`, `checked_at`),
                CONSTRAINT `fk_stock_check_product` FOREIGN KEY (`product_id`) REFERENCES `product`(`product_id`) ON DELETE CASCADE,
                CONSTRAINT `fk_stock_check_user` FOREIGN KEY (`checked_by_user_id`) REFERENCES `user`(`user_id`) ON DELETE SET NULL
            ) ENGINE=InnoDB"
        );

        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `audit_log` (
                `audit_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                `actor_user_id` INT DEFAULT NULL,
                `actor_name` VARCHAR(150) NOT NULL,
                `actor_role` VARCHAR(30) DEFAULT NULL,
                `action_text` VARCHAR(500) NOT NULL,
                `entity_type` VARCHAR(50) DEFAULT NULL,
                `entity_id` VARCHAR(100) DEFAULT NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_audit_created_at` (`created_at`),
                CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`user_id`) ON DELETE SET NULL
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

        $mysqli->query(
            "INSERT INTO `role` (`role_id`, `role_type`) VALUES
                (1, 'cashier'),
                (2, 'manager'),
                (3, 'admin'),
                (4, 'super_admin')
             ON DUPLICATE KEY UPDATE `role_type` = VALUES(`role_type`)"
        );

    } catch (Exception $e) {
        // Logs the error to your server's PHP error log without breaking the UI
        error_log("Schema initialization error: " . $e->getMessage());
    }
}

// Executes safely. Will instantly bypass if tables are already built.
ensureSchema($mysqli);
?>
