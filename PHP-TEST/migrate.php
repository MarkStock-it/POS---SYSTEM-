<?php
try {
    require_once __DIR__ . '/db.php';
} catch (Throwable $e) {
    echo "ERROR: Could not load db.php: " . $e->getMessage() . "\n";
    exit(1);
}

if (!isset($mysqli) || !($mysqli instanceof mysqli)) {
    echo "ERROR: Database connection not available.\n";
    exit(1);
}

$statements = [
    "ALTER TABLE `user` MODIFY `status` VARCHAR(20) NOT NULL DEFAULT 'active';",
    "ALTER TABLE `user` MODIFY `full_name` VARCHAR(150) NOT NULL;",
    "ALTER TABLE `user` ADD COLUMN IF NOT EXISTS `username` VARCHAR(100) NULL UNIQUE AFTER `email`;",
    "ALTER TABLE `user` ADD COLUMN IF NOT EXISTS `phone` VARCHAR(30) DEFAULT NULL AFTER `username`;",
    "ALTER TABLE `user` ADD COLUMN IF NOT EXISTS `branch_location` VARCHAR(150) DEFAULT NULL AFTER `phone`;",
    "ALTER TABLE `user` ADD COLUMN IF NOT EXISTS `date_hired` DATE DEFAULT NULL AFTER `branch_location`;",
    "ALTER TABLE `user` ADD COLUMN IF NOT EXISTS `employment_status` VARCHAR(30) NOT NULL DEFAULT 'active' AFTER `date_hired`;",
    "ALTER TABLE `user` ADD COLUMN IF NOT EXISTS `pin_hash` VARCHAR(255) DEFAULT NULL AFTER `employment_status`;",
    "ALTER TABLE `user` ADD COLUMN IF NOT EXISTS `last_login_at` TIMESTAMP NULL DEFAULT NULL AFTER `pin_hash`;",
    "ALTER TABLE `category` MODIFY `status` VARCHAR(20) NOT NULL DEFAULT 'active';",
    "ALTER TABLE `product` MODIFY `status` VARCHAR(20) NOT NULL DEFAULT 'active';"
];

foreach ($statements as $statement) {
    try {
        $mysqli->query($statement);
        echo "SUCCESS: {$statement}\n";
    } catch (Exception $e) {
        $message = trim($e->getMessage());
        if (stripos($message, 'duplicate') !== false || stripos($message, 'already exists') !== false) {
            echo "SKIPPED: {$statement} (already applied)\n";
            continue;
        }
        echo "FAILED: {$statement}\n";
        echo "ERROR: {$message}\n";
    }
}
