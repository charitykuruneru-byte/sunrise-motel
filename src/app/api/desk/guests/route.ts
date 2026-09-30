import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, guestAccountsTable, guestsTable, roomsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { deskActor, requireSuperAdmin } from "@/lib/desk-auth";
import { resendActivation } from "@/lib/guest-account";
import { inviteCheckedInGuest } from "@/lib/guest-invitations";

export const dynamic = "force-dynamic";

/**
 * Guest CRM (§8.4 Guests tab) — every guest record with stay count, total spent,
 * last stay, regular / no-show flags, their app accounts and their invitation
 * state, so the desk can see "invited, not activated" at a glance.
 */
export async function GET(request: Request) {
  const auth = await deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    const [guests, accounts, allBookings, rooms] = await Promise.all([
      db.select().from(guestsTable).orderBy(desc(guestsTable.updatedAt)).limit(500),
      db.select().from(guestAccountsTable),
      db.select().from(bookings).orderBy(desc(bookings.checkIn)).limit(500),
      db.select().from(roomsTable),
    ]);
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const list = guests.map((guest) => {
      const stays = allBookings.filter((b) => b.guestId === guest.id);
      const completed = stays.filter((b) => ["checked_out", "checked_in"].includes(b.status));
      const lastStay = [...stays].sort((a, b) => (a.checkOut < b.checkOut ? 1 : -1))[0];
      const guestAccounts = accounts.filter((a) => a.guestId === guest.id);
      const stayCount = guest.stayCount || completed.length;
      return {
        id: guest.id,
        fullName: guest.fullName,
        phone: guest.phone,
        email: guest.email,
        country: guest.country,
        notes: guest.notes,
        stayCount,
        totalSpent: guest.totalSpent || completed.reduce((sum, b) => sum + b.totalAmount, 0),
        isRegular: guest.isRegular || stayCount >= 3,
        isNoShow: guest.isNoShow,
        marketingConsent: guest.marketingConsent,
        lastStay: lastStay
          ? {
              reference: lastStay.reference,
              checkIn: lastStay.checkIn,
              checkOut: lastStay.checkOut,
              status: lastStay.status,
              roomNumber: lastStay.assignedRoomId ? roomById.get(lastStay.assignedRoomId)?.roomNumber ?? null : null,
            }
          : null,
        accounts: guestAccounts.map((a) => ({
          id: a.id,
          loginEmail: a.loginEmail,
          loginPhone: a.loginPhone,
          status: a.status,
          phoneVerified: a.phoneVerified,
          marketingConsent: a.marketingConsent,
          lastLoginAt: a.lastLoginAt,
          invitedByLabel: a.invitedByLabel,
        })),
        activeStay: stays.find((b) => ["confirmed", "checked_in"].includes(b.status)) ?? null,
      };
    });
    return NextResponse.json({
      guests: list,
      stats: {
        total: list.length,
        regulars: list.filter((g) => g.isRegular).length,
        appAccounts: accounts.length,
        activated: accounts.filter((a) => a.status === "active").length,
        invitedNotActivated: accounts.filter((a) => a.status === "invited").length,
        optedIn: accounts.filter((a) => a.marketingConsent).length,
      },
    });
  } catch (error) {
    console.error("Guest CRM load failed", error);
    return NextResponse.json({ error: "Could not load guests." }, { status: 500 });
  }
}

/**
 * The one-tap front-desk flow (§2): create the guest account for a booking and
 * email the activation link, or link the stay when the guest already has one.
 * Also: resend an unactivated invite, set a password at the counter, mute a
 * nuisance account, or record marketing consent (which is always separate from
 * service messages).
 */
export async function POST(request: Request) {
  const auth = await deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      action?: string;
      bookingId?: string;
      accountId?: string;
      login?: string;
      channel?: "email" | "sms";
      password?: string;
      status?: string;
      consent?: boolean;
    };
    const action = body.action ?? "";

    if (action === "invite") {
      if (!body.bookingId) return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, body.bookingId)).limit(1);
      if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
      const result = await inviteCheckedInGuest({
        booking,
        email: body.login ?? booking.email ?? "",
        actor: auth.user,
        request,
      });
      return NextResponse.json({ success: true, result });
    }

    if (action === "register") {
      return NextResponse.json({ error: "Direct registration is disabled. Send an invitation after check-in." }, { status: 410 });
    }

    // The gate sits BEFORE the lookup so operational staff cannot manage account access.
    if (["set_status", "set_consent"].includes(action)) {
      const denied = requireSuperAdmin(auth.user);
      if (denied) return denied;
    }

    if (!body.accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 });
    const [account] = await db
      .select()
      .from(guestAccountsTable)
      .where(eq(guestAccountsTable.id, body.accountId))
      .limit(1);
    if (!account) return NextResponse.json({ error: "Guest account not found." }, { status: 404 });
    const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, account.guestId)).limit(1);

    if (action === "resend") {
      const result = await resendActivation({
        account,
        guestName: guest?.fullName ?? "Guest",
        actorLabel: auth.label,
        request,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "activate_at_desk") {
      return NextResponse.json({ error: "Password setup must use the account's one-time invitation link." }, { status: 410 });
    }

    if (action === "set_status") {
      const allowed = ["active", "messaging_muted", "disabled", "locked"];
      const next = (body.status ?? "").trim();
      if (!allowed.includes(next)) {
        return NextResponse.json({ error: `Status must be one of ${allowed.join(", ")}.` }, { status: 400 });
      }
      await db
        .update(guestAccountsTable)
        .set({ status: next, updatedAt: new Date() })
        .where(eq(guestAccountsTable.id, account.id));
      return NextResponse.json({ success: true, status: next });
    }

    if (action === "set_consent") {
      const consent = Boolean(body.consent);
      await db
        .update(guestAccountsTable)
        .set({ marketingConsent: consent, updatedAt: new Date() })
        .where(eq(guestAccountsTable.id, account.id));
      await db
        .update(guestsTable)
        .set({ marketingConsent: consent, updatedAt: new Date() })
        .where(eq(guestsTable.id, account.guestId));
      return NextResponse.json({ success: true, consent });
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    console.error("Guest account action failed", error);
    return NextResponse.json({ error: "Could not complete that guest action." }, { status: 500 });
  }
}
