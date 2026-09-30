import { NextResponse } from "next/server";
import { isSuperAdminRole, readSession } from "@/lib/staff-auth";
import { sendMail } from "@/lib/mail";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isSuperAdminRole(user.role)) {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }
  if (!user.email) return NextResponse.json({ error: "The signed-in account has no email address." }, { status: 400 });

  const outcome = await sendMail({
    to: user.email,
    subject: "Sunrise Motel email delivery test",
    html: `<p>Email delivery is working for the Sunrise Motel system.</p><p>Tested at ${new Date().toISOString()}.</p>`,
    text: `Email delivery is working for the Sunrise Motel system. Tested at ${new Date().toISOString()}.`,
  });

  if (!outcome.sent) {
    return NextResponse.json({ sent: false, error: outcome.reason }, { status: 502 });
  }

  revalidateLiveContent();
  return NextResponse.json({ sent: true, recipient: user.email });
}
