<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$search = trim((string) ($_GET['search'] ?? ''));
$category = strtolower(trim((string) ($_GET['category'] ?? 'all')));
$stockFilter = strtolower(trim((string) ($_GET['stock'] ?? 'all')));

$sql = 'SELECT p.product_id AS id, p.product_code AS sku, p.name, p.price, COALESCE(s.quantity, 0) AS stock, p.image_path AS image, c.name AS category, p.restock_threshold AS threshold, p.status, p.delete_flag AS deleteFlag FROM `product` AS p LEFT JOIN `category` AS c ON c.category_id = p.category_id LEFT JOIN (SELECT product_id, SUM(quantity) AS quantity FROM `stock` GROUP BY product_id) AS s ON s.product_id = p.product_id';
$where = [];
$params = [];
$types = '';

if ($search !== '') {
    $where[] = '(p.name LIKE ? OR p.product_code LIKE ? OR c.name LIKE ?)';
    $pattern = "%$search%";
    $params = array_merge($params, [$pattern, $pattern, $pattern]);
    $types .= 'sss';
}

if ($category !== '' && $category !== 'all') {
    $where[] = 'LOWER(c.name) = ?';
    $params[] = $category;
    $types .= 's';
}

if ($stockFilter === 'low') {
    $where[] = 'COALESCE(s.quantity, 0) > 0 AND COALESCE(s.quantity, 0) <= 10';
} elseif ($stockFilter === 'out') {
    $where[] = 'COALESCE(s.quantity, 0) = 0';
}

if ($where) {
    $sql .= ' WHERE ' . implode(' AND ', $where);
}

$sql .= ' ORDER BY p.name COLLATE utf8mb4_general_ci';

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
    $rows[] = [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'sku' => $row['sku'],
        'barcode' => null,
        'category' => $row['category'],
        'price' => (float) $row['price'],
        'stock' => (int) $row['stock'],
        'image' => $row['image'],
        'description' => null,
        'cost' => 0,
        'threshold' => (int) $row['threshold'],
        'status' => $row['status'],
        'deleteFlag' => (int) $row['deleteFlag'],
    ];
}

echo json_encode($rows);
