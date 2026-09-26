export function bookingMath(nightlyRate: number, nights: number, opts?: { serviceFee?: number; extensionFee?: number; discount?: number; extrasTotal?: number }) {
  const serviceFee = Math.max(0, Math.round(opts?.serviceFee ?? 0));
  const extensionFee = Math.max(0, Math.round(opts?.extensionFee ?? 0));
  const discount = Math.max(0, Math.round(opts?.discount ?? 0));
  const extrasTotal = Math.max(0, Math.round(opts?.extrasTotal ?? 0));
  const subtotal = nightlyRate * nights;
  const total = Math.max(0, subtotal + serviceFee + extensionFee + extrasTotal - discount);
  return { subtotal, serviceFee, extensionFee, discount, extrasTotal, total };
}

export function extensionFeeFor(extraNights: number, nightlyRate: number) {
  return Math.max(0, extraNights) * nightlyRate;
}

/** Sequential human reference BK-YYYY-XXXX scoped to the Malawi year. */
export async function nextBookingNumber(db: unknown, year: number) {
  const { bookings } = await import("@/db/schema");
  const { sql } = await import("drizzle-orm");
  const typed = db as { execute: (q: unknown) => Promise<{ rows?: { maxn?: string }[] }> };
  const res = await typed.execute(
    sql`select max(${bookings.bookingNumber}) as maxn from ${bookings} where ${bookings.bookingNumber} like ${`BK-${year}-%`}`,
  );
  const max = res.rows?.[0]?.maxn ?? null;
  const m = max ? /BK-\d+-(\d+)/.exec(max) : null;
  const next = (m ? Number(m[1]) : 0) + 1;
  return `BK-${year}-${String(next).padStart(4, "0")}`;
}
