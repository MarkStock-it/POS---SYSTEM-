<?php
// Run from the CLI after taking a database backup. db.php performs the
// idempotent, information_schema-guarded schema creation used by the app.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

try {
    require_once __DIR__ . '/db.php';
    $required = [
        'user' => ['phone', 'branch_location', 'date_hired', 'employment_status', 'pin_hash', 'last_login_at'],
        'user_device' => ['device_id', 'user_id', 'device_token'],
        'permission' => ['permission_id', 'permission_key'],
        'role_permission' => ['role_id', 'permission_id'],
        'user_permission' => ['user_id', 'permission_id'],
        'system_settings' => ['setting_key', 'setting_value', 'updated_by'],
    ];
    foreach ($required as $table => $columns) {
        $stmt = $mysqli->prepare('SELECT `COLUMN_NAME` FROM `information_schema`.`COLUMNS` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ?');
        $stmt->bind_param('s', $table);
        $stmt->execute();
        $present = array_column($stmt->get_result()->fetch_all(MYSQLI_ASSOC), 'COLUMN_NAME');
        $missing = array_diff($columns, $present);
        if ($missing) throw new RuntimeException("{$table} is missing: " . implode(', ', $missing));
        echo "OK: {$table}\n";
    }
    echo "Migration completed successfully.\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'Migration failed: ' . $error->getMessage() . "\n");
    exit(1);
}
