<?php
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../api-auth.php';

$actor = requireUser($mysqli, ['admin', 'super_admin']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$userId = (int) ($_GET['id'] ?? 0);

if ($method === 'PUT') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $role = strtolower(trim((string) ($data['role'] ?? '')));
    $status = strtolower(trim((string) ($data['status'] ?? '')));
    if ($userId <= 0 || ($role === '' && $status === '')) {
        http_response_code(400);
        echo json_encode(['error' => 'User ID and an update are required.']);
        exit;
    }
    $actorUserId = (int) ($_SESSION['pos_user_id'] ?? 0);
    $actorStmt = $mysqli->prepare('SELECT `r`.`role_type` FROM `user` AS `u` JOIN `role` AS `r` ON `u`.`role_id` = `r`.`role_id` WHERE `u`.`user_id` = ?');
    $actorStmt->bind_param('i', $actorUserId);
    $actorStmt->execute();
    $actorRole = strtolower((string) (($actorStmt->get_result()->fetch_assoc()['role_type'] ?? '')));

    $targetStmt = $mysqli->prepare('SELECT `r`.`role_type` FROM `user` AS `u` JOIN `role` AS `r` ON `u`.`role_id` = `r`.`role_id` WHERE `u`.`user_id` = ?');
    $targetStmt->bind_param('i', $userId);
    $targetStmt->execute();
    $targetRole = strtolower((string) (($targetStmt->get_result()->fetch_assoc()['role_type'] ?? '')));

    if ($targetRole === '') {
        http_response_code(404);
        echo json_encode(['error' => 'User not found.']);
        exit;
    }
    if ($targetRole === 'super_admin' && $actorRole !== 'super_admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Only a super admin can modify a super admin account.']);
        exit;
    }
    if ($actorRole === 'admin' && !in_array($targetRole, ['manager', 'cashier'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Admins can only manage manager and cashier accounts.']);
        exit;
    }
    if ($actorRole === 'admin' && $role !== '' && !in_array($role, ['manager', 'cashier'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Admins can only assign manager or cashier roles.']);
        exit;
    }
    if (!in_array($actorRole, ['admin', 'super_admin'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'You do not have permission to manage accounts.']);
        exit;
    }
    if ($role !== '') {
        $role = $role === 'super-admin' ? 'super_admin' : $role;
        $roleStmt = $mysqli->prepare('UPDATE `user` AS `u` JOIN `role` AS `r` ON `r`.`role_type` = ? SET `u`.`role_id` = `r`.`role_id` WHERE `u`.`user_id` = ?');
        $roleStmt->bind_param('si', $role, $userId);
        $roleStmt->execute();
    }
    if ($status !== '') {
        $statusStmt = $mysqli->prepare('UPDATE `user` SET `status` = ? WHERE `user_id` = ?');
        $statusStmt->bind_param('si', $status, $userId);
        $statusStmt->execute();
    }
    writeAudit($mysqli, $actor, 'Updated account role or status', 'user', (string) $userId);
    echo json_encode(['success' => true, 'id' => $userId]);
    exit;
}

$where = $userId > 0 ? ' WHERE `u`.`user_id` = ' . $userId : '';

$result = $mysqli->query(
    'SELECT `u`.`user_id` AS `id`, `u`.`full_name` AS `fullName`, `u`.`email`, `u`.`username`, `u`.`phone`, `u`.`branch_location` AS `branchLocation`, `u`.`date_hired` AS `dateHired`, `u`.`employment_status` AS `employmentStatus`, `u`.`last_login_at` AS `lastLogin`, `u`.`status`, `r`.`role_type` AS `role`, `u`.`created_at` AS `createdAt` FROM `user` AS `u` JOIN `role` AS `r` ON `u`.`role_id` = `r`.`role_id`' . $where . ' ORDER BY `u`.`user_id` ASC'
);
$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

if ($userId > 0) {
    if (!$rows) http_response_code(404);
    echo json_encode($rows[0] ?? ['error' => 'User not found.']);
} else {
    echo json_encode($rows);
}
