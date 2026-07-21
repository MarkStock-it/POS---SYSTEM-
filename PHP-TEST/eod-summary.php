<?php
// Cron example (server local time): 0 0 * * * /usr/bin/php /absolute/path/PHP-TEST/eod-summary.php
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('This job is available from the server CLI only.');
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/eod-report-lib.php';

$reportDate = $argv[1] ?? date('Y-m-d', strtotime('yesterday'));
try {
    $summary = generateEodSummary($mysqli, $reportDate);
    fwrite(STDOUT, json_encode($summary, JSON_UNESCAPED_SLASHES) . PHP_EOL);
} catch (Throwable $error) {
    fwrite(STDERR, 'EOD summary failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
