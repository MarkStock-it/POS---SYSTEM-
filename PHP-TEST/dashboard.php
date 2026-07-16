<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$revenue = $mysqli->query('SELECT COALESCE(SUM(`total`), 0) AS `value` FROM `transaction` WHERE DATE(`transaction_date`) = CURDATE()')->fetch_assoc();
$flags = $mysqli->query('SELECT COUNT(*) AS `value` FROM `transaction` WHERE LOWER(`payment_method`) = "flagged"')->fetch_assoc();
$stock = $mysqli->query('SELECT COUNT(*) AS `value` FROM (SELECT `product_id`, SUM(`quantity`) AS `quantity` FROM `stock` GROUP BY `product_id` HAVING `quantity` > 0 AND `quantity` <= 10) AS `low_stock`')->fetch_assoc();
$users = $mysqli->query('SELECT COUNT(*) AS `total`, SUM(LOWER(`status`) = "active") AS `active` FROM `user`')->fetch_assoc();

echo json_encode([
    'todayRevenue' => (float) ($revenue['value'] ?? 0),
    'flaggedTransactions' => (int) ($flags['value'] ?? 0),
    'lowStockItems' => (int) ($stock['value'] ?? 0),
    'totalUsers' => (int) ($users['total'] ?? 0),
    'activeSessions' => (int) ($users['active'] ?? 0),
]);
