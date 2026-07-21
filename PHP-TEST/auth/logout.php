<?php
session_start();
header('Content-Type: application/json');
ini_set('display_errors', '0');
require_once __DIR__ . '/../db.php';

$userId = (int) ($_SESSION['pos_user_id'] ?? 0);
$shiftId = (int) ($_SESSION['pos_shift_id'] ?? 0);
$summary = null;

if ($userId > 0) {
    if ($shiftId <= 0) {
        $openStmt = $mysqli->prepare('SELECT `shift_id` FROM `cashier_shift` WHERE `user_id` = ? AND `time_out` IS NULL ORDER BY `time_in` DESC LIMIT 1');
        $openStmt->bind_param('i', $userId);
        $openStmt->execute();
        $shiftId = (int) ($openStmt->get_result()->fetch_assoc()['shift_id'] ?? 0);
    }

    if ($shiftId > 0) {
        $mysqli->begin_transaction();
        try {
            $closeStmt = $mysqli->prepare(
                'UPDATE `cashier_shift` `s` SET `s`.`time_out` = CURRENT_TIMESTAMP, `s`.`shift_duration_seconds` = GREATEST(0, TIMESTAMPDIFF(SECOND, `s`.`time_in`, CURRENT_TIMESTAMP)), `s`.`total_sales` = (SELECT COALESCE(SUM(`t`.`total`), 0) FROM `transaction` `t` WHERE `t`.`user_id` = `s`.`user_id` AND `t`.`transaction_date` >= `s`.`time_in` AND `t`.`transaction_date` <= CURRENT_TIMESTAMP) WHERE `s`.`shift_id` = ? AND `s`.`user_id` = ? AND `s`.`time_out` IS NULL'
            );
            $closeStmt->bind_param('ii', $shiftId, $userId);
            $closeStmt->execute();

            $reportStmt = $mysqli->prepare(
                'INSERT INTO `shift_report` (`shift_id`, `user_id`, `login_timestamp`, `logout_timestamp`, `shift_duration_seconds`, `total_sales`) SELECT `shift_id`, `user_id`, `time_in`, `time_out`, COALESCE(`shift_duration_seconds`, 0), `total_sales` FROM `cashier_shift` WHERE `shift_id` = ? AND `user_id` = ? AND `time_out` IS NOT NULL ON DUPLICATE KEY UPDATE `logout_timestamp` = VALUES(`logout_timestamp`), `shift_duration_seconds` = VALUES(`shift_duration_seconds`), `total_sales` = VALUES(`total_sales`)'
            );
            $reportStmt->bind_param('ii', $shiftId, $userId);
            $reportStmt->execute();

            $summaryStmt = $mysqli->prepare('SELECT `user_id` AS `userId`, `login_timestamp` AS `loginTimestamp`, `logout_timestamp` AS `logoutTimestamp`, `shift_duration_seconds` AS `shiftDurationSeconds`, `total_sales` AS `totalSales` FROM `shift_report` WHERE `shift_id` = ? LIMIT 1');
            $summaryStmt->bind_param('i', $shiftId);
            $summaryStmt->execute();
            $summary = $summaryStmt->get_result()->fetch_assoc();
            $mysqli->commit();
        } catch (Throwable $error) {
            $mysqli->rollback();
            error_log('Unable to finalize cashier shift: ' . $error->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Unable to generate the shift summary.']);
            exit;
        }
    }
}

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
}
session_destroy();

echo json_encode(['success' => true, 'shiftSummary' => $summary]);
