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
  assignedRoom: varchar("assigned_room", { length: 32 }), // e.g. Room 102 (legacy free text)
  // --- v2 ---
  assignedRoomId: varchar("assigned_room_id", { length: 36 }), // rooms.id — validated against overlaps + state
  guestId: varchar("guest_id", { length: 36 }), // guests.id — the CRM identity behind the booking
  depositRequired: integer("deposit_required").notNull().default(0),
  depositDueAt: timestamp("deposit_due_at", { withTimezone: true }),
  selfModifiedCount: integer("self_modified_count").notNull().default(0),
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

// ---------------------------------------------------------------------------
// v2 — GUEST PLATFORM + FRONT DESK SYSTEM (Parts 4–10 of the v2 spec).
// Additive only: physical rooms with housekeeping state, guest accounts invited
// by the front desk, a running room bill (folio), guest orders, private
// guest↔desk threads, service tasks, payments and the notification log.
// ---------------------------------------------------------------------------

// Physical rooms (not room types). State drives housekeeping and what the desk
// may sell: an `out_of_order` room leaves the sellable inventory entirely.
export const roomsTable = pgTable("rooms", {
  id: varchar("id", { length: 36 }).primaryKey(),
  roomNumber: varchar("room_number", { length: 16 }).notNull().unique(), // "101"
  roomTypeId: varchar("room_type_id", { length: 64 }).notNull(),
  roomType: varchar("room_type", { length: 120 }).notNull(),
  floor: varchar("floor", { length: 16 }),
  // available | occupied | dirty | clean | inspected | out_of_order
  state: varchar("state", { length: 24 }).notNull().default("available"),
  oooReason: text("ooo_reason"),
  oooUntil: varchar("ooo_until", { length: 10 }), // YYYY-MM-DD
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// One record per person — the CRM identity. Matched on phone first, then email.
export const guestsTable = pgTable("guests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 180 }),
  country: varchar("country", { length: 80 }),
  notes: text("notes"),
  stayCount: integer("stay_count").notNull().default(0),
  totalSpent: integer("total_spent").notNull().default(0),
  isRegular: boolean("is_regular").notNull().default(false),
  isNoShow: boolean("is_no_show").notNull().default(false),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Guest login. The email/phone is only the login name — the ACCOUNT is the
// identity, so two adults can share a booking and a phone-only account exists.
export const guestAccountsTable = pgTable("guest_accounts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  guestId: varchar("guest_id", { length: 36 }).notNull(),
  loginEmail: varchar("login_email", { length: 180 }),
  loginPhone: varchar("login_phone", { length: 40 }),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  // invited | active | locked | messaging_muted | disabled
  status: varchar("status", { length: 24 }).notNull().default("invited"),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  invitedByLabel: varchar("invited_by_label", { length: 160 }),
  // --- addenda: account creation + the two guest paths ---
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }), // OTP proved the inbox
  messagingMutedAt: timestamp("messaging_muted_at", { withTimezone: true }),
  // desk | guest_app | track | bulk | admin — how the account came to exist
  signupSource: varchar("signup_source", { length: 24 }).notNull().default("desk"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// One row per signed-in device, so "sign out of all devices" is possible.
//
// ADDENDUM (staying signed in): there is NO session timeout. `expiresAt` is a
// 12-month inactivity backstop, refreshed by `lastSeenAt` every time the device is
// used, so a guest who opens the app at least once a year is never asked to sign in
// again. Only logout, a password change, an admin action, a lost device or the
// backstop ends a session.
export const guestSessionsTable = pgTable("guest_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: varchar("account_id", { length: 36 }).notNull(),
  guestId: varchar("guest_id", { length: 36 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  deviceLabel: varchar("device_label", { length: 160 }),
  userAgent: varchar("user_agent", { length: 240 }),
  ip: varchar("ip", { length: 64 }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedReason: varchar("revoked_reason", { length: 120 }),
});

// Single-use, expiring, hashed invitation / password-reset / OTP tokens.
//
// The OTP is NEVER stored in readable form: `otpHash` is sha256 of the 6 digits,
// it expires 10 minutes after it was sent, allows 3 attempts per code and can be
// requested at most once a minute (see src/lib/guest-otp.ts). The legacy
// `otpCode` column is kept for rows written before this rule and is no longer set.
export const activationTokensTable = pgTable("activation_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: varchar("account_id", { length: 36 }).notNull(),
  guestId: varchar("guest_id", { length: 36 }).notNull(),
  // activation | password_reset | phone_otp | email_otp
  purpose: varchar("purpose", { length: 24 }).notNull().default("activation"),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  otpCode: varchar("otp_code", { length: 8 }),
  otpHash: varchar("otp_hash", { length: 128 }),
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  otpLastSentAt: timestamp("otp_last_sent_at", { withTimezone: true }),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  channel: varchar("channel", { length: 16 }).notNull().default("email"), // email | sms
  sentTo: varchar("sent_to", { length: 180 }),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Payment claims + verification. Cash rows are written already verified.
export const paymentsTable = pgTable("payments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 36 }),
  reference: varchar("reference", { length: 32 }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("MWK"),
  channel: varchar("channel", { length: 24 }).notNull().default("cash"), // cash|bank|airtel_money|tnm_mpamba|other
  txnRef: varchar("txn_ref", { length: 96 }),
  payerName: varchar("payer_name", { length: 160 }),
  payerPhone: varchar("payer_phone", { length: 40 }),
  // pending_verification | verified | rejected
  status: varchar("status", { length: 24 }).notNull().default("pending_verification"),
  claimedBy: varchar("claimed_by", { length: 16 }).notNull().default("guest"), // guest | staff | system
  verifiedByLabel: varchar("verified_by_label", { length: 160 }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Every message the system attempted on every channel, with its outcome.
export const notificationLogTable = pgTable("notification_log", {
  id: varchar("id", { length: 36 }).primaryKey(),
  channel: varchar("channel", { length: 16 }).notNull().default("portal"), // email|sms|push|whatsapp|portal
  template: varchar("template", { length: 64 }),
  recipient: varchar("recipient", { length: 180 }),
  subject: varchar("subject", { length: 200 }),
  body: text("body"),
  status: varchar("status", { length: 16 }).notNull().default("queued"), // queued|sent|failed|skipped
  providerRef: varchar("provider_ref", { length: 160 }),
  error: text("error"),
  guestId: varchar("guest_id", { length: 36 }),
  bookingId: varchar("booking_id", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Guest orders (Dine menu + room service) and their line items. Items are priced
// from `menu_items` at order time so a price change never rewrites history.
export const ordersTable = pgTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderNumber: varchar("order_number", { length: 24 }).notNull().unique(),
  bookingId: varchar("booking_id", { length: 36 }),
  roomNumber: varchar("room_number", { length: 16 }),
  guestId: varchar("guest_id", { length: 36 }),
  guestAccountId: varchar("guest_account_id", { length: 36 }),
  guestName: varchar("guest_name", { length: 160 }),
  // placed | accepted | preparing | ready | delivered | rejected
  status: varchar("status", { length: 24 }).notNull().default("placed"),
  service: varchar("service", { length: 24 }).notNull().default("room_service"), // room_service | takeaway
  // ADDENDUM (two guest paths): how the order arrived — app | qr | pin | reference |
  // desk | whatsapp | counter. The desk sees this on the board so they know whether
  // the guest can be reached by push or only by SMS/WhatsApp.
  channel: varchar("channel", { length: 16 }).notNull().default("app"),
  roomSessionId: varchar("room_session_id", { length: 36 }),
  note: text("note"),
  total: integer("total").notNull().default(0),
  placedByLabel: varchar("placed_by_label", { length: 160 }),
  placedAt: timestamp("placed_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderItemsTable = pgTable("order_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull(),
  menuItemId: varchar("menu_item_id", { length: 36 }),
  name: varchar("name", { length: 160 }).notNull(),
  qty: integer("qty").notNull().default(1),
  unitPrice: integer("unit_price").notNull(),
  amount: integer("amount").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("open"), // open | voided
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// THE ROOM BILL. The invoice is generated from this, never typed by hand, so the
// room bill, the orders and the receipt always agree.
export const folioItemsTable = pgTable("folio_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 36 }),
  roomNumber: varchar("room_number", { length: 16 }),
  // room | extras | order | late_checkout | damage | adjustment
  category: varchar("category", { length: 24 }).notNull().default("order"),
  description: varchar("description", { length: 200 }).notNull(),
  qty: integer("qty").notNull().default(1),
  unitPrice: integer("unit_price").notNull(),
  amount: integer("amount").notNull(),
  orderId: varchar("order_id", { length: 36 }),
  postedByLabel: varchar("posted_by_label", { length: 160 }),
  status: varchar("status", { length: 16 }).notNull().default("open"), // open | settled | voided
  voidReason: text("void_reason"),
  voidedByLabel: varchar("voided_by_label", { length: 160 }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// One private thread per guest per stay. Never visible to another guest —
// enforced on the server, not by hiding it in the app.
export const messageThreadsTable = pgTable("message_threads", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 36 }),
  roomNumber: varchar("room_number", { length: 16 }),
  guestId: varchar("guest_id", { length: 36 }),
  guestAccountId: varchar("guest_account_id", { length: 36 }),
  guestName: varchar("guest_name", { length: 160 }),
  subject: varchar("subject", { length: 200 }),
  // ADDENDUM (two guest paths): how this thread started — app | qr | pin | reference
  // | desk. A no-account guest has no push token, so the desk replies by SMS/WhatsApp
  // and the thread records which path the guest arrived on.
  channel: varchar("channel", { length: 16 }).notNull().default("app"),
  roomSessionId: varchar("room_session_id", { length: 36 }),
  kind: varchar("kind", { length: 24 }).notNull().default("message"), // message|request|complaint|emergency|system
  priority: varchar("priority", { length: 16 }).notNull().default("normal"), // normal | urgent | emergency
  // open | acknowledged | in_progress | resolved | closed | escalated
  status: varchar("status", { length: 24 }).notNull().default("open"),
  resolutionNote: text("resolution_note"),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messagesTable = pgTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  threadId: varchar("thread_id", { length: 36 }).notNull(),
  bookingId: varchar("booking_id", { length: 36 }),
  roomNumber: varchar("room_number", { length: 16 }),
  guestId: varchar("guest_id", { length: 36 }),
  direction: varchar("direction", { length: 24 }).notNull().default("guest_to_desk"), // guest_to_desk | desk_to_guest
  body: text("body").notNull(),
  kind: varchar("kind", { length: 24 }).notNull().default("message"),
  status: varchar("status", { length: 16 }).notNull().default("sent"), // sent|delivered|read|archived
  senderLabel: varchar("sender_label", { length: 160 }),
  readByStaffAt: timestamp("read_by_staff_at", { withTimezone: true }),
  readByGuestAt: timestamp("read_by_guest_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Housekeeping / maintenance / amenity work tied to a ROOM, not to a booking —
// this is what makes the room map useful to housekeeping.
export const serviceTasksTable = pgTable("service_tasks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  roomNumber: varchar("room_number", { length: 16 }).notNull(),
  bookingId: varchar("booking_id", { length: 36 }),
  guestAccountId: varchar("guest_account_id", { length: 36 }),
  // ADDENDUM (two guest paths): the same channel + room session as orders, so the
  // desk can see at a glance whether the guest is reachable by push or only by SMS.
  channel: varchar("channel", { length: 16 }).notNull().default("app"),
  roomSessionId: varchar("room_session_id", { length: 36 }),
  // cleaning|towels|linen|maintenance|amenity|taxi|wake_up|other
  kind: varchar("kind", { length: 24 }).notNull().default("other"),
  note: text("note"),
  requestedBy: varchar("requested_by", { length: 16 }).notNull().default("guest"), // guest|staff|system
  requestedByLabel: varchar("requested_by_label", { length: 160 }),
  assignedTo: varchar("assigned_to", { length: 160 }),
  priority: varchar("priority", { length: 16 }).notNull().default("normal"), // normal|urgent|emergency
  status: varchar("status", { length: 16 }).notNull().default("open"), // open|assigned|in_progress|done|cancelled
  dueBy: timestamp("due_by", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: varchar("completed_by", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Seasonal and length-of-stay pricing on top of the base room-type rate.
export const roomTypeRatesTable = pgTable("room_type_rates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  roomTypeId: varchar("room_type_id", { length: 64 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  kind: varchar("kind", { length: 24 }).notNull().default("seasonal"), // seasonal | length_of_stay
  startDate: varchar("start_date", { length: 10 }),
  endDate: varchar("end_date", { length: 10 }),
  minNights: integer("min_nights").notNull().default(1),
  nightlyRate: integer("nightly_rate").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Room = typeof roomsTable.$inferSelect;
export type Guest = typeof guestsTable.$inferSelect;
export type GuestAccount = typeof guestAccountsTable.$inferSelect;
export type GuestSession = typeof guestSessionsTable.$inferSelect;
export type ActivationToken = typeof activationTokensTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type NotificationLogRow = typeof notificationLogTable.$inferSelect;
// The ROOM SESSION — the second guest path (addendum "two guest paths").
//
// A guest with no account proves "I am the person in Room 104 right now" with the
// QR card on the nightstand, the room number + the 4-digit PIN on the key sleeve,
// or their booking reference + phone. The printed/QR code is only a POINTER: it is
// re-pointed at the new guest at check-in and cleared at check-out, so a
// photographed card is dead after the guest leaves. The PIN is unique to the STAY
// (never the room number) and locks after 3 wrong attempts.
export const roomSessionsTable = pgTable("room_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 36 }).notNull(),
  guestId: varchar("guest_id", { length: 36 }),
  roomNumber: varchar("room_number", { length: 16 }).notNull(),
  guestName: varchar("guest_name", { length: 160 }).notNull(),
  // The value behind the QR card in the room. Opaque, unrelated to the room number.
  qrTokenHash: varchar("qr_token_hash", { length: 128 }).notNull(),
  // 4 digits, salted+hashed, unique per stay. Never the room number.
  pinHash: text("pin_hash"),
  pinSalt: text("pin_salt"),
  pinAttempts: integer("pin_attempts").notNull().default(0),
  pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
  // How this session was opened: qr | pin | reference | desk
  openedVia: varchar("opened_via", { length: 16 }).notNull().default("qr"),
  // open | closed — cleared at check-out, rotated at every check-in
  status: varchar("status", { length: 16 }).notNull().default("open"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedReason: varchar("closed_reason", { length: 120 }),
});

// ADDENDUM (landing page): guest reviews, collected automatically at check-out and
// imported from Google with attribution. Hidden reviews stay in the table as a record.
export const reviewsTable = pgTable("reviews", {
  id: varchar("id", { length: 36 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 36 }),
  guestId: varchar("guest_id", { length: 36 }),
  guestName: varchar("guest_name", { length: 160 }).notNull(),
  stayMonth: varchar("stay_month", { length: 16 }), // e.g. "Sep 2026"
  rating: integer("rating").notNull().default(5), // 1–5
  comment: text("comment"),
  source: varchar("source", { length: 16 }).notNull().default("direct"), // direct | google
  sourceUrl: varchar("source_url", { length: 300 }),
  isPublished: boolean("is_published").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  collectedVia: varchar("collected_via", { length: 24 }).notNull().default("check_out"), // check_out|app|desk|import
  publishedByLabel: varchar("published_by_label", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ADDENDUM (landing page): sold-out nights become leads. When a booking covering
// these dates is cancelled or released, the waitlist is what fills the room.
export const waitlistTable = pgTable("waitlist_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  fullName: varchar("full_name", { length: 160 }),
  email: varchar("email", { length: 180 }),
  phone: varchar("phone", { length: 40 }),
  checkIn: varchar("check_in", { length: 10 }).notNull(),
  checkOut: varchar("check_out", { length: 10 }).notNull(),
  roomTypeId: varchar("room_type_id", { length: 64 }),
  roomType: varchar("room_type", { length: 120 }),
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  note: text("note"),
  status: varchar("status", { length: 16 }).notNull().default("waiting"), // waiting|notified|booked|cancelled
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ADDENDUM (landing page): the FAQ is real content the admin can edit, because
// check-in times, extras and policies change.
export const faqsTable = pgTable("faqs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  question: varchar("question", { length: 240 }).notNull(),
  answer: text("answer").notNull(),
  category: varchar("category", { length: 40 }).notNull().default("general"),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  updatedByLabel: varchar("updated_by_label", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RoomSession = typeof roomSessionsTable.$inferSelect;
export type Review = typeof reviewsTable.$inferSelect;
export type WaitlistEntry = typeof waitlistTable.$inferSelect;
export type Faq = typeof faqsTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type FolioItem = typeof folioItemsTable.$inferSelect;
export type MessageThread = typeof messageThreadsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type ServiceTask = typeof serviceTasksTable.$inferSelect;
export type RoomTypeRate = typeof roomTypeRatesTable.$inferSelect;

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
