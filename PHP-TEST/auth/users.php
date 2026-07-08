<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../db.php';

$result = $mysqli->query(
    'SELECT `u`.`user_id` AS `id`, `u`.`full_name` AS `fullName`, `u`.`email`, `u`.`status`, `r`.`role_type` AS `role`, `u`.`created_at` AS `createdAt` FROM `user` AS `u` JOIN `role` AS `r` ON `u`.`role_id` = `r`.`role_id` ORDER BY `u`.`user_id` ASC'
);
$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode($rows);
