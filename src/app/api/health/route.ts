import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = (await db.execute(sql`select now() as server_time`)) as unknown as { rows?: { server_time: string }[] };
    const serverTime = rows.rows?.[0]?.server_time ?? new Date().toISOString();
    return Response.json({
      ok: true,
      serverTime,
      timezone: "Africa/Blantyre",
      localTime: new Date(serverTime).toLocaleString("en-GB", { timeZone: "Africa/Blantyre" }),
    });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
