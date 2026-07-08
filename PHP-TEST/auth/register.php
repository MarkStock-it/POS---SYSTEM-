<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../db.php';

$data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$fullName = trim((string) ($data['fullName'] ?? ''));
$email = strtolower(trim((string) ($data['email'] ?? '')));
$username = strtolower(trim((string) ($data['username'] ?? explode('@', $email)[0])));
$password = (string) ($data['password'] ?? '');
$role = strtolower(trim((string) ($data['role'] ?? 'cashier')));

if ($fullName === '' || $email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Full name, email, and password are required.']);
    exit;
}

$roleType = in_array($role, ['manager', 'admin', 'super_admin', 'super-admin'], true) ? ($role === 'super-admin' ? 'super_admin' : $role) : 'cashier';

$roleStmt = $mysqli->prepare('SELECT `role_id` FROM `role` WHERE `role_type` = ? LIMIT 1');
$roleStmt->bind_param('s', $roleType);
$roleStmt->execute();
$roleRow = $roleStmt->get_result()->fetch_assoc();

if (!$roleRow) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid role.']);
    exit;
}

$hash = password_hash($password, PASSWORD_DEFAULT);
$stmt = $mysqli->prepare('INSERT INTO `user` (`full_name`, `password_hash`, `role_id`, `status`, `email`) VALUES (?, ?, ?, "active", ?)');
$stmt->bind_param('siss', $fullName, $hash, $roleRow['role_id'], $email);

if (!$stmt->execute()) {
    http_response_code(409);
    echo json_encode(['error' => 'That email already exists.']);
    exit;
}

echo json_encode([
    'id' => (int) $mysqli->insert_id,
    'fullName' => $fullName,
    'email' => $email,
    'username' => $username,
    'role' => $roleType,
]);
