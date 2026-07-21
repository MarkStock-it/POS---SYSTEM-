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
        $addColumn = function ($table, $column, $definition) use ($mysqli) {
            $stmt = $mysqli->prepare('SELECT COUNT(*) AS `count` FROM `information_schema`.`COLUMNS` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ? AND `COLUMN_NAME` = ?');
            $stmt->bind_param('ss', $table, $column);
            $stmt->execute();
            if ((int) $stmt->get_result()->fetch_assoc()['count'] === 0) {
                $mysqli->query("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
            }
        };
        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `role` (
                `role_id` INT AUTO_INCREMENT PRIMARY KEY,
                `role_type` VARCHAR(30) NOT NULL UNIQUE
            ) ENGINE=InnoDB"
        );

        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `user` (
                `user_id` INT AUTO_INCREMENT PRIMARY KEY,
                `first_name` VARCHAR(100) NOT NULL,
                `middle_name` VARCHAR(100) DEFAULT NULL,
                `last_name` VARCHAR(100) NOT NULL,
                `password_hash` VARCHAR(255) NOT NULL,
                `role_id` INT NOT NULL,
                `status` VARCHAR(20) NOT NULL DEFAULT 'active',
                `email` VARCHAR(191) NOT NULL UNIQUE,
                `username` VARCHAR(100) DEFAULT NULL UNIQUE,
                `phone` VARCHAR(30) DEFAULT NULL,
                `branch_location` VARCHAR(150) DEFAULT NULL,
                `date_hired` DATE DEFAULT NULL,
                `employment_status` VARCHAR(30) NOT NULL DEFAULT 'active',
                `pin_hash` VARCHAR(255) DEFAULT NULL,
                `last_login_at` TIMESTAMP NULL DEFAULT NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `role`(`role_id`)
            ) ENGINE=InnoDB"
        );

        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `branch` (
                `branch_id` INT AUTO_INCREMENT PRIMARY KEY,
                `branch_name` VARCHAR(150) NOT NULL UNIQUE,
                `status` VARCHAR(20) NOT NULL DEFAULT 'active',
                `created_by` INT DEFAULT NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB"
        );
        $mysqli->query("INSERT IGNORE INTO `branch` (`branch_name`, `status`) VALUES ('Main Branch', 'active')");

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
        $addColumn('product', 'barcode', 'VARCHAR(100) DEFAULT NULL UNIQUE AFTER `product_code`');
        $addColumn('product', 'description', 'TEXT DEFAULT NULL AFTER `name`');

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
                `variance` INT NOT NULL DEFAULT 0,
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
                `shift_duration_seconds` INT UNSIGNED DEFAULT NULL,
                CONSTRAINT `fk_shift_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`)
            ) ENGINE=InnoDB"
        );

        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `shift_report` (
                `report_id` INT AUTO_INCREMENT PRIMARY KEY,
                `shift_id` INT NOT NULL UNIQUE,
                `user_id` INT NOT NULL,
                `login_timestamp` DATETIME NOT NULL,
                `logout_timestamp` DATETIME NOT NULL,
                `shift_duration_seconds` INT UNSIGNED NOT NULL DEFAULT 0,
                `total_sales` DECIMAL(10,2) NOT NULL DEFAULT 0,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT `fk_shift_report_shift` FOREIGN KEY (`shift_id`) REFERENCES `cashier_shift`(`shift_id`),
                CONSTRAINT `fk_shift_report_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`)
            ) ENGINE=InnoDB"
        );

        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `daily_report` (
                `daily_report_id` INT AUTO_INCREMENT PRIMARY KEY,
                `report_date` DATE NOT NULL UNIQUE,
                `shift_count` INT UNSIGNED NOT NULL DEFAULT 0,
                `cashier_count` INT UNSIGNED NOT NULL DEFAULT 0,
                `total_shift_seconds` BIGINT UNSIGNED NOT NULL DEFAULT 0,
                `transaction_count` INT UNSIGNED NOT NULL DEFAULT 0,
                `gross_sales` DECIMAL(12,2) NOT NULL DEFAULT 0,
                `generated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB"
        );
        $mysqli->query(
            "CREATE OR REPLACE VIEW `reports_view` AS
             SELECT `daily_report_id` AS `report_id`, 'eod_summary' AS `report_type`, `report_date`, `shift_count`, `cashier_count`, `total_shift_seconds`, `transaction_count`, `gross_sales`, `generated_at`
             FROM `daily_report`"
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

        // Reconcile installations created with the older checkout schema.
        $addColumn('transaction', 'user_id', 'INT DEFAULT NULL');
        $addColumn('transaction', 'receipt_no', 'VARCHAR(100) DEFAULT NULL');
        $addColumn('transaction', 'payment_method', "VARCHAR(50) DEFAULT 'Unknown'");
        $addColumn('transaction', 'amount_tendered', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        $addColumn('transaction', 'transaction_status', "VARCHAR(20) NOT NULL DEFAULT 'completed'");
        $addColumn('transaction', 'subtotal', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        $addColumn('transaction', 'tax', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        $addColumn('transaction', 'total', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        $addColumn('transaction', 'change_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        $addColumn('transaction_item', 'unit_price', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        $addColumn('transaction_item', 'line_total', 'DECIMAL(10,2) NOT NULL DEFAULT 0');

        $receiptTypeStmt = $mysqli->prepare('SELECT `DATA_TYPE` FROM `information_schema`.`COLUMNS` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ? AND `COLUMN_NAME` = ?');
        $receiptTable = 'transaction';
        $receiptColumn = 'receipt_no';
        $receiptTypeStmt->bind_param('ss', $receiptTable, $receiptColumn);
        $receiptTypeStmt->execute();
        $receiptType = strtolower((string) ($receiptTypeStmt->get_result()->fetch_assoc()['DATA_TYPE'] ?? ''));
        if ($receiptType !== 'varchar') {
            $mysqli->query('ALTER TABLE `transaction` MODIFY COLUMN `receipt_no` VARCHAR(100) DEFAULT NULL');
        }

        $addColumn('user', 'first_name', 'VARCHAR(100) DEFAULT NULL AFTER `user_id`');
        $addColumn('user', 'middle_name', 'VARCHAR(100) DEFAULT NULL AFTER `first_name`');
        $addColumn('user', 'last_name', 'VARCHAR(100) DEFAULT NULL AFTER `middle_name`');
        $addColumn('user', 'username', 'VARCHAR(100) DEFAULT NULL UNIQUE AFTER `email`');
        $addColumn('user', 'phone', 'VARCHAR(30) DEFAULT NULL AFTER `username`');
        $addColumn('user', 'branch_location', 'VARCHAR(150) DEFAULT NULL AFTER `phone`');
        $addColumn('user', 'branch_id', 'INT DEFAULT NULL AFTER `branch_location`');
        $addColumn('user', 'date_hired', 'DATE DEFAULT NULL AFTER `branch_location`');
        $addColumn('user', 'employment_status', "VARCHAR(30) NOT NULL DEFAULT 'active' AFTER `date_hired`");
        $addColumn('user', 'pin_hash', 'VARCHAR(255) DEFAULT NULL AFTER `employment_status`');
        $addColumn('user', 'last_login_at', 'TIMESTAMP NULL DEFAULT NULL AFTER `pin_hash`');
        $addColumn('cashier_shift', 'shift_duration_seconds', 'INT UNSIGNED DEFAULT NULL AFTER `time_out`');
        $addColumn('stock_check', 'variance', 'INT NOT NULL DEFAULT 0 AFTER `expected_quantity`');
        $mysqli->query('UPDATE `stock_check` SET `variance` = `counted_quantity` - `expected_quantity`');

        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `user_device` (
                `device_id` INT AUTO_INCREMENT PRIMARY KEY,
                `user_id` INT NOT NULL,
                `device_token` CHAR(64) NOT NULL,
                `device_name` VARCHAR(150) NOT NULL,
                `last_active_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY `uq_user_device_token` (`user_id`, `device_token`),
                CONSTRAINT `fk_device_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`) ON DELETE CASCADE
            ) ENGINE=InnoDB"
        );

        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `permission` (
                `permission_id` INT AUTO_INCREMENT PRIMARY KEY,
                `permission_key` VARCHAR(100) NOT NULL UNIQUE,
                `permission_label` VARCHAR(150) NOT NULL
            ) ENGINE=InnoDB"
        );
        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `role_permission` (
                `role_id` INT NOT NULL,
                `permission_id` INT NOT NULL,
                PRIMARY KEY (`role_id`, `permission_id`),
                CONSTRAINT `fk_role_permission_role` FOREIGN KEY (`role_id`) REFERENCES `role`(`role_id`) ON DELETE CASCADE,
                CONSTRAINT `fk_role_permission_permission` FOREIGN KEY (`permission_id`) REFERENCES `permission`(`permission_id`) ON DELETE CASCADE
            ) ENGINE=InnoDB"
        );
        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `user_permission` (
                `user_id` INT NOT NULL,
                `permission_id` INT NOT NULL,
                PRIMARY KEY (`user_id`, `permission_id`),
                CONSTRAINT `fk_user_permission_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`) ON DELETE CASCADE,
                CONSTRAINT `fk_user_permission_permission` FOREIGN KEY (`permission_id`) REFERENCES `permission`(`permission_id`) ON DELETE CASCADE
            ) ENGINE=InnoDB"
        );

        $mysqli->query(
            "CREATE TABLE IF NOT EXISTS `system_settings` (
                `setting_key` VARCHAR(100) NOT NULL PRIMARY KEY,
                `setting_value` TEXT NOT NULL,
                `updated_by` INT DEFAULT NULL,
                `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT `fk_settings_user` FOREIGN KEY (`updated_by`) REFERENCES `user`(`user_id`) ON DELETE SET NULL
            ) ENGINE=InnoDB"
        );

        $mysqli->query(
            "INSERT INTO `permission` (`permission_key`, `permission_label`) VALUES
                ('manage_admins', 'Manage administrators'),
                ('manage_staff', 'Manage staff accounts'),
                ('manage_inventory', 'Manage inventory'),
                ('view_transactions', 'View transactions'),
                ('approve_transactions', 'Approve flagged transactions'),
                ('generate_reports', 'Generate reports'),
                ('configure_security', 'Configure security')
             ON DUPLICATE KEY UPDATE `permission_label` = VALUES(`permission_label`)"
        );
        $mysqli->query(
            "INSERT IGNORE INTO `role_permission` (`role_id`, `permission_id`)
             SELECT `r`.`role_id`, `p`.`permission_id` FROM `role` `r` JOIN `permission` `p`
             WHERE (`r`.`role_type` = 'super_admin')
                OR (`r`.`role_type` = 'admin' AND `p`.`permission_key` IN ('manage_staff','manage_inventory','view_transactions','approve_transactions','generate_reports'))
                OR (`r`.`role_type` = 'manager' AND `p`.`permission_key` IN ('manage_inventory','view_transactions','approve_transactions','generate_reports'))
                OR (`r`.`role_type` = 'cashier' AND `p`.`permission_key` IN ('view_transactions'))"
        );

    } catch (Exception $e) {
        // Logs the error to your server's PHP error log without breaking the UI
        error_log("Schema initialization error: " . $e->getMessage());
    }
}

// Executes safely. Will instantly bypass if tables are already built.
ensureSchema($mysqli);
?>
