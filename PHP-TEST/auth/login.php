<?php
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/../db.php';

$data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$identifier = trim((string) ($data['identifier'] ?? ''));
$password = (string) ($data['password'] ?? '');

if ($identifier === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Identifier and password are required.']);
    exit;
}

$stmt = $mysqli->prepare(
    'SELECT `u`.`user_id` AS `id`, `u`.`full_name`, `u`.`email`, `u`.`username`, `u`.`password_hash`, `u`.`last_login_at`, `u`.`status`, `u`.`employment_status`, `r`.`role_type` AS `role` FROM `user` AS `u` JOIN `role` AS `r` ON `u`.`role_id` = `r`.`role_id` WHERE LOWER(`u`.`email`) = ? OR LOWER(`u`.`username`) = ? LIMIT 1'
);
$needle = strtolower($identifier);
$stmt->bind_param('ss', $needle, $needle);
$stmt->execute();
$result = $stmt->get_result();
$user = $result->fetch_assoc();

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials.']);
    exit;
}
if ($user['status'] !== 'active' || $user['employment_status'] === 'inactive') {
    http_response_code(403);
    echo json_encode(['error' => 'This account is inactive. Contact an administrator.']);
    exit;
}

session_regenerate_id(true);
$_SESSION['pos_user_id'] = (int) $user['id'];
$_SESSION['pos_previous_login_at'] = $user['last_login_at'] ?? null;
$loginUserId = (int) $user['id'];
$mysqli->query('UPDATE `user` SET `last_login_at` = CURRENT_TIMESTAMP WHERE `user_id` = ' . $loginUserId);

$deviceToken = (string) ($_COOKIE['pos_device_token'] ?? '');
if (!preg_match('/^[a-f0-9]{64}$/', $deviceToken)) {
    $deviceToken = bin2hex(random_bytes(32));
    setcookie('pos_device_token', $deviceToken, time() + 31536000, '/', '', !empty($_SERVER['HTTPS']), true);
}
$userAgent = (string) ($_SERVER['HTTP_USER_AGENT'] ?? 'Web browser');
$deviceName = preg_match('/Mobile|Android|iPhone|iPad/i', $userAgent) ? 'Mobile browser' : 'POS workstation browser';
$deviceStmt = $mysqli->prepare('INSERT INTO `user_device` (`user_id`, `device_token`, `device_name`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `device_name` = VALUES(`device_name`), `last_active_at` = CURRENT_TIMESTAMP');
$deviceStmt->bind_param('iss', $loginUserId, $deviceToken, $deviceName);
$deviceStmt->execute();

$roleValue = strtolower(trim((string) ($user['role'] ?? '')));
if (in_array($roleValue, ['super_admin', 'super-admin', 'superadmin', 'super admin'], true)) {
    $normalizedRole = 'super-admin';
} elseif (in_array($roleValue, ['administrator', 'admin'], true)) {
    $normalizedRole = 'admin';
} elseif ($roleValue === 'manager') {
    $normalizedRole = 'manager';
} else {
    $normalizedRole = 'cashier';
}

echo json_encode([
    'id' => (int) $user['id'],
    'fullName' => $user['full_name'],
    'email' => $user['email'],
    'username' => $user['username'],
    'role' => $normalizedRole,
]);
