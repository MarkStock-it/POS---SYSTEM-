<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../PHP-TEST/db.php';

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

$hash = password_hash($password, PASSWORD_DEFAULT);
$stmt = $mysqli->prepare('INSERT INTO users (full_name, email, username, password, role) VALUES (?, ?, ?, ?, ?)');
$stmt->bind_param('sssss', $fullName, $email, $username, $hash, $role);

if (!$stmt->execute()) {
    http_response_code(409);
    echo json_encode(['error' => 'That email or username already exists.']);
    exit;
}

echo json_encode([
    'id' => (int) $mysqli->insert_id,
    'fullName' => $fullName,
    'email' => $email,
    'username' => $username,
    'role' => $role,
]);
