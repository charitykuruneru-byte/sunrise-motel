<?php
require_once __DIR__ . '/config.php';
$pdo = getDbConnection();
$filter = $_GET['cat'] ?? 'All';
try {
  $imgs = $pdo->query("SELECT * FROM gallery_images ORDER BY display_order ASC, created_at DESC")->fetchAll();
} catch (Exception $e) { $imgs = []; }
if (!$imgs) {
  $imgs = [
    ['title' => 'Deluxe King Room', 'category' => 'Rooms', 'image_url' => 'images/deluxe-main.jpg', 'caption' => 'King bed, desk, en-suite'],
    ['title' => 'Standard Queen Room', 'category' => 'Rooms', 'image_url' => 'images/hero-standard.jpg', 'caption' => 'Clean and comfortable'],
    ['title' => 'Twin Room', 'category' => 'Rooms', 'image_url' => 'images/twin-main.jpg', 'caption' => 'Two proper single beds'],
    ['title' => 'Welcome Desk', 'category' => 'Property', 'image_url' => 'images/reception.jpg', 'caption' => '24-hour front desk'],
    ['title' => 'Courtyard', 'category' => 'Property', 'image_url' => 'images/courtyard.jpg', 'caption' => 'Open-air courtyard'],
    ['title' => 'Signature Grill Platter', 'category' => 'Dining', 'image_url' => 'images/food-grill.jpg', 'caption' => 'From the grill'],
    ['title' => 'Nsima & Beef Stew', 'category' => 'Dining', 'image_url' => 'images/food-nsima-beef.jpg', 'caption' => 'The house classic'],
    ['title' => 'Lawn Braai', 'category' => 'Events', 'image_url' => 'images/braai-lawn.jpg', 'caption' => 'Saturday braai'],
    ['title' => 'Happy Hour', 'category' => 'Events', 'image_url' => 'images/happy-hour-terrace.jpg', 'caption' => 'Sunset drinks'],
  ];
}
$cats = array_values(array_unique(array_merge(['All'], array_column($imgs, 'category'))));
$vis = $filter === 'All' ? $imgs : array_values(array_filter($imgs, fn($i) => $i['category'] === $filter));
?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gallery · Sunrise Motel (PHP/MySQL)</title><link rel="icon" href="images/sunrise-logo.svg"><link rel="stylesheet" href="assets/style.css">
<style>.gal{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px;}.gal figure{margin:0;position:relative;border-radius:10px;overflow:hidden;height:180px;background:#ddd;}.gal img{width:100%;height:100%;object-fit:cover;}figcaption{position:absolute;left:0;right:0;bottom:0;padding:22px 10px 8px;color:#fff;font-size:12px;background:linear-gradient(0deg,rgba(0,0,0,.75),transparent);}.filters{display:flex;gap:8px;overflow-x:auto;margin-top:12px;}.filters a{flex:0 0 auto;padding:7px 14px;border-radius:20px;border:1px solid var(--line);background:#fff;font-size:11px;font-weight:800;text-transform:uppercase;text-decoration:none;color:#756c64;}.filters a.on{background:#171513;color:#fff;}@media(max-width:700px){.gal{grid-template-columns:repeat(2,1fr);}.gal figure{height:150px;}}</style>
</head><body>
<div class="topbar"><div class="wrap"><span>📍 Area 5, Lilongwe</span><a href="tel:+265998688332">☎ +265 998 688 332</a><a class="pill" href="index.php">Book a room</a></div></div>
<header class="site-header"><div class="wrap">
<a class="brand" href="index.php"><img src="images/sunrise-logo.svg" alt="logo"><span><strong>Sunrise Motel</strong><small>When you are here, you are family.</small></span></a>
<nav class="nav"><a href="index.php">Stay</a><a href="track.php">Track</a><a href="gallery.php" class="active">Gallery</a><a href="admin.php">Manager</a></nav>
<a class="wa-btn" href="https://wa.me/<?= MOTEL_WHATSAPP ?>" target="_blank">WhatsApp</a></div></header>
<section class="section"><div class="wrap">
<span class="eyebrow">Gallery</span><h2>Take a look around</h2>
<p style="color:#756c64;font-size:13px;">Room photos are the real Sunrise Motel listing photographs. Managers can add more from Admin → Pictures.</p>
<div class="filters"><?php foreach ($cats as $c): ?><a href="?cat=<?= urlencode($c) ?>" class="<?= $c === $filter ? 'on' : '' ?>"><?= htmlspecialchars($c) ?></a><?php endforeach; ?></div>
<div class="gal"><?php foreach ($vis as $g): ?><figure><img src="<?= htmlspecialchars($g['image_url']) ?>" alt="<?= htmlspecialchars($g['title']) ?>" loading="lazy"><figcaption><strong><?= htmlspecialchars($g['title']) ?></strong><br><small><?= htmlspecialchars($g['category']) ?><?= !empty($g['caption']) ? ' · ' . htmlspecialchars($g['caption']) : '' ?></small></figcaption></figure><?php endforeach; ?></div>
</div></section>
</body></html>
