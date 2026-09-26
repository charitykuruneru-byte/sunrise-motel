-- Sunrise Motel Lilongwe — PHP/MySQL Database Schema
-- Account-free direct booking · Area 5, Lilongwe · PHP 7.4+ / MySQL 5.7+ / MariaDB 10.3+

CREATE DATABASE IF NOT EXISTS `sunrise_motel` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sunrise_motel`;

-- Room types & sellable inventory
CREATE TABLE IF NOT EXISTS `room_types` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(120) NOT NULL UNIQUE,
  `description` TEXT NOT NULL,
  `rate` INT NOT NULL,
  `total_inventory` INT NOT NULL DEFAULT 3,
  `bed` VARCHAR(80) NOT NULL,
  `sleeps` VARCHAR(80) NOT NULL,
  `size` VARCHAR(80) NOT NULL,
  `badge` VARCHAR(80) NULL,
  `features_json` TEXT NOT NULL,
  `images_json` TEXT NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Direct account-free bookings
CREATE TABLE IF NOT EXISTS `bookings` (
  `id` VARCHAR(36) PRIMARY KEY,
  `reference` VARCHAR(32) NOT NULL UNIQUE,
  `room_type_id` VARCHAR(64) NOT NULL,
  `room_type` VARCHAR(120) NOT NULL,
  `check_in` DATE NOT NULL,
  `check_out` DATE NOT NULL,
  `adults` INT NOT NULL DEFAULT 1,
  `children` INT NOT NULL DEFAULT 0,
  `nights` INT NOT NULL DEFAULT 1,
  `nightly_rate` INT NOT NULL,
  `total_amount` INT NOT NULL,
  `guest_name` VARCHAR(160) NOT NULL,
  `phone` VARCHAR(40) NOT NULL,
  `email` VARCHAR(180) NULL,
  `arrival` VARCHAR(80) NULL,
  `requests` TEXT NULL,
  `extras_json` TEXT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `assigned_room` VARCHAR(32) NULL,
  `invoice_number` VARCHAR(64) NULL,
  `invoice_sent_at` DATETIME NULL,
  `amount_paid` INT NOT NULL DEFAULT 0,
  `policy_version` VARCHAR(32) NOT NULL DEFAULT '2026-07',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_dates` (`check_in`, `check_out`),
  INDEX `idx_status` (`status`),
  INDEX `idx_room` (`room_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Append-only booking timeline (follow every booking by reference)
CREATE TABLE IF NOT EXISTS `booking_events` (
  `id` VARCHAR(36) PRIMARY KEY,
  `booking_id` VARCHAR(36) NOT NULL,
  `reference` VARCHAR(32) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `note` TEXT NULL,
  `actor` VARCHAR(64) NOT NULL DEFAULT 'system',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_booking` (`booking_id`),
  INDEX `idx_ref` (`reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pro-forma & final invoices
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(36) PRIMARY KEY,
  `invoice_number` VARCHAR(64) NOT NULL UNIQUE,
  `booking_id` VARCHAR(36) NULL,
  `booking_ref` VARCHAR(32) NOT NULL,
  `guest_name` VARCHAR(160) NOT NULL,
  `guest_email` VARCHAR(180) NULL,
  `guest_phone` VARCHAR(40) NULL,
  `room_type` VARCHAR(120) NOT NULL,
  `check_in` DATE NOT NULL,
  `check_out` DATE NOT NULL,
  `nights` INT NOT NULL DEFAULT 1,
  `subtotal` INT NOT NULL,
  `extras_total` INT NOT NULL DEFAULT 0,
  `tax_amount` INT NOT NULL DEFAULT 0,
  `total_amount` INT NOT NULL,
  `amount_paid` INT NOT NULL DEFAULT 0,
  `balance_due` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'proforma',
  `line_items_json` TEXT NOT NULL,
  `payment_instructions` TEXT NULL,
  `sent_to_email` VARCHAR(180) NULL,
  `sent_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Events & posts
CREATE TABLE IF NOT EXISTS `posts` (
  `id` VARCHAR(36) PRIMARY KEY,
  `title` VARCHAR(200) NOT NULL,
  `category` VARCHAR(64) NOT NULL DEFAULT 'Event',
  `day` VARCHAR(16) NULL,
  `date` VARCHAR(16) NULL,
  `time` VARCHAR(80) NULL,
  `detail` TEXT NOT NULL,
  `price_tag` VARCHAR(80) NULL,
  `image_url` TEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gallery pictures
CREATE TABLE IF NOT EXISTS `gallery_images` (
  `id` VARCHAR(36) PRIMARY KEY,
  `title` VARCHAR(160) NOT NULL,
  `category` VARCHAR(80) NOT NULL DEFAULT 'Rooms',
  `image_url` TEXT NOT NULL,
  `alt_text` VARCHAR(255) NOT NULL,
  `caption` TEXT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed rooms (images are bundled in php-mysql/images/)
INSERT IGNORE INTO `room_types` (`id`, `name`, `slug`, `description`, `rate`, `total_inventory`, `bed`, `sleeps`, `size`, `badge`, `features_json`, `images_json`)
VALUES
('standard', 'The Standard', 'standard', 'An easy, restful Queen room: hot shower, work surface, fresh linen and fast Wi-Fi.', 85000, 4, 'Queen bed', 'Sleeps 2', '24 m²', 'Classic comfort', '["Fast Wi-Fi / Starlink","Hot water & walk-in shower","Flat-screen TV","Daily housekeeping","Secure on-site parking"]', '["images/hero-standard.jpg","images/deluxe-detail.jpg","images/listing-11.jpg","images/bathroom.jpg","images/room-layout.jpg"]'),
('deluxe', 'The Deluxe', 'deluxe', 'Spacious King room for business and slow weekends, with a proper desk and tea & coffee station.', 125000, 3, 'King bed', 'Sleeps 2 adults', '32 m²', 'Guest favourite', '["King bed & premium pillows","Dedicated work desk","Fast Wi-Fi / Starlink","En-suite bathroom","Tea & coffee station","Breakfast option"]', '["images/deluxe-main.jpg","images/deluxe-bed.jpg","images/deluxe-room.jpg","images/deluxe-detail.jpg","images/listing-12.jpg","images/bathroom.jpg"]'),
('twin', 'The Twin', 'twin', 'Two proper single beds and generous floor space for colleagues, friends or family.', 115000, 3, 'Twin single beds', 'Sleeps 2', '30 m²', 'Colleagues & family', '["Two comfortable single beds","Fast Wi-Fi","Writing desk & chair","En-suite private bathroom","Secure parking included"]', '["images/twin-main.jpg","images/twin-view.jpg","images/twin-setup.jpg","images/room-layout.jpg","images/bathroom.jpg"]');

-- Seed gallery
INSERT IGNORE INTO `gallery_images` (`id`, `title`, `category`, `image_url`, `alt_text`, `caption`, `display_order`) VALUES
('gal-01','Deluxe King Room','Rooms','images/deluxe-main.jpg','Deluxe king room','King bed, desk, en-suite',1),
('gal-02','Standard Queen Room','Rooms','images/hero-standard.jpg','Standard room','Clean and comfortable',2),
('gal-03','Twin Room','Rooms','images/twin-main.jpg','Twin room','Two proper single beds',3),
('gal-04','En-suite Bathroom','Rooms','images/bathroom.jpg','Bathroom','24/7 hot water',4),
('gal-05','Welcome Desk','Property','images/reception.jpg','Reception','24-hour front desk',5),
('gal-06','Courtyard','Property','images/courtyard.jpg','Courtyard','Open-air courtyard',6),
('gal-07','Signature Grill Platter','Dining','images/food-grill.jpg','Grill platter','From the grill',7),
('gal-08','Nsima & Beef Stew','Dining','images/food-nsima-beef.jpg','Nsima','The house classic',8),
('gal-09','Lawn Braai','Events','images/braai-lawn.jpg','Braai','Saturday braai',9),
('gal-10','Happy Hour','Events','images/happy-hour-terrace.jpg','Happy hour','Sunset drinks',10);

-- Seed posts
INSERT IGNORE INTO `posts` (`id`, `title`, `category`, `day`, `date`, `time`, `detail`, `price_tag`, `image_url`, `is_active`) VALUES
('post-1','Sunset Happy Hour','Event','THU','24','17:00 — 19:00','House pours and chilled drinks on the terrace as the sun goes down.','Special drink prices','images/happy-hour-terrace.jpg',1),
('post-2','Lawn Braai & Sizzling Cuts','Special','SAT','26','12:00 — 20:00','Grilled beef and chicken, house relish, roasted maize and cold drinks on the lawn.','Plates from MWK 22,000','images/braai-lawn.jpg',1),
('post-3','Match Day on the Big Screen','Event','SUN','27','15:00 onwards','Live football with sharing platters and drinks-bucket specials.','Free entry for diners','images/match-day.jpg',1);
