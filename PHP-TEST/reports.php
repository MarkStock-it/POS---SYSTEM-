<?php
session_start();
header('Content-Type: application/json');
ini_set('display_errors', '0');
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/api-auth.php';
require_once __DIR__ . '/eod-report-lib.php';

requireUser($mysqli, ['admin', 'super_admin']);
$page = max(1, (int) ($_GET['page'] ?? 1));
$pageSize = max(1, min(50, (int) ($_GET['pageSize'] ?? 5)));
$offset = ($page - 1) * $pageSize;

// Backfill yesterday when the page is first opened after midnight, while the
// CLI cron job remains the primary 23:59 scheduler.
generateEodSummary($mysqli, date('Y-m-d', strtotime('yesterday')));

$total = (int) $mysqli->query('SELECT COUNT(*) AS `count` FROM `reports_view`')->fetch_assoc()['count'];
$stmt = $mysqli->prepare('SELECT `report_id` AS `id`, `report_date` AS `reportDate`, `shift_count` AS `shiftCount`, `cashier_count` AS `cashierCount`, `total_shift_seconds` AS `totalShiftSeconds`, `transaction_count` AS `transactionCount`, `gross_sales` AS `grossSales`, `generated_at` AS `generatedAt` FROM `reports_view` ORDER BY `report_date` DESC LIMIT ? OFFSET ?');
$stmt->bind_param('ii', $pageSize, $offset);
$stmt->execute();
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

foreach ($rows as &$row) {
    $row['id'] = (int) $row['id'];
    $row['shiftCount'] = (int) $row['shiftCount'];
    $row['cashierCount'] = (int) $row['cashierCount'];
    $row['totalShiftSeconds'] = (int) $row['totalShiftSeconds'];
    $row['transactionCount'] = (int) $row['transactionCount'];
    $row['grossSales'] = (float) $row['grossSales'];
}

echo json_encode(['reports' => $rows, 'page' => $page, 'pageSize' => $pageSize, 'total' => $total, 'totalPages' => max(1, (int) ceil($total / $pageSize))]);
