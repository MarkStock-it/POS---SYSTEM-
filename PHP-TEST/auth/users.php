<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../db.php';

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
    echo json_encode(['success' => true, 'id' => $userId]);
    exit;
}

$where = $userId > 0 ? ' WHERE `u`.`user_id` = ' . $userId : '';

$result = $mysqli->query(
    'SELECT `u`.`user_id` AS `id`, `u`.`full_name` AS `fullName`, `u`.`email`, `u`.`username`, `u`.`status`, `r`.`role_type` AS `role`, `u`.`created_at` AS `createdAt` FROM `user` AS `u` JOIN `role` AS `r` ON `u`.`role_id` = `r`.`role_id`' . $where . ' ORDER BY `u`.`user_id` ASC'
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
