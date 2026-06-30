<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$result = $mysqli->query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 20');
$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode($rows);
