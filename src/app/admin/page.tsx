"use client";

import {
  ArrowLeft,
  BedDouble,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  Flame,
  History,
  Image as ImageIcon,
  Key,
  LayoutDashboard,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImageUploader from "@/components/ImageUploader";
import { SunriseLogo } from "@/components/sunrise-logo";
import { formatMalawi } from "@/lib/time";

type BookingItem = {
  id: string;
  reference: string;
  roomTypeId: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  nights: number;
  nightlyRate: number;
  totalAmount: number;
  guestName: string;
  phone: string;
  email: string | null;
  arrival: string | null;
  requests: string | null;
  extras: string | null;
  status: string;
  assignedRoom: string | null;
  bookingNumber: string | null;
  serviceFee: number | null;
  extensionFee: number | null;
  discount: number | null;
  assignedStaffId: string | null;
  followUpAt: string | null;
  followUpNote: string | null;
  lastReminderAt: string | null;
  reminderCount: number | null;
  escalatedAt: string | null;
  invoiceNumber: string | null;
  invoiceSentAt: string | null;
  amountPaid: number;
  createdAt: string;
};

type BookingEvent = { id: string; action: string; note: string | null; actor: string; actorId: string | null; actorName: string | null; actorEmail: string | null; actorRole: string | null; createdAt: string };

type InvoiceItem = {
  id: string;
  invoiceNumber: string;
  bookingRef: string;
  guestName: string;
  guestEmail: string | null;
  roomType: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  sentAt: string | null;
  createdAt: string;
};

type PostItem = { id: string; title: string; category: string; day: string | null; date: string | null; time: string | null; detail: string; priceTag: string | null; imageUrl: string | null; isActive: boolean };
type GalleryItem = { id: string; title: string; category: string; imageUrl: string; altText: string; caption: string | null };
type AuditEntry = { id: string; action: string; entity: string; entityId: string | null; reference: string | null; summary: string | null; actor: string; actorLabel: string | null; ip: string | null; createdAt: string };

const STATUSES = ["pending", "awaiting_payment", "confirmed", "checked_in", "checked_out", "cancelled"];
const money = (v: number) => `MWK ${Math.round(v).toLocaleString("en-US")}`;
// All timestamps are stored as UTC instants (timestamptz) and displayed in
// Africa/Blantyre (Malawi, UTC+2) so records are accurate everywhere.
const when = (iso: string | Date | null | undefined) => `${formatMalawi(iso, { withYear: true })} CAT`;

const EVENT_LABEL: Record<string, string> = {
  created: "Booking request received",
  status_changed: "Status updated",
  room_assigned: "Room assigned",
  payment_recorded: "Payment recorded",
  invoice_emailed: "Invoice emailed",
  invoice_email_failed: "Invoice email not delivered",
  note: "Manager note",
};

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"bookings" | "invoices" | "gallery" | "posts" | "audit" | "staff" | "rooms" | "reports">("bookings");
  const [busy, setBusy] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [toast, setToast] = useState("");

  const [bookingsList, setBookingsList] = useState<BookingItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditEntity, setAuditEntity] = useState("all");
  const [dashboard, setDashboard] = useState<{
    totals: { bookings: number; pending: number; confirmed: number; cancelled: number; paid: number; collected: number; outstanding: number; cancelledLoss: number };
    today: { bookings: number; revenue: number; collected: number };
    week: { bookings: number; revenue: number; collected: number };
    month: { bookings: number; revenue: number; collected: number };
  } | null>(null);
  const [reminders, setReminders] = useState<{ pendingCount: number; reminderDue: { id: string; reference: string; bookingNumber: string | null; guestName: string; hours: number }[] } | null>(null);
  const [staffList, setStaffList] = useState<{ id: string; staffCode: string; name: string; email: string; phone: string | null; role: string; isActive: boolean; lastLoginAt: string | null }[]>([]);
  const [roomsList, setRoomsList] = useState<{ id: string; name: string; rate: number; totalInventory: number; isActive: boolean }[]>([]);
  const [roomForm, setRoomForm] = useState({ id: "", name: "", rate: "", totalInventory: "3", weekendPrice: "", extraBedPrice: "", cleaningFee: "", taxPercent: "16.5", minNights: "1", weeklyDiscountPercent: "", monthlyDiscountPercent: "" });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selected, setSelected] = useState<BookingItem | null>(null);
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [roomInput, setRoomInput] = useState("");
  const [paymentInput, setPaymentInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailState, setEmailState] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);

  const [showAddImage, setShowAddImage] = useState(false);
  const [imgTitle, setImgTitle] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [imgCategory, setImgCategory] = useState("Rooms");
  const [imgCaption, setImgCaption] = useState("");

  const [showAddPost, setShowAddPost] = useState(false);
  const [post, setPost] = useState({ title: "", category: "Event", day: "SAT", date: "26", time: "12:00 — 20:00", detail: "", priceTag: "", imageUrl: "" });
  const [notifyAppUsers, setNotifyAppUsers] = useState(false);

  // --- Manager login gate (staff or admin account, legacy password still works) ---
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  // The password box takes the keyboard when the pop-up appears, and the button that
  // opened it takes it back when the pop-up closes — otherwise a keyboard user is
  // left standing at the top of the page with no idea where the focus went.
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const signInButtonRef = useRef<HTMLButtonElement | null>(null);
  const [sessionUser, setSessionUser] = useState<{ id: string; staffCode: string; name: string; email: string; role: "admin" | "super_admin" | "motel_manager" | "restaurant_manager" | "staff" | "auditor" } | null>(null);
  const isAdmin = sessionUser?.role === "admin" || sessionUser?.role === "super_admin";
  const isMotelManager = isAdmin || sessionUser?.role === "motel_manager";
  const isRestaurantManager = isAdmin || sessionUser?.role === "restaurant_manager";
  const isManager = isMotelManager || isRestaurantManager;
  const canViewUsers = isAdmin || sessionUser?.role === "motel_manager" || sessionUser?.role === "restaurant_manager";

  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 3500);
  };

  const testEmail = async () => {
    setEmailTesting(true);
    try {
      const res = await fetch("/api/admin/email-test", { method: "POST" });
      const data = await res.json();
      notify(res.ok ? `Test email sent to ${data.recipient}` : data.error || "Email test failed");
    } catch {
      notify("Email test failed. Check the connection and try again.");
    } finally {
      setEmailTesting(false);
    }
  };

  const loadAll = async () => {
    if (!authed) return;
    setBusy(true);
    try {
      const [b, i, g, p, a, d, r] = await Promise.all([fetch("/api/admin/bookings"), fetch("/api/admin/invoices"), fetch("/api/admin/gallery"), fetch("/api/admin/posts"), fetch("/api/admin/audit?limit=200"), fetch("/api/admin/dashboard"), fetch("/api/admin/reminders")]);
      const [bj, ij, gj, pj, aj, dj, rj] = await Promise.all([b.json(), i.json(), g.json(), p.json(), a.json(), d.json(), r.json()]);
      setBookingsList(bj.bookings ?? []);
      setInvoices(ij.invoices ?? []);
      setGallery(gj.images ?? []);
      setPosts(pj.posts ?? []);
      setAuditEntries(aj.entries ?? []);
      setDashboard(dj.totals ? dj : null);
      setReminders(rj.pendingCount !== undefined ? rj : null);
      if (isAdmin) {
        const staffResponse = await fetch("/api/admin/staff");
        const staffData = await staffResponse.json();
        setStaffList(staffData.staff ?? []);
      }
      if (isMotelManager) {
        const roomResponse = await fetch("/api/admin/rooms");
        const roomData = await roomResponse.json();
        setRoomsList(roomData.rooms ?? []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const loadDashboard = async () => {
    if (!authed) return;
    try {
      const [d, r] = await Promise.all([fetch("/api/admin/dashboard"), fetch("/api/admin/reminders")]);
      const [dj, rj] = await Promise.all([d.json(), r.json()]);
      if (dj.totals) setDashboard(dj);
      if (rj.pendingCount !== undefined) setReminders(rj);
    } catch (e) {
      console.error(e);
    }
  };

  const runReminders = async () => {
    const res = await fetch("/api/admin/reminders", { method: "POST" });
    const data = await res.json();
    notify(res.ok ? `Reminders sent: ${data.reminded ?? 0}, escalated: ${data.escalated ?? 0}.` : (data.error || "Reminder run failed"));
    loadDashboard();
  };

  const loadAudit = async () => {
    if (!authed) return;
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (auditQuery.trim()) params.set("q", auditQuery.trim());
      if (auditEntity !== "all") params.set("entity", auditEntity);
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      const data = await res.json();
      setAuditEntries(data.entries ?? []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/login", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { authed?: boolean; user?: { id: string; staffCode: string; name: string; email: string; role: "admin" | "super_admin" | "motel_manager" | "restaurant_manager" | "staff" | "auditor" } | null };
        if (cancelled) return;
        setCheckingAuth(false);
        if (data.authed) {
          setAuthed(true);
          setSessionUser(data.user ?? null);
          setLoginOpen(false);
        } else {
          setLoginOpen(true);
        }
      } catch {
        if (!cancelled) {
          setCheckingAuth(false);
          setLoginOpen(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed, isAdmin, isMotelManager]);

  // ---- The sign-in pop-up (front desk, not a maze) ---------------------------
  // It can always be closed — the cross, a tap on the dark background, or Escape —
  // and closing reveals nothing: the portal behind it stays blurred and inert, and
  // the "Manager sign-in" button brings the pop-up straight back. It used to be
  // impossible to leave without signing in or reloading, which made the whole site
  // unreachable from /admin for anyone who opened the page by accident.
  const closeLogin = () => {
    setLoginOpen(false);
    setPassword("");
    setLoginError("");
  };

  useEffect(() => {
    if (!loginOpen) return;
    // The box the cursor belongs in, once the dialog is really in the DOM.
    const focusTimer = window.setTimeout(() => passwordRef.current?.focus(), 30);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLoginOpen(false);
      setPassword("");
      setLoginError("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [loginOpen]);

  useEffect(() => {
    // Focus goes back where it came from, so a keyboard user is never dropped at
    // the top of a page they were not looking at.
    if (loginOpen || authed) return;
    signInButtonRef.current?.focus();
  }, [loginOpen, authed]);

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim() || undefined, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean; user?: { id: string; staffCode: string; name: string; email: string; role: "admin" | "super_admin" | "motel_manager" | "restaurant_manager" | "staff" | "auditor" } };
      if (!res.ok || !data.success) throw new Error(data.error || "Login failed.");
      setAuthed(true);
      setSessionUser(data.user ?? null);
      setLoginOpen(false);
      setPassword("");
      notify(`Welcome back ${data.user ? `${data.user.name} (${data.user.role.replaceAll("_", " ")})` : ""}.`);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    setAuthed(false);
    setSessionUser(null);
    setLoginOpen(true);
    setPassword("");
  };

  const openBooking = async (b: BookingItem) => {
    setSelected(b);
    setRoomInput(b.assignedRoom ?? "");
    setPaymentInput(String(b.amountPaid || ""));
    setEmailInput(b.email ?? "");
    setEmailState(null);
    setNoteInput("");
    setEvents([]);
    try {
      const res = await fetch(`/api/admin/bookings?reference=${encodeURIComponent(b.reference)}`);
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch (e) {
      console.error(e);
    }
  };

  const refreshSelected = async (id: string) => {
    const res = await fetch("/api/admin/bookings");
    const data = await res.json();
    const list: BookingItem[] = data.bookings ?? [];
    setBookingsList(list);
    const fresh = list.find((x) => x.id === id);
    if (fresh) await openBooking(fresh);
  };

  const patchBooking = async (id: string, payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) });
    const data = await res.json();
    if (!res.ok && !data.booking) {
      notify(data.error || "Update failed");
      return;
    }
    await refreshSelected(id);
    await loadDashboard();
    notify("Saved");
  };

  const approveBooking = async (b: BookingItem, action: "approve" | "confirm" | "cancel" | "follow_up") => {
    const followNote = action === "follow_up" ? prompt(`Follow-up note for ${b.reference} (guest will be emailed):`, "Please confirm if you are continuing with this booking.") : "";
    if (action === "follow_up" && followNote === null) return;
    if (action === "cancel" && !confirm(`Cancel booking ${b.reference} for ${b.guestName}? The guest will be emailed.`)) return;
    const res = await fetch("/api/admin/bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, action, ...(action === "follow_up" ? { followUpNote: followNote || "" } : {}) }) });
    const data = await res.json();
    if (!res.ok && !data.booking) { notify(data.error || "Update failed"); return; }
    notify(action === "cancel" ? `Booking ${b.reference} cancelled.` : action === "follow_up" ? `Follow-up sent for ${b.reference}.` : `Booking ${b.reference} ${action === "approve" ? "approved" : "confirmed"}.`);
    await refreshSelected(b.id);
    await loadAll();
  };

  const extendBooking = async (b: BookingItem) => {
    const next = prompt(`Extend ${b.reference} — new check-out date (YYYY-MM-DD, current ${b.checkOut}):`, b.checkOut);
    if (!next || next === b.checkOut) return;
    const res = await fetch("/api/admin/bookings/extend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, newCheckOut: next }) });
    const data = await res.json();
    if (!res.ok) { notify(data.error || "Extension failed"); return; }
    notify(`Extended by ${data.extraNights} night(s) — +MWK ${Number(data.additionalFee).toLocaleString()}.`);
    loadAll();
    await refreshSelected(b.id);
  };

  const emailInvoice = async (b: BookingItem) => {
    setEmailState({ tone: "warn", text: "Sending…" });
    const res = await fetch("/api/admin/bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, action: "email_invoice", recipientEmail: emailInput || b.email }) });
    const data = await res.json();
    if (res.ok && data.sent) setEmailState({ tone: "ok", text: data.message });
    else setEmailState({ tone: res.status === 202 ? "warn" : "err", text: data.message || data.error || "Email failed" });
    await refreshSelected(b.id);
  };

  const deleteBooking = async (b: BookingItem) => {
    if (!confirm(`Delete booking ${b.reference} for ${b.guestName}? This releases the room and removes its invoice.`)) return;
    const res = await fetch(`/api/admin/bookings?id=${b.id}`, { method: "DELETE" });
    const data = await res.json();
    notify(data.message || data.error || "Deleted");
    setSelected(null);
    loadAll();
  };

  const addImage = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: imgTitle, imageUrl: imgUrl, category: imgCategory, caption: imgCaption, altText: imgAlt }) });
    const data = await res.json();
    if (data.image) {
      setGallery((prev) => [data.image, ...prev]);
      setShowAddImage(false);
      setImgTitle("");
      setImgUrl("");
      setImgAlt("");
      setImgCaption("");
      router.refresh();
      notify("Picture added to the gallery");
    } else notify(data.error || "Could not add picture");
  };

  const removeImage = async (id: string) => {
    if (!confirm("Remove this picture from the public gallery?")) return;
    const res = await fetch(`/api/admin/gallery?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setGallery((prev) => prev.filter((g) => g.id !== id));
      router.refresh();
    }
  };

  const addPost = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(post) });
    const data = await res.json();
    if (data.post) {
      setPosts((prev) => [data.post, ...prev]);
      setShowAddPost(false);
      // The post itself is already live and already alerted every subscribed device
      // (the API does that automatically) — this line just tells the truth about it.
      const push: { delivered?: number; devices?: number; reason?: string } = data.push || {};
      const alertNote =
        push.delivered
          ? ` — alert sent to ${push.delivered} device${push.delivered === 1 ? "" : "s"}`
          : push.reason
            ? ` — alert: ${push.reason}`
            : push.devices === 0
              ? " — no device has alerts on yet (footer → Get alerts)"
              : "";
      // Additive: optionally broadcast this post to all installed apps.
      if (notifyAppUsers) {
        try {
          const nres = await fetch("/api/admin/send-notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: data.post.title,
              body: data.post.detail ? String(data.post.detail).slice(0, 160) : "New post from Sunrise Motel.",
              url: "/unwind",
              imageUrl: data.post.imageUrl || undefined,
            }),
          });
          const ndata = await nres.json().catch(() => ({}));
          notify(ndata.delivered ? "Post published + app users notified" : `Post published${alertNote} (app push not configured — see /admin/notifications)`);
        } catch {
          notify(`Post published${alertNote} (app push failed — see /admin/notifications)`);
        }
        setNotifyAppUsers(false);
      } else {
        notify(`Post published${alertNote}`);
      }
      setPost({ title: "", category: "Event", day: "SAT", date: "26", time: "12:00 — 20:00", detail: "", priceTag: "", imageUrl: "" });
      router.refresh();
    } else notify(data.error || "Could not publish");
  };

  const removePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    const res = await fetch(`/api/admin/posts?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== id));
      router.refresh();
    }
  };

  const togglePost = async (p: PostItem) => {
    const res = await fetch("/api/admin/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, isActive: !p.isActive }) });
    const data = await res.json();
    if (data.post) {
      setPosts((prev) => prev.map((x) => (x.id === p.id ? data.post : x)));
      router.refresh();
    }
  };

  const addRoom = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...roomForm,
        rate: Number(roomForm.rate),
        totalInventory: Number(roomForm.totalInventory),
        // The form speaks percent because that is how a rate is written on paper;
        // the API stores basis points so 16.5% cannot drift into 16% by rounding.
        weekendPrice: Number(roomForm.weekendPrice) || 0,
        extraBedPrice: Number(roomForm.extraBedPrice) || 0,
        cleaningFee: Number(roomForm.cleaningFee) || 0,
        taxPercent: Number(roomForm.taxPercent) || 0,
        minNights: Number(roomForm.minNights) || 1,
        weeklyDiscountBp: Math.round((Number(roomForm.weeklyDiscountPercent) || 0) * 100),
        monthlyDiscountBp: Math.round((Number(roomForm.monthlyDiscountPercent) || 0) * 100),
      }),
    });
    const data = await res.json();
    if (!res.ok) { notify(data.error || "Could not add room"); return; }
    setRoomForm({ id: "", name: "", rate: "", totalInventory: "3", weekendPrice: "", extraBedPrice: "", cleaningFee: "", taxPercent: "16.5", minNights: "1", weeklyDiscountPercent: "", monthlyDiscountPercent: "" });
    notify(`Room added: ${data.room.name}.`);
    loadAll();
  };

  const toggleRoom = async (id: string, isActive: boolean) => {
    const res = await fetch("/api/admin/rooms", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isActive }) });
    if (!res.ok) notify("Update failed");
    loadAll();
  };

  const removeRoom = async (id: string) => {
    if (!confirm(`Remove room/service ${id}? Rooms with live bookings are hidden instead of deleted.`)) return;
    const res = await fetch(`/api/admin/rooms?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    notify(res.ok ? (data.deactivated ? "Room hidden (live bookings exist)." : "Room removed.") : (data.error || "Remove failed"));
    loadAll();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookingsList.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (!q) return true;
      return [b.reference, b.guestName, b.phone, b.email ?? "", b.roomType, b.assignedRoom ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [bookingsList, query, statusFilter]);

  const stats = useMemo(() => {
    const live = bookingsList.filter((b) => b.status !== "cancelled");
    return {
      total: bookingsList.length,
      pending: bookingsList.filter((b) => b.status === "pending").length,
      awaiting: bookingsList.filter((b) => b.status === "awaiting_payment").length,
      confirmed: bookingsList.filter((b) => ["confirmed", "checked_in"].includes(b.status)).length,
      collected: live.reduce((s, b) => s + b.amountPaid, 0),
      outstanding: live.reduce((s, b) => s + Math.max(0, b.totalAmount - b.amountPaid), 0),
    };
  }, [bookingsList]);

  const waLink = (b: BookingItem, text: string) => `https://wa.me/${b.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

  return (
    <div className="admin-portal">
      <header className="admin-header">
        <div className="admin-header-left">
          <Link href="/" className="back-link"><ArrowLeft size={15} /> Site</Link>
          <div className="admin-brand">
            <SunriseLogo size="small" animated={false} theme="dark" showTagline={false} />
            <div className="admin-title">
              <span className="admin-badge">MANAGER PORTAL</span>
              <small>Front desk · bookings · invoices · pictures · posts</small>
            </div>
          </div>
        </div>
        <div className="admin-header-actions">
          {/* `/desk` is the console the front desk actually works the day from — ten
              tabs, the room map, the order board, the money. It linked OUT to this
              legacy portal, but nothing linked IN to it, so the only way to reach it
              was to type the URL. This is that missing inbound link (§2.6: the
              manager portal is a text link and never competes with Check
              availability — it sits beside the header actions, not in the nav). */}
          <a className="admin-btn" href="/desk"><LayoutDashboard size={15} /> Front desk console</a>
          <button className="admin-btn admin-btn-refresh" onClick={loadAll}>{busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Refresh</button>
          {authed && isAdmin && <button className="admin-btn" onClick={testEmail} disabled={emailTesting}>{emailTesting ? <Loader2 size={15} className="spin" /> : <Mail size={15} />} Test email</button>}
          {authed && <button className="admin-btn" onClick={logout}><Key size={15} /> Lock</button>}
        </div>
      </header>

      {/* ---------- Locked state ---------- */}
      {!authed && !checkingAuth && !loginOpen && (
        <div className="admin-locked-card">
          <ShieldCheck size={28} />
          <h2>Manager area is locked</h2>
          <p>Please sign in to see bookings, invoices and guest details.</p>
          <button ref={signInButtonRef} className="admin-btn admin-btn-primary" onClick={() => setLoginOpen(true)}><Key size={15} /> Manager sign-in</button>
        </div>
      )}

      {/* ---------- Login pop-up ---------- */}
      {loginOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeLogin(); }}>
          <div className="modal-dialog admin-login-dialog" role="dialog" aria-modal="true" aria-label="Manager sign-in">
            <button className="modal-close-btn" onClick={closeLogin} aria-label="Close sign-in"><X size={18} /></button>
            <div className="modal-head">
              <span className="eyebrow"><span className="eyebrow-line" /> MANAGER PORTAL</span>
              <h2>Manager sign-in</h2>
              <p className="modal-sub">Staff only. Guests never need a login — they track with reference + phone.</p>
            </div>
            <form onSubmit={submitLogin} className="admin-modal-form">
              <label><span>Invitation email</span>
                <input type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@sunrisemotel.mw" autoComplete="username" />
              </label>
              <label><span>Password</span>
                <input ref={passwordRef} required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" />
              </label>
              {loginError && <div className="booking-error-banner"><X size={14} /><span>{loginError}</span></div>}
              <button type="submit" className="admin-btn admin-btn-primary admin-btn-wide" disabled={loginBusy || !password}>
                {loginBusy ? <><Loader2 size={15} className="spin" /> Checking…</> : <><Key size={15} /> Unlock manager portal</>}
              </button>
              <p className="no-account-guarantee"><ShieldCheck size={13} /> Sign in with the email and password you set from your invitation. Session lasts 12 hours on this device.</p>
              <p className="admin-login-dismiss">Not the manager? Close this and carry on reading the site — nothing here opens without the password.</p>
            </form>
          </div>
        </div>
      )}

      {/* Main portal - blurred/locked until login. `inert` is what makes that a
          promise rather than a picture: while it is locked the keyboard cannot
          wander into the blurred cards behind the pop-up either. */}
      <div className={authed ? "" : "admin-locked-blur"} aria-hidden={!authed} inert={!authed}>
        <div className="admin-stats">
        <div className="stat"><span>Requests</span><strong>{stats.total}</strong></div>
        <div className="stat stat-warn"><span>Pending review{reminders && reminders.pendingCount > 0 ? ` (${reminders.pendingCount})` : ""}</span><strong>{stats.pending}</strong></div>
        <div className="stat stat-info"><span>Awaiting payment</span><strong>{stats.awaiting}</strong></div>
        <div className="stat stat-ok"><span>Confirmed / in-house</span><strong>{stats.confirmed}</strong></div>
        <div className="stat"><span>Collected</span><strong>{money(stats.collected)}</strong></div>
        <div className="stat"><span>Outstanding</span><strong>{money(stats.outstanding)}</strong></div>
      </div>

      {dashboard && (
        <div className="admin-stats admin-stats-revenue">
          <div className="stat"><span>Today — bookings</span><strong>{dashboard.today.bookings}</strong><em>{money(dashboard.today.revenue)}</em></div>
          <div className="stat"><span>Week — bookings</span><strong>{dashboard.week.bookings}</strong><em>{money(dashboard.week.revenue)}</em></div>
          <div className="stat"><span>Month — bookings</span><strong>{dashboard.month.bookings}</strong><em>{money(dashboard.month.revenue)}</em></div>
          <div className="stat"><span>Paid bookings</span><strong>{dashboard.totals.paid}</strong><em>Collected {money(dashboard.totals.collected)}</em></div>
          <div className="stat stat-bad"><span>Cancelled loss</span><strong>{money(dashboard.totals.cancelledLoss)}</strong><em>{dashboard.totals.cancelled} cancelled</em></div>
          <div className="stat"><span>Session</span><strong>{sessionUser ? (sessionUser.role === "admin" ? "Admin" : sessionUser.staffCode) : "—"}</strong><em>{sessionUser?.name ?? ""}</em></div>
        </div>
      )}

      {reminders && reminders.reminderDue.length > 0 && (
        <div className="reminder-banner">
          <Clock size={16} />
          <div>
            <strong>{reminders.reminderDue.length} booking(s) waiting too long</strong>
            <p>{reminders.reminderDue.slice(0, 4).map((r) => `${r.bookingNumber ?? r.reference} (${r.guestName}, ${r.hours}h)`).join(" · ")}{reminders.reminderDue.length > 4 ? " …" : ""}</p>
          </div>
          <button className="admin-btn admin-btn-secondary" onClick={runReminders}><Send size={14} /> Send reminders</button>
        </div>
      )}

      <nav className="admin-tabs">
        <button className={tab === "bookings" ? "active" : ""} onClick={() => setTab("bookings")}><Calendar size={15} /> Bookings ({bookingsList.length})</button>
        <button className={tab === "invoices" ? "active" : ""} onClick={() => setTab("invoices")}><FileText size={15} /> Invoices ({invoices.length})</button>
        <button className={tab === "gallery" ? "active" : ""} onClick={() => setTab("gallery")}><ImageIcon size={15} /> Pictures ({gallery.length})</button>
        <button className={tab === "posts" ? "active" : ""} onClick={() => setTab("posts")}><Flame size={15} /> Posts ({posts.length})</button>
        <a className="admin-btn" href="/admin/audit-logs" style={{ textDecoration: "none" }}><History size={15} /> Audit trail</a>
        {canViewUsers && <a className="admin-btn" href="/admin/users" style={{ textDecoration: "none" }}><Users size={15} /> Users{isAdmin ? ` (${staffList.length})` : ""}</a>}
        {isMotelManager && <button className={tab === "rooms" ? "active" : ""} onClick={() => setTab("rooms")}><BedDouble size={15} /> Rooms ({roomsList.length})</button>}
        <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><Download size={15} /> Reports</button>
        <a className="admin-btn" href="/admin/notifications" style={{ textDecoration: "none" }}><Send size={15} /> App push</a>
        {canViewUsers && <a className="admin-btn" href="/admin/finance" style={{ textDecoration: "none" }}><CreditCard size={15} /> Finance &amp; night audit</a>}
        {canViewUsers && <a className="admin-btn" href="/admin/calendar" style={{ textDecoration: "none" }}><Calendar size={15} /> Room calendar</a>}
        {canViewUsers && <a className="admin-btn" href="/admin/housekeeping" style={{ textDecoration: "none" }}><BedDouble size={15} /> Housekeeping</a>}
      </nav>

      {/* ---------------- BOOKINGS ---------------- */}
      {tab === "bookings" && (
        <section className="admin-content-section">
          <div className="admin-search-row">
            <label className="admin-search">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Follow a booking: reference (SM-…), guest name, phone or email" />
              {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
            </label>
            <div className="filter-chips">
              {["all", ...STATUSES].map((s) => (
                <button key={s} className={statusFilter === s ? "active" : ""} onClick={() => setStatusFilter(s)}>{s === "all" ? "All" : s.replace("_", " ")}</button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state"><FileText size={34} /><p>{bookingsList.length === 0 ? "No booking requests yet. New guest requests appear here instantly." : "No bookings match this search."}</p></div>
          ) : (
            <div className="booking-card-list">
              {filtered.map((b) => {
                const balance = Math.max(0, b.totalAmount - b.amountPaid);
                return (
                  <article key={b.id} className={`booking-card status-border-${b.status}`}>
                    <div className="bc-top">
                      <button className="bc-ref" onClick={() => openBooking(b)}>{b.bookingNumber ?? b.reference}</button>
                      <span className={`status-pill status-${b.status}`}>{b.status.replace("_", " ")}</span>
                    </div>
                    <div className="bc-guest">
                      <strong>{b.guestName}</strong>
                      <a href={`tel:${b.phone}`}><Phone size={12} /> {b.phone}</a>
                      {b.email && <span><Mail size={12} /> {b.email}</span>}
                    </div>
                    <div className="bc-grid">
                      <div><small>Room</small><strong><BedDouble size={13} /> {b.roomType}</strong>{b.assignedRoom ? <em className="assigned-tag">{b.assignedRoom}</em> : <em className="unassigned-tag">unassigned</em>}</div>
                      <div><small>Stay</small><strong>{b.checkIn} → {b.checkOut}</strong><em>{b.nights} night{b.nights > 1 ? "s" : ""} · {b.adults} adult{b.adults > 1 ? "s" : ""}{b.children ? ` · ${b.children} child` : ""}</em></div>
                      <div><small>Money</small><strong>{money(b.totalAmount)}</strong><em className={balance > 0 ? "due" : "paid"}>{balance > 0 ? `Balance ${money(balance)}` : "Paid in full"}</em></div>
                      <div><small>Requested</small><strong>{when(b.createdAt)}</strong><em>{b.invoiceNumber}</em></div>
                    </div>
                    <div className="bc-actions">
                      <button className="btn-action btn-view" onClick={() => openBooking(b)}><Key size={14} /> Manage & timeline</button>
                      <button className="btn-action btn-ok" onClick={() => approveBooking(b, "approve")}>Approve</button>
                      <button className="btn-action" onClick={() => approveBooking(b, "confirm")}>Confirm</button>
                      <button className="btn-action" onClick={() => approveBooking(b, "follow_up")}>Follow-up</button>
                      <button className="btn-action btn-danger-text" onClick={() => approveBooking(b, "cancel")}>Cancel</button>
                      <a className="btn-action btn-pdf" href={`/api/invoices/${b.reference}`} download><Download size={14} /> Invoice PDF</a>
                      <a className="btn-action btn-wa" href={waLink(b, `Hello ${b.guestName}, this is Sunrise Motel front desk regarding booking ${b.bookingNumber ?? b.reference} (${b.roomType}, ${b.checkIn} to ${b.checkOut}).`)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ---------------- INVOICES ---------------- */}
      {tab === "invoices" && (
        <section className="admin-content-section">
          <div className="section-toolbar">
            <div className="toolbar-info"><h2>Invoices & receipts</h2><p>Every booking gets a pro-forma automatically. Recording full payment converts it to a receipt. Download or email the PDF.</p></div>
          </div>
          {invoices.length === 0 ? (
            <div className="empty-state"><FileText size={34} /><p>No invoices yet.</p></div>
          ) : (
            <div className="invoice-list">
              {invoices.map((inv) => (
                <article key={inv.id} className="invoice-row">
                  <div className="inv-main">
                    <strong>{inv.invoiceNumber}</strong>
                    <span>Booking {inv.bookingRef} · {inv.guestName}</span>
                    <small>{inv.roomType} · {inv.checkIn} → {inv.checkOut}</small>
                  </div>
                  <div className="inv-money">
                    <strong>{money(inv.totalAmount)}</strong>
                    <small className={inv.balanceDue > 0 ? "due" : "paid"}>{inv.balanceDue > 0 ? `Due ${money(inv.balanceDue)}` : "Paid"}</small>
                  </div>
                  <span className={`status-pill inv-${inv.status}`}>{inv.status}</span>
                  <div className="inv-actions">
                    <a className="btn-action btn-pdf" href={`/api/invoices/${inv.bookingRef}`} download><Download size={14} /> PDF</a>
                    <button className="btn-action btn-view" onClick={() => { const b = bookingsList.find((x) => x.reference === inv.bookingRef); if (b) { setTab("bookings"); openBooking(b); } }}><Mail size={14} /> Email</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------------- GALLERY ---------------- */}
      {tab === "gallery" && (
        <section className="admin-content-section">
          <div className="section-toolbar">
            <div className="toolbar-info"><h2>Pictures & gallery</h2><p>Upload photos from your phone or paste an image link. Remove anything outdated — changes are live immediately.</p></div>
            {isMotelManager
              ? <button className="admin-btn admin-btn-primary" onClick={() => setShowAddImage(true)}><Plus size={15} /> Add picture</button>
              : <small className="hint">Admins only — staff can view the gallery here.</small>}
          </div>
          <div className="gallery-admin-grid">
            {gallery.map((img) => (
              <div key={img.id} className="gallery-admin-card">
                <div className="card-image-wrap"><img src={img.imageUrl} alt={img.altText} /><span className="card-category-badge">{img.category}</span></div>
                <div className="card-body">
                  <strong>{img.title}</strong>
                  {img.caption && <p>{img.caption}</p>}
                  {isMotelManager && <div className="card-actions"><button className="btn-delete" onClick={() => removeImage(img.id)}><Trash2 size={13} /> Remove</button></div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- POSTS ---------------- */}
      {tab === "posts" && (
        <section className="admin-content-section">
          <div className="section-toolbar">
            <div className="toolbar-info"><h2>Posts, events & offers</h2><p>Publish braai days, happy hour, match days and offers. Pause or delete anything that has passed.</p></div>
            {isRestaurantManager
              ? <button className="admin-btn admin-btn-primary" onClick={() => setShowAddPost(true)}><Plus size={15} /> New post</button>
              : <small className="hint">Admins only — staff can view posts here.</small>}
          </div>
          <div className="posts-admin-grid">
            {posts.map((p) => (
              <article key={p.id} className={`post-admin-card ${!p.isActive ? "post-inactive" : ""}`}>
                {p.imageUrl && <div className="post-img-wrap"><img src={p.imageUrl} alt={p.title} /><span className="post-cat-badge">{p.category}</span></div>}
                <div className="post-admin-body">
                  <div className="post-schedule-badge"><span>{p.day || "DAY"}</span><strong>{p.date || "—"}</strong></div>
                  <div className="post-main-content">
                    <h3>{p.title}</h3>
                    <small className="time-line"><Clock size={12} /> {p.time || "All day"}</small>
                    <p>{p.detail}</p>
                    {p.priceTag && <strong className="price-tag-badge">{p.priceTag}</strong>}
                  </div>
                </div>
                {isRestaurantManager && (
                  <div className="post-admin-actions">
                    <button className={`btn-toggle ${p.isActive ? "btn-active" : "btn-paused"}`} onClick={() => togglePost(p)}>{p.isActive ? "Live" : "Paused"}</button>
                    <button className="btn-delete-post" onClick={() => removePost(p.id)}><Trash2 size={13} /> Delete</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- MANAGE BOOKING MODAL ---------------- */}
      {selected && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="modal-dialog modal-wide">
            <button className="modal-close-btn" onClick={() => setSelected(null)}><X size={18} /></button>
            <div className="modal-head">
              <span className="eyebrow"><span className="eyebrow-line" /> FOLLOW BOOKING</span>
              <h2>{selected.bookingNumber ?? selected.reference}</h2>
              <p><strong>{selected.guestName}</strong> · {selected.phone}{selected.email ? ` · ${selected.email}` : ""}</p>
              <p className="modal-sub">Ref {selected.reference} · Room total {money(selected.totalAmount)}{(selected.serviceFee ?? 0) > 0 ? ` (incl. service ${money(selected.serviceFee ?? 0)})` : ""}{(selected.extensionFee ?? 0) > 0 ? ` (incl. extension ${money(selected.extensionFee ?? 0)})` : ""}{(selected.discount ?? 0) > 0 ? ` (− discount ${money(selected.discount ?? 0)})` : ""}{selected.escalatedAt ? " · ESCALATED" : ""}</p>
            </div>

            <div className="modal-stay-facts">
              <div><span>Room</span><strong>{selected.roomType}{selected.assignedRoom ? ` · ${selected.assignedRoom}` : ""}</strong></div>
              <div><span>Stay</span><strong>{selected.checkIn} → {selected.checkOut} ({selected.nights}n)</strong></div>
              <div><span>Total</span><strong>{money(selected.totalAmount)}</strong></div>
              <div><span>Paid / balance</span><strong>{money(selected.amountPaid)} / {money(Math.max(0, selected.totalAmount - selected.amountPaid))}</strong></div>
            </div>
            {(selected.requests || selected.arrival) && (
              <div className="requests-box">{selected.arrival && <p><strong>Arrival:</strong> {selected.arrival}</p>}{selected.requests && <p><strong>Requests:</strong> {selected.requests}</p>}</div>
            )}

            <div className="manage-grid">
              <div className="manage-col">
                <div className="admin-form-group">
                  <label>Quick decision</label>
                  <div className="inline-actions">
                    <button className="admin-btn admin-btn-primary" onClick={() => approveBooking(selected, "approve")}>Approve</button>
                    <button className="admin-btn admin-btn-secondary" onClick={() => approveBooking(selected, "confirm")}>Confirm</button>
                    <button className="admin-btn" onClick={() => approveBooking(selected, "follow_up")}><Send size={14} /> Follow-up</button>
                    <button className="admin-btn" onClick={() => extendBooking(selected)}>Extend stay</button>
                    {!isMotelManager && <small className="hint">Desk staff can approve, confirm, cancel and follow up; Motel Managers handle extensions and room controls.</small>}
                  </div>
                </div>
                <div className="admin-form-group">
                  <label>Status</label>
                  <div className="status-button-row">
                    {STATUSES.map((s) => (
                      <button key={s} className={`status-btn ${selected.status === s ? "active" : ""}`} disabled={!isManager && !["confirmed", "cancelled"].includes(s)} title={!isManager && !["confirmed", "cancelled"].includes(s) ? "Manager action" : undefined} onClick={() => patchBooking(selected.id, { status: s })}>{s.replace("_", " ")}</button>
                    ))}
                  </div>
                </div>
                {isMotelManager && (
                <div className="admin-form-group">
                  <label>Assign physical room (admin)</label>
                  <div className="input-with-button">
                    <input value={roomInput} onChange={(e) => setRoomInput(e.target.value)} placeholder="e.g. Room 104" />
                    <button className="admin-btn admin-btn-primary" onClick={() => patchBooking(selected.id, { assignedRoom: roomInput })}>Save</button>
                  </div>
                </div>
                )}
                {isMotelManager && (
                <div className="admin-form-group">
                  <label>Record payment received (MWK, admin)</label>
                  <div className="input-with-button">
                    <input type="number" value={paymentInput} onChange={(e) => setPaymentInput(e.target.value)} placeholder="e.g. 85000" />
                    <button className="admin-btn admin-btn-primary" onClick={() => patchBooking(selected.id, { amountPaid: Number(paymentInput) })}><CreditCard size={14} /> Record</button>
                  </div>
                  <small className="hint">Full payment automatically confirms the booking and turns the pro-forma into a receipt.</small>
                </div>
                )}
                <div className="admin-form-group">
                  <label>Invoice</label>
                  <div className="input-with-button">
                    <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="guest@email.com" />
                    <button className="admin-btn admin-btn-invoice" onClick={() => emailInvoice(selected)}><Mail size={14} /> Email PDF</button>
                  </div>
                  <div className="inline-actions">
                    <a className="btn-action btn-pdf" href={`/api/invoices/${selected.reference}`} download><Download size={14} /> Download PDF</a>
                    <a className="btn-action btn-view" href={`/api/invoices/${selected.reference}`} target="_blank" rel="noreferrer"><Printer size={14} /> Open / print</a>
                    <a className="btn-action btn-wa" href={waLink(selected, `Hello ${selected.guestName}, your Sunrise Motel ${selected.amountPaid >= selected.totalAmount ? "receipt" : "pro-forma invoice"} ${selected.invoiceNumber} for booking ${selected.reference} is ready. Total ${money(selected.totalAmount)}. Download: ${typeof window !== "undefined" ? window.location.origin : ""}/api/invoices/${selected.reference}`)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Send link on WhatsApp</a>
                  </div>
                  {emailState && <p className={`email-state email-${emailState.tone}`}>{emailState.text}</p>}
                  {selected.invoiceSentAt && <small className="hint">Last emailed {when(selected.invoiceSentAt)}</small>}
                </div>
              </div>

              <div className="manage-col">
                <div className="admin-form-group">
                  <label>Timeline</label>
                  <ol className="timeline">
                    {events.length === 0 && <li className="tl-empty">Loading history…</li>}
                    {events.map((ev) => (
                      <li key={ev.id} className={`tl-${ev.action}`}>
                        <span className="tl-dot" />
                        <div>
                          <strong>{EVENT_LABEL[ev.action] || ev.action}</strong>
                          {ev.note && <p>{ev.note}</p>}
                          <small>{when(ev.createdAt)} · {ev.actorName ?? ev.actor}{ev.actorRole ? ` (${ev.actorRole.replaceAll("_", " ")})` : ""}{ev.actorEmail ? ` · ${ev.actorEmail}` : ""}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="admin-form-group">
                  <label>Add a manager note</label>
                  <div className="input-with-button">
                    <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="e.g. Guest called, arriving 21:00" />
                    <button className="admin-btn admin-btn-secondary" onClick={async () => { if (!noteInput.trim()) return; await patchBooking(selected.id, { action: "add_note", note: noteInput }); setNoteInput(""); }}><Send size={14} /> Note</button>
                  </div>
                </div>
                {isAdmin ? (
                <button className="btn-danger" onClick={() => deleteBooking(selected)}><Trash2 size={14} /> Delete booking & release room</button>
                ) : (
                <small className="hint">Deletes are admin-only. Your approve / confirm / cancel actions are logged with your staff ID.</small>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- ADD PICTURE ---------------- */}
      {showAddImage && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddImage(false); }}>
          <div className="modal-dialog">
            <button className="modal-close-btn" onClick={() => setShowAddImage(false)}><X size={18} /></button>
            <div className="modal-head"><span className="eyebrow"><span className="eyebrow-line" /> PICTURES</span><h2>Add a picture</h2><p>Pick from your laptop or phone — it uploads to permanent cloud storage.</p></div>
            <form onSubmit={addImage} className="admin-modal-form">
              <ImageUploader currentImage={imgUrl} onUploadComplete={(url) => { setImgUrl(url); if (!imgTitle) setImgTitle("Gallery photo"); notify("Photo uploaded — add a title and save"); }} />
              {imgUrl && <img className="upload-preview" src={imgUrl} alt="Preview of the picture being added" />}
              <p className="hint" style={{ marginTop: 6 }}>
                Gallery standard: 1000 × 750 (4:3), WebP or JPEG, under about 120 KB. A 6 MB phone photo costs every
                guest data money — compress before uploading. Real photographs of this motel only, and empty the room
                first.
              </p>
              <label><span>Title</span><input required value={imgTitle} onChange={(e) => setImgTitle(e.target.value)} placeholder="e.g. Deluxe room — new curtains" /></label>
              {/* Alt text describes the SCENE, never the file. It is what a screen
                  reader reads out and what Google Images indexes (Part 5.6), so it is
                  asked for here rather than silently copied from the title. */}
              <label>
                <span>Alt text — describe the scene</span>
                <input
                  value={imgAlt}
                  onChange={(e) => setImgAlt(e.target.value)}
                  placeholder="e.g. Deluxe room with a king bed, work desk and a window onto the garden"
                />
                <small className="hint">
                  Never start with &quot;image of&quot; — the screen reader already says it is an image. Leave blank and the
                  title is used.
                </small>
              </label>
              <div className="form-grid-2">
                <label><span>Category</span><select value={imgCategory} onChange={(e) => setImgCategory(e.target.value)}><option>Rooms</option><option>Property</option><option>Dining</option><option>Events</option><option>Work</option></select></label>
                <label><span>Caption (optional)</span><input value={imgCaption} onChange={(e) => setImgCaption(e.target.value)} placeholder="Short caption" /></label>
              </div>
              <button type="submit" className="admin-btn admin-btn-primary admin-btn-wide" disabled={!imgUrl}><Plus size={15} /> Save to gallery</button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- ADD POST ---------------- */}
      {showAddPost && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddPost(false); }}>
          <div className="modal-dialog">
            <button className="modal-close-btn" onClick={() => setShowAddPost(false)}><X size={18} /></button>
            <div className="modal-head"><span className="eyebrow"><span className="eyebrow-line" /> POSTS & EVENTS</span><h2>Publish a post</h2></div>
            <form onSubmit={addPost} className="admin-modal-form">
              <label><span>Title</span><input required value={post.title} onChange={(e) => setPost({ ...post, title: e.target.value })} placeholder="e.g. Saturday lawn braai" /></label>
              <div className="form-grid-2">
                <label><span>Category</span><select value={post.category} onChange={(e) => setPost({ ...post, category: e.target.value })}><option>Event</option><option>Special</option><option>Offer</option><option>News</option></select></label>
                <label><span>Day / date</span><div className="mini-grid-2"><input value={post.day} onChange={(e) => setPost({ ...post, day: e.target.value })} placeholder="SAT" /><input value={post.date} onChange={(e) => setPost({ ...post, date: e.target.value })} placeholder="26" /></div></label>
              </div>
              <div className="form-grid-2">
                <label><span>Time</span><input value={post.time} onChange={(e) => setPost({ ...post, time: e.target.value })} placeholder="12:00 — 20:00" /></label>
                <label><span>Price tag</span><input value={post.priceTag} onChange={(e) => setPost({ ...post, priceTag: e.target.value })} placeholder="From MWK 22,000" /></label>
              </div>
              <label><span>Picture</span>
                <ImageUploader currentImage={post.imageUrl || null} onUploadComplete={(url) => setPost({ ...post, imageUrl: url })} />
                <select value={post.imageUrl} onChange={(e) => setPost({ ...post, imageUrl: e.target.value })} style={{ marginTop: 8 }}>
                  <option value="">…or choose from gallery</option>
                  {gallery.map((g) => <option key={g.id} value={g.imageUrl}>{g.title} ({g.category})</option>)}
                </select>
              </label>
              <label><span>Details</span><textarea required rows={3} value={post.detail} onChange={(e) => setPost({ ...post, detail: e.target.value })} placeholder="What, when, price and any terms…" /></label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={notifyAppUsers} onChange={(e) => setNotifyAppUsers(e.target.checked)} />
                <span>Also send push notification to app users</span>
              </label>
              <button type="submit" className="admin-btn admin-btn-primary admin-btn-wide"><Plus size={15} /> Publish</button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- AUDIT TRAIL ---------------- */}
      {tab === "audit" && (
        <section className="admin-content-section">
          <div className="audit-intro">
            <History size={18} />
            <div>
              <strong>Append-only audit trail</strong>
              <p>Every booking, invoice, picture, post, upload and login is recorded with actor, IP and Malawi time (CAT) and kept for future auditing. Records are never edited or deleted from here.</p>
            </div>
          </div>
          <div className="admin-search-row">
            <label className="admin-search">
              <Search size={16} />
              <input value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") loadAudit(); }} placeholder="Search audit: action, reference (SM-…), summary…" />
              {auditQuery && <button onClick={() => { setAuditQuery(""); }} aria-label="Clear search"><X size={14} /></button>}
            </label>
            <select className="audit-entity-filter" value={auditEntity} onChange={(e) => setAuditEntity(e.target.value)}>
              <option value="all">All records</option>
              <option value="booking">Bookings</option>
              <option value="invoice">Invoices</option>
              <option value="gallery">Pictures</option>
              <option value="post">Posts</option>
              <option value="upload">Uploads</option>
              <option value="auth">Logins</option>
            </select>
            <button className="admin-btn admin-btn-secondary" onClick={loadAudit}><Search size={14} /> Search</button>
            <button
              className="admin-btn"
              onClick={() => {
                const rows = [["time_cat", "action", "entity", "reference", "actor", "actor_label", "ip", "summary"]];
                for (const a of auditEntries) rows.push([when(a.createdAt), a.action, a.entity, a.reference ?? "", a.actor, a.actorLabel ?? "", a.ip ?? "", (a.summary ?? "").replace(/\s+/g, " ")]);
                const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "sunrise-audit-trail.csv";
                link.click();
                URL.revokeObjectURL(url);
              }}
            ><Download size={14} /> Export CSV</button>
          </div>
          {auditEntries.length === 0 ? (
            <div className="empty-state"><History size={34} /><p>No audit records yet — they appear here as bookings and manager actions happen.</p></div>
          ) : (
            <ol className="timeline audit-timeline">
              {auditEntries.map((a) => (
                <li key={a.id} className="tl-audit">
                  <span className="tl-dot" />
                  <div>
                    <strong>{a.action}</strong>
                    <span className="audit-entity-tag">{a.entity}{a.reference ? ` · ${a.reference}` : ""}</span>
                    {a.summary && <p>{a.summary}</p>}
                    <small>{when(a.createdAt)} · {a.actor}{a.actorLabel ? ` (${a.actorLabel})` : ""}{a.ip ? ` · ${a.ip}` : ""}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* ---------------- STAFF DIRECTORY ---------------- */}
      {tab === "staff" && isAdmin && (
        <section className="admin-content-section">
          <h2>User and invitation controls</h2>
          <p>Direct password creation is disabled. Use the invitation manager to grant access and audit all changes.</p>
          <Link className="admin-btn admin-btn-primary" href="/admin/users"><Users size={15} /> Open user management</Link>
        </section>
      )}
      {/* ---------------- ROOMS (admin only) ---------------- */}
      {tab === "rooms" && isMotelManager && (
        <section className="admin-content-section">
          <div className="section-toolbar">
            <div className="toolbar-info"><h2>Rooms / services</h2><p>Only admins can add, hide or remove these.</p></div>
          </div>
          <form onSubmit={addRoom} className="admin-modal-form admin-inline-form">
            <div className="form-grid-2">
              <label><span>ID (slug)</span><input value={roomForm.id} onChange={(e) => setRoomForm({ ...roomForm, id: e.target.value })} placeholder="e.g. executive" /></label>
              <label><span>Name *</span><input required value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} placeholder="e.g. Executive Suite" /></label>
            </div>
            <div className="form-grid-2">
              <label><span>Rate MWK/night *</span><input required type="number" value={roomForm.rate} onChange={(e) => setRoomForm({ ...roomForm, rate: e.target.value })} /></label>
              <label><span>Rooms of this type</span><input type="number" value={roomForm.totalInventory} onChange={(e) => setRoomForm({ ...roomForm, totalInventory: e.target.value })} /></label>
            </div>
            <div className="form-grid-2">
              <label><span>Weekend rate — Fri/Sat (MWK)</span><input type="number" value={roomForm.weekendPrice} onChange={(e) => setRoomForm({ ...roomForm, weekendPrice: e.target.value })} placeholder="blank = same as rate" /></label>
              <label><span>Extra bed (MWK)</span><input type="number" value={roomForm.extraBedPrice} onChange={(e) => setRoomForm({ ...roomForm, extraBedPrice: e.target.value })} /></label>
            </div>
            <div className="form-grid-2">
              <label><span>Cleaning fee (MWK)</span><input type="number" value={roomForm.cleaningFee} onChange={(e) => setRoomForm({ ...roomForm, cleaningFee: e.target.value })} /></label>
              <label><span>VAT %</span><input type="number" step="0.01" value={roomForm.taxPercent} onChange={(e) => setRoomForm({ ...roomForm, taxPercent: e.target.value })} /></label>
            </div>
            <div className="form-grid-2">
              <label><span>Minimum nights</span><input type="number" value={roomForm.minNights} onChange={(e) => setRoomForm({ ...roomForm, minNights: e.target.value })} /></label>
              <label><span>Weekly discount % (7+ nights)</span><input type="number" value={roomForm.weeklyDiscountPercent} onChange={(e) => setRoomForm({ ...roomForm, weeklyDiscountPercent: e.target.value })} /></label>
            </div>
            <div className="form-grid-2">
              <label><span>Monthly discount % (28+ nights)</span><input type="number" value={roomForm.monthlyDiscountPercent} onChange={(e) => setRoomForm({ ...roomForm, monthlyDiscountPercent: e.target.value })} /></label>
              <p style={{ fontSize: 12, opacity: 0.75, alignSelf: "end" }}>New quotes use these. Bookings already made keep the price they were made at.</p>
            </div>
            <button type="submit" className="admin-btn admin-btn-primary"><Plus size={15} /> Add room / service</button>
          </form>
          <div className="invoice-list">
            {roomsList.map((r) => (
              <div key={r.id} className="invoice-row">
                <div><strong>{r.name}</strong><small>{r.id} · MWK {r.rate.toLocaleString()}/night</small></div>
                <div><strong>{r.isActive ? "Live" : "Hidden"}</strong></div>
                <div className="invoice-actions">
                  <button className="btn-action" onClick={() => toggleRoom(r.id, !r.isActive)}>{r.isActive ? "Hide" : "Show"}</button>
                  <button className="btn-action btn-danger-text" onClick={() => removeRoom(r.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- REPORTS ---------------- */}
      {tab === "reports" && (
        <section className="admin-content-section">
          <div className="section-toolbar">
            <div className="toolbar-info"><h2>Reports</h2><p>Daily bookings PDF for the office, revenue CSV for Excel.</p></div>
          </div>
          <div className="inline-actions">
            <a className="admin-btn admin-btn-primary" href="/api/admin/reports" target="_blank" rel="noreferrer"><Printer size={15} /> Daily bookings (print / PDF)</a>
            <a className="admin-btn admin-btn-secondary" href="/api/admin/reports?format=csv" download><Download size={15} /> Revenue CSV (Excel)</a>
          </div>
        </section>
      )}
      <footer className="admin-foot"><ShieldCheck size={13} /> Staff-only portal · guests never see a login · <Users size={13} /> {bookingsList.length} guest records</footer>
      </div>
    </div>
  );
}
