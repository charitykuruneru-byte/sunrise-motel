<?php
require_once __DIR__ . '/config.php';
$pdo = getDbConnection();

$today = todayPlus(0);
$checkIn = (isset($_GET['checkIn']) && validDate($_GET['checkIn'])) ? $_GET['checkIn'] : todayPlus(1);
$checkOut = (isset($_GET['checkOut']) && validDate($_GET['checkOut'])) ? $_GET['checkOut'] : todayPlus(4);
if ($checkOut <= $checkIn) {
    $d = new DateTime($checkIn);
    $d->modify('+1 day');
    $checkOut = $d->format('Y-m-d');
}
$adults = max(1, min(6, (int)($_GET['adults'] ?? 2)));
$children = max(0, min(4, (int)($_GET['children'] ?? 0)));
$nights = nightsBetween($checkIn, $checkOut);

$rooms = $pdo->query("SELECT * FROM room_types WHERE is_active = 1 ORDER BY rate ASC")->fetchAll();
$ov = $pdo->prepare("SELECT room_type_id, COUNT(*) c FROM bookings WHERE status != 'cancelled' AND check_in < :out AND check_out > :in GROUP BY room_type_id");
$ov->execute([':in' => $checkIn, ':out' => $checkOut]);
$map = [];
foreach ($ov->fetchAll() as $r) $map[$r['room_type_id']] = (int)$r['c'];
$totalFree = 0;
foreach ($rooms as $r) $totalFree += max(0, $r['total_inventory'] - ($map[$r['id']] ?? 0));
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sunrise Motel · Stay Comfortably — Area 5, Lilongwe (PHP/MySQL)</title>
<link rel="icon" href="images/sunrise-logo.svg">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="topbar"><div class="wrap">
  <span>📍 Area 5, Lilongwe</span>
  <a href="tel:+265998688332">☎ +265 998 688 332</a>
  <a class="pill" href="track.php">Track booking</a>
</div></div>

<header class="site-header"><div class="wrap">
  <a class="brand" href="index.php"><img src="images/sunrise-logo.svg" alt="Sunrise Motel logo"><span><strong>Sunrise Motel</strong><small>When you are here, you are family.</small></span></a>
  <nav class="nav">
    <a href="index.php" class="active">Stay</a>
    <a href="track.php">Track</a>
    <a href="gallery.php">Gallery</a>
    <a href="admin.php">Manager</a>
  </nav>
  <a class="wa-btn" href="https://wa.me/<?= MOTEL_WHATSAPP ?>?text=Hello%20Sunrise%20Motel" target="_blank" rel="noreferrer">WhatsApp</a>
</div></header>

<section class="hero">
  <div class="hero-bg" style="background-image:url('images/deluxe-main.jpg')"></div>
  <div class="hero-shade"></div>
  <div class="wrap">
    <span class="badge-pill"><span class="dot"></span> STAY · LIVE ROOM INVENTORY · PHP/MYSQL EDITION</span>
    <h1>Stay Comfortably. <em>Sleep Soundly.</em></h1>
    <p class="lead">Real room photos, honest availability and direct booking — no account, no password. Only rooms free for <strong>every night</strong> of your stay are shown.</p>
  </div>
</section>

<div class="wrap">
  <form method="GET" class="search-card" id="searchCard">
    <div class="search-head"><span>📅 Check live availability</span><span class="live"><i></i><?= $totalFree ?> rooms free</span></div>
    <div class="fields">
      <div class="field"><label>Check-in</label><input type="date" name="checkIn" value="<?= htmlspecialchars($checkIn) ?>" min="<?= $today ?>" required><small><?= friendlyDate($checkIn) ?> · from 14:00</small></div>
      <div class="field"><label>Check-out</label><input type="date" name="checkOut" value="<?= htmlspecialchars($checkOut) ?>" min="<?= htmlspecialchars($checkIn) ?>" required><small><?= friendlyDate($checkOut) ?> · by 10:00</small></div>
      <div class="field"><label>Adults</label><div class="stepper"><button type="button" data-step="adults:-1">−</button><span id="adultsLabel"><?= $adults ?></span><button type="button" data-step="adults:1">+</button></div><input type="hidden" name="adults" id="adultsInput" value="<?= $adults ?>"></div>
      <div class="field"><label>Children</label><div class="stepper"><button type="button" data-step="children:-1">−</button><span id="childrenLabel"><?= $children ?></span><button type="button" data-step="children:1">+</button></div><input type="hidden" name="children" id="childrenInput" value="<?= $children ?>"></div>
    </div>
    <div class="summary-strip">
      <span><strong><?= $nights ?> night<?= $nights > 1 ? 's' : '' ?></strong> · <?= friendlyDate($checkIn) ?> → <?= friendlyDate($checkOut) ?> · <?= $adults ?> adult<?= $adults > 1 ? 's' : '' ?><?= $children ? " · $children child" . ($children > 1 ? 'ren' : '') : '' ?></span>
      <span>🛡️ Double-booking protected</span>
    </div>
    <button class="btn-primary" type="submit">See available rooms →</button>
  </form>

  <div class="photo-strip">
    <a href="#rooms"><img src="images/deluxe-main.jpg" alt="Deluxe King room"><span>Deluxe King</span></a>
    <a href="#rooms"><img src="images/hero-standard.jpg" alt="Standard Queen room"><span>Standard Queen</span></a>
    <a href="#rooms"><img src="images/twin-main.jpg" alt="Twin room"><span>Twin Room</span></a>
  </div>
</div>

<section class="section" id="rooms"><div class="wrap">
  <span class="eyebrow">Live results</span>
  <h2>Available for your dates</h2>
  <p style="color:#756c64;font-size:14px;margin:4px 0 0;"><?= friendlyDate($checkIn) ?> → <?= friendlyDate($checkOut) ?> · <?= $nights ?> night<?= $nights > 1 ? 's' : '' ?>. Tap “Photos” for the full room slideshow.</p>

  <div class="rooms">
  <?php foreach ($rooms as $r):
    $images = roomImages($r); $features = roomFeatures($r);
    $booked = $map[$r['id']] ?? 0;
    $avail = max(0, (int)$r['total_inventory'] - $booked);
    $sold = $avail <= 0;
    $cls = $sold ? 'sold' : ($avail === 1 ? 'low' : '');
    $txt = $sold ? 'Fully booked for these dates' : ($booked === 0 ? "All {$r['total_inventory']} rooms available" : ($avail === 1 ? "Only 1 of {$r['total_inventory']} left" : "$avail of {$r['total_inventory']} available"));
  ?>
    <article class="room">
      <div class="room-photo">
        <img src="<?= htmlspecialchars($images[0]) ?>" alt="<?= htmlspecialchars($r['name']) ?> at Sunrise Motel" loading="lazy">
        <span class="chip <?= $cls ?>"><?= htmlspecialchars($txt) ?></span>
        <?php if ($r['badge']): ?><span class="badge-tag"><?= htmlspecialchars($r['badge']) ?></span><?php endif; ?>
        <button class="photos-btn" data-room="<?= htmlspecialchars($r['id']) ?>">📷 <?= count($images) ?> photos</button>
      </div>
      <div class="room-body">
        <div class="rate-row">
          <div><h3><?= htmlspecialchars($r['name']) ?></h3><p class="desc"><?= htmlspecialchars($r['description']) ?></p></div>
          <div class="rate"><small>Per night</small><strong><?= formatMwk($r['rate']) ?></strong><em><?= formatMwk($r['rate'] * $nights) ?> / <?= $nights ?>n</em></div>
        </div>
        <div class="specs"><span>🛏 <?= htmlspecialchars($r['bed']) ?></span><span>👥 <?= htmlspecialchars($r['sleeps']) ?></span><span>📐 <?= htmlspecialchars($r['size']) ?></span></div>
        <div class="meta"><?= $sold ? '<b class="bad">No rooms free for these nights</b>' : "<b class=\"ok\">$avail free</b>" ?> · <?= $booked === 0 ? 'No other bookings on these dates' : "$booked already booked" ?></div>
        <div class="pills"><?php foreach (array_slice($features, 0, 4) as $f): ?><span>✓ <?= htmlspecialchars($f) ?></span><?php endforeach; ?></div>
        <div class="room-actions">
          <button class="btn-ghost" data-room="<?= htmlspecialchars($r['id']) ?>">View photos</button>
          <?php if ($sold): ?><span class="btn-book disabled">Fully booked</span>
          <?php else: ?><a class="btn-book" href="booking.php?room=<?= urlencode($r['id']) ?>&in=<?= urlencode($checkIn) ?>&out=<?= urlencode($checkOut) ?>&adults=<?= $adults ?>&children=<?= $children ?>">Book this room →</a><?php endif; ?>
        </div>
      </div>
    </article>
  <?php endforeach; ?>
  </div>
</div></section>

<footer class="footer"><div class="wrap">
  <div class="cols">
    <div><h4>SUNRISE MOTEL</h4><p>Your warm welcome in the heart of Lilongwe. Comfortable rooms, generous meals, lively evenings and dependable connectivity.</p></div>
    <div><h4>FIND US</h4><p>📍 <?= MOTEL_LOCATION ?><br>☎ <?= MOTEL_PHONE ?> · <a style="color:#25d366" href="https://wa.me/<?= MOTEL_WHATSAPP ?>">WhatsApp front desk</a></p></div>
  </div>
  <p style="font-size:11px;color:rgba(255,255,255,.4)">© 2026 Sunrise Motel · PHP/MySQL edition · When you are here, you are family.</p>
</div></footer>

<nav class="mobilebar">
  <a href="index.php">🛏<span>Book</span></a>
  <a href="gallery.php">🖼<span>Photos</span></a>
  <a href="track.php">🔎<span>Track</span></a>
  <a href="https://wa.me/<?= MOTEL_WHATSAPP ?>">💬<span>WhatsApp</span></a>
</nav>

<div class="lightbox" id="lightbox"><div class="box">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><strong id="lbTitle">Room photos</strong><span><span id="lbCount">1 / 1</span> · <button id="lbClose" style="background:rgba(255,255,255,.15);color:#fff;border:0;border-radius:50%;width:30px;height:30px;cursor:pointer;">✕</button></span></div>
  <img class="main" id="lbImg" src="" alt="Room photo">
  <div class="lb-nav"><button id="lbPrev">‹</button><button id="lbNext">›</button></div>
  <div class="thumbs" id="lbThumbs"></div>
</div></div>

<script>
const GALLERIES = <?= json_encode(array_reduce($rooms, function($c, $r) { $c[$r['id']] = ['name' => $r['name'], 'images' => roomImages($r)]; return $c; }, [])) ?>;
let lbRoom = null, lbIdx = 0;
const lb = document.getElementById('lightbox'), lbImg = document.getElementById('lbImg'),
      lbTitle = document.getElementById('lbTitle'), lbCount = document.getElementById('lbCount'),
      lbThumbs = document.getElementById('lbThumbs');
function openLb(id) {
  lbRoom = GALLERIES[id]; lbIdx = 0; if (!lbRoom) return;
  renderLb(); lb.classList.add('open'); document.body.style.overflow = 'hidden';
}
function renderLb() {
  const imgs = lbRoom.images;
  lbImg.src = imgs[lbIdx]; lbTitle.textContent = lbRoom.name;
  lbCount.textContent = (lbIdx + 1) + ' / ' + imgs.length;
  lbThumbs.innerHTML = '';
  imgs.forEach((s, i) => {
    const t = document.createElement('img');
    t.src = s; t.className = i === lbIdx ? 'on' : '';
    t.onclick = () => { lbIdx = i; renderLb(); };
    lbThumbs.appendChild(t);
  });
}
function closeLb() { lb.classList.remove('open'); document.body.style.overflow = 'auto'; }
document.querySelectorAll('[data-room]').forEach(b => b.addEventListener('click', () => openLb(b.dataset.room)));
document.getElementById('lbClose').onclick = closeLb;
document.getElementById('lbPrev').onclick = () => { lbIdx = (lbIdx - 1 + lbRoom.images.length) % lbRoom.images.length; renderLb(); };
document.getElementById('lbNext').onclick = () => { lbIdx = (lbIdx + 1) % lbRoom.images.length; renderLb(); };
lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLb(); });
// guest steppers
const counts = { adults: <?= $adults ?>, children: <?= $children ?> };
document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
  const [k, d] = b.dataset.step.split(':');
  const min = k === 'adults' ? 1 : 0, max = k === 'adults' ? 6 : 4;
  counts[k] = Math.min(max, Math.max(min, counts[k] + parseInt(d, 10)));
  document.getElementById(k + 'Label').textContent = counts[k];
  document.getElementById(k + 'Input').value = counts[k];
}));
// keep checkout after checkin
const inEl = document.querySelector('input[name=checkIn]'), outEl = document.querySelector('input[name=checkOut]');
inEl.addEventListener('change', () => {
  outEl.min = inEl.value;
  if (outEl.value <= inEl.value) {
    const d = new Date(inEl.value + 'T12:00:00'); d.setDate(d.getDate() + 1);
    outEl.value = d.toISOString().slice(0, 10);
  }
});
</script>
</body>
</html>
