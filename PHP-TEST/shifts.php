<?php
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/api-auth.php';
requireUser($mysqli, ['admin', 'super_admin']);

$page = max(1, (int) ($_GET['page'] ?? 1));
$pageSize = max(1, min(100, (int) ($_GET['pageSize'] ?? 5)));
$offset = ($page - 1) * $pageSize;
$total = (int) $mysqli->query('SELECT COUNT(*) AS `count` FROM `cashier_shift`')->fetch_assoc()['count'];
$stmt = $mysqli->prepare('SELECT `s`.`shift_id` AS `id`, `s`.`user_id` AS `userId`, TRIM(CONCAT_WS(\' \', `u`.`first_name`, NULLIF(`u`.`middle_name`, \'\'), `u`.`last_name`)) AS `cashierName`, `s`.`time_in` AS `loginTimestamp`, `s`.`time_out` AS `logoutTimestamp`, `s`.`shift_duration_seconds` AS `shiftDurationSeconds`, `s`.`total_sales` AS `totalSales` FROM `cashier_shift` `s` JOIN `user` `u` ON `u`.`user_id` = `s`.`user_id` ORDER BY `s`.`time_in` DESC LIMIT ? OFFSET ?');
$stmt->bind_param('ii', $pageSize, $offset);
$stmt->execute();
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
foreach ($rows as &$row) {
    $row['id'] = (int) $row['id'];
    $row['userId'] = (int) $row['userId'];
    $row['shiftDurationSeconds'] = $row['shiftDurationSeconds'] === null ? null : (int) $row['shiftDurationSeconds'];
    $row['totalSales'] = (float) $row['totalSales'];
}
echo json_encode(['records' => $rows, 'page' => $page, 'pageSize' => $pageSize, 'total' => $total, 'totalPages' => max(1, (int) ceil($total / $pageSize))]);
