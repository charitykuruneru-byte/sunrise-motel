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

// ─────────────────────────────────────────────────────────────────────────────────
// THE STAY QUOTE ENGINE (added — nothing above this line changed).
//
// `bookingMath` above keeps the existing booking path exactly as it was: nightly
// rate × nights + fees − discount. This is the richer quote for new work — weekend
// and seasonal rates, extra beds, paid amenities, length-of-stay discounts and VAT —
// and it is pure: no database, no clock, no environment. So the same stay can be
// quoted twice and land on the same number, which is the only property that makes a
// price trustworthy.
//
// Order of precedence for ONE night, highest first:
//   1. a length-of-stay rate whose minNights the stay meets (room_type_rates)
//   2. a seasonal rate covering that date (room_type_rates)
//   3. the room type's weekend price, on a Friday or Saturday
//   4. the room type's base `rate`
// then extras (extra bed, cleaning, amenities), then the discount, then VAT last —
// tax is charged on what is actually being charged.
// ─────────────────────────────────────────────────────────────────────────────────

export type StayRate = {
  kind: string; // seasonal | length_of_stay
  label: string;
  startDate: string | null;
  endDate: string | null;
  minNights: number;
  nightlyRate: number;
};

export type RoomPricing = {
  rate: number;
  weekendPrice?: number | null;
  extraBedPrice?: number | null;
  cleaningFee?: number | null;
  taxRateBp?: number | null;
  minNights?: number | null;
  weeklyDiscountBp?: number | null;
  monthlyDiscountBp?: number | null;
  amenitiesCharges?: string | null; // JSON string, as stored on the row
};

export type AmenityCharge = { name: string; price: number; perPerson?: boolean; perNight?: boolean };

export type NightlyLine = {
  date: string; // YYYY-MM-DD
  dow: string; // Mon … Sun
  rate: number;
  source: "seasonal" | "length_of_stay" | "weekend" | "base";
  label?: string;
};

export type StayQuote = {
  nights: number;
  nightly: NightlyLine[];
  nightlySubtotal: number;
  extraBeds: number;
  extraBedTotal: number;
  cleaningFee: number;
  amenities: { name: string; amount: number }[];
  amenitiesTotal: number;
  discount: { label: string | null; basisPoints: number; amount: number };
  subtotal: number; // everything before tax is considered
  taxRateBp: number;
  taxAmount: number; // the VAT portion — broken out whether prices include it or not
  /** The amount before VAT: `subtotal` when VAT is added on top, the gross minus VAT when prices already include it. */
  netOfTax: number;
  /** True when the advertised price already contains VAT, so `total` equals `subtotal`. */
  taxInclusive: boolean;
  total: number;
  currency: "MWK";
  minimumNights: number;
  meetsMinimumNights: boolean;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDay(date: string) {
  const [year, month, day] = date.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

/** Every night of the stay: the check-in night up to (not including) the check-out date. */
export function stayNights(checkIn: string, checkOut: string) {
  const nights: string[] = [];
  const start = parseDay(checkIn);
  const end = parseDay(checkOut);
  for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    nights.push(cursor.toISOString().slice(0, 10));
  }
  return nights;
}

export function nightsBetween(checkIn: string, checkOut: string) {
  return stayNights(checkIn, checkOut).length;
}

/** The room type's paid amenities, defensively parsed: bad JSON must not stop a booking. */
export function amenityChargesOf(room: RoomPricing): AmenityCharge[] {
  if (!room.amenitiesCharges) return [];
  try {
    const parsed = JSON.parse(room.amenitiesCharges) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is AmenityCharge => Boolean(entry) && typeof entry === "object" && typeof (entry as AmenityCharge).name === "string")
      .map((entry) => ({
        name: entry.name,
        price: Math.max(0, Math.round(Number(entry.price) || 0)),
        perPerson: Boolean(entry.perPerson),
        perNight: Boolean(entry.perNight),
      }));
  } catch {
    return [];
  }
}


/** The rate that applies to one night, and where it came from. */
function rateForNight(opts: { date: string; nights: number; room: RoomPricing; rates: StayRate[] }): NightlyLine {
  const { date, nights, room, rates } = opts;
  const base = Math.max(0, Math.round(Number(room.rate) || 0));
  const dow = parseDay(date).getUTCDay();

  const seasonal = rates
    .filter((rate) => rate.kind === "seasonal" && rate.startDate && rate.endDate && rate.startDate <= date && rate.endDate >= date)
    .sort((a, b) => (b.nightlyRate ?? 0) - (a.nightlyRate ?? 0))[0];
  if (seasonal) {
    return { date, dow: DAY_NAMES[dow], rate: Math.max(0, Math.round(seasonal.nightlyRate)), source: "seasonal", label: seasonal.label };
  }

  const lengthOfStay = rates
    .filter((rate) => rate.kind !== "seasonal" && rate.minNights <= nights)
    .sort((a, b) => b.minNights - a.minNights)[0];
  if (lengthOfStay) {
    return { date, dow: DAY_NAMES[dow], rate: Math.max(0, Math.round(lengthOfStay.nightlyRate)), source: "length_of_stay", label: lengthOfStay.label };
  }

  const weekend = Math.max(0, Math.round(Number(room.weekendPrice) || 0));
  if (weekend > 0 && (dow === 5 || dow === 6)) {
    return { date, dow: DAY_NAMES[dow], rate: weekend, source: "weekend" };
  }
  return { date, dow: DAY_NAMES[dow], rate: base, source: "base" };
}

/** Quote one stay, night by night, with the tax shown as its own line. */
export function calculateStayQuote(opts: {
  room: RoomPricing;
  rates?: StayRate[];
  checkIn: string;
  checkOut: string;
  guests?: number;
  extraBeds?: number;
  /** Amenity names the guest accepted, matched against the room type's charge list. */
  amenities?: string[];
  /**
   * `true` (the default for this motel) means the advertised price already contains VAT:
   * a guest reading "MWK 85,000 per night" pays 85,000, and VAT is the portion inside it —
   * broken out for the books, not added to the bill. `false` adds VAT on top, which would
   * change every price the website shows, so it is opt-in.
   */
  taxInclusive?: boolean;
}): StayQuote {
  const rates = opts.rates ?? [];
  const nights = nightsBetween(opts.checkIn, opts.checkOut);
  const nightly = stayNights(opts.checkIn, opts.checkOut).map((date) => rateForNight({ date, nights, room: opts.room, rates }));
  const nightlySubtotal = nightly.reduce((sum, line) => sum + line.rate, 0);

  const extraBeds = Math.max(0, Math.round(Number(opts.extraBeds) || 0));
  const extraBedTotal = extraBeds * Math.max(0, Math.round(Number(opts.room.extraBedPrice) || 0));
  const cleaningFee = Math.max(0, Math.round(Number(opts.room.cleaningFee) || 0));

  const wanted = new Set((opts.amenities ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean));
  const guests = Math.max(1, Math.round(Number(opts.guests) || 1));
  const amenities = amenityChargesOf(opts.room)
    .filter((charge) => wanted.has(charge.name.toLowerCase()))
    .map((charge) => ({
      name: charge.name,
      amount: charge.price * (charge.perPerson ? guests : 1) * (charge.perNight ? nights : 1),
    }));
  const amenitiesTotal = amenities.reduce((sum, item) => sum + item.amount, 0);

  const beforeDiscount = nightlySubtotal + extraBedTotal + cleaningFee + amenitiesTotal;
  const weeklyBp = Math.max(0, Math.round(Number(opts.room.weeklyDiscountBp) || 0));
  const monthlyBp = Math.max(0, Math.round(Number(opts.room.monthlyDiscountBp) || 0));
  let discountBp = 0;
  let discountLabel: string | null = null;
  if (nights >= 28 && monthlyBp > 0) {
    discountBp = monthlyBp;
    discountLabel = `Monthly stay — ${nights} nights`;
  } else if (nights >= 7 && weeklyBp > 0) {
    discountBp = weeklyBp;
    discountLabel = `Weekly stay — ${nights} nights`;
  }
  const discountAmount = Math.round((beforeDiscount * discountBp) / 10_000);
  const subtotal = Math.max(0, beforeDiscount - discountAmount);

  const taxRateBp = Math.max(0, Math.round(Number(opts.room.taxRateBp ?? 1650)));
  const taxInclusive = opts.taxInclusive ?? true;
  // Inclusive: the gross is the price, and VAT is the slice inside it (gross × bp ÷ (10000+bp)).
  // Exclusive: VAT is added on top of the net.
  const netOfTax = taxInclusive ? Math.round((subtotal * 10_000) / (10_000 + taxRateBp)) : subtotal;
  const taxAmount = taxInclusive ? subtotal - netOfTax : Math.round((subtotal * taxRateBp) / 10_000);
  const minimumNights = Math.max(1, Math.round(Number(opts.room.minNights) || 1));

  return {
    nights,
    nightly,
    nightlySubtotal,
    extraBeds,
    extraBedTotal,
    cleaningFee,
    amenities,
    amenitiesTotal,
    discount: { label: discountLabel, basisPoints: discountBp, amount: discountAmount },
    subtotal,
    taxRateBp,
    taxAmount,
    netOfTax,
    taxInclusive,
    total: taxInclusive ? subtotal : subtotal + taxAmount,
    currency: "MWK",
    minimumNights,
    meetsMinimumNights: nights >= minimumNights,
  };
}

/** "16.50%" from 1650 basis points — for the UI and invoices. */
export function taxLabel(bp: number) {
  return `${(bp / 100).toFixed(2)}%`;
}

