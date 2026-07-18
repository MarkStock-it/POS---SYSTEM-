<?php
header('Content-Type: application/json');
ini_set('display_errors', '0');
require_once __DIR__ . '/db.php';

function checkoutError($status, $message) {
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$items = $data['items'] ?? [];
$paymentMethod = trim((string) ($data['paymentMethod'] ?? 'Unknown'));
$discountPercent = (float) ($data['discountPercent'] ?? 0);
$taxRate = max(0, min(100, (float) ($data['taxRate'] ?? 8)));
$amountTendered = (float) ($data['amountTendered'] ?? 0);

if (!is_array($items) || count($items) === 0) {
    checkoutError(400, 'Cart is empty');
}

$subtotal = 0;
foreach ($items as $item) {
    $subtotal += (float) ($item['unitPrice'] ?? 0) * (int) ($item['quantity'] ?? 1);
}
$discount = max(0, min($discountPercent, 100)) * $subtotal / 100;
$tax = round(($subtotal - $discount) * ($taxRate / 100), 2);
$total = round($subtotal - $discount + $tax, 2);
$changeAmount = round(max(0, $amountTendered - $total), 2);

try {
    $mysqli->begin_transaction();

    $receiptNo = 'RCPT-' . date('YmdHis') . '-' . random_int(1000, 9999);
    $stmt = $mysqli->prepare('INSERT INTO `transaction` (`receipt_no`, `payment_method`, `amount_tendered`, `transaction_status`, `subtotal`, `tax`, `total`, `change_amount`) VALUES (?, ?, ?, "completed", ?, ?, ?, ?)');
    $stmt->bind_param('ssddddd', $receiptNo, $paymentMethod, $amountTendered, $subtotal, $tax, $total, $changeAmount);
    $stmt->execute();

    $transactionId = $mysqli->insert_id;
    $itemStmt = $mysqli->prepare('INSERT INTO `transaction_item` (`transaction_id`, `stock_id`, `quantity`, `unit_price`, `line_total`) VALUES (?, ?, ?, ?, ?)');
    $stockId = 0;
    $quantity = 0;
    $unitPrice = 0.0;
    $lineTotal = 0.0;
    $itemStmt->bind_param('iiidd', $transactionId, $stockId, $quantity, $unitPrice, $lineTotal);

    foreach ($items as $item) {
        $productId = (int) ($item['productId'] ?? 0);
        $unitPrice = (float) ($item['unitPrice'] ?? 0);
        $quantity = (int) ($item['quantity'] ?? 1);
        $lineTotal = round($unitPrice * $quantity, 2);

        if ($productId <= 0 || $quantity <= 0) {
            throw new InvalidArgumentException('Invalid product or quantity in cart.');
        }

        $stockQuery = $mysqli->prepare('SELECT `stock_id`, `quantity` FROM `stock` WHERE `product_id` = ? LIMIT 1 FOR UPDATE');
        $stockQuery->bind_param('i', $productId);
        $stockQuery->execute();
        $stockRow = $stockQuery->get_result()->fetch_assoc();
        $stockQuery->close();

        if (!$stockRow || (int) $stockRow['quantity'] < $quantity) {
            $mysqli->rollback();
            checkoutError(409, 'Insufficient stock for one or more items.');
        }

        $stockId = (int) $stockRow['stock_id'];
        $itemStmt->execute();

        $stockUpdate = $mysqli->prepare('UPDATE `stock` SET `quantity` = `quantity` - ? WHERE `stock_id` = ?');
        $stockUpdate->bind_param('ii', $quantity, $stockId);
        $stockUpdate->execute();
        $stockUpdate->close();
    }

    $itemStmt->close();
    $stmt->close();
    $mysqli->commit();
    echo json_encode(['transactionId' => $transactionId, 'receiptNo' => $receiptNo, 'subtotal' => round($subtotal, 2), 'discount' => round($discount, 2), 'tax' => $tax, 'total' => $total, 'changeAmount' => $changeAmount]);
} catch (Throwable $error) {
    try {
        $mysqli->rollback();
    } catch (Throwable $rollbackError) {
        // The connection may already be closed or the transaction already rolled back.
    }
    error_log('Checkout failed: ' . $error->getMessage());
    $status = $error instanceof InvalidArgumentException ? 400 : 500;
    checkoutError($status, $status === 400 ? $error->getMessage() : 'Unable to complete checkout.');
}
