<?php
// One-time destructive demo reset. Run from the command line only:
// php PHP-TEST/reset-demo-db.php --confirm-reset
if (PHP_SAPI !== 'cli' || !in_array('--confirm-reset', $argv ?? [], true)) {
    http_response_code(403);
    fwrite(STDERR, "Run from CLI with --confirm-reset.\n");
    exit(1);
}

require_once __DIR__ . '/db.php';

$mysqli->query('SET FOREIGN_KEY_CHECKS = 0');
try {
    foreach (['transaction_items', 'transactions', 'products', 'users', 'roles'] as $legacyTable) {
        $mysqli->query("DROP TABLE IF EXISTS `{$legacyTable}`");
    }

    foreach ([
        'audit_log',
        'stock_check',
        'transaction_item',
        'transaction',
        'cashier_shift',
        'stock',
        'product',
        'category',
        'discount_eligibility',
        'user',
        'role',
    ] as $table) {
        $mysqli->query("TRUNCATE TABLE `{$table}`");
    }

    $mysqli->query(
        "INSERT INTO `role` (`role_id`, `role_type`) VALUES
            (1, 'cashier'),
            (2, 'manager'),
            (3, 'admin'),
            (4, 'super_admin')"
    );
} finally {
    $mysqli->query('SET FOREIGN_KEY_CHECKS = 1');
}

echo "Demo database reset complete. Legacy plural tables were dropped; canonical tables are empty; roles 1-4 were seeded.\n";
