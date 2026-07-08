<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$items = $data['items'] ?? [];
$paymentMethod = trim((string) ($data['paymentMethod'] ?? 'Unknown'));
$discountPercent = (float) ($data['discountPercent'] ?? 0);
$amountTendered = (float) ($data['amountTendered'] ?? 0);

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
$changeAmount = round(max(0, $amountTendered - $total), 2);

$mysqli->begin_transaction();

$receiptNo = 'RCPT-' . date('YmdHis') . '-' . random_int(1000, 9999);
$stmt = $mysqli->prepare('INSERT INTO `transaction` (`receipt_no`, `payment_method`, `amount_tendered`, `transaction_status`, `subtotal`, `tax`, `total`, `change_amount`) VALUES (?, ?, ?, "completed", ?, ?, ?, ?)');
$stmt->bind_param('ssdddd', $receiptNo, $paymentMethod, $amountTendered, $subtotal, $tax, $total, $changeAmount);
if (!$stmt->execute()) {
    $mysqli->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Unable to save transaction.']);
    exit;
}

$transactionId = $mysqli->insert_id;
$itemStmt = $mysqli->prepare('INSERT INTO `transaction_item` (`transaction_id`, `stock_id`, `quantity`, `unit_price`, `line_total`) VALUES (?, ?, ?, ?, ?)');
foreach ($items as $item) {
    $productId = (int) ($item['productId'] ?? 0);
    $unitPrice = (float) ($item['unitPrice'] ?? 0);
    $quantity = (int) ($item['quantity'] ?? 1);
    $lineTotal = round($unitPrice * $quantity, 2);

    $stockQuery = $mysqli->prepare('SELECT `stock_id`, `quantity` FROM `stock` WHERE `product_id` = ? LIMIT 1');
    $stockQuery->bind_param('i', $productId);
    $stockQuery->execute();
    $stockRow = $stockQuery->get_result()->fetch_assoc();

    if (!$stockRow) {
        $createStock = $mysqli->prepare('INSERT INTO `stock` (`product_id`, `quantity`) VALUES (?, 0)');
        $createStock->bind_param('i', $productId);
        $createStock->execute();
        $stockId = $mysqli->insert_id;
    } else {
        $stockId = (int) $stockRow['stock_id'];
    }

    if (!$stockRow || (int) $stockRow['quantity'] < $quantity) {
        $mysqli->rollback();
        http_response_code(409);
        echo json_encode(['error' => 'Insufficient stock for one or more items.']);
        exit;
    }

    if (!$itemStmt->execute([$transactionId, $stockId, $quantity, $unitPrice, $lineTotal])) {
        $mysqli->rollback();
        http_response_code(500);
        echo json_encode(['error' => 'Unable to save transaction items.']);
        exit;
    }

    $stockUpdate = $mysqli->prepare('UPDATE `stock` SET `quantity` = `quantity` - ? WHERE `stock_id` = ?');
    $stockUpdate->bind_param('ii', $quantity, $stockId);
    $stockUpdate->execute();
}

$mysqli->commit();
echo json_encode(['transactionId' => $transactionId, 'receiptNo' => $receiptNo, 'subtotal' => round($subtotal, 2), 'discount' => round($discount, 2), 'tax' => $tax, 'total' => $total, 'changeAmount' => $changeAmount]);
