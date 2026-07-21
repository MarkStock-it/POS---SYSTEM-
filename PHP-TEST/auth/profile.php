<?php
session_start();
header('Content-Type: application/json');
ini_set('display_errors', '0');
require_once __DIR__ . '/../db.php';

function profileResponse($status, $payload) {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

$userId = (int) ($_SESSION['pos_user_id'] ?? 0);
if ($userId <= 0) {
    profileResponse(401, ['error' => 'Your session has expired. Please sign in again.']);
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $stmt = $mysqli->prepare(
            'SELECT `u`.`user_id` AS `id`, TRIM(CONCAT_WS(\' \', `u`.`first_name`, NULLIF(`u`.`middle_name`, \'\'), `u`.`last_name`)) AS `fullName`, `u`.`first_name` AS `firstName`, `u`.`middle_name` AS `middleName`, `u`.`last_name` AS `lastName`, `u`.`email`, `u`.`username`, `u`.`phone`, `u`.`branch_location` AS `branchLocation`, `u`.`date_hired` AS `dateHired`, `u`.`employment_status` AS `employmentStatus`, `u`.`status`, `u`.`last_login_at` AS `lastLogin`, `u`.`created_at` AS `createdAt`, `r`.`role_type` AS `role` FROM `user` `u` JOIN `role` `r` ON `r`.`role_id` = `u`.`role_id` WHERE `u`.`user_id` = ? LIMIT 1'
        );
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $profile = $stmt->get_result()->fetch_assoc();
        if (!$profile) profileResponse(404, ['error' => 'Account profile was not found.']);
        if (!empty($_SESSION['pos_previous_login_at'])) $profile['lastLogin'] = $_SESSION['pos_previous_login_at'];

        $deviceStmt = $mysqli->prepare('SELECT `device_id` AS `id`, `device_name` AS `name`, `last_active_at` AS `lastActive` FROM `user_device` WHERE `user_id` = ? ORDER BY `last_active_at` DESC');
        $deviceStmt->bind_param('i', $userId);
        $deviceStmt->execute();
        $devices = [];
        $deviceResult = $deviceStmt->get_result();
        while ($device = $deviceResult->fetch_assoc()) $devices[] = $device;

        $permissionStmt = $mysqli->prepare(
            'SELECT DISTINCT `p`.`permission_key` AS `key`, `p`.`permission_label` AS `label` FROM `permission` `p` LEFT JOIN `role_permission` `rp` ON `rp`.`permission_id` = `p`.`permission_id` LEFT JOIN `user_permission` `up` ON `up`.`permission_id` = `p`.`permission_id` AND `up`.`user_id` = ? JOIN `user` `u` ON `u`.`user_id` = ? WHERE `rp`.`role_id` = `u`.`role_id` OR `up`.`user_id` IS NOT NULL ORDER BY `p`.`permission_label`'
        );
        $permissionStmt->bind_param('ii', $userId, $userId);
        $permissionStmt->execute();
        $permissions = [];
        $permissionResult = $permissionStmt->get_result();
        while ($permission = $permissionResult->fetch_assoc()) $permissions[] = $permission;

        $profile['devices'] = $devices;
        $profile['permissions'] = $permissions;
        profileResponse(200, $profile);
    }

    $data = json_decode(file_get_contents('php://input'), true) ?? [];

    if ($method === 'PUT') {
        $phone = trim((string) ($data['phone'] ?? ''));
        if ($phone !== '' && !preg_match('/^[0-9+()\-\s]{7,30}$/', $phone)) {
            profileResponse(422, ['error' => 'Enter a valid phone number.']);
        }
        $stmt = $mysqli->prepare('UPDATE `user` SET `phone` = ? WHERE `user_id` = ?');
        $phoneValue = $phone === '' ? null : $phone;
        $stmt->bind_param('si', $phoneValue, $userId);
        $stmt->execute();
        profileResponse(200, ['success' => true, 'phone' => $phoneValue]);
    }

    if ($method === 'POST') {
        $action = strtolower(trim((string) ($data['action'] ?? '')));
        if ($action === 'unlink-device') {
            $deviceId = (int) ($data['deviceId'] ?? 0);
            $stmt = $mysqli->prepare('DELETE FROM `user_device` WHERE `device_id` = ? AND `user_id` = ?');
            $stmt->bind_param('ii', $deviceId, $userId);
            $stmt->execute();
            profileResponse($stmt->affected_rows ? 200 : 404, $stmt->affected_rows ? ['success' => true] : ['error' => 'Paired device was not found.']);
        }

        if (!in_array($action, ['change-password', 'change-pin'], true)) {
            profileResponse(400, ['error' => 'Unsupported profile action.']);
        }

        $currentPassword = (string) ($data['currentPassword'] ?? '');
        $passwordStmt = $mysqli->prepare('SELECT `password_hash` FROM `user` WHERE `user_id` = ? LIMIT 1');
        $passwordStmt->bind_param('i', $userId);
        $passwordStmt->execute();
        $passwordHash = (string) (($passwordStmt->get_result()->fetch_assoc()['password_hash'] ?? ''));
        if ($currentPassword === '' || !password_verify($currentPassword, $passwordHash)) {
            profileResponse(403, ['error' => 'Current password is incorrect.']);
        }

        if ($action === 'change-password') {
            $newPassword = (string) ($data['newPassword'] ?? '');
            if (strlen($newPassword) < 8) profileResponse(422, ['error' => 'New password must contain at least 8 characters.']);
            $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
            $stmt = $mysqli->prepare('UPDATE `user` SET `password_hash` = ? WHERE `user_id` = ?');
            $stmt->bind_param('si', $newHash, $userId);
            $stmt->execute();
            profileResponse(200, ['success' => true]);
        }

        $newPin = (string) ($data['newPin'] ?? '');
        if (!preg_match('/^[0-9]{4,6}$/', $newPin)) profileResponse(422, ['error' => 'PIN must contain 4 to 6 digits.']);
        $pinHash = password_hash($newPin, PASSWORD_DEFAULT);
        $stmt = $mysqli->prepare('UPDATE `user` SET `pin_hash` = ? WHERE `user_id` = ?');
        $stmt->bind_param('si', $pinHash, $userId);
        $stmt->execute();
        profileResponse(200, ['success' => true]);
    }

    profileResponse(405, ['error' => 'Method not allowed.']);
} catch (Throwable $error) {
    error_log('Profile API failed: ' . $error->getMessage());
    profileResponse(500, ['error' => 'Unable to process the account profile request.']);
}
