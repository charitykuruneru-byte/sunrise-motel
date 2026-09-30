import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { expensesTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { isManagerRole, readSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const CATEGORIES = ["cleaning", "food", "bar_stock", "maintenance", "salary", "utility", "other"];
const METHODS = ["cash", "bank", "m_pesa", "airtel_money", "card", "other"];

/** GET /api/admin/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD — newest first. */
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const filters = [
    from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? gte(expensesTable.spentOn, from) : undefined,
    to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? lte(expensesTable.spentOn, to) : undefined,
  ].filter(Boolean);
  const rows = filters.length
    ? await db.select().from(expensesTable).where(and(...filters)).orderBy(desc(expensesTable.spentOn), desc(expensesTable.createdAt)).limit(500)
    : await db.select().from(expensesTable).orderBy(desc(expensesTable.spentOn), desc(expensesTable.createdAt)).limit(100);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return NextResponse.json({ expenses: rows, total, categories: CATEGORIES, methods: METHODS });
}

/** POST /api/admin/expenses — what the motel spent, so net profit is not just revenue. */
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  try {
    const body = (await request.json()) as {
      category?: string;
      description?: string;
      amount?: number | string;
      paidTo?: string;
      method?: string;
      receiptUrl?: string;
      spentOn?: string;
      note?: string;
    };
    const description = (body.description ?? "").trim();
    const amount = Math.round(Number(body.amount) || 0);
    const spentOn = (body.spentOn ?? "").trim();
    const category = CATEGORIES.includes(body.category ?? "") ? (body.category as string) : "other";
    const method = METHODS.includes(body.method ?? "") ? (body.method as string) : "cash";
    if (description.length < 2) return NextResponse.json({ error: "Describe what the money was spent on." }, { status: 400 });
    if (amount <= 0) return NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) return NextResponse.json({ error: "Pick the date the money was spent (YYYY-MM-DD)." }, { status: 400 });

    const [row] = await db
      .insert(expensesTable)
      .values({
        id: randomUUID(),
        category,
        description,
        amount,
        paidTo: (body.paidTo ?? "").trim() || null,
        method,
        receiptUrl: (body.receiptUrl ?? "").trim() || null,
        spentOn,
        approvedBy: user.name,
        createdBy: `${user.staffCode} — ${user.name}`,
        note: (body.note ?? "").trim() || null,
      })
      .returning();

    await logAudit({
      action: "EXPENSE_RECORDED",
      entity: "expense",
      entityId: row.id,
      summary: `${user.name} recorded ${category} expense MWK ${amount.toLocaleString()} (${description}) on ${spentOn}.`,
      actor: "manager",
      actorLabel: `${user.staffCode} — ${user.name}`,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: clientIp(request),
      metadata: { category, amount, method, spentOn },
    });

    return NextResponse.json({ success: true, expense: row }, { status: 201 });
  } catch (error) {
    console.error("Recording an expense failed", error);
    return NextResponse.json({ error: "Could not record that expense." }, { status: 500 });
  }
}

/** DELETE /api/admin/expenses?id=… — correct a mistake (the audit row stays). */
export async function DELETE(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "An expense id is required." }, { status: 400 });
  const [row] = await db.select().from(expensesTable).where(eq(expensesTable.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  await logAudit({
    action: "EXPENSE_DELETED",
    entity: "expense",
    entityId: id,
    summary: `${user.name} deleted expense MWK ${row.amount.toLocaleString()} (${row.description}).`,
    actor: "manager",
    actorLabel: `${user.staffCode} — ${user.name}`,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    ip: clientIp(request),
    metadata: { ...row },
  });
  return NextResponse.json({ success: true });
}
