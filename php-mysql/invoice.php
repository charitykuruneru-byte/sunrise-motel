<?php
require_once __DIR__ . '/config.php';
$pdo = getDbConnection();
$ref = strtoupper(trim($_GET['ref'] ?? ''));
if ($ref === '') die("Missing reference. <a href='index.php'>Back</a>");
$st = $pdo->prepare("SELECT b.*, i.invoice_number AS inv_no, i.status AS inv_status, i.line_items_json, i.payment_instructions, i.sent_at FROM bookings b LEFT JOIN invoices i ON i.booking_ref = b.reference WHERE b.reference = :r LIMIT 1");
$st->execute([':r' => $ref]);
$row = $st->fetch();
if (!$row) die("Invoice not found for $ref. <a href='index.php'>Back</a>");
$lines = json_decode($row['line_items_json'] ?? '[]', true) ?: [];
$paid = (int)$row['amount_paid']; $total = (int)$row['total_amount']; $bal = max(0, $total - $paid);
$isPaid = $paid >= $total && $total > 0;
$title = $row['status'] === 'cancelled' ? 'CANCELLED PRO-FORMA' : ($isPaid ? 'TAX INVOICE / RECEIPT' : 'PRO-FORMA INVOICE');
?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= htmlspecialchars($row['inv_no'] ?: $ref) ?> · Sunrise Motel invoice</title>
<link rel="icon" href="images/sunrise-logo.svg"><link rel="stylesheet" href="assets/style.css">
<style>
.inv { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 26px; max-width: 760px; margin: 0 auto; }
.inv-head { display: flex; gap: 14px; align-items: center; border-bottom: 2px solid var(--orange); padding-bottom: 14px; }
.inv-head img { width: 64px; height: 64px; background: #fff; border-radius: 50%; }
.inv table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 14px; }
.inv th { text-align: left; font-size: 10px; text-transform: uppercase; color: #756c64; border-bottom: 1px solid var(--line); padding: 8px; }
.inv td { padding: 8px; border-bottom: 1px solid #f0ece6; }
.totals { text-align: right; font-size: 13px; margin-top: 10px; }
.totals .grand { font-size: 17px; font-weight: 800; color: var(--ember); }
</style></head>
<body>
<div class="topbar no-print"><div class="wrap"><span>📍 Area 5, Lilongwe</span><a href="index.php">← Back to rooms</a></div></div>
<section class="section"><div class="wrap">
<div class="inv">
<div class="inv-head">
<img src="images/sunrise-logo.svg" alt="Sunrise Motel logo">
<div><strong style="font-size:20px;">Sunrise Motel</strong><br><small style="color:#c95612;font-style:italic;">When you are here, you are family.</small><br><small style="color:#756c64;"><?= MOTEL_LOCATION ?> · <?= MOTEL_PHONE ?></small></div>
<div style="margin-left:auto;text-align:right;"><strong style="color:#c95612;"><?= $title ?></strong><br><small>Invoice: <b><?= htmlspecialchars($row['inv_no'] ?: ('INV-'.$ref)) ?></b></small><br><small>Booking: <b><?= htmlspecialchars($ref) ?></b></small></div>
</div>
<div class="grid2" style="margin-top:14px;font-size:13px;">
<div><small style="color:#756c64;">BILLED TO</small><br><strong><?= htmlspecialchars($row['guest_name']) ?></strong><br>Phone: <?= htmlspecialchars($row['phone']) ?><br><?= $row['email'] ? 'Email: '.htmlspecialchars($row['email']).'<br>' : '' ?>Guests: <?= (int)$row['adults'] ?> adult(s)<?= $row['children'] ? ' · '.(int)$row['children'].' child(ren)' : '' ?></div>
<div><small style="color:#756c64;">STAY</small><br><strong><?= htmlspecialchars($row['room_type']) ?><?= $row['assigned_room'] ? ' · '.htmlspecialchars($row['assigned_room']) : '' ?></strong><br>Check-in: <?= friendlyDate($row['check_in']) ?> (from 14:00)<br>Check-out: <?= friendlyDate($row['check_out']) ?> (by 10:00)<br><?= (int)$row['nights'] ?> night(s) · <?= formatMwk($row['nightly_rate']) ?>/night</div>
</div>
<table><thead><tr><th>Description</th><th style="text-align:right;">Amount (MWK)</th></tr></thead><tbody>
<?php foreach ($lines as $l): ?><tr><td><?= htmlspecialchars($l['description'] ?? '') ?></td><td style="text-align:right;"><?= number_format((int)($l['amount'] ?? 0)) ?></td></tr><?php endforeach; ?>
</tbody></table>
<div class="totals">
<div>Total: <strong><?= formatMwk($total) ?></strong></div>
<div>Paid: <?= formatMwk($paid) ?></div>
<div class="grand"><?= $bal > 0 ? 'Balance due: ' . formatMwk($bal) : 'PAID IN FULL — thank you' ?></div>
</div>
<div style="background:#f8f5f0;border:1px dashed #b78754;border-radius:8px;padding:12px;font-size:12px;margin-top:14px;">
<strong>HOW TO PAY:</strong><br>
Bank: National Bank of Malawi — Sunrise Motel — Acc 1009876543 — Ref <?= htmlspecialchars($ref) ?><br>
Airtel Money +265 998 688 332 · TNM Mpamba +265 888 123 456 · Cash/card at front desk<br>
<small style="color:#756c64;">Send proof on WhatsApp +265 998 688 332 quoting your reference.</small>
</div>
<?php if ($row['requests']): ?><p style="font-size:12px;color:#555;"><strong>Guest notes:</strong> <?= htmlspecialchars($row['requests']) ?></p><?php endif; ?>
<p style="font-size:11px;color:#756c64;font-style:italic;"><?= $isPaid ? 'This document confirms payment received.' : 'This pro-forma invoice is a quotation, not a payment receipt. A receipt is issued once payment is verified.' ?></p>
<div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;">
<button class="btn-primary" style="flex:1;" onclick="window.print()">🖨 Print / save PDF</button>
<a class="btn-primary" style="flex:1;background:#25d366;color:#fff;" href="https://wa.me/<?= MOTEL_WHATSAPP ?>?text=<?= urlencode("Hello, my Sunrise Motel invoice is " . ($row['inv_no'] ?: $ref) . " for booking $ref.") ?>" target="_blank">💬 Send via WhatsApp</a>
</div>
</div>
</div></section>
</body></html>
