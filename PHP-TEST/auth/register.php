<?php
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../api-auth.php';

$creator = requireUser($mysqli, ['admin', 'super_admin']);

$data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$firstName = trim((string) ($data['firstName'] ?? ''));
$middleName = trim((string) ($data['middleName'] ?? ''));
$lastName = trim((string) ($data['lastName'] ?? ''));
$fullName = trim(implode(' ', array_filter([$firstName, $middleName, $lastName], static function ($part) { return $part !== ''; })));
$email = strtolower(trim((string) ($data['email'] ?? '')));
$username = strtolower(trim((string) ($data['username'] ?? explode('@', $email)[0])));
$password = (string) ($data['password'] ?? '');
$role = strtolower(trim((string) ($data['role'] ?? 'cashier')));
$phone = trim((string) ($data['phone'] ?? ''));
$branchId = (int) ($data['branchId'] ?? 0);
$dateHired = trim((string) ($data['dateHired'] ?? ''));
$employmentStatus = strtolower(trim((string) ($data['employmentStatus'] ?? 'active')));
$pin = (string) ($data['pin'] ?? '');

if ($firstName === '' || $lastName === '' || $email === '' || $username === '' || $password === '' || $phone === '' || $branchId <= 0 || $dateHired === '') {
    http_response_code(400);
    echo json_encode(['error' => 'First name, last name, email, username, phone, branch, hire date, and password are required.']);
    exit;
}
if (mb_strlen($firstName) < 2 || mb_strlen($firstName) > 100 || mb_strlen($lastName) < 2 || mb_strlen($lastName) > 100 || mb_strlen($middleName) > 100) {
    http_response_code(422);
    echo json_encode(['error' => 'First and last names must contain 2 to 100 characters. Middle name may contain up to 100 characters.']);
    exit;
}
$branchStmt = $mysqli->prepare('SELECT `branch_id`, `branch_name` FROM `branch` WHERE `branch_id` = ? AND `status` = "active" LIMIT 1');
$branchStmt->bind_param('i', $branchId);
$branchStmt->execute();
$branchRow = $branchStmt->get_result()->fetch_assoc();
if (!$branchRow) apiJson(422, ['error' => 'Select an existing active branch.']);
$branchLocation = $branchRow['branch_name'];
if (!preg_match('/^[a-zA-Z0-9_.-]{3,100}$/', $username)) {
    http_response_code(422); echo json_encode(['error' => 'Username format is invalid.']); exit;
}
if (!preg_match('/^[0-9+()\-\s]{7,30}$/', $phone)) {
    http_response_code(422); echo json_encode(['error' => 'Phone number is invalid.']); exit;
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateHired)) {
    http_response_code(422); echo json_encode(['error' => 'Date hired is invalid.']); exit;
}
if ($pin !== '' && !preg_match('/^[0-9]{4,6}$/', $pin)) {
    http_response_code(422); echo json_encode(['error' => 'PIN must contain 4 to 6 digits.']); exit;
}
$allowedEmploymentStatuses = ['active', 'probationary', 'part-time', 'on-leave', 'inactive'];
if (!in_array($employmentStatus, $allowedEmploymentStatuses, true)) $employmentStatus = 'active';

$roleType = in_array($role, ['manager', 'admin', 'super_admin', 'super-admin'], true) ? ($role === 'super-admin' ? 'super_admin' : $role) : 'cashier';
if ($creator['role'] === 'admin' && !in_array($roleType, ['manager', 'cashier'], true)) {
    apiJson(403, ['error' => 'Admins can only create manager and cashier accounts.']);
}

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
$pinHash = $pin === '' ? null : password_hash($pin, PASSWORD_DEFAULT);
$accountStatus = $employmentStatus === 'inactive' ? 'inactive' : 'active';
$stmt = $mysqli->prepare('INSERT INTO `user` (`first_name`, `middle_name`, `last_name`, `password_hash`, `role_id`, `status`, `email`, `username`, `phone`, `branch_location`, `branch_id`, `date_hired`, `employment_status`, `pin_hash`) VALUES (?, NULLIF(?, \'\'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$stmt->bind_param('ssssisssssisss', $firstName, $middleName, $lastName, $hash, $roleRow['role_id'], $accountStatus, $email, $username, $phone, $branchLocation, $branchId, $dateHired, $employmentStatus, $pinHash);

try {
    $stmt->execute();
    writeAudit($mysqli, $creator, 'Created ' . $roleType . ' account for ' . $fullName, 'user', (string) $mysqli->insert_id);
} catch (mysqli_sql_exception $e) {
    if ((int) $e->getCode() === 1062) {
        http_response_code(409);
        echo json_encode(['error' => 'That email or username already exists.']);
        exit;
    }

    error_log('Registration failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Registration failed. Please try again.']);
    exit;
}

$responseRole = $roleType === 'super_admin' ? 'super-admin' : $roleType;
echo json_encode([
    'id' => (int) $mysqli->insert_id,
    'fullName' => $fullName,
    'firstName' => $firstName,
    'middleName' => $middleName,
    'lastName' => $lastName,
    'email' => $email,
    'username' => $username,
    'role' => $responseRole,
    'phone' => $phone,
    'branchLocation' => $branchLocation,
    'branchId' => $branchId,
    'dateHired' => $dateHired,
    'employmentStatus' => $employmentStatus,
]);
