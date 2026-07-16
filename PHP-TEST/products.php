<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$data = json_decode(file_get_contents('php://input'), true) ?? [];
$productId = (int) ($_GET['id'] ?? 0);

if ($method !== 'GET') {
    $name = trim((string) ($data['name'] ?? ''));
    $sku = trim((string) ($data['sku'] ?? ''));
    $categoryName = trim((string) ($data['category'] ?? ''));
    $price = (float) ($data['price'] ?? 0);
    $stock = max(0, (int) ($data['stock'] ?? 0));
    $threshold = max(0, (int) ($data['threshold'] ?? 0));
    $image = trim((string) ($data['image'] ?? '/images/placeholder.svg'));

    if ($method === 'DELETE') {
        if ($productId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Product ID is required.']);
            exit;
        }
        $stmt = $mysqli->prepare('UPDATE `product` SET `delete_flag` = 1, `status` = "inactive" WHERE `product_id` = ?');
        $stmt->bind_param('i', $productId);
        $stmt->execute();
        if ($stmt->affected_rows === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Product not found.']);
            exit;
        }
        echo json_encode(['success' => true]);
        exit;
    }

    if ($name === '' || $sku === '' || $categoryName === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Name, SKU, and category are required.']);
        exit;
    }

    try {
        $mysqli->begin_transaction();
        $categoryQuery = $mysqli->prepare('SELECT `category_id` FROM `category` WHERE LOWER(`name`) = LOWER(?) LIMIT 1');
        $categoryQuery->bind_param('s', $categoryName);
        $categoryQuery->execute();
        $categoryRow = $categoryQuery->get_result()->fetch_assoc();
        if (!$categoryRow) {
            $categoryStmt = $mysqli->prepare('INSERT INTO `category` (`name`, `status`) VALUES (?, "active")');
            $categoryStmt->bind_param('s', $categoryName);
            $categoryStmt->execute();
            $categoryId = (int) $mysqli->insert_id;
        } else {
            $categoryId = (int) $categoryRow['category_id'];
        }

        if ($method === 'POST') {
            $stmt = $mysqli->prepare('INSERT INTO `product` (`product_code`, `category_id`, `name`, `price`, `restock_threshold`, `status`, `delete_flag`, `image_path`) VALUES (?, ?, ?, ?, ?, "active", 0, ?)');
            $stmt->bind_param('sisdis', $sku, $categoryId, $name, $price, $threshold, $image);
            $stmt->execute();
            $productId = (int) $mysqli->insert_id;
            $stockStmt = $mysqli->prepare('INSERT INTO `stock` (`product_id`, `quantity`) VALUES (?, ?)');
            $stockStmt->bind_param('ii', $productId, $stock);
            $stockStmt->execute();
        } elseif ($method === 'PUT') {
            if ($productId <= 0) throw new RuntimeException('Product ID is required.');
            $stmt = $mysqli->prepare('UPDATE `product` SET `product_code` = ?, `category_id` = ?, `name` = ?, `price` = ?, `restock_threshold` = ?, `status` = "active", `delete_flag` = 0, `image_path` = ? WHERE `product_id` = ?');
            $stmt->bind_param('sisdisi', $sku, $categoryId, $name, $price, $threshold, $image, $productId);
            $stmt->execute();
            $stockQuery = $mysqli->prepare('SELECT `stock_id` FROM `stock` WHERE `product_id` = ? ORDER BY `stock_id` LIMIT 1');
            $stockQuery->bind_param('i', $productId);
            $stockQuery->execute();
            $stockRow = $stockQuery->get_result()->fetch_assoc();
            if ($stockRow) {
                $stockId = (int) $stockRow['stock_id'];
                $stockStmt = $mysqli->prepare('UPDATE `stock` SET `quantity` = ? WHERE `stock_id` = ?');
                $stockStmt->bind_param('ii', $stock, $stockId);
                $stockStmt->execute();
            } else {
                $stockStmt = $mysqli->prepare('INSERT INTO `stock` (`product_id`, `quantity`) VALUES (?, ?)');
                $stockStmt->bind_param('ii', $productId, $stock);
                $stockStmt->execute();
            }
        } else {
            throw new RuntimeException('Unsupported method.');
        }

        $mysqli->commit();
        echo json_encode(['id' => $productId, 'name' => $name, 'sku' => $sku, 'category' => $categoryName, 'price' => $price, 'stock' => $stock, 'threshold' => $threshold, 'image' => $image]);
    } catch (mysqli_sql_exception $e) {
        $mysqli->rollback();
        http_response_code((int) $e->getCode() === 1062 ? 409 : 500);
        echo json_encode(['error' => (int) $e->getCode() === 1062 ? 'A product with this SKU already exists.' : 'Unable to save product.']);
    } catch (Throwable $e) {
        $mysqli->rollback();
        http_response_code(400);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

$search = trim((string) ($_GET['search'] ?? ''));
$category = strtolower(trim((string) ($_GET['category'] ?? 'all')));
$stockFilter = strtolower(trim((string) ($_GET['stock'] ?? 'all')));

$sql = 'SELECT p.product_id AS id, p.product_code AS sku, p.name, p.price, COALESCE(s.quantity, 0) AS stock, p.image_path AS image, c.name AS category, p.restock_threshold AS threshold, p.status, p.delete_flag AS deleteFlag FROM `product` AS p LEFT JOIN `category` AS c ON c.category_id = p.category_id LEFT JOIN (SELECT product_id, SUM(quantity) AS quantity FROM `stock` GROUP BY product_id) AS s ON s.product_id = p.product_id';
$where = ['p.delete_flag = 0'];
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
