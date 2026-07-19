<?php
session_start();
header('Content-Type: application/json');
ini_set('display_errors', '0');
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/api-auth.php';

function checkoutError($status, $message) {
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

$user = requireUser($mysqli, ['cashier', 'manager', 'admin', 'super_admin']);
$data = json_decode(file_get_contents('php://input'), true) ?? [];
$items = $data['items'] ?? [];
$paymentMethod = trim((string) ($data['paymentMethod'] ?? 'Unknown'));
$discountPercent = (float) ($data['discountPercent'] ?? 0);
$amountTendered = (float) ($data['amountTendered'] ?? 0);

if (!is_array($items) || count($items) === 0) {
    checkoutError(400, 'Cart is empty');
}

try {
    $mysqli->begin_transaction();

    $taxRate = 8.0;
    $settingStmt = $mysqli->prepare("SELECT `setting_value` FROM `system_settings` WHERE `setting_key` = 'taxRate' LIMIT 1");
    $settingStmt->execute();
    $settingRow = $settingStmt->get_result()->fetch_assoc();
    if ($settingRow) {
        $decodedTaxRate = json_decode($settingRow['setting_value'], true);
        if (is_numeric($decodedTaxRate)) $taxRate = max(0, min(100, (float) $decodedTaxRate));
    }

    $subtotal = 0.0;
    $lockedItems = [];
    foreach ($items as $item) {
        $productId = (int) ($item['productId'] ?? 0);
        $quantity = (int) ($item['quantity'] ?? 0);
        if ($productId <= 0 || $quantity <= 0) throw new InvalidArgumentException('Invalid product or quantity in cart.');
        $stockQuery = $mysqli->prepare('SELECT `s`.`stock_id`, `s`.`quantity`, `p`.`price` FROM `stock` `s` JOIN `product` `p` ON `p`.`product_id` = `s`.`product_id` WHERE `s`.`product_id` = ? AND `p`.`status` = "active" AND `p`.`delete_flag` = 0 LIMIT 1 FOR UPDATE');
        $stockQuery->bind_param('i', $productId);
        $stockQuery->execute();
        $stockRow = $stockQuery->get_result()->fetch_assoc();
        if (!$stockRow || (int) $stockRow['quantity'] < $quantity) throw new RuntimeException('Insufficient stock for one or more items.', 409);
        $unitPrice = (float) $stockRow['price'];
        $subtotal += $unitPrice * $quantity;
        $lockedItems[] = ['stockId' => (int) $stockRow['stock_id'], 'quantity' => $quantity, 'unitPrice' => $unitPrice];
    }
    $subtotal = round($subtotal, 2);
    $discount = max(0, min($discountPercent, 100)) * $subtotal / 100;
    $tax = round(($subtotal - $discount) * ($taxRate / 100), 2);
    $total = round($subtotal - $discount + $tax, 2);
    if ($amountTendered < $total && strtolower($paymentMethod) === 'cash') throw new InvalidArgumentException('Amount tendered is less than the total.');
    $changeAmount = round(max(0, $amountTendered - $total), 2);

    $receiptNo = 'RCPT-' . date('YmdHis') . '-' . random_int(1000, 9999);
    $stmt = $mysqli->prepare('INSERT INTO `transaction` (`user_id`, `receipt_no`, `payment_method`, `amount_tendered`, `transaction_status`, `subtotal`, `tax`, `total`, `change_amount`) VALUES (?, ?, ?, ?, "completed", ?, ?, ?, ?)');
    $actorId = (int) $user['id'];
    $stmt->bind_param('issddddd', $actorId, $receiptNo, $paymentMethod, $amountTendered, $subtotal, $tax, $total, $changeAmount);
    $stmt->execute();

    $transactionId = $mysqli->insert_id;
    $itemStmt = $mysqli->prepare('INSERT INTO `transaction_item` (`transaction_id`, `stock_id`, `quantity`, `unit_price`, `line_total`) VALUES (?, ?, ?, ?, ?)');
    $stockId = 0;
    $quantity = 0;
    $unitPrice = 0.0;
    $lineTotal = 0.0;
    $itemStmt->bind_param('iiidd', $transactionId, $stockId, $quantity, $unitPrice, $lineTotal);

    foreach ($lockedItems as $item) {
        $stockId = $item['stockId'];
        $unitPrice = $item['unitPrice'];
        $quantity = $item['quantity'];
        $lineTotal = round($unitPrice * $quantity, 2);
        $itemStmt->execute();

        $stockUpdate = $mysqli->prepare('UPDATE `stock` SET `quantity` = `quantity` - ? WHERE `stock_id` = ?');
        $stockUpdate->bind_param('ii', $quantity, $stockId);
        $stockUpdate->execute();
        $stockUpdate->close();
    }

    $itemStmt->close();
    $stmt->close();
    writeAudit($mysqli, $user, 'Completed sale ' . $receiptNo, 'transaction', (string) $transactionId);
    $mysqli->commit();
    echo json_encode(['transactionId' => $transactionId, 'receiptNo' => $receiptNo, 'subtotal' => round($subtotal, 2), 'discount' => round($discount, 2), 'tax' => $tax, 'total' => $total, 'changeAmount' => $changeAmount]);
} catch (Throwable $error) {
    try {
        $mysqli->rollback();
    } catch (Throwable $rollbackError) {
        // The connection may already be closed or the transaction already rolled back.
    }
    error_log('Checkout failed: ' . $error->getMessage());
    $status = $error instanceof InvalidArgumentException ? 400 : (($error instanceof RuntimeException && $error->getCode() === 409) ? 409 : 500);
    checkoutError($status, $status < 500 ? $error->getMessage() : 'Unable to complete checkout.');
}
