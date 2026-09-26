# Sunrise Motel — PHP/MySQL Edition (Account-Free Booking System)
**Area 5, Lilongwe · Mzimba Road, behind Bwasila Secondary School · +265 998 688 332**

This is the **PHP/MySQL build** of the Sunrise Motel booking platform — designed for standard shared hosting / cPanel with **no Node.js required**.

## What is inside

| File | Purpose |
|---|---|
| `index.php` | Stay page: live availability search, room cards, photo slideshow popup, anti-overbooking counts |
| `booking.php` | Account-free checkout with live extras calculator (breakfast / airport transfer / late check-out), pro-forma auto-creation |
| `track.php` | Guest tracking by booking reference + phone — status, balance, invoice link |
| `invoice.php` | Printable / save-as-PDF invoice & receipt (`invoice.php?ref=SM-…`) |
| `gallery.php` | Filterable photo gallery (reads `gallery_images` table) |
| `admin.php` | Manager portal: follow bookings by reference, timeline, room assignment, payments, invoice download, add/remove pictures & posts |
| `config.php` | DB credentials, Malawi helpers (MWK formatting, dates, references, overlap check) |
| `schema.sql` | Full MySQL schema + seed rooms, gallery and posts |
| `images/` | All bundled room, food, property & event photos + official logo |
| `assets/style.css` | Shared mobile-first stylesheet |

## Requirements

- PHP 7.4+ (8.x recommended) with `pdo_mysql`
- MySQL 5.7+ / MariaDB 10.3+
- Apache or Nginx (works on cPanel shared hosting)

## Install in 5 minutes

1. **Create the database** and import the schema:
   ```sql
   CREATE DATABASE sunrise_motel CHARACTER SET utf8mb4;
   -- then import php-mysql/schema.sql via phpMyAdmin or:
   mysql -u root -p sunrise_motel < php-mysql/schema.sql
   ```
2. **Set credentials** in `php-mysql/config.php` (`DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`).
3. **Upload** the contents of `php-mysql/` to your web root (e.g. `public_html/`), keeping the `images/` and `assets/` folders beside the `.php` files.
4. **Set permissions** so PHP can save manager uploads:
   ```
   mkdir -p images/uploads && chmod 775 images/uploads
   ```
5. Open `https://your-domain/index.php` — pick dates and book. Managers use `admin.php`.

## How anti-overbooking works

Every search and every booking runs the same rule in MySQL:

```sql
SELECT COUNT(*) FROM bookings
WHERE room_type_id = :id AND status != 'cancelled'
  AND check_in < :checkOut AND check_out > :checkIn
```

`available = total_inventory − overlapping`. Booking inserts run inside a transaction with `SELECT … FOR UPDATE` on the room-type row, so two guests can never take the last room at the same moment.

## Notes

- Guests never create accounts. Tracking uses **reference + phone number**.
- Room photos are the real Sunrise Motel listing photographs; food/event shots are illustrative until the team uploads their own via **Admin → Pictures**.
- To send invoice emails from PHP, configure your host's SMTP/`mail()` and add it in `admin.php` / `invoice.php` (WhatsApp sharing works out of the box).
