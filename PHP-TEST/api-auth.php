<?php

function apiJson($status, $payload) {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function currentUser($mysqli) {
    $userId = (int) ($_SESSION['pos_user_id'] ?? 0);
    if ($userId <= 0) return null;
    $stmt = $mysqli->prepare('SELECT `u`.`user_id` AS `id`, `u`.`full_name` AS `fullName`, `u`.`email`, `u`.`username`, `u`.`status`, `r`.`role_type` AS `role` FROM `user` `u` JOIN `role` `r` ON `r`.`role_id` = `u`.`role_id` WHERE `u`.`user_id` = ? LIMIT 1');
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    return $user && $user['status'] === 'active' ? $user : null;
}

function requireUser($mysqli, $roles = []) {
    $user = currentUser($mysqli);
    if (!$user) apiJson(401, ['error' => 'Your session has expired. Please sign in again.']);
    if ($roles && !in_array(strtolower($user['role']), $roles, true)) {
        apiJson(403, ['error' => 'You do not have permission to perform this action.']);
    }
    return $user;
}

function writeAudit($mysqli, $user, $action, $entityType = null, $entityId = null) {
    $stmt = $mysqli->prepare('INSERT INTO `audit_log` (`actor_user_id`, `actor_name`, `actor_role`, `action_text`, `entity_type`, `entity_id`) VALUES (?, ?, ?, ?, ?, ?)');
    $id = (int) $user['id'];
    $stmt->bind_param('isssss', $id, $user['fullName'], $user['role'], $action, $entityType, $entityId);
    $stmt->execute();
}
