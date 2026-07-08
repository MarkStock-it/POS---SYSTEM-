<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$result = $mysqli->query(
    'SELECT `transaction_id` AS `id`, `receipt_no` AS `receiptNo`, `payment_method` AS `paymentMethod`, `subtotal`, `tax`, `total`, `transaction_status` AS `status`, `transaction_date` AS `created_at` FROM `transaction` ORDER BY `transaction_date` DESC LIMIT 20'
);
$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode($rows);
