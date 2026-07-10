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
    "ALTER TABLE `user` MODIFY `full_name` VARCHAR(150) NOT NULL;"
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
