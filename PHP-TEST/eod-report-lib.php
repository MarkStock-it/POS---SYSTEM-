<?php

function generateEodSummary($mysqli, $reportDate) {
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', (string) $reportDate);
    if (!$date || $date->format('Y-m-d') !== $reportDate) {
        throw new InvalidArgumentException('Invalid EOD report date.');
    }

    $start = $date->format('Y-m-d 00:00:00');
    $end = $date->modify('+1 day')->format('Y-m-d 00:00:00');
    $shiftStmt = $mysqli->prepare('SELECT COUNT(*) AS `shift_count`, COUNT(DISTINCT `user_id`) AS `cashier_count`, COALESCE(SUM(`shift_duration_seconds`), 0) AS `total_shift_seconds` FROM `shift_report` WHERE `login_timestamp` >= ? AND `login_timestamp` < ?');
    $shiftStmt->bind_param('ss', $start, $end);
    $shiftStmt->execute();
    $shift = $shiftStmt->get_result()->fetch_assoc();

    $salesStmt = $mysqli->prepare('SELECT COUNT(*) AS `transaction_count`, COALESCE(SUM(`total`), 0) AS `gross_sales` FROM `transaction` WHERE `transaction_status` = "completed" AND `transaction_date` >= ? AND `transaction_date` < ?');
    $salesStmt->bind_param('ss', $start, $end);
    $salesStmt->execute();
    $sales = $salesStmt->get_result()->fetch_assoc();

    $saveStmt = $mysqli->prepare('INSERT INTO `daily_report` (`report_date`, `shift_count`, `cashier_count`, `total_shift_seconds`, `transaction_count`, `gross_sales`) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `shift_count` = VALUES(`shift_count`), `cashier_count` = VALUES(`cashier_count`), `total_shift_seconds` = VALUES(`total_shift_seconds`), `transaction_count` = VALUES(`transaction_count`), `gross_sales` = VALUES(`gross_sales`), `generated_at` = CURRENT_TIMESTAMP');
    $shiftCount = (int) $shift['shift_count'];
    $cashierCount = (int) $shift['cashier_count'];
    $totalShiftSeconds = (int) $shift['total_shift_seconds'];
    $transactionCount = (int) $sales['transaction_count'];
    $grossSales = (float) $sales['gross_sales'];
    $saveStmt->bind_param('siiiid', $reportDate, $shiftCount, $cashierCount, $totalShiftSeconds, $transactionCount, $grossSales);
    $saveStmt->execute();

    return ['reportDate' => $reportDate, 'shiftCount' => $shiftCount, 'cashierCount' => $cashierCount, 'totalShiftSeconds' => $totalShiftSeconds, 'transactionCount' => $transactionCount, 'grossSales' => $grossSales];
}
