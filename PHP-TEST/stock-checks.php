<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$counts = $data['counts'] ?? [[
    'productId' => $data['productId'] ?? 0,
    'countedQuantity' => $data['countedQuantity'] ?? null,
]];
$checkedByUserId = (int) ($data['checkedByUserId'] ?? 0);
$checkedByName = trim((string) ($data['checkedByName'] ?? 'Unknown staff'));

if (!is_array($counts) || count($counts) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'At least one physical stock count is required.']);
    exit;
}

if ($checkedByUserId > 0) {
    $userStmt = $mysqli->prepare('SELECT user_id FROM `user` WHERE user_id = ? LIMIT 1');
    $userStmt->bind_param('i', $checkedByUserId);
    $userStmt->execute();
    if (!$userStmt->get_result()->fetch_assoc()) {
        $checkedByUserId = 0;
    }
}

$checkedByName = $checkedByName === '' ? 'Unknown staff' : mb_substr($checkedByName, 0, 150);
$nullableUserId = $checkedByUserId > 0 ? $checkedByUserId : null;
$productStmt = $mysqli->prepare('SELECT p.product_id, COALESCE(SUM(s.quantity), 0) AS expected_quantity FROM `product` AS p LEFT JOIN `stock` AS s ON s.product_id = p.product_id WHERE p.product_id = ? AND p.delete_flag = 0 GROUP BY p.product_id');
$insert = $mysqli->prepare('INSERT INTO `stock_check` (`product_id`, `counted_quantity`, `expected_quantity`, `variance`, `checked_by_user_id`, `checked_by_name`) VALUES (?, ?, ?, ?, ?, ?)');
$saved = [];

try {
    $mysqli->begin_transaction();
    foreach ($counts as $count) {
        $productId = (int) ($count['productId'] ?? 0);
        $countedQuantity = filter_var($count['countedQuantity'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
        if ($productId <= 0 || $countedQuantity === false) {
            throw new InvalidArgumentException('Every row requires a valid product and whole-number stock count.');
        }

        $productStmt->bind_param('i', $productId);
        $productStmt->execute();
        $product = $productStmt->get_result()->fetch_assoc();
        if (!$product) {
            throw new InvalidArgumentException('One of the selected products was not found.');
        }

        $expectedQuantity = (int) $product['expected_quantity'];
        $variance = $countedQuantity - $expectedQuantity;
        $insert->bind_param('iiiiis', $productId, $countedQuantity, $expectedQuantity, $variance, $nullableUserId, $checkedByName);
        $insert->execute();
        $saved[] = [
            'stockCheckId' => (int) $mysqli->insert_id,
            'productId' => $productId,
            'currentStock' => $countedQuantity,
            'expectedStock' => $expectedQuantity,
            'variance' => $variance,
        ];
    }
    $mysqli->commit();
} catch (InvalidArgumentException $e) {
    $mysqli->rollback();
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
    exit;
} catch (Throwable $e) {
    $mysqli->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Unable to save physical stock counts.']);
    exit;
}

echo json_encode([
    'success' => true,
    'savedCount' => count($saved),
    'counts' => $saved,
    'checkedBy' => $checkedByName,
]);
