<?php
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/api-auth.php';

$actor = requireUser($mysqli, ['admin', 'super_admin']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $limit = max(1, min(50, (int) ($_GET['limit'] ?? 10)));
    $stmt = $mysqli->prepare('SELECT audit_id AS id, actor_name AS actorName, actor_role AS actorRole, action_text AS actionText, entity_type AS entityType, entity_id AS entityId, created_at AS createdAt FROM `audit_log` ORDER BY created_at DESC, audit_id DESC LIMIT ?');
    $stmt->bind_param('i', $limit);
    $stmt->execute();
    echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$actionText = trim((string) ($data['actionText'] ?? ''));
$entityType = trim((string) ($data['entityType'] ?? ''));
$entityId = trim((string) ($data['entityId'] ?? ''));

if ($actionText === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Activity description is required.']);
    exit;
}

$actionText = mb_substr($actionText, 0, 500);
$entityType = mb_substr($entityType, 0, 50);
$entityId = mb_substr($entityId, 0, 100);
writeAudit($mysqli, $actor, $actionText, $entityType, $entityId);
echo json_encode(['success' => true, 'id' => (int) $mysqli->insert_id]);
