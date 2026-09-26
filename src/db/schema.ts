import { boolean, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const roomTypesTable = pgTable("room_types", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  description: text("description").notNull(),
  rate: integer("rate").notNull(), // MWK per night
  totalInventory: integer("total_inventory").notNull().default(3),
  bed: varchar("bed", { length: 80 }).notNull(),
  sleeps: varchar("sleeps", { length: 80 }).notNull(),
  size: varchar("size", { length: 80 }).notNull(),
  badge: varchar("badge", { length: 80 }),
  features: text("features").notNull().default("[]"), // JSON string
  images: text("images").notNull().default("[]"), // JSON array of string URLs
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bookings = pgTable("bookings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  reference: varchar("reference", { length: 32 }).notNull().unique(),
  bookingNumber: varchar("booking_number", { length: 16 }), // e.g. BK-2026-0011 (human reference)
  roomTypeId: varchar("room_type_id", { length: 64 }).notNull(),
  roomType: varchar("room_type", { length: 120 }).notNull(),
  checkIn: varchar("check_in", { length: 10 }).notNull(), // YYYY-MM-DD
  checkOut: varchar("check_out", { length: 10 }).notNull(), // YYYY-MM-DD
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  nights: integer("nights").notNull().default(1),
  nightlyRate: integer("nightly_rate").notNull(),
  serviceFee: integer("service_fee").notNull().default(0),
  extensionFee: integer("extension_fee").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  totalAmount: integer("total_amount").notNull(),
  guestName: varchar("guest_name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  email: varchar("email", { length: 180 }),
  arrival: varchar("arrival", { length: 80 }),
  requests: text("requests"),
  extras: text("extras").default("[]"), // JSON string of selected extras
  status: varchar("status", { length: 32 }).notNull().default("pending"), // pending, confirmed, awaiting_payment, checked_in, checked_out, cancelled
  assignedRoom: varchar("assigned_room", { length: 32 }), // e.g. Room 102
  assignedStaffId: varchar("assigned_staff_id", { length: 36 }), // staff.id handling this booking
  followUpAt: timestamp("follow_up_at", { withTimezone: true }), // requested follow-up date
  followUpNote: text("follow_up_note"),
  lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
  reminderCount: integer("reminder_count").notNull().default(0),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  invoiceNumber: varchar("invoice_number", { length: 64 }),
  invoiceSentAt: timestamp("invoice_sent_at", { withTimezone: true }),
  amountPaid: integer("amount_paid").notNull().default(0),
  policyVersion: varchar("policy_version", { length: 32 }).notNull().default("2026-07"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const postsTable = pgTable("posts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  category: varchar("category", { length: 64 }).notNull().default("Event"), // Event, Offer, Announcement
  day: varchar("day", { length: 16 }), // e.g. SAT
  date: varchar("date", { length: 16 }), // e.g. 26
  time: varchar("time", { length: 80 }), // e.g. 12:00 — 20:00
  detail: text("detail").notNull(),
  priceTag: varchar("price_tag", { length: 80 }), // e.g. MWK 22,000
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const menuItemsTable = pgTable("menu_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(), // From the grill, Mains, Light & fresh, Coffee & snacks, Drinks
  description: text("description").notNull(),
  price: integer("price").notNull(), // MWK
  imageUrl: text("image_url").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  isSpecial: boolean("is_special").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const galleryImagesTable = pgTable("gallery_images", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  category: varchar("category", { length: 80 }).notNull().default("Rooms"), // Rooms, Property, Dining, Events
  imageUrl: text("image_url").notNull(),
  altText: varchar("alt_text", { length: 255 }).notNull(),
  caption: text("caption"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoicesTable = pgTable("invoices", {
  id: varchar("id", { length: 36 }).primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 64 }).notNull().unique(),
  bookingId: varchar("booking_id", { length: 36 }),
  bookingRef: varchar("booking_ref", { length: 32 }).notNull(),
  guestName: varchar("guest_name", { length: 160 }).notNull(),
  guestEmail: varchar("guest_email", { length: 180 }),
  guestPhone: varchar("guest_phone", { length: 40 }),
  roomType: varchar("room_type", { length: 120 }).notNull(),
  checkIn: varchar("check_in", { length: 10 }).notNull(),
  checkOut: varchar("check_out", { length: 10 }).notNull(),
  nights: integer("nights").notNull().default(1),
  subtotal: integer("subtotal").notNull(),
  extrasTotal: integer("extras_total").notNull().default(0),
  taxAmount: integer("tax_amount").notNull().default(0), // Tourism levy + VAT if applicable
  totalAmount: integer("total_amount").notNull(),
  amountPaid: integer("amount_paid").notNull().default(0),
  balanceDue: integer("balance_due").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("proforma"), // proforma, sent, paid, cancelled
  lineItemsJson: text("line_items_json").notNull().default("[]"),
  paymentInstructions: text("payment_instructions"),
  sentToEmail: varchar("sent_to_email", { length: 180 }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Staff accounts + roles. Admins have full control; staff can only
// view + confirm/approve/cancel/follow-up bookings (enforced in APIs + UI).
export const staffTable = pgTable("staff", {
  id: varchar("id", { length: 36 }).primaryKey(),
  staffCode: varchar("staff_code", { length: 16 }).notNull().unique(), // e.g. STF002
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 180 }).notNull().unique(),
  phone: varchar("phone", { length: 40 }),
  role: varchar("role", { length: 16 }).notNull().default("staff"), // admin | staff
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Append-only audit trail so every booking can be followed by reference
export const bookingEventsTable = pgTable("booking_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 36 }).notNull(),
  reference: varchar("reference", { length: 32 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(), // created, status_changed, room_assigned, payment_recorded, invoice_emailed, note
  note: text("note"),
  actor: varchar("actor", { length: 64 }).notNull().default("system"), // guest, manager, system
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// System-wide audit log: organised, append-only record of everything staff and
// guests do — kept for future auditing. Never updated, only inserted + read.
export const auditLogTable = pgTable("audit_log", {
  id: varchar("id", { length: 36 }).primaryKey(),
  action: varchar("action", { length: 96 }).notNull(), // e.g. booking.created, booking.status_changed, gallery.image_added
  entity: varchar("entity", { length: 64 }).notNull(), // booking | invoice | gallery | post | upload | auth
  entityId: varchar("entity_id", { length: 64 }),
  reference: varchar("reference", { length: 32 }),
  summary: text("summary"),
  actor: varchar("actor", { length: 32 }).notNull().default("system"), // guest | manager | system
  actorLabel: varchar("actor_label", { length: 160 }),
  ip: varchar("ip", { length: 64 }),
  metadataJson: text("metadata_json").default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Fallback image store. Used when Vercel Blob is not configured (local dev, the
// trycloudflare tunnel, or a missing/expired BLOB_READ_WRITE_TOKEN) so admin photo
// uploads always land somewhere permanent instead of dead-ending. Bytes are kept
// in Postgres and served back by /api/images/[id].
export const uploadedImagesTable = pgTable("uploaded_images", {
  id: varchar("id", { length: 36 }).primaryKey(),
  filename: varchar("filename", { length: 160 }).notNull(),
  contentType: varchar("content_type", { length: 64 }).notNull(),
  size: integer("size").notNull(),
  data: text("data").notNull(), // base64 of the image bytes
  uploadedBy: varchar("uploaded_by", { length: 160 }), // "Admin — Willard Kulemeka"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BookingEvent = typeof bookingEventsTable.$inferSelect;
export type AuditLog = typeof auditLogTable.$inferSelect;
export type Staff = typeof staffTable.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type RoomType = typeof roomTypesTable.$inferSelect;
export type Post = typeof postsTable.$inferSelect;
export type MenuItem = typeof menuItemsTable.$inferSelect;
export type GalleryImage = typeof galleryImagesTable.$inferSelect;
export type Invoice = typeof invoicesTable.$inferSelect;
export type UploadedImage = typeof uploadedImagesTable.$inferSelect;
