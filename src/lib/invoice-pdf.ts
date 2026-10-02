import { LineCapStyle, PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatMalawiDate, malawiStamp } from "./time";

export type InvoiceExtra = { label: string; amount?: number };

export type InvoiceData = {
  invoiceNumber: string;
  reference: string;
  status: string; // pending | awaiting_payment | confirmed | checked_in | checked_out | cancelled
  issueDate: Date;
  guestName: string;
  phone: string;
  email?: string | null;
  roomType: string;
  assignedRoom?: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  nightlyRate: number;
  roomSubtotal?: number;
  discountAmount?: number;
  extras: InvoiceExtra[];
  extrasTotal: number;
  taxAmount?: number | null;
  taxRateBp?: number | null;
  taxInclusive?: boolean | null;
  totalAmount: number;
  amountPaid: number;
  requests?: string | null;
};

const ORANGE = rgb(0.949, 0.549, 0.094);
const EMBER = rgb(0.788, 0.337, 0.07);
const INK = rgb(0.09, 0.082, 0.075);
const MUTED = rgb(0.46, 0.424, 0.392);
const SAND = rgb(0.973, 0.961, 0.941);
const WHITE = rgb(1, 1, 1);

export function money(n: number) {
  return `MWK ${Math.round(n).toLocaleString("en-US")}`;
}

/** Parse the extras column which may be a JSON array of strings or of {label, amount} objects. */
export function parseExtras(raw: string | null | undefined): InvoiceExtra[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === "string") return { label: item };
        if (item && typeof item === "object" && "label" in item) {
          const obj = item as { label: string; amount?: number };
          return { label: String(obj.label), amount: typeof obj.amount === "number" ? obj.amount : undefined };
        }
        return null;
      })
      .filter((x): x is InvoiceExtra => Boolean(x));
  } catch {
    return [];
  }
}

function drawEmblem(page: PDFPage, cx: number, cy: number, r: number) {
  page.drawCircle({ x: cx, y: cy, size: r, color: WHITE, borderColor: ORANGE, borderWidth: r * 0.075 });
  const rayAngles = [90, 66, 114, 42, 138, 20, 160];
  for (const deg of rayAngles) {
    const a = (deg * Math.PI) / 180;
    page.drawLine({
      start: { x: cx + Math.cos(a) * r * 0.46, y: cy + Math.sin(a) * r * 0.46 },
      end: { x: cx + Math.cos(a) * r * 0.74, y: cy + Math.sin(a) * r * 0.74 },
      thickness: r * 0.07,
      color: ORANGE,
      lineCap: LineCapStyle.Round,
    });
  }
  page.drawCircle({ x: cx, y: cy, size: r * 0.34, color: WHITE, borderColor: ORANGE, borderWidth: r * 0.06 });
  // Mountains (SVG path coordinates are relative, y grows downward)
  const s = r / 100;
  page.drawSvgPath("M-86 40 L-40 -8 L-18 18 L10 -24 L34 10 L56 -6 L86 38 C60 34 30 44 0 40 C-30 36 -60 46 -86 40 Z", {
    x: cx,
    y: cy - 4 * s,
    scale: s,
    color: ORANGE,
  });
  page.drawSvgPath("M-8 14 L2 2 L10 10 L18 -2 L26 8", {
    x: cx,
    y: cy - 4 * s,
    scale: s,
    borderColor: WHITE,
    borderWidth: 4 * s,
    borderLineCap: LineCapStyle.Round,
  });
}

function text(page: PDFPage, str: string, x: number, y: number, size: number, font: PDFFont, color = INK, opts: { maxWidth?: number; lineHeight?: number } = {}) {
  page.drawText(str, { x, y, size, font, color, maxWidth: opts.maxWidth, lineHeight: opts.lineHeight ?? size * 1.35 });
}

function rightText(page: PDFPage, str: string, rightX: number, y: number, size: number, font: PDFFont, color = INK) {
  const w = font.widthOfTextAtSize(str, size);
  page.drawText(str, { x: rightX - w, y, size, font, color });
}

export async function buildInvoicePdf(d: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.invoiceNumber} — Sunrise Motel`);
  pdf.setAuthor("Sunrise Motel, Area 5, Lilongwe");
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const M = 44;

  const isPaid = d.amountPaid >= d.totalAmount && d.totalAmount > 0;
  const isCancelled = d.status === "cancelled";
  const docTitle = isCancelled ? "CANCELLED PRO-FORMA" : isPaid ? "PAYMENT CONFIRMATION" : "PRO-FORMA INVOICE";

  // Top band + emblem
  page.drawRectangle({ x: 0, y: height - 10, width, height: 10, color: ORANGE });
  drawEmblem(page, M + 30, height - 74, 30);
  text(page, "Sunrise Motel", M + 72, height - 62, 20, bold, INK);
  text(page, "When you are here, you are family.", M + 72, height - 78, 9.5, oblique, EMBER);
  text(page, "Mzimba Road, behind Bwasila Secondary School, Area 5, Lilongwe, Malawi", M + 72, height - 93, 8.5, font, MUTED);
  text(page, "Tel / WhatsApp: +265 998 688 332", M + 72, height - 105, 8.5, font, MUTED);

  rightText(page, docTitle, width - M, height - 60, 15, bold, EMBER);
  rightText(page, `Invoice No: ${d.invoiceNumber}`, width - M, height - 78, 9.5, bold, INK);
  rightText(page, `Booking Ref: ${d.reference}`, width - M, height - 91, 9, font, INK);
  rightText(page, `Issued: ${formatMalawiDate(d.issueDate)} (CAT)`, width - M, height - 104, 9, font, MUTED);
  rightText(page, `Status: ${d.status.replace("_", " ").toUpperCase()}`, width - M, height - 117, 9, font, MUTED);

  page.drawLine({ start: { x: M, y: height - 130 }, end: { x: width - M, y: height - 130 }, thickness: 1.2, color: ORANGE });

  // Bill-to / Stay boxes
  const boxTop = height - 145;
  const boxH = 92;
  const boxW = (width - M * 2 - 12) / 2;
  page.drawRectangle({ x: M, y: boxTop - boxH, width: boxW, height: boxH, color: SAND });
  page.drawRectangle({ x: M + boxW + 12, y: boxTop - boxH, width: boxW, height: boxH, color: SAND });

  text(page, "BILLED TO", M + 12, boxTop - 16, 7.5, bold, MUTED);
  text(page, d.guestName, M + 12, boxTop - 32, 11.5, bold, INK);
  text(page, `Phone: ${d.phone}`, M + 12, boxTop - 47, 9, font, INK);
  if (d.email) text(page, `Email: ${d.email}`, M + 12, boxTop - 60, 9, font, INK);
  text(page, `Guests: ${d.adults} adult${d.adults === 1 ? "" : "s"}${d.children > 0 ? `, ${d.children} child${d.children === 1 ? "" : "ren"}` : ""}`, M + 12, boxTop - 73, 9, font, MUTED);

  const bx = M + boxW + 24;
  text(page, "STAY DETAILS", bx, boxTop - 16, 7.5, bold, MUTED);
  text(page, d.roomType + (d.assignedRoom ? ` — ${d.assignedRoom}` : ""), bx, boxTop - 32, 11.5, bold, INK);
  text(page, `Check-in: ${d.checkIn}  (from 14:00)`, bx, boxTop - 47, 9, font, INK);
  text(page, `Check-out: ${d.checkOut}  (by 10:00)`, bx, boxTop - 60, 9, font, INK);
  text(page, `${d.nights} night${d.nights === 1 ? "" : "s"} · ${money(d.nightlyRate)} per night`, bx, boxTop - 73, 9, font, MUTED);

  // Table
  let y = boxTop - boxH - 28;
  page.drawRectangle({ x: M, y: y - 6, width: width - M * 2, height: 22, color: INK });
  text(page, "DESCRIPTION", M + 10, y, 8, bold, WHITE);
  text(page, "QTY", M + 300, y, 8, bold, WHITE);
  text(page, "UNIT", M + 350, y, 8, bold, WHITE);
  rightText(page, "AMOUNT (MWK)", width - M - 10, y, 8, bold, WHITE);
  y -= 26;

  const roomSubtotal = d.roomSubtotal ?? d.nightlyRate * d.nights;
  const rows: { desc: string; qty: string; unit: string; amount: number | null }[] = [
    { desc: `${d.roomType} accommodation`, qty: `${d.nights} night${d.nights === 1 ? "" : "s"}`, unit: "Stay total", amount: roomSubtotal },
  ];
  if ((d.discountAmount ?? 0) > 0) {
    rows.push({ desc: "Stay discount", qty: "1", unit: "Discount", amount: -(d.discountAmount ?? 0) });
  }
  const extrasWithAmounts = d.extras.filter((e) => typeof e.amount === "number");
  if (d.extras.length > 0 && extrasWithAmounts.length === d.extras.length) {
    for (const e of d.extras) rows.push({ desc: e.label, qty: "1", unit: money(e.amount ?? 0), amount: e.amount ?? 0 });
  } else if (d.extrasTotal > 0) {
    rows.push({ desc: `Stay extras${d.extras.length ? `: ${d.extras.map((e) => e.label).join(", ")}` : ""}`, qty: "1", unit: money(d.extrasTotal), amount: d.extrasTotal });
  }

  for (const row of rows) {
    text(page, row.desc, M + 10, y, 9.5, font, INK, { maxWidth: 270 });
    text(page, row.qty, M + 300, y, 9.5, font, INK);
    text(page, row.unit, M + 350, y, 9.5, font, INK);
    if (row.amount !== null) rightText(page, Math.round(row.amount).toLocaleString("en-US"), width - M - 10, y, 9.5, font, INK);
    y -= 18;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: width - M, y: y + 6 }, thickness: 0.5, color: rgb(0.85, 0.82, 0.78) });
  }

  // Totals
  y -= 8;
  const totalsX = width - M - 200;
  const line = (label: string, value: string, strong = false, color = INK) => {
    text(page, label, totalsX, y, strong ? 10 : 9.5, strong ? bold : font, color);
    rightText(page, value, width - M - 10, y, strong ? 10.5 : 9.5, strong ? bold : font, color);
    y -= 16;
  };
  line("Accommodation", money(roomSubtotal));
  if ((d.discountAmount ?? 0) > 0) line("Discount", `-${money(d.discountAmount ?? 0)}`);
  line("Extras", money(d.extrasTotal));
  const taxLabel = d.taxRateBp == null
    ? "VAT"
    : `VAT ${(d.taxRateBp / 100).toFixed(2)}%${d.taxInclusive ? " (included)" : ""}`;
  line(taxLabel, d.taxAmount == null ? "See final tax document" : money(d.taxAmount), false, MUTED);
  page.drawLine({ start: { x: totalsX, y: y + 10 }, end: { x: width - M, y: y + 10 }, thickness: 1, color: ORANGE });
  y -= 4;
  line("TOTAL", money(d.totalAmount), true);
  line("Paid", money(d.amountPaid));
  const balance = Math.max(0, d.totalAmount - d.amountPaid);
  page.drawRectangle({ x: totalsX - 8, y: y - 5, width: width - M - totalsX + 8, height: 20, color: balance > 0 ? ORANGE : rgb(0.32, 0.42, 0.34) });
  text(page, balance > 0 ? "BALANCE DUE" : "PAID IN FULL", totalsX, y, 10, bold, balance > 0 ? INK : WHITE);
  rightText(page, money(balance), width - M - 10, y, 11, bold, balance > 0 ? INK : WHITE);
  y -= 40;

  // Payment channels
  page.drawRectangle({ x: M, y: y - 74, width: width - M * 2, height: 84, color: SAND, borderColor: rgb(0.72, 0.53, 0.33), borderWidth: 0.8 });
  text(page, "HOW TO PAY (LILONGWE)", M + 12, y - 6, 8, bold, EMBER);
  text(page, "Bank transfer: National Bank of Malawi — Sunrise Motel — Acc 1009876543 — Ref: " + d.reference, M + 12, y - 22, 9, font, INK);
  text(page, "Airtel Money: +265 998 688 332   ·   TNM Mpamba: +265 888 123 456   ·   Cash or card at the front desk", M + 12, y - 36, 9, font, INK);
  text(page, "Send proof of payment on WhatsApp (+265 998 688 332) quoting your booking reference. Rooms are held until the payment deadline shown by the front desk.", M + 12, y - 52, 8.5, font, MUTED, { maxWidth: width - M * 2 - 24, lineHeight: 11 });
  y -= 98;

  if (d.requests) {
    text(page, "Guest notes:", M, y, 8.5, bold, MUTED);
    text(page, d.requests, M + 62, y, 8.5, font, INK, { maxWidth: width - M * 2 - 62, lineHeight: 11 });
    y -= 30;
  }

  // Footer
  const footerY = 60;
  page.drawLine({ start: { x: M, y: footerY + 26 }, end: { x: width - M, y: footerY + 26 }, thickness: 0.6, color: rgb(0.85, 0.82, 0.78) });
  text(
    page,
    isPaid
      ? "Payment has been recorded. This confirmation is not an MRA tax invoice or fiscal receipt."
      : "PRO-FORMA ONLY — this quotation is not an MRA tax invoice or fiscal receipt. An official fiscal document is issued separately where required.",
    M,
    footerY + 10,
    8,
    oblique,
    MUTED,
    { maxWidth: width - M * 2, lineHeight: 10.5 },
  );
  text(page, `Generated ${malawiStamp()} · Sunrise Motel guest services · +265 998 688 332`, M, footerY - 12, 7.5, font, MUTED);

  return pdf.save();
}
