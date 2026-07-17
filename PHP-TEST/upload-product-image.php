<?php
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed.']);
    exit;
}

if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Choose an image to upload.']);
    exit;
}

$file = $_FILES['image'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'The image upload failed. Please try again.']);
    exit;
}

$size = (int) ($file['size'] ?? 0);
if ($size <= 0 || $size > 5 * 1024 * 1024) {
    http_response_code(413);
    echo json_encode(['error' => 'Product images must be 5 MB or smaller.']);
    exit;
}

$mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
$allowedTypes = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
];
if (!isset($allowedTypes[$mime])) {
    http_response_code(415);
    echo json_encode(['error' => 'Use a JPG, PNG, WebP, or GIF image.']);
    exit;
}

$uploadDirectory = dirname(__DIR__) . '/images/uploads';
if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true)) {
    http_response_code(500);
    echo json_encode(['error' => 'Unable to create the product image folder.']);
    exit;
}

$filename = 'product-' . bin2hex(random_bytes(12)) . '.' . $allowedTypes[$mime];
$destination = $uploadDirectory . '/' . $filename;
if (!move_uploaded_file($file['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['error' => 'Unable to store the uploaded image.']);
    exit;
}
chmod($destination, 0644);

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/PHP-TEST/upload-product-image.php', PHP_URL_PATH);
$projectPrefix = preg_replace('#/PHP-TEST/[^/]+$#', '', $requestPath);
$publicPath = rtrim((string) $projectPrefix, '/') . '/images/uploads/' . $filename;

echo json_encode(['success' => true, 'path' => $publicPath]);
