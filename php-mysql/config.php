<?php
/**
 * Sunrise Motel Lilongwe — PHP/MySQL Edition
 * Account-free direct booking · Area 5, Lilongwe
 */

define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_NAME', getenv('DB_NAME') ?: 'sunrise_motel');
define('DB_PORT', getenv('DB_PORT') ?: 3306);

define('MOTEL_NAME', 'Sunrise Motel');
define('MOTEL_TAGLINE', 'When you are here, you are family.');
define('MOTEL_LOCATION', 'Mzimba Road, behind Bwasila Secondary School, Area 5, Lilongwe, Malawi');
define('MOTEL_PHONE', '+265 998 688 332');
define('MOTEL_WHATSAPP', '265998688332');
define('CURRENCY_CODE', 'MWK');
define('PRICE_BREAKFAST', 8500);
define('PRICE_TRANSFER', 25000);
define('PRICE_LATEOUT', 15000);

function getDbConnection() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        } catch (PDOException $e) {
            die("Database connection failed. Check config.php credentials. (" . htmlspecialchars($e->getMessage()) . ")");
        }
    }
    return $pdo;
}

function formatMwk($amount) {
    return 'MWK ' . number_format((int)$amount, 0);
}

function todayPlus($days) {
    $d = new DateTime('today', new DateTimeZone('Africa/Blantyre'));
    $d->modify('+' . (int)$days . ' days');
    return $d->format('Y-m-d');
}

function validDate($s) {
    if (!is_string($s) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return false;
    [$y, $m, $d] = array_map('intval', explode('-', $s));
    return checkdate($m, $d, $y);
}

function nightsBetween($in, $out) {
    if (!validDate($in) || !validDate($out)) return 1;
    $n = (int)round((strtotime($out) - strtotime($in)) / 86400);
    return max(1, $n);
}

function friendlyDate($iso) {
    if (!validDate($iso)) return htmlspecialchars((string)$iso);
    return date('D, j M Y', strtotime($iso));
}

function makeReference() {
    $chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    $rand = '';
    for ($i = 0; $i < 4; $i++) $rand .= $chars[random_int(0, strlen($chars) - 1)];
    return 'SM-' . date('ymd') . '-' . $rand;
}

function makeInvoiceNumber() {
    return 'INV-' . date('Y') . '-' . random_int(1000, 9999);
}

function roomImages($row) {
    $imgs = json_decode($row['images_json'] ?? '[]', true);
    if (!is_array($imgs) || empty($imgs)) return ['images/hero-standard.jpg'];
    return $imgs;
}

function roomFeatures($row) {
    $f = json_decode($row['features_json'] ?? '[]', true);
    return is_array($f) ? $f : [];
}

function overlappingCount($pdo, $roomTypeId, $checkIn, $checkOut) {
    $st = $pdo->prepare("SELECT COUNT(*) FROM bookings WHERE room_type_id = :id AND status != 'cancelled' AND check_in < :out AND check_out > :in");
    $st->execute([':id' => $roomTypeId, ':in' => $checkIn, ':out' => $checkOut]);
    return (int)$st->fetchColumn();
}

function logEvent($pdo, $bookingId, $reference, $action, $note = null, $actor = 'system') {
    try {
        $st = $pdo->prepare("INSERT INTO booking_events (id, booking_id, reference, action, note, actor) VALUES (:id, :bid, :ref, :act, :note, :actor)");
        $st->execute([':id' => bin2hex(random_bytes(16)), ':bid' => $bookingId, ':ref' => $reference, ':act' => $action, ':note' => $note, ':actor' => $actor]);
    } catch (Exception $e) { /* events table optional */ }
}
