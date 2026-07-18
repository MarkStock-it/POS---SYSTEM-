<?php
// Repeatable starter catalog seed. Run from the command line only:
// php PHP-TEST/seed-starter-inventory.php --confirm-seed
if (PHP_SAPI !== 'cli' || !in_array('--confirm-seed', $argv ?? [], true)) {
    http_response_code(403);
    fwrite(STDERR, "Run from CLI with --confirm-seed.\n");
    exit(1);
}

require_once __DIR__ . '/db.php';

$items = [
    ['WTR-500', '4800010000014', 'Beverages', 'Bottled Water 500ml', 'Purified drinking water in a convenient 500 ml bottle.', 20.00, 10.00, 120, 24, '../images/catalog/bottled-water-500ml.png'],
    ['COF-ICE-16', '4800010000021', 'Beverages', 'Classic Iced Coffee 16oz', 'Freshly prepared iced coffee in a sealed 16 oz cup.', 65.00, 32.00, 40, 10, '../images/catalog/iced-coffee-16oz.png'],
    ['SNK-CHP-60', '4800010000038', 'Snacks', 'Salted Potato Chips 60g', 'Crisp classic salted potato chips in a single-serve bag.', 35.00, 19.00, 75, 15, '../images/catalog/salted-potato-chips.png'],
    ['DRY-MLK-1L', '4800010000045', 'Dairy', 'Fresh Whole Milk 1L', 'One-liter carton of fresh whole milk; keep refrigerated.', 95.00, 68.00, 30, 8, '../images/catalog/whole-milk-1l.png'],
    ['ACC-USBC-1M', '4800010000052', 'Electronics', 'USB-C Charging Cable 1m', 'Durable one-meter braided USB-C to USB-C charging cable.', 149.00, 82.00, 25, 5, '../images/catalog/usb-c-cable-1m.png'],
];

$mysqli->begin_transaction();
try {
    $categoryStmt = $mysqli->prepare('INSERT INTO `category` (`name`, `status`) VALUES (?, "active")');
    $categoryQuery = $mysqli->prepare('SELECT `category_id` FROM `category` WHERE LOWER(`name`) = LOWER(?) LIMIT 1');
    $productStmt = $mysqli->prepare(
        'INSERT INTO `product` (`product_code`, `barcode`, `category_id`, `name`, `description`, `price`, `cost_price`, `restock_threshold`, `status`, `delete_flag`, `image_path`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, "active", 0, ?)
         ON DUPLICATE KEY UPDATE `barcode` = VALUES(`barcode`), `category_id` = VALUES(`category_id`), `name` = VALUES(`name`), `description` = VALUES(`description`), `price` = VALUES(`price`), `cost_price` = VALUES(`cost_price`), `restock_threshold` = VALUES(`restock_threshold`), `status` = "active", `delete_flag` = 0, `image_path` = VALUES(`image_path`)'
    );
    $productQuery = $mysqli->prepare('SELECT `product_id` FROM `product` WHERE `product_code` = ? LIMIT 1');
    $stockStmt = $mysqli->prepare('INSERT INTO `stock` (`product_id`, `quantity`) VALUES (?, ?)');

    foreach ($items as [$sku, $barcode, $category, $name, $description, $price, $cost, $stock, $threshold, $image]) {
        $categoryQuery->bind_param('s', $category);
        $categoryQuery->execute();
        $categoryRow = $categoryQuery->get_result()->fetch_assoc();
        if ($categoryRow) {
            $categoryId = (int) $categoryRow['category_id'];
        } else {
            $categoryStmt->bind_param('s', $category);
            $categoryStmt->execute();
            $categoryId = (int) $mysqli->insert_id;
        }

        $productStmt->bind_param('ssissddis', $sku, $barcode, $categoryId, $name, $description, $price, $cost, $threshold, $image);
        $productStmt->execute();
        $productQuery->bind_param('s', $sku);
        $productQuery->execute();
        $productId = (int) $productQuery->get_result()->fetch_assoc()['product_id'];
        $mysqli->query('DELETE FROM `stock` WHERE `product_id` = ' . $productId);
        $stockStmt->bind_param('ii', $productId, $stock);
        $stockStmt->execute();
    }
    $mysqli->commit();
} catch (Throwable $error) {
    $mysqli->rollback();
    fwrite(STDERR, "Inventory seed failed: {$error->getMessage()}\n");
    exit(1);
}

echo "Starter inventory seeded: " . count($items) . " products.\n";
