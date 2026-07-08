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
    'SELECT `u`.`user_id` AS `id`, `u`.`full_name`, `u`.`email`, `u`.`password_hash`, `r`.`role_type` AS `role` FROM `user` AS `u` JOIN `role` AS `r` ON `u`.`role_id` = `r`.`role_id` WHERE LOWER(`u`.`email`) = ? LIMIT 1'
);
$needle = strtolower($identifier);
$stmt->bind_param('s', $needle);
$stmt->execute();
$result = $stmt->get_result();
$user = $result->fetch_assoc();

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials.']);
    exit;
}

$normalizedRole = $user['role'] === 'super_admin' ? 'super-admin' : ($user['role'] === 'admin' ? 'admin' : ($user['role'] === 'manager' ? 'manager' : 'cashier'));

echo json_encode([
    'id' => (int) $user['id'],
    'fullName' => $user['full_name'],
    'email' => $user['email'],
    'username' => $user['email'],
    'role' => $normalizedRole,
]);
