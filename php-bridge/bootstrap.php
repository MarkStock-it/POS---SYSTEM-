<?php
class PhpCliInputStream {
  private static $data = '';
  private static $position = 0;

  public static function setData($data) {
    self::$data = (string) $data;
    self::$position = 0;
  }

  public function stream_open($path, $mode, $options, &$opened_path) {
    return true;
  }

  public function stream_read($count) {
    $chunk = substr(self::$data, self::$position, $count);
    self::$position += strlen($chunk);
    return $chunk;
  }

  public function stream_eof() {
    return self::$position >= strlen(self::$data);
  }

  public function stream_stat() {
    return [];
  }

  public function stream_seek($offset, $whence) {
    if ($whence === SEEK_SET) {
      self::$position = $offset;
    } elseif ($whence === SEEK_CUR) {
      self::$position += $offset;
    } elseif ($whence === SEEK_END) {
      self::$position = strlen(self::$data) + $offset;
    } else {
      return false;
    }
    return true;
  }

  public function stream_tell() {
    return self::$position;
  }

  public function stream_write($data) {
    return 0;
  }

  public function stream_flush() {
    return true;
  }
}

$rawBody = getenv('PHP_CLI_INPUT_BODY');
if ($rawBody !== false) {
  PhpCliInputStream::setData($rawBody);
  stream_wrapper_unregister('php');
  stream_wrapper_register('php', 'PhpCliInputStream');
}

$_SERVER['REQUEST_METHOD'] = getenv('REQUEST_METHOD') ?: 'GET';
$_SERVER['REQUEST_URI'] = getenv('REQUEST_URI') ?: '/';
$_SERVER['QUERY_STRING'] = getenv('QUERY_STRING') ?: '';
$_SERVER['CONTENT_TYPE'] = getenv('CONTENT_TYPE') ?: '';
$_SERVER['CONTENT_LENGTH'] = getenv('CONTENT_LENGTH') ?: '';
$_SERVER['PHP_SELF'] = $_SERVER['REQUEST_URI'];
$_SERVER['SCRIPT_NAME'] = $_SERVER['REQUEST_URI'];
$_SERVER['SCRIPT_FILENAME'] = $_SERVER['REQUEST_URI'];

$_GET = [];
if ($_SERVER['QUERY_STRING'] !== '') {
  parse_str($_SERVER['QUERY_STRING'], $_GET);
}

$_POST = [];
if ($rawBody !== false && $rawBody !== '') {
  $contentType = strtolower((string) $_SERVER['CONTENT_TYPE']);
  if (str_contains($contentType, 'application/json')) {
    $decodedJson = json_decode($rawBody, true);
    if (is_array($decodedJson)) {
      $_POST = $decodedJson;
    }
  } elseif (str_contains($contentType, 'application/x-www-form-urlencoded')) {
    parse_str($rawBody, $_POST);
  }
}

$_REQUEST = array_merge($_GET, $_POST);
?>