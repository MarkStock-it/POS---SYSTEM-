<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$search = trim((string) ($_GET['search'] ?? ''));
$category = strtolower(trim((string) ($_GET['category'] ?? 'all')));
$stockFilter = strtolower(trim((string) ($_GET['stock'] ?? 'all')));

$sql = 'SELECT * FROM products';
$where = [];
$params = [];
$types = '';

if ($search !== '') {
    $where[] = '(name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR category LIKE ?)';
    $pattern = "%$search%";
    $params = array_merge($params, [$pattern, $pattern, $pattern, $pattern]);
    $types .= 'ssss';
}

if ($category !== '' && $category !== 'all') {
    $where[] = 'LOWER(category) = ?';
    $params[] = $category;
    $types .= 's';
}

if ($stockFilter === 'low') {
    $where[] = 'stock > 0 AND stock <= 10';
} elseif ($stockFilter === 'out') {
    $where[] = 'stock = 0';
}

if ($where) {
    $sql .= ' WHERE ' . implode(' AND ', $where);
}

$sql .= ' ORDER BY name COLLATE utf8mb4_general_ci';

$stmt = $mysqli->prepare($sql);
if ($stmt && $params) {
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
} else {
    $result = $mysqli->query($sql);
}

$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode($rows);
