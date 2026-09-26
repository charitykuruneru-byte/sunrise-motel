<?php
require_once __DIR__ . '/config.php';
$pdo = getDbConnection();

$roomId = $_GET['room'] ?? 'standard';
$checkIn = (isset($_GET['in']) && validDate($_GET['in'])) ? $_GET['in'] : todayPlus(1);
$checkOut = (isset($_GET['out']) && validDate($_GET['out'])) ? $_GET['out'] : todayPlus(4);
if ($checkOut <= $checkIn) { $d = new DateTime($checkIn); $d->modify('+1 day'); $checkOut = $d->format('Y-m-d'); }
$adults = max(1, min(6, (int)($_GET['adults'] ?? 2)));
$children = max(0, min(4, (int)($_GET['children'] ?? 0)));

$st = $pdo->prepare("SELECT * FROM room_types WHERE id = :id AND is_active = 1");
$st->execute([':id' => $roomId]);
$room = $st->fetch();
if (!$room) die("Room not found. <a href='index.php'>Back to rooms</a>");

$nights = nightsBetween($checkIn, $checkOut);
$rate = (int)$room['rate'];
$subtotal = $rate * $nights;
$images = roomImages($room);

$success = false; $error = ''; $ref = ''; $inv = ''; $paidTotal = 0;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $guestName = trim($_POST['guest_name'] ?? '');
    $phone = trim($_POST['phone'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $arrival = trim($_POST['arrival'] ?? '');
    $requests = trim($_POST['requests'] ?? '');
    $bfQty = max(0, min(10, (int)($_POST['breakfast_qty'] ?? 0)));
    $transfer = isset($_POST['transfer']) ? PRICE_TRANSFER : 0;
    $late = isset($_POST['lateout']) ? PRICE_LATEOUT : 0;
    $bfTotal = $bfQty * PRICE_BREAKFAST * $nights;
    $extrasTotal = $bfTotal + $transfer + $late;
    $totalAmount = $subtotal + $extrasTotal;
    $paidTotal = $totalAmount;

    $extras = [];
    if ($bfQty > 0) $extras[] = ['label' => "Daily breakfast × $bfQty guest(s) ($nights nights)", 'amount' => $bfTotal];
    if ($transfer) $extras[] = ['label' => 'Kamuzu Airport transfer (one-way)', 'amount' => $transfer];
    if ($late) $extras[] = ['label' => 'Late check-out until 15:00', 'amount' => $late];

    if ($guestName === '' || $phone === '') {
        $error = 'Please enter your full name and phone / WhatsApp number.';
    } else {
        try {
            $pdo->beginTransaction();
            $pdo->exec("SELECT id FROM room_types WHERE id = " . $pdo->quote($roomId) . " FOR UPDATE");
            $booked = overlappingCount($pdo, $roomId, $checkIn, $checkOut);
            $avail = (int)$room['total_inventory'] - $booked;
            if ($avail <= 0) {
                $pdo->rollBack();
                $error = "Sorry — {$room['name']} is fully booked between $checkIn and $checkOut. Please choose other dates.";
            } else {
                $ref = makeReference(); $inv = makeInvoiceNumber();
                $id = bin2hex(random_bytes(16));
                $ins = $pdo->prepare("INSERT INTO bookings (id, reference, room_type_id, room_type, check_in, check_out, adults, children, nights, nightly_rate, total_amount, guest_name, phone, email, arrival, requests, extras_json, status, invoice_number) VALUES (:id,:ref,:rid,:rt,:in,:out,:ad,:ch,:n,:nr,:tot,:name,:phone,:email,:arr,:req,:ex,'pending',:inv)");
                $ins->execute([':id' => $id, ':ref' => $ref, ':rid' => $room['id'], ':rt' => $room['name'], ':in' => $checkIn, ':out' => $checkOut, ':ad' => $adults, ':ch' => $children, ':n' => $nights, ':nr' => $rate, ':tot' => $totalAmount, ':name' => $guestName, ':phone' => $phone, ':email' => $email ?: null, ':arr' => $arrival ?: null, ':req' => $requests ?: null, ':ex' => json_encode($extras), ':inv' => $inv]);
                $lines = array_merge([['description' => "{$room['name']} ($nights night(s) @ " . formatMwk($rate) . "/night)", 'amount' => $subtotal]], array_map(fn($e) => ['description' => $e['label'], 'amount' => $e['amount']], $extras));
                $ii = $pdo->prepare("INSERT INTO invoices (id, invoice_number, booking_id, booking_ref, guest_name, guest_email, guest_phone, room_type, check_in, check_out, nights, subtotal, extras_total, total_amount, balance_due, status, line_items_json, payment_instructions) VALUES (:id,:inv,:bid,:bref,:name,:email,:phone,:rt,:in,:out,:n,:sub,:ex,:tot,:tot,'proforma',:lines,:pay)");
                $ii->execute([':id' => bin2hex(random_bytes(16)), ':inv' => $inv, ':bid' => $id, ':bref' => $ref, ':name' => $guestName, ':email' => $email ?: null, ':phone' => $phone, ':rt' => $room['name'], ':in' => $checkIn, ':out' => $checkOut, ':n' => $nights, ':sub' => $subtotal, ':ex' => $extrasTotal, ':tot' => $totalAmount, ':lines' => json_encode($lines), ':pay' => "National Bank of Malawi Acc 1009876543 · Airtel Money +265 998 688 332 · TNM Mpamba +265 888 123 456 (Ref: $ref)"]);
                logEvent($pdo, $id, $ref, 'created', "Guest $guestName requested {$room['name']} for $checkIn → $checkOut. Pro-forma $inv issued.", 'guest');
                $pdo->commit();
                $success = true;
            }
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $error = 'Could not save the booking. Please try again or WhatsApp us. (' . htmlspecialchars($e->getMessage()) . ')';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Book <?= htmlspecialchars($room['name']) ?> · Sunrise Motel (PHP/MySQL)</title>
<link rel="icon" href="images/sunrise-logo.svg"><link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="topbar"><div class="wrap"><span>📍 Area 5, Lilongwe</span><a href="tel:+265998688332">☎ +265 998 688 332</a><a class="pill" href="track.php">Track booking</a></div></div>
<header class="site-header"><div class="wrap">
  <a class="brand" href="index.php"><img src="images/sunrise-logo.svg" alt="Sunrise Motel logo"><span><strong>Sunrise Motel</strong><small>When you are here, you are family.</small></span></a>
  <nav class="nav"><a href="index.php">Stay</a><a href="track.php">Track</a><a href="gallery.php">Gallery</a><a href="admin.php">Manager</a></nav>
  <a class="wa-btn" href="https://wa.me/<?= MOTEL_WHATSAPP ?>" target="_blank">WhatsApp</a>
</div></header>

<section class="section"><div class="wrap">
  <a href="index.php?checkIn=<?= urlencode($checkIn) ?>&checkOut=<?= urlencode($checkOut) ?>" style="font-size:12px;">← Back to rooms</a>
  <div class="form-card" style="max-width:720px;margin-top:14px;">
  <?php if ($success): ?>
    <div style="text-align:center;">
      <div style="font-size:44px;">🎉</div>
      <span class="eyebrow">Request received</span>
      <h2>Your room is held, <?= htmlspecialchars($_POST['guest_name'] ?? '') ?>.</h2>
      <p style="color:#756c64;font-size:13px;"><?= htmlspecialchars($room['name']) ?> · <?= friendlyDate($checkIn) ?> → <?= friendlyDate($checkOut) ?> · <?= $nights ?> night(s). The front desk will confirm on WhatsApp.</p>
      <div class="ref-box"><small style="font-size:10px;color:#756c64;">BOOKING REFERENCE</small><br><code><?= htmlspecialchars($ref) ?></code><br><small>Total <?= formatMwk($paidTotal) ?> · Status: Pending confirmation · Invoice <?= htmlspecialchars($inv) ?></small></div>
      <a class="btn-primary" href="invoice.php?ref=<?= urlencode($ref) ?>">📄 View / print invoice</a>
      <a class="btn-primary" style="background:#25d366;color:#fff;" href="https://wa.me/<?= MOTEL_WHATSAPP ?>?text=<?= urlencode("Hello Sunrise Motel, I sent booking $ref for {$room['name']} ($checkIn to $checkOut).") ?>" target="_blank">💬 Chat with front desk</a>
      <a class="btn-primary" style="background:#171513;color:#fff;" href="track.php?ref=<?= urlencode($ref) ?>">🔎 Track this booking</a>
    </div>
  <?php else: ?>
    <span class="eyebrow">Direct request · No account</span>
    <h2 style="margin-bottom:4px;">Request <?= htmlspecialchars($room['name']) ?></h2>
    <p style="font-size:12px;color:#756c64;"><?= friendlyDate($checkIn) ?> → <?= friendlyDate($checkOut) ?> · <?= $nights ?> night(s) · <?= $adults ?> adult(s)<?= $children ? " · $children child(ren)" : '' ?></p>
    <img src="<?= htmlspecialchars($images[0]) ?>" alt="<?= htmlspecialchars($room['name']) ?>" style="width:100%;height:200px;object-fit:cover;border-radius:8px;margin:10px 0;">
    <?php if ($error): ?><div class="alert err"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <form method="POST" id="bookForm">
      <div class="extras-box">
        <strong>✨ Add extras — total updates instantly</strong>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
          <span>☕ Daily breakfast<br><small style="color:#756c64;">MWK 8,500 / guest / day</small></span>
          <span class="stepper" style="width:120px;"><button type="button" id="bfMinus">−</button><b id="bfLabel">0</b><button type="button" id="bfPlus">+</button></span>
          <input type="hidden" name="breakfast_qty" id="bfInput" value="0">
        </div>
        <label style="display:flex;justify-content:space-between;margin-top:10px;font-weight:400;"><span>✈️ Airport transfer <small style="color:#756c64;">MWK 25,000 one-way</small></span><input type="checkbox" name="transfer" id="transferBox" style="width:20px;height:20px;"></label>
        <label style="display:flex;justify-content:space-between;margin-top:8px;font-weight:400;"><span>🕒 Late check-out 15:00 <small style="color:#756c64;">MWK 15,000</small></span><input type="checkbox" name="lateout" id="lateBox" style="width:20px;height:20px;"></label>
        <div class="calc">
          <div class="row"><span><?= htmlspecialchars($room['name']) ?> × <?= $nights ?>n @ <?= formatMwk($rate) ?></span><span><?= formatMwk($subtotal) ?></span></div>
          <div class="row" id="exRow" style="display:none;color:#c95612;font-weight:700;"><span>Extras</span><span id="exVal">+MWK 0</span></div>
          <div class="row total"><span>Total</span><span id="grandVal"><?= formatMwk($subtotal) ?></span></div>
        </div>
      </div>
      <label><span>Full name *</span><input name="guest_name" required placeholder="e.g. Kondwani Phiri" value="<?= htmlspecialchars($_POST['guest_name'] ?? '') ?>"></label>
      <div class="grid2">
        <label><span>Phone / WhatsApp *</span><input name="phone" required placeholder="+265 …" value="<?= htmlspecialchars($_POST['phone'] ?? '') ?>"></label>
        <label><span>Email (invoice)</span><input type="email" name="email" placeholder="you@example.com" value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"></label>
      </div>
      <div class="grid2">
        <label><span>Expected arrival</span><select name="arrival"><option value="">Choose…</option><option>Morning (before 14:00)</option><option>Afternoon (14:00 — 18:00)</option><option>Evening (18:00 — 22:00)</option><option>Late night (after 22:00)</option></select></label>
        <label><span>Requests</span><input name="requests" placeholder="Quiet room, ground floor…"></label>
      </div>
      <button class="btn-primary" type="submit">Send booking request →</button>
      <p style="font-size:11px;color:#756c64;text-align:center;">🛡️ Saved first, then the front desk is alerted. You get a reference + invoice.</p>
    </form>
  <?php endif; ?>
  </div>
</div></section>

<script>
const NIGHTS = <?= $nights ?>, RATE = <?= $rate ?>, SUB = <?= $subtotal ?>, MAXBF = <?= $adults + $children ?>;
let bf = 0;
const bfLabel = document.getElementById('bfLabel'), bfInput = document.getElementById('bfInput');
function mwk(n) { return 'MWK ' + n.toLocaleString('en-US'); }
function recalc() {
  const t = document.getElementById('transferBox')?.checked ? <?= PRICE_TRANSFER ?> : 0;
  const l = document.getElementById('lateBox')?.checked ? <?= PRICE_LATEOUT ?> : 0;
  const ex = bf * <?= PRICE_BREAKFAST ?> * NIGHTS + t + l;
  document.getElementById('exRow').style.display = ex > 0 ? 'flex' : 'none';
  document.getElementById('exVal').textContent = '+' + mwk(ex);
  document.getElementById('grandVal').textContent = mwk(SUB + ex);
}
document.getElementById('bfMinus')?.addEventListener('click', () => { bf = Math.max(0, bf - 1); bfLabel.textContent = bf; bfInput.value = bf; recalc(); });
document.getElementById('bfPlus')?.addEventListener('click', () => { bf = Math.min(MAXBF, bf + 1); bfLabel.textContent = bf; bfInput.value = bf; recalc(); });
document.getElementById('transferBox')?.addEventListener('change', recalc);
document.getElementById('lateBox')?.addEventListener('change', recalc);
</script>
</body>
</html>
