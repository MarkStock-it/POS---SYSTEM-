<?php
session_start();
header('Content-Type: application/json');
ini_set('display_errors', '0');
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/api-auth.php';

$user = requireUser($mysqli, ['super_admin']);
$defaults = [
    'businessName' => 'MarkStock-it', 'branchName' => 'Main Branch', 'supportEmail' => '',
    'supportPhone' => '', 'receiptFooter' => 'Thank you for shopping with us!', 'currency' => 'PHP',
    'taxRate' => 8, 'lowStockThreshold' => 10, 'sessionTimeout' => 30, 'allowOfflineSales' => false,
    'requireVoidApproval' => true, 'lowStockNotifications' => true, 'darkTheme' => true
];

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        $result = $mysqli->query('SELECT `setting_key`, `setting_value` FROM `system_settings`');
        $settings = $defaults;
        while ($row = $result->fetch_assoc()) {
            $value = json_decode($row['setting_value'], true);
            $settings[$row['setting_key']] = json_last_error() === JSON_ERROR_NONE ? $value : $row['setting_value'];
        }
        apiJson(200, $settings);
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PUT') apiJson(405, ['error' => 'Method not allowed.']);
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) apiJson(400, ['error' => 'A JSON settings object is required.']);
    $allowed = array_keys($defaults);
    $numeric = ['taxRate' => [0, 100], 'lowStockThreshold' => [0, 1000000], 'sessionTimeout' => [5, 1440]];
    $stmt = $mysqli->prepare('INSERT INTO `system_settings` (`setting_key`, `setting_value`, `updated_by`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_by` = VALUES(`updated_by`), `updated_at` = CURRENT_TIMESTAMP');
    foreach ($data as $key => $value) {
        if (!in_array($key, $allowed, true)) continue;
        if (isset($numeric[$key])) {
            if (!is_numeric($value) || $value < $numeric[$key][0] || $value > $numeric[$key][1]) apiJson(422, ['error' => "Invalid value for {$key}."]);
            $value = (float) $value;
        }
        if (is_string($value) && mb_strlen($value) > 2000) apiJson(422, ['error' => "Value for {$key} is too long."]);
        $encoded = json_encode($value);
        $userId = (int) $user['id'];
        $stmt->bind_param('ssi', $key, $encoded, $userId);
        $stmt->execute();
    }
    writeAudit($mysqli, $user, 'Updated system settings', 'system_settings', 'global');
    apiJson(200, ['success' => true]);
} catch (Throwable $error) {
    error_log('Settings API failed: ' . $error->getMessage());
    apiJson(500, ['error' => 'Unable to process system settings.']);
}
