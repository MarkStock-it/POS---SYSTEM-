<?php
session_start();
header('Content-Type: application/json');
ini_set('display_errors', '0');
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/api-auth.php';

$actor = requireUser($mysqli, ['admin', 'super_admin']);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    $activeOnly = ($_GET['active'] ?? '1') !== '0';
    $sql = 'SELECT `branch_id` AS `id`, `branch_name` AS `name`, `status`, `created_at` AS `createdAt`, `updated_at` AS `updatedAt` FROM `branch`';
    if ($activeOnly) $sql .= ' WHERE `status` = "active"';
    $sql .= ' ORDER BY `branch_name`';
    $rows = $mysqli->query($sql)->fetch_all(MYSQLI_ASSOC);
    foreach ($rows as &$row) $row['id'] = (int) $row['id'];
    echo json_encode($rows);
    exit;
}

if (strtolower($actor['role']) !== 'super_admin') {
    apiJson(403, ['error' => 'Only Superadmins can create or edit branches.']);
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$name = trim((string) ($data['name'] ?? ''));
$status = strtolower(trim((string) ($data['status'] ?? 'active')));
if ($name === '' || strlen($name) > 150) apiJson(422, ['error' => 'Enter a branch name up to 150 characters.']);
if (!in_array($status, ['active', 'inactive'], true)) apiJson(422, ['error' => 'Branch status must be active or inactive.']);

try {
    if ($method === 'POST') {
        $stmt = $mysqli->prepare('INSERT INTO `branch` (`branch_name`, `status`, `created_by`) VALUES (?, ?, ?)');
        $actorId = (int) $actor['id'];
        $stmt->bind_param('ssi', $name, $status, $actorId);
        $stmt->execute();
        writeAudit($mysqli, $actor, 'Created branch ' . $name, 'branch', (string) $mysqli->insert_id);
        echo json_encode(['id' => (int) $mysqli->insert_id, 'name' => $name, 'status' => $status]);
        exit;
    }

    if ($method === 'PUT') {
        $branchId = (int) ($data['id'] ?? 0);
        if ($branchId <= 0) apiJson(422, ['error' => 'A valid branch ID is required.']);
        $stmt = $mysqli->prepare('UPDATE `branch` SET `branch_name` = ?, `status` = ? WHERE `branch_id` = ?');
        $stmt->bind_param('ssi', $name, $status, $branchId);
        $stmt->execute();
        if ($stmt->affected_rows === 0) {
            $exists = $mysqli->prepare('SELECT 1 FROM `branch` WHERE `branch_id` = ?');
            $exists->bind_param('i', $branchId);
            $exists->execute();
            if (!$exists->get_result()->fetch_row()) apiJson(404, ['error' => 'Branch not found.']);
        }
        writeAudit($mysqli, $actor, 'Updated branch ' . $name, 'branch', (string) $branchId);
        echo json_encode(['id' => $branchId, 'name' => $name, 'status' => $status]);
        exit;
    }
} catch (mysqli_sql_exception $error) {
    if ((int) $error->getCode() === 1062) apiJson(409, ['error' => 'A branch with that name already exists.']);
    error_log('Branch update failed: ' . $error->getMessage());
    apiJson(500, ['error' => 'Unable to save the branch.']);
}

apiJson(405, ['error' => 'Method not allowed.']);
