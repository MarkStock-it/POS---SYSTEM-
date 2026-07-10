<?php
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
    'SELECT `u`.`user_id` AS `id`, `u`.`full_name`, `u`.`email`, `u`.`username`, `u`.`password_hash`, `r`.`role_type` AS `role` FROM `user` AS `u` JOIN `role` AS `r` ON `u`.`role_id` = `r`.`role_id` WHERE LOWER(`u`.`email`) = ? OR LOWER(`u`.`username`) = ? LIMIT 1'
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
