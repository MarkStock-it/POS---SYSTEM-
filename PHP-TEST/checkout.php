<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$items = $data['items'] ?? [];
$paymentMethod = trim((string) ($data['paymentMethod'] ?? 'Unknown'));
$discountPercent = (float) ($data['discountPercent'] ?? 0);

if (!is_array($items) || count($items) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Cart is empty']);
    exit;
}

$subtotal = 0;
foreach ($items as $item) {
    $subtotal += (float) ($item['unitPrice'] ?? 0) * (int) ($item['quantity'] ?? 1);
}
$discount = max(0, min($discountPercent, 100)) * $subtotal / 100;
$tax = round(($subtotal - $discount) * 0.08, 2);
$total = round($subtotal - $discount + $tax, 2);

$mysqli->begin_transaction();

$stmt = $mysqli->prepare('INSERT INTO transactions (payment_method, subtotal, discount, tax, total) VALUES (?, ?, ?, ?, ?)');
$stmt->bind_param('ssddd', $paymentMethod, $subtotal, $discount, $tax, $total);
if (!$stmt->execute()) {
    $mysqli->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Unable to save transaction.']);
    exit;
}

$transactionId = $mysqli->insert_id;
$itemStmt = $mysqli->prepare('INSERT INTO transaction_items (transaction_id, product_id, name, sku, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)');
foreach ($items as $item) {
    $productId = (int) ($item['productId'] ?? 0);
    $name = $item['name'] ?? '';
    $sku = $item['sku'] ?? '';
    $unitPrice = (float) ($item['unitPrice'] ?? 0);
    $quantity = (int) ($item['quantity'] ?? 1);
    $lineTotal = round($unitPrice * $quantity, 2);

    $itemStmt->bind_param('iisssii', $transactionId, $productId, $name, $sku, $unitPrice, $quantity, $lineTotal);
    if (!$itemStmt->execute()) {
        $mysqli->rollback();
        http_response_code(500);
        echo json_encode(['error' => 'Unable to save transaction items.']);
        exit;
    }

    $stockStmt = $mysqli->prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    $stockStmt->bind_param('ii', $quantity, $productId);
    $stockStmt->execute();
}

$mysqli->commit();
echo json_encode(['transactionId' => $transactionId, 'subtotal' => round($subtotal, 2), 'discount' => round($discount, 2), 'tax' => $tax, 'total' => $total]);
