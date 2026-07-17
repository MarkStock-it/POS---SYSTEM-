<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

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
$actorUserId = (int) ($data['actorUserId'] ?? 0);
$actorName = trim((string) ($data['actorName'] ?? 'Unknown user'));
$actorRole = trim((string) ($data['actorRole'] ?? ''));
$actionText = trim((string) ($data['actionText'] ?? ''));
$entityType = trim((string) ($data['entityType'] ?? ''));
$entityId = trim((string) ($data['entityId'] ?? ''));

if ($actionText === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Activity description is required.']);
    exit;
}

$actorName = mb_substr($actorName === '' ? 'Unknown user' : $actorName, 0, 150);
$actorRole = mb_substr($actorRole, 0, 30);
$actionText = mb_substr($actionText, 0, 500);
$entityType = mb_substr($entityType, 0, 50);
$entityId = mb_substr($entityId, 0, 100);
$nullableActorId = null;
if ($actorUserId > 0) {
    $userStmt = $mysqli->prepare('SELECT user_id FROM `user` WHERE user_id = ? LIMIT 1');
    $userStmt->bind_param('i', $actorUserId);
    $userStmt->execute();
    if ($userStmt->get_result()->fetch_assoc()) $nullableActorId = $actorUserId;
}

$stmt = $mysqli->prepare('INSERT INTO `audit_log` (`actor_user_id`, `actor_name`, `actor_role`, `action_text`, `entity_type`, `entity_id`) VALUES (?, ?, ?, ?, ?, ?)');
$stmt->bind_param('isssss', $nullableActorId, $actorName, $actorRole, $actionText, $entityType, $entityId);
$stmt->execute();
echo json_encode(['success' => true, 'id' => (int) $mysqli->insert_id]);
