<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../PHP-TEST/db.php';

$data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$identifier = trim((string) ($data['identifier'] ?? ''));
$password = (string) ($data['password'] ?? '');

if ($identifier === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Identifier and password are required.']);
    exit;
}

$stmt = $mysqli->prepare('SELECT id, full_name, email, username, role, password FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1');
$needle = strtolower($identifier);
$stmt->bind_param('ss', $needle, $needle);
$stmt->execute();
$result = $stmt->get_result();
$user = $result->fetch_assoc();

if (!$user || !password_verify($password, $user['password'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials.']);
    exit;
}

unset($user['password']);
echo json_encode([
    'id' => (int) $user['id'],
    'fullName' => $user['full_name'],
    'email' => $user['email'],
    'username' => $user['username'],
    'role' => $user['role'],
]);
