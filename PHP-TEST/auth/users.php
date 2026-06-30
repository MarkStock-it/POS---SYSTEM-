<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../PHP-TEST/db.php';

$result = $mysqli->query('SELECT id, full_name AS fullName, email, username, role, created_at AS createdAt FROM users ORDER BY id ASC');
$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode($rows);
