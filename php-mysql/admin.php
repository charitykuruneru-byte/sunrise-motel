<?php
require_once __DIR__ . '/config.php';
$pdo = getDbConnection();
$msg = ''; $err = '';
$tab = $_GET['tab'] ?? 'bookings';
$q = trim($_GET['q'] ?? '');
$statusFilter = $_GET['status'] ?? 'all';

// ---- actions ----
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    try {
        if ($action === 'update_booking') {
            $id = $_POST['id'];
            $b = $pdo->prepare("SELECT * FROM bookings WHERE id = :id"); $b->execute([':id' => $id]); $bk = $b->fetch();
            if ($bk) {
                $notes = [];
                if (isset($_POST['status']) && $_POST['status'] !== $bk['status']) { $notes[] = "Status {$bk['status']} → {$_POST['status']}"; }
                $paid = isset($_POST['amount_paid']) ? max(0, (int)$_POST['amount_paid']) : (int)$bk['amount_paid'];
                if ($paid !== (int)$bk['amount_paid']) $notes[] = "Payment recorded: " . formatMwk($paid);
                $room = trim($_POST['assigned_room'] ?? '');
                if ($room !== ($bk['assigned_room'] ?? '')) $notes[] = $room ? "Assigned $room" : "Room assignment cleared";
                $newStatus = $_POST['status'] ?? $bk['status'];
                if ($paid >= $bk['total_amount'] && $newStatus === $bk['status']) $newStatus = 'confirmed';
                $u = $pdo->prepare("UPDATE bookings SET status = :s, assigned_room = :r, amount_paid = :p WHERE id = :id");
                $u->execute([':s' => $newStatus, ':r' => $room ?: null, ':p' => $paid, ':id' => $id]);
                $pdo->prepare("UPDATE invoices SET amount_paid = :p, balance_due = GREATEST(0, total_amount - :p), status = CASE WHEN :p >= total_amount THEN 'paid' ELSE status END WHERE booking_ref = :ref")
                    ->execute([':p' => $paid, ':ref' => $bk['reference']]);
                if ($notes) logEvent($pdo, $id, $bk['reference'], 'status_changed', implode(' · ', $notes), 'manager');
                $msg = "Booking {$bk['reference']} updated.";
            }
        } elseif ($action === 'add_note') {
            $id = $_POST['id']; $note = trim($_POST['note'] ?? '');
            $b = $pdo->prepare("SELECT * FROM bookings WHERE id = :id"); $b->execute([':id' => $id]); $bk = $b->fetch();
            if ($bk && $note !== '') { logEvent($pdo, $id, $bk['reference'], 'note', $note, 'manager'); $msg = 'Note saved.'; }
        } elseif ($action === 'delete_booking') {
            $id = $_POST['id'];
            $b = $pdo->prepare("SELECT * FROM bookings WHERE id = :id"); $b->execute([':id' => $id]); $bk = $b->fetch();
            if ($bk) {
                $pdo->prepare("DELETE FROM invoices WHERE booking_ref = :r")->execute([':r' => $bk['reference']]);
                try { $pdo->prepare("DELETE FROM booking_events WHERE booking_id = :id")->execute([':id' => $id]); } catch (Exception $e) {}
                $pdo->prepare("DELETE FROM bookings WHERE id = :id")->execute([':id' => $id]);
                $msg = "Booking {$bk['reference']} deleted — rooms released.";
            }
        } elseif ($action === 'add_image') {
            $title = trim($_POST['title'] ?? ''); $url = trim($_POST['image_url'] ?? '');
            $cat = $_POST['category'] ?? 'Rooms'; $cap = trim($_POST['caption'] ?? '');
            if (!empty($_FILES['photo']['tmp_name']) && empty($url)) {
                $dir = __DIR__ . '/images/uploads';
                if (!is_dir($dir)) mkdir($dir, 0775, true);
                $ext = strtolower(pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION));
                if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'])) throw new Exception('Only JPG/PNG/WEBP/GIF allowed.');
                if ($_FILES['photo']['size'] > 8 * 1024 * 1024) throw new Exception('Image larger than 8 MB.');
                $name = preg_replace('/[^a-z0-9-]+/i', '-', pathinfo($_FILES['photo']['name'], PATHINFO_FILENAME));
                $name = substr($name, 0, 40) . '-' . substr(bin2hex(random_bytes(4)), 0, 8) . '.' . $ext;
                move_uploaded_file($_FILES['photo']['tmp_name'], $dir . '/' . $name);
                $url = 'images/uploads/' . $name;
            }
            if ($title === '' || $url === '') throw new Exception('Title and image (upload or URL) required.');
            $pdo->prepare("INSERT INTO gallery_images (id, title, category, image_url, alt_text, caption, display_order) VALUES (:id,:t,:c,:u,:a,:cap,99)")
                ->execute([':id' => bin2hex(random_bytes(16)), ':t' => $title, ':c' => $cat, ':u' => $url, ':a' => $title, ':cap' => $cap ?: null]);
            $msg = 'Picture added to the gallery.';
        } elseif ($action === 'delete_image') {
            $pdo->prepare("DELETE FROM gallery_images WHERE id = :id")->execute([':id' => $_POST['id']]);
            $msg = 'Picture removed.';
        } elseif ($action === 'add_post') {
            $t = trim($_POST['title'] ?? ''); $d = trim($_POST['detail'] ?? '');
            if ($t === '' || $d === '') throw new Exception('Title and details required.');
            $pdo->prepare("INSERT INTO posts (id, title, category, day, date, time, detail, price_tag, image_url) VALUES (:id,:t,:c,:day,:dt,:tm,:d,:p,:u)")
                ->execute([':id' => bin2hex(random_bytes(16)), ':t' => $t, ':c' => $_POST['category'] ?? 'Event', ':day' => $_POST['day'] ?? null, ':dt' => $_POST['date'] ?? null, ':tm' => $_POST['time'] ?? null, ':d' => $d, ':p' => $_POST['price_tag'] ?? null, ':u' => trim($_POST['image_url'] ?? '') ?: 'images/food-grill.jpg']);
            $msg = 'Post published.';
        } elseif ($action === 'delete_post') {
            $pdo->prepare("DELETE FROM posts WHERE id = :id")->execute([':id' => $_POST['id']]);
            $msg = 'Post deleted.';
        } elseif ($action === 'toggle_post') {
            $pdo->prepare("UPDATE posts SET is_active = 1 - is_active WHERE id = :id")->execute([':id' => $_POST['id']]);
            $msg = 'Post visibility updated.';
        }
    } catch (Exception $e) { $err = $e->getMessage(); }
}

// ---- data ----
$where = "1=1"; $params = [];
if ($statusFilter !== 'all') { $where .= " AND status = :st"; $params[':st'] = $statusFilter; }
if ($q !== '') { $where .= " AND (reference LIKE :q OR guest_name LIKE :q OR phone LIKE :q OR email LIKE :q)"; $params[':q'] = "%$q%"; }
$bst = $pdo->prepare("SELECT * FROM bookings WHERE $where ORDER BY created_at DESC LIMIT 200");
$bst->execute($params);
$bookings = $bst->fetchAll();
$all = $pdo->query("SELECT status, total_amount, amount_paid FROM bookings")->fetchAll();
$stats = ['total' => count($all), 'pending' => 0, 'awaiting' => 0, 'confirmed' => 0, 'collected' => 0, 'out' => 0];
foreach ($all as $b) {
    if ($b['status'] === 'pending') $stats['pending']++;
    if ($b['status'] === 'awaiting_payment') $stats['awaiting']++;
    if (in_array($b['status'], ['confirmed', 'checked_in'])) $stats['confirmed']++;
    if ($b['status'] !== 'cancelled') { $stats['collected'] += $b['amount_paid']; $stats['out'] += max(0, $b['total_amount'] - $b['amount_paid']); }
}
$invoices = $pdo->query("SELECT * FROM invoices ORDER BY created_at DESC LIMIT 100")->fetchAll();
try { $gallery = $pdo->query("SELECT * FROM gallery_images ORDER BY display_order ASC LIMIT 200")->fetchAll(); } catch (Exception $e) { $gallery = []; }
try { $posts = $pdo->query("SELECT * FROM posts ORDER BY created_at DESC LIMIT 100")->fetchAll(); } catch (Exception $e) { $posts = []; }
$manage = null; $timeline = [];
if (isset($_GET['manage'])) {
    $m = $pdo->prepare("SELECT * FROM bookings WHERE id = :id OR reference = :ref LIMIT 1");
    $m->execute([':id' => $_GET['manage'], ':ref' => strtoupper($_GET['manage'])]);
    $manage = $m->fetch();
    if ($manage) { try { $t = $pdo->prepare("SELECT * FROM booking_events WHERE booking_id = :id ORDER BY created_at ASC"); $t->execute([':id' => $manage['id']]); $timeline = $t->fetchAll(); } catch (Exception $e) {} }
}
?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Manager Portal · Sunrise Motel (PHP/MySQL)</title><link rel="icon" href="images/sunrise-logo.svg"><link rel="stylesheet" href="assets/style.css">
<style>
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:16px 0;}.stats div{background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;}.stats small{font-size:9px;text-transform:uppercase;color:#756c64;}.stats b{font-size:16px;}
.tabs{display:flex;gap:8px;margin:12px 0;flex-wrap:wrap;}.tabs a{padding:8px 14px;border-radius:20px;background:#fff;border:1px solid var(--line);font-size:12px;font-weight:700;text-decoration:none;color:#555;}.tabs a.on{background:#171513;color:#fff;}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;}.card{background:#fff;border:1px solid var(--line);border-left:4px solid #fb8c00;border-radius:10px;padding:12px;}
.searchbar{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap;}.searchbar input{flex:1;min-width:200px;height:42px;border:1px solid var(--line);border-radius:8px;padding:0 12px;}
.grid-imgs{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}.grid-imgs figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;} .grid-imgs img{width:100%;height:120px;object-fit:cover;}
@media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr);}.cards{grid-template-columns:1fr;}.grid-imgs{grid-template-columns:repeat(2,1fr);}}
</style></head>
<body>
<div class="topbar"><div class="wrap"><span>🔐 STAFF ONLY · Manager Portal</span><a href="index.php">← Guest site</a></div></div>
<header class="site-header"><div class="wrap">
<a class="brand" href="admin.php"><img src="images/sunrise-logo.svg" alt="logo"><span><strong>Sunrise Motel · Manager</strong><small>Bookings · invoices · pictures · posts</small></span></a>
<nav class="nav"><a href="index.php">Stay</a><a href="admin.php" class="active">Manager</a></nav></div></header>
<div class="wrap">
<?php if ($msg): ?><div class="alert ok" style="margin-top:12px;"><?= htmlspecialchars($msg) ?></div><?php endif; ?>
<?php if ($err): ?><div class="alert err" style="margin-top:12px;"><?= htmlspecialchars($err) ?></div><?php endif; ?>
<div class="stats">
<div><small>Requests</small><b><?= $stats['total'] ?></b></div><div><small>Pending</small><b><?= $stats['pending'] ?></b></div>
<div><small>Awaiting pay</small><b><?= $stats['awaiting'] ?></b></div><div><small>Confirmed</small><b><?= $stats['confirmed'] ?></b></div>
<div><small>Collected</small><b><?= formatMwk($stats['collected']) ?></b></div><div><small>Outstanding</small><b><?= formatMwk($stats['out']) ?></b></div>
</div>
<div class="tabs">
<a href="?tab=bookings" class="<?= $tab === 'bookings' ? 'on' : '' ?>">📅 Bookings</a>
<a href="?tab=invoices" class="<?= $tab === 'invoices' ? 'on' : '' ?>">🧾 Invoices (<?= count($invoices) ?>)</a>
<a href="?tab=gallery" class="<?= $tab === 'gallery' ? 'on' : '' ?>">🖼 Pictures (<?= count($gallery) ?>)</a>
<a href="?tab=posts" class="<?= $tab === 'posts' ? 'on' : '' ?>">🔥 Posts (<?= count($posts) ?>)</a>
</div>

<?php if ($tab === 'bookings'): ?>
<form class="searchbar" method="GET"><input type="hidden" name="tab" value="bookings">
<input name="q" placeholder="Follow a booking: reference (SM-…), name, phone…" value="<?= htmlspecialchars($q) ?>">
<select name="status" style="height:42px;border:1px solid var(--line);border-radius:8px;">
<option value="all">All statuses</option>
<?php foreach (['pending','awaiting_payment','confirmed','checked_in','checked_out','cancelled'] as $s): ?><option value="<?= $s ?>" <?= $statusFilter === $s ? 'selected' : '' ?>><?= str_replace('_',' ',$s) ?></option><?php endforeach; ?>
</select>
<button class="btn-primary" style="width:auto;margin:0;padding:0 18px;" type="submit">Search</button></form>
<div class="cards">
<?php foreach ($bookings as $b): $bal = max(0, $b['total_amount'] - $b['amount_paid']); ?>
<div class="card">
<div style="display:flex;justify-content:space-between;"><a href="?tab=bookings&manage=<?= urlencode($b['reference']) ?>" style="font-family:monospace;font-weight:800;color:#c95612;"><?= htmlspecialchars($b['reference']) ?></a><span class="status st-<?= $b['status'] ?>"><?= str_replace('_',' ',$b['status']) ?></span></div>
<strong><?= htmlspecialchars($b['guest_name']) ?></strong> <small style="color:#756c64;"><?= htmlspecialchars($b['phone']) ?></small>
<div style="font-size:12px;margin-top:6px;">🛏 <?= htmlspecialchars($b['room_type']) ?><?= $b['assigned_room'] ? ' · <b>'.htmlspecialchars($b['assigned_room']).'</b>' : ' · <i>unassigned</i>' ?><br>📅 <?= htmlspecialchars($b['check_in']) ?> → <?= htmlspecialchars($b['check_out']) ?> (<?= $b['nights'] ?>n)<br>💰 <?= formatMwk($b['total_amount']) ?> · <?= $bal ? 'Balance <b style="color:#c62828">'.formatMwk($bal).'</b>' : '<b style="color:green">Paid</b>' ?></div>
<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
<a href="?tab=bookings&manage=<?= urlencode($b['reference']) ?>" style="font-size:12px;">🔑 Manage & timeline</a>
<a href="invoice.php?ref=<?= urlencode($b['reference']) ?>" style="font-size:12px;" target="_blank">📄 Invoice</a>
<a href="https://wa.me/<?= preg_replace('/\D/','',$b['phone']) ?>?text=<?= urlencode("Hello {$b['guest_name']}, Sunrise Motel front desk re booking {$b['reference']}.") ?>" target="_blank" style="font-size:12px;">💬 WhatsApp</a>
</div></div>
<?php endforeach; ?>
<?php if (!$bookings): ?><p>No bookings match.</p><?php endif; ?>
</div>
<?php endif; ?>

<?php if ($tab === 'invoices'): ?>
<table class="admin"><thead><tr><th>Invoice</th><th>Booking / guest</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
<?php foreach ($invoices as $i): ?><tr>
<td><b style="font-family:monospace;color:#c95612;"><?= htmlspecialchars($i['invoice_number']) ?></b><br><small><?= htmlspecialchars($i['created_at']) ?></small></td>
<td><?= htmlspecialchars($i['booking_ref']) ?> · <?= htmlspecialchars($i['guest_name']) ?><br><small><?= htmlspecialchars($i['room_type']) ?> · <?= htmlspecialchars($i['check_in']) ?> → <?= htmlspecialchars($i['check_out']) ?></small></td>
<td><b><?= formatMwk($i['total_amount']) ?></b><br><small><?= $i['balance_due'] > 0 ? 'Due '.formatMwk($i['balance_due']) : 'Paid' ?></small></td>
<td><span class="status"><?= htmlspecialchars($i['status']) ?></span></td>
<td><a href="invoice.php?ref=<?= urlencode($i['booking_ref']) ?>" target="_blank">📄 Open / print</a></td>
</tr><?php endforeach; ?></tbody></table>
<?php endif; ?>

<?php if ($tab === 'gallery'): ?>
<div class="form-card" style="max-width:none;margin-bottom:14px;"><strong>Add picture</strong>
<form method="POST" enctype="multipart/form-data" style="display:grid;gap:8px;margin-top:8px;">
<input type="hidden" name="action" value="add_image">
<div class="grid2"><label>Title<input name="title" required placeholder="e.g. Deluxe room, new curtains"></label><label>Category<select name="category"><option>Rooms</option><option>Property</option><option>Dining</option><option>Events</option><option>Work</option></select></label></div>
<label>Upload photo (JPG/PNG/WEBP, max 8 MB)<input type="file" name="photo" accept="image/*"></label>
<label>…or paste image URL<input name="image_url" placeholder="https://… or images/xxx.jpg"></label>
<label>Caption (optional)<input name="caption" placeholder="Short caption"></label>
<button class="btn-primary" style="margin-top:4px;" type="submit">＋ Save to gallery</button>
</form></div>
<div class="grid-imgs"><?php foreach ($gallery as $g): ?><figure><img src="<?= htmlspecialchars($g['image_url']) ?>" alt="<?= htmlspecialchars($g['title']) ?>" loading="lazy"><figcaption style="padding:8px;font-size:12px;"><b><?= htmlspecialchars($g['title']) ?></b> <small>(<?= htmlspecialchars($g['category']) ?>)</small><form method="POST" onsubmit="return confirm('Remove this picture?')"><input type="hidden" name="action" value="delete_image"><input type="hidden" name="id" value="<?= $g['id'] ?>"><button style="color:#c62828;border:0;background:none;cursor:pointer;font-size:12px;" type="submit">🗑 Remove</button></form></figcaption></figure><?php endforeach; ?></div>
<?php endif; ?>

<?php if ($tab === 'posts'): ?>
<div class="form-card" style="max-width:none;margin-bottom:14px;"><strong>Publish post / event</strong>
<form method="POST" style="display:grid;gap:8px;margin-top:8px;"><input type="hidden" name="action" value="add_post">
<label>Title<input name="title" required placeholder="Saturday lawn braai"></label>
<div class="grid2">
<label>Category<select name="category"><option>Event</option><option>Special</option><option>Offer</option><option>News</option></select></label>
<label>Day / Date / Time<input name="day" placeholder="SAT" style="margin-bottom:4px;"><input name="date" placeholder="26" style="margin-bottom:4px;"><input name="time" placeholder="12:00 — 20:00"></label>
</div>
<div class="grid2"><label>Price tag<input name="price_tag" placeholder="From MWK 22,000"></label><label>Image URL<input name="image_url" placeholder="images/braai-lawn.jpg"></label></div>
<label>Details<textarea name="detail" required rows="2" placeholder="What, when, price, terms…"></textarea></label>
<button class="btn-primary" style="margin-top:4px;" type="submit">＋ Publish</button></form></div>
<?php foreach ($posts as $p): ?><div class="card" style="margin-bottom:8px;">
<strong><?= htmlspecialchars($p['title']) ?></strong> <small>(<?= htmlspecialchars($p['category']) ?> · <?= $p['is_active'] ? 'Live' : 'Paused' ?>)</small>
<p style="font-size:12px;color:#555;"><?= htmlspecialchars($p['detail']) ?></p>
<div style="display:flex;gap:10px;font-size:12px;">
<form method="POST"><input type="hidden" name="action" value="toggle_post"><input type="hidden" name="id" value="<?= $p['id'] ?>"><button style="border:0;background:none;color:#2e6b34;cursor:pointer;" type="submit"><?= $p['is_active'] ? '⏸ Pause' : '▶ Publish' ?></button></form>
<form method="POST" onsubmit="return confirm('Delete?')"><input type="hidden" name="action" value="delete_post"><input type="hidden" name="id" value="<?= $p['id'] ?>"><button style="border:0;background:none;color:#c62828;cursor:pointer;" type="submit">🗑 Delete</button></form>
</div></div><?php endforeach; ?>
<?php endif; ?>
</div>

<?php if ($manage): ?>
<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto;z-index:99;" onclick="if(event.target===this)location.href='?tab=bookings'">
<div class="form-card" style="max-width:720px;width:100%;">
<a href="?tab=bookings" style="float:right;">✕</a>
<span class="eyebrow">Follow booking</span>
<h2 style="font-family:monospace;"><?= htmlspecialchars($manage['reference']) ?></h2>
<p style="font-size:13px;"><b><?= htmlspecialchars($manage['guest_name']) ?></b> · <?= htmlspecialchars($manage['phone']) ?><?= $manage['email'] ? ' · '.htmlspecialchars($manage['email']) : '' ?></p>
<p style="font-size:12px;">🛏 <?= htmlspecialchars($manage['room_type']) ?> · 📅 <?= htmlspecialchars($manage['check_in']) ?> → <?= htmlspecialchars($manage['check_out']) ?> (<?= $manage['nights'] ?>n) · 💰 <?= formatMwk($manage['total_amount']) ?> (paid <?= formatMwk($manage['amount_paid']) ?>)</p>
<?php if ($manage['requests']): ?><p style="font-size:12px;background:#fffde7;padding:8px;border-radius:6px;"><?= htmlspecialchars($manage['requests']) ?></p><?php endif; ?>
<form method="POST" style="display:grid;gap:8px;"><input type="hidden" name="action" value="update_booking"><input type="hidden" name="id" value="<?= $manage['id'] ?>">
<div class="grid2">
<label>Status<select name="status"><?php foreach (['pending','awaiting_payment','confirmed','checked_in','checked_out','cancelled'] as $s): ?><option value="<?= $s ?>" <?= $manage['status'] === $s ? 'selected' : '' ?>><?= str_replace('_',' ',$s) ?></option><?php endforeach; ?></select></label>
<label>Assign room<input name="assigned_room" value="<?= htmlspecialchars($manage['assigned_room'] ?? '') ?>" placeholder="Room 104"></label>
</div>
<label>Amount paid (MWK)<input type="number" name="amount_paid" value="<?= (int)$manage['amount_paid'] ?>"></label>
<button class="btn-primary" type="submit">Save changes</button></form>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;font-size:13px;">
<a href="invoice.php?ref=<?= urlencode($manage['reference']) ?>" target="_blank">📄 Download / print invoice</a>
<a href="https://wa.me/<?= preg_replace('/\D/','',$manage['phone']) ?>" target="_blank">💬 WhatsApp guest</a>
</div>
<h4>Timeline</h4>
<ul style="font-size:12px;"><?php foreach ($timeline as $t): ?><li><b><?= htmlspecialchars($t['action']) ?></b><?= $t['note'] ? ' — '.htmlspecialchars($t['note']) : '' ?> <small>(<?= htmlspecialchars($t['created_at']) ?> · <?= htmlspecialchars($t['actor']) ?>)</small></li><?php endforeach; ?><?php if (!$timeline): ?><li>No events yet.</li><?php endif; ?></ul>
<form method="POST" style="display:flex;gap:8px;"><input type="hidden" name="action" value="add_note"><input type="hidden" name="id" value="<?= $manage['id'] ?>"><input name="note" placeholder="Manager note…" style="flex:1;height:40px;border:1px solid var(--line);border-radius:4px;padding:0 10px;"><button class="btn-primary" style="width:auto;margin:0;padding:0 16px;" type="submit">Add note</button></form>
<form method="POST" onsubmit="return confirm('Delete booking and release rooms?')" style="margin-top:10px;"><input type="hidden" name="action" value="delete_booking"><input type="hidden" name="id" value="<?= $manage['id'] ?>"><button style="background:#ffebee;color:#c62828;border:0;border-radius:6px;padding:8px 12px;cursor:pointer;" type="submit">🗑 Delete booking</button></form>
</div></div>
<?php endif; ?>
</body></html>
