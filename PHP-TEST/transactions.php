<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$result = $mysqli->query(
    'SELECT `t`.`transaction_id` AS `id`, `t`.`receipt_no` AS `receiptNo`, `t`.`payment_method` AS `paymentMethod`, `t`.`payment_method` AS `payment_method`, `t`.`subtotal`, `t`.`tax`, `t`.`total`, `t`.`transaction_status` AS `status`, `t`.`transaction_date` AS `created_at`, COUNT(`ti`.`transaction_items_id`) AS `item_count` FROM `transaction` AS `t` LEFT JOIN `transaction_item` AS `ti` ON `ti`.`transaction_id` = `t`.`transaction_id` GROUP BY `t`.`transaction_id` ORDER BY `t`.`transaction_date` DESC LIMIT 20'
);
$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode($rows);
