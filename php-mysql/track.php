<?php
require_once __DIR__ . '/config.php';
$pdo = getDbConnection();
$ref = strtoupper(trim($_GET['ref'] ?? $_POST['reference'] ?? ''));
$phone = trim($_POST['phone'] ?? '');
$result = null; $events = []; $error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' || ($ref && isset($_GET['ref']) && $phone === '')) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if ($ref === '' || strlen(preg_replace('/\D/', '', $phone)) < 6) {
            $error = 'Enter your booking reference and the phone number you booked with.';
        } else {
            $st = $pdo->prepare("SELECT * FROM bookings WHERE reference = :r LIMIT 1");
            $st->execute([':r' => $ref]);
            $b = $st->fetch();
            if (!$b) $error = "We could not find booking $ref.";
            else {
                $a = preg_replace('/\D/', '', $b['phone']); $c = preg_replace('/\D/', '', $phone);
                if (substr($a, -6) !== substr($c, -6)) $error = 'The phone number does not match this booking.';
                else {
                    $result = $b;
                    try {
                        $e = $pdo->prepare("SELECT * FROM booking_events WHERE booking_id = :id ORDER BY created_at ASC");
                        $e->execute([':id' => $b['id']]);
                        $events = $e->fetchAll();
                    } catch (Exception $ex) { $events = []; }
                }
            }
        }
    }
}
$STATUS = [
  'pending' => 'Our front desk is reviewing your request. You will hear from us on WhatsApp shortly.',
  'awaiting_payment' => 'Your room is held. Please pay using the channels on your invoice and send proof on WhatsApp.',
  'confirmed' => 'Confirmed — we look forward to welcoming you. Check-in from 14:00.',
  'checked_in' => 'Welcome! You are checked in.',
  'checked_out' => 'Thank you for staying with us. You are family.',
  'cancelled' => 'This booking was cancelled. Contact us if this is unexpected.',
];
?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Track booking · Sunrise Motel (PHP/MySQL)</title><link rel="icon" href="images/sunrise-logo.svg"><link rel="stylesheet" href="assets/style.css"></head>
<body>
<div class="topbar"><div class="wrap"><span>📍 Area 5, Lilongwe</span><a href="tel:+265998688332">☎ +265 998 688 332</a><a class="pill" href="index.php">Book a room</a></div></div>
<header class="site-header"><div class="wrap">
<a class="brand" href="index.php"><img src="images/sunrise-logo.svg" alt="logo"><span><strong>Sunrise Motel</strong><small>When you are here, you are family.</small></span></a>
<nav class="nav"><a href="index.php">Stay</a><a href="track.php" class="active">Track</a><a href="gallery.php">Gallery</a><a href="admin.php">Manager</a></nav>
<a class="wa-btn" href="https://wa.me/<?= MOTEL_WHATSAPP ?>" target="_blank">WhatsApp</a></div></header>
<section class="section"><div class="wrap">
<span class="eyebrow">Follow your booking</span>
<h2>Track your stay — no login needed</h2>
<div class="form-card">
<form method="POST">
<div class="grid2">
<label><span>Booking reference</span><input name="reference" required placeholder="SM-260918-AB12" value="<?= htmlspecialchars($ref) ?>" style="text-transform:uppercase"></label>
<label><span>Phone used at booking</span><input name="phone" required placeholder="+265 …" inputmode="tel"></label>
</div>
<button class="btn-primary" type="submit">🔎 Find my booking</button>
<?php if ($error): ?><div class="alert err" style="margin-top:10px;"><?= htmlspecialchars($error) ?></div><?php endif; ?>
</form>
</div>
<?php if ($result): $bal = max(0, $result['total_amount'] - $result['amount_paid']); ?>
<div class="form-card" style="margin-top:16px;">
<p><span class="status st-<?= htmlspecialchars($result['status']) ?>"><?= htmlspecialchars(str_replace('_',' ',$result['status'])) ?></span></p>
<h3><?= htmlspecialchars($result['room_type']) ?><?= $result['assigned_room'] ? ' · ' . htmlspecialchars($result['assigned_room']) : '' ?></h3>
<p style="font-size:13px;color:#756c64;"><?= friendlyDate($result['check_in']) ?> → <?= friendlyDate($result['check_out']) ?> · <?= $result['nights'] ?> night(s) · Ref <?= htmlspecialchars($result['reference']) ?></p>
<p style="font-size:13px;background:#e8efe9;color:#2e6b34;border-radius:6px;padding:10px;"><?= htmlspecialchars($STATUS[$result['status']] ?? 'We have your booking on file.') ?></p>
<div class="grid2" style="font-size:13px;">
<div><small style="color:#756c64;">TOTAL</small><br><strong><?= formatMwk($result['total_amount']) ?></strong></div>
<div><small style="color:#756c64;">BALANCE</small><br><strong style="color:<?= $bal ? '#c62828' : '#2e6b34' ?>"><?= formatMwk($bal) ?></strong></div>
</div>
<a class="btn-primary" href="invoice.php?ref=<?= urlencode($result['reference']) ?>">📄 View / print invoice</a>
<a class="btn-primary" style="background:#25d366;color:#fff;" href="https://wa.me/<?= MOTEL_WHATSAPP ?>?text=<?= urlencode("Hello Sunrise Motel, following up on booking {$result['reference']}.") ?>" target="_blank">💬 WhatsApp front desk</a>
<?php if ($events): ?><h4 style="margin-top:16px;">Progress</h4><ul style="font-size:12px;color:#555;"><?php foreach ($events as $ev): ?><li><strong><?= htmlspecialchars($ev['action']) ?></strong><?= $ev['note'] ? ' — ' . htmlspecialchars($ev['note']) : '' ?> <small>(<?= htmlspecialchars($ev['created_at']) ?>)</small></li><?php endforeach; ?></ul><?php endif; ?>
</div>
<?php endif; ?>
</div></section>
</body></html>
