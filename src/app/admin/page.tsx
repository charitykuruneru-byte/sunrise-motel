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
  Utensils,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminNavigation, AdminSection } from "@/components/admin/admin-navigation";
import ImageUploader from "@/components/ImageUploader";
import SafeImage from "@/components/safe-image";
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

type PostItem = { id: string; title: string; category: string; day: string | null; date: string | null; time: string | null; detail: string; priceTag: string | null; bookingAddonPrice: number | null; imageUrl: string | null; isActive: boolean };
type MenuAdminItem = { id: string; name: string; category: string; description: string; price: number; imageUrl: string; isAvailable: boolean; isSpecial: boolean };
type GalleryItem = { id: string; title: string; category: string; imageUrl: string; altText: string; caption: string | null; displayOrder: number };
type RoomAdminItem = { id: string; name: string; rate: number; weekendPrice?: number; totalInventory: number; isActive: boolean; images: string | string[] };
type AuditEntry = { id: string; action: string; entity: string; entityId: string | null; reference: string | null; summary: string | null; actor: string; actorLabel: string | null; ip: string | null; createdAt: string };

const STATUSES = ["pending", "awaiting_payment", "confirmed", "checked_in", "checked_out", "cancelled"];
const money = (v: number) => `MWK ${Math.round(v).toLocaleString("en-US")}`;
const roomImageUrls = (images: RoomAdminItem["images"]): string[] => {
  if (Array.isArray(images)) return images.filter((image): image is string => typeof image === "string" && image.length > 0);
  try {
    const parsed: unknown = JSON.parse(images);
    return Array.isArray(parsed) ? parsed.filter((image): image is string => typeof image === "string" && image.length > 0) : [];
  } catch (error) {
    console.error("Room images are not valid JSON.", error);
    return [];
  }
};
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
  const [tab, setTab] = useState<"overview" | "bookings" | "invoices" | "gallery" | "posts" | "menu" | "audit" | "staff" | "rooms" | "reports">("overview");
  const [busy, setBusy] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [toast, setToast] = useState("");

  const [bookingsList, setBookingsList] = useState<BookingItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsError, setPostsError] = useState("");
  const [menuItems, setMenuItems] = useState<MenuAdminItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState("");
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
  const [roomsList, setRoomsList] = useState<RoomAdminItem[]>([]);
  const [roomForm, setRoomForm] = useState({ id: "", name: "", rate: "", totalInventory: "3", weekendPrice: "", extraBedPrice: "", cleaningFee: "", taxPercent: "17.5", minNights: "1", weeklyDiscountPercent: "", monthlyDiscountPercent: "" });
  const [roomImages, setRoomImages] = useState<string[]>([]);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomAdminItem | null>(null);
  const [roomEditForm, setRoomEditForm] = useState({ rate: "", weekendPrice: "", totalInventory: "" });
  const [roomEditImages, setRoomEditImages] = useState<string[]>([]);
  const [roomBusy, setRoomBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookingSort, setBookingSort] = useState<"recent" | "checkIn" | "amount">("recent");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("all");
  const [invoiceSort, setInvoiceSort] = useState<"recent" | "oldest" | "amount">("recent");

  const [selected, setSelected] = useState<BookingItem | null>(null);
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [roomInput, setRoomInput] = useState("");
  const [paymentInput, setPaymentInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailState, setEmailState] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);

  const [showAddImage, setShowAddImage] = useState(false);
  const [editingImage, setEditingImage] = useState<GalleryItem | null>(null);
  const [imgTitle, setImgTitle] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [imgAlt, setImgAlt] = useState("");
  const [imgCategory, setImgCategory] = useState("Rooms");
  const [imgCaption, setImgCaption] = useState("");
  const [imgOrder, setImgOrder] = useState("0");
  const [imageUploading, setImageUploading] = useState(false);
  const [galleryQuery, setGalleryQuery] = useState("");
  const [galleryCategory, setGalleryCategory] = useState("all");
  const [gallerySort, setGallerySort] = useState<"order" | "title" | "category">("order");
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [galleryBusy, setGalleryBusy] = useState(false);

  const [showAddPost, setShowAddPost] = useState(false);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  const [post, setPost] = useState({ title: "", category: "Event", day: "SAT", date: "26", time: "12:00 — 20:00", detail: "", priceTag: "", bookingAddonPrice: "", imageUrl: "" });
  const [notifyAppUsers, setNotifyAppUsers] = useState(false);
  const [menuForm, setMenuForm] = useState({ name: "", category: "Mains", description: "", price: "", imageUrl: "/images/food-grill.jpg", isAvailable: true, isSpecial: false });
  const [editingMenuId, setEditingMenuId] = useState("");
  const [showMenuEditor, setShowMenuEditor] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuImageUploading, setMenuImageUploading] = useState(false);
  const menuEditTitleId = "menu-edit-dialog-title";

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

  useEffect(() => {
    const syncSection = () => {
      const requestedSection = new URLSearchParams(window.location.search).get("section");
      const validSections: AdminSection[] = ["overview", "bookings", "invoices", "gallery", "posts", "menu", "rooms", "reports"];
      if (requestedSection && validSections.includes(requestedSection as AdminSection)) {
        setTab(requestedSection as AdminSection);
      }
    };
    syncSection();
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);

  const selectTab = (nextTab: typeof tab) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("section", nextTab);
    window.history.replaceState(null, "", url);
  };

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
    if (isRestaurantManager) {
      setMenuLoading(true);
      setMenuError("");
      void (async () => {
        try {
          const menuResponse = await fetch("/api/admin/menu");
          const menuData = await menuResponse.json();
          if (!menuResponse.ok) throw new Error(menuData.error || "Could not load menu items.");
          setMenuItems(menuData.items ?? []);
        } catch (error) {
          console.error("Admin menu load failed", error);
          setMenuError(error instanceof Error ? error.message : "Could not load menu items.");
        } finally {
          setMenuLoading(false);
        }
      })();
    }
    try {
      const [b, i, g, p, a, d, r] = await Promise.all([fetch("/api/admin/bookings"), fetch("/api/admin/invoices"), fetch("/api/admin/gallery"), fetch("/api/admin/posts"), fetch("/api/admin/audit?limit=200"), fetch("/api/admin/dashboard"), fetch("/api/admin/reminders")]);
      const [bj, ij, gj, pj, aj, dj, rj] = await Promise.all([b.json(), i.json(), g.json(), p.json(), a.json(), d.json(), r.json()]);
      setBookingsList(bj.bookings ?? []);
      setInvoices(ij.invoices ?? []);
      setGallery(gj.images ?? []);
      if (!p.ok) {
        setPosts([]);
        setPostsError(pj.error || "Could not load posts.");
      } else {
        setPosts(pj.posts ?? []);
        setPostsError("");
      }
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
  }, [authed, isAdmin, isMotelManager, isRestaurantManager]);

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

  const openAddImage = () => {
    setEditingImage(null);
    setImgTitle("");
    setImgUrl("");
    setImgAlt("");
    setImgCategory("Rooms");
    setImgCaption("");
    setImgOrder(String(Math.max(0, ...gallery.map((image) => image.displayOrder ?? 0)) + 1));
    setShowAddImage(true);
  };

  const openEditImage = (image: GalleryItem) => {
    setEditingImage(image);
    setImgTitle(image.title);
    setImgUrl(image.imageUrl);
    setImgAlt(image.altText);
    setImgCategory(image.category);
    setImgCaption(image.caption ?? "");
    setImgOrder(String(image.displayOrder ?? 0));
    setShowAddImage(true);
  };

  const closeImageEditor = () => {
    setShowAddImage(false);
    setEditingImage(null);
  };

  const addImage = async (e: FormEvent) => {
    e.preventDefault();
    setGalleryBusy(true);
    try {
      const isEditing = editingImage !== null;
      const res = await fetch("/api/admin/gallery", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEditing ? { id: editingImage.id } : {}),
          title: imgTitle,
          imageUrl: imgUrl,
          category: imgCategory,
          caption: imgCaption,
          altText: imgAlt.trim() || imgTitle.trim(),
          displayOrder: Number(imgOrder),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.image) throw new Error(data.error || `Could not ${isEditing ? "save" : "add"} picture.`);
      setGallery((prev) => isEditing
        ? prev.map((image) => image.id === data.image.id ? data.image : image)
        : [...prev, data.image]);
      closeImageEditor();
      router.refresh();
      notify(isEditing ? "Picture changes saved" : "Picture added to the gallery");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save picture.");
    } finally {
      setGalleryBusy(false);
    }
  };

  const removeImage = async (id: string) => {
    const image = gallery.find((item) => item.id === id);
    if (!confirm(`Remove “${image?.title ?? "this picture"}” from the public gallery? This cannot be undone.`)) return;
    setGalleryBusy(true);
    try {
      const res = await fetch(`/api/admin/gallery?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove picture.");
      setGallery((prev) => prev.filter((g) => g.id !== id));
      setSelectedImageIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      router.refresh();
      notify(data.message || "Picture removed.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not remove picture.");
    } finally {
      setGalleryBusy(false);
    }
  };

  const removeSelectedImages = async () => {
    const ids = [...selectedImageIds];
    if (!ids.length || !confirm(`Remove ${ids.length} selected picture${ids.length === 1 ? "" : "s"} from the public gallery? This cannot be undone.`)) return;
    setGalleryBusy(true);
    try {
      const params = new URLSearchParams();
      ids.forEach((id) => params.append("id", id));
      const res = await fetch(`/api/admin/gallery?${params.toString()}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove selected pictures.");
      const removedIds = new Set(ids);
      setGallery((prev) => prev.filter((image) => !removedIds.has(image.id)));
      setSelectedImageIds(new Set());
      router.refresh();
      notify(data.message || `${data.removed} pictures removed.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not remove selected pictures.");
    } finally {
      setGalleryBusy(false);
    }
  };

  const openNewPost = () => {
    setEditingPost(null);
    setPost({ title: "", category: "Event", day: "SAT", date: "26", time: "12:00 — 20:00", detail: "", priceTag: "", bookingAddonPrice: "", imageUrl: "" });
    setNotifyAppUsers(false);
    setShowAddPost(true);
  };

  const openEditPost = (item: PostItem) => {
    setEditingPost(item);
    setPost({
      title: item.title,
      category: item.category,
      day: item.day ?? "",
      date: item.date ?? "",
      time: item.time ?? "",
      detail: item.detail,
      priceTag: item.priceTag ?? "",
      bookingAddonPrice: item.bookingAddonPrice === null ? "" : String(item.bookingAddonPrice),
      imageUrl: item.imageUrl ?? "",
    });
    setNotifyAppUsers(false);
    setShowAddPost(true);
  };

  const closePostEditor = () => {
    setShowAddPost(false);
    setEditingPost(null);
  };

  const addPost = async (e: FormEvent) => {
    e.preventDefault();
    const isEditing = editingPost !== null;
    try {
      const res = await fetch("/api/admin/posts", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...post,
          ...(isEditing ? { id: editingPost.id } : {}),
          bookingAddonPrice: post.category === "Offer" && post.bookingAddonPrice !== "" ? Number(post.bookingAddonPrice) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.post) throw new Error(data.error || `Could not ${isEditing ? "save" : "publish"} this post.`);
      setPosts((prev) => isEditing
        ? prev.map((item) => item.id === data.post.id ? data.post : item)
        : [data.post, ...prev]);
      closePostEditor();
      if (isEditing) {
        notify("Post and booking offer saved.");
        router.refresh();
        return;
      }
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
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save this post.");
    }
  };

  const saveMenuItem = async (event: FormEvent) => {
    event.preventDefault();
    setMenuBusy(true);
    try {
      const res = await fetch("/api/admin/menu", {
        method: editingMenuId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...menuForm, price: Number(menuForm.price), ...(editingMenuId ? { id: editingMenuId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error || "Could not save menu item.");
      setMenuItems((items) => editingMenuId
        ? items.map((item) => item.id === data.item.id ? data.item : item)
        : [...items, data.item].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
      setShowMenuEditor(false);
      setEditingMenuId("");
      setMenuForm({ name: "", category: "Mains", description: "", price: "", imageUrl: "/images/food-grill.jpg", isAvailable: true, isSpecial: false });
      notify(editingMenuId ? "Menu item updated." : "Menu item added.");
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save menu item.");
    } finally {
      setMenuBusy(false);
    }
  };

  const editMenuItem = (item: MenuAdminItem) => {
    setEditingMenuId(item.id);
    setShowMenuEditor(true);
    setMenuForm({
      name: item.name,
      category: item.category,
      description: item.description,
      price: String(item.price),
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      isSpecial: item.isSpecial,
    });
  };

  const addMenuItem = () => {
    setEditingMenuId("");
    setMenuForm({ name: "", category: "Mains", description: "", price: "", imageUrl: "/images/food-grill.jpg", isAvailable: true, isSpecial: false });
    setShowMenuEditor(true);
  };

  const closeMenuEditor = () => {
    if (menuBusy) return;
    setShowMenuEditor(false);
    setEditingMenuId("");
    setMenuForm({ name: "", category: "Mains", description: "", price: "", imageUrl: "/images/food-grill.jpg", isAvailable: true, isSpecial: false });
  };

  const toggleMenuAvailability = async (item: MenuAdminItem) => {
    try {
      const res = await fetch("/api/admin/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, isAvailable: !item.isAvailable }),
      });
      const data = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error || "Could not update item availability.");
      setMenuItems((items) => items.map((current) => current.id === item.id ? data.item : current));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update item availability.");
    }
  };

  const removeMenuItem = async (item: MenuAdminItem) => {
    if (!confirm(`Remove "${item.name}" from the menu? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/menu?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove menu item.");
      setMenuItems((items) => items.filter((current) => current.id !== item.id));
      if (editingMenuId === item.id) {
        setShowMenuEditor(false);
        setEditingMenuId("");
        setMenuForm({ name: "", category: "Mains", description: "", price: "", imageUrl: "/images/food-grill.jpg", isAvailable: true, isSpecial: false });
      }
      notify("Menu item removed.");
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not remove menu item.");
    }
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
    if (roomImages.length === 0) {
      notify("Select at least one room photo from Pictures before adding this room.");
      return;
    }
    setRoomBusy(true);
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...roomForm,
          rate: Number(roomForm.rate),
          totalInventory: Number(roomForm.totalInventory),
          images: roomImages,
          // The form speaks percent; the API stores basis points for hundredth-percent precision.
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
      if (!res.ok || !data.room) throw new Error(data.error || "Could not add room.");
      setRoomForm({ id: "", name: "", rate: "", totalInventory: "3", weekendPrice: "", extraBedPrice: "", cleaningFee: "", taxPercent: "17.5", minNights: "1", weeklyDiscountPercent: "", monthlyDiscountPercent: "" });
      setRoomImages([]);
      setShowAddRoom(false);
      notify(`Room added: ${data.room.name}.`);
      loadAll();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not add room.");
    } finally {
      setRoomBusy(false);
    }
  };

  const closeAddRoom = () => {
    if (roomBusy) return;
    setShowAddRoom(false);
    setRoomForm({ id: "", name: "", rate: "", totalInventory: "3", weekendPrice: "", extraBedPrice: "", cleaningFee: "", taxPercent: "17.5", minNights: "1", weeklyDiscountPercent: "", monthlyDiscountPercent: "" });
    setRoomImages([]);
  };

  const openRoomEditor = (room: RoomAdminItem) => {
    setEditingRoom(room);
    setRoomEditForm({
      rate: String(room.rate),
      weekendPrice: String(room.weekendPrice ?? 0),
      totalInventory: String(room.totalInventory),
    });
    setRoomEditImages(roomImageUrls(room.images));
  };

  const saveRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingRoom) return;
    setRoomBusy(true);
    try {
      const response = await fetch("/api/admin/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRoom.id,
          rate: Number(roomEditForm.rate),
          weekendPrice: Number(roomEditForm.weekendPrice) || 0,
          totalInventory: Number(roomEditForm.totalInventory),
          images: roomEditImages,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.room) throw new Error(data.error || "Could not update room.");
      setRoomsList((rooms) => rooms.map((room) => room.id === data.room.id ? data.room : room));
      setEditingRoom(null);
      notify(`${data.room.name} updated.`);
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update room.");
    } finally {
      setRoomBusy(false);
    }
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
    const matches = bookingsList.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (!q) return true;
      return [b.reference, b.bookingNumber ?? "", b.invoiceNumber ?? "", b.guestName, b.phone, b.email ?? "", b.roomType, b.assignedRoom ?? ""].some((value) => value.toLowerCase().includes(q));
    });
    return matches.sort((left, right) => {
      if (bookingSort === "checkIn") return left.checkIn.localeCompare(right.checkIn);
      if (bookingSort === "amount") return right.totalAmount - left.totalAmount;
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
  }, [bookingsList, query, statusFilter, bookingSort]);

  const filteredInvoices = useMemo(() => {
    const search = invoiceQuery.trim().toLowerCase();
    const matches = invoices.filter((invoice) => {
      if (invoiceStatus !== "all" && invoice.status.toLowerCase() !== invoiceStatus) return false;
      if (!search) return true;
      return [invoice.invoiceNumber, invoice.bookingRef, invoice.guestName, invoice.guestEmail ?? "", invoice.roomType]
        .some((value) => value.toLowerCase().includes(search));
    });
    return matches.sort((left, right) => {
      if (invoiceSort === "amount") return right.totalAmount - left.totalAmount;
      const dateOrder = Date.parse(left.createdAt) - Date.parse(right.createdAt);
      return invoiceSort === "oldest" ? dateOrder : -dateOrder;
    });
  }, [invoices, invoiceQuery, invoiceStatus, invoiceSort]);

  const filteredGallery = useMemo(() => {
    const search = galleryQuery.trim().toLocaleLowerCase();
    const matches = gallery.filter((image) => {
      if (galleryCategory !== "all" && image.category !== galleryCategory) return false;
      if (!search) return true;
      return [image.title, image.category, image.altText, image.caption ?? ""]
        .some((value) => value.toLocaleLowerCase().includes(search));
    });
    return matches.sort((left, right) => {
      if (gallerySort === "title") return left.title.localeCompare(right.title);
      if (gallerySort === "category") return left.category.localeCompare(right.category) || left.displayOrder - right.displayOrder;
      return left.displayOrder - right.displayOrder || left.title.localeCompare(right.title);
    });
  }, [gallery, galleryQuery, galleryCategory, gallerySort]);

  const toggleVisibleImageSelection = () => {
    setSelectedImageIds((previous) => {
      const next = new Set(previous);
      const allVisibleSelected = filteredGallery.length > 0 && filteredGallery.every((image) => next.has(image.id));
      filteredGallery.forEach((image) => allVisibleSelected ? next.delete(image.id) : next.add(image.id));
      return next;
    });
  };

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
  const renderRoomImagePicker = (selectedImages: string[], onSelectionChange: (url: string, checked: boolean) => void) => {
    const roomPictures = gallery.filter((image) => image.category === "Rooms");
    const unlistedCurrentImages = selectedImages
      .filter((url) => !roomPictures.some((image) => image.imageUrl === url))
      .map((url, index) => ({
        id: `current-room-image-${index}`,
        title: "Existing photo — not in Pictures",
        imageUrl: url,
        altText: "Existing room photo",
      }));
    const selectablePictures = [...roomPictures, ...unlistedCurrentImages];
    return (
      <fieldset className="room-image-picker">
        <legend>Room photos from Pictures</legend>
        <p>Select one or more room photos from the admin Pictures gallery. The first selected photo is used as the main room image.</p>
        {selectablePictures.length > 0 ? (
          <div className="room-image-picker-grid">
            {selectablePictures.map((image) => (
              <label key={image.id} className={selectedImages.includes(image.imageUrl) ? "selected" : ""}>
                <input
                  type="checkbox"
                  checked={selectedImages.includes(image.imageUrl)}
                  onChange={(event) => onSelectionChange(image.imageUrl, event.target.checked)}
                />
                <SafeImage src={image.imageUrl} alt={image.altText || image.title} width={240} height={150} />
                <span>{image.title}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="room-image-picker-empty">
            <span>No pictures are categorized as Rooms yet.</span>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => selectTab("gallery")}>Open Pictures</button>
          </div>
        )}
      </fieldset>
    );
  };
  const activeNavigationSection: AdminSection = ["overview", "bookings", "invoices", "gallery", "posts", "menu", "rooms", "reports"].includes(tab as AdminSection)
    ? (tab as AdminSection)
    : "overview";

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
      <div className="admin-shell">
        <AdminNavigation
          activeSection={activeNavigationSection}
          onSectionChange={selectTab}
          counts={{ bookings: bookingsList.length, invoices: invoices.length, gallery: gallery.length, posts: posts.length, menu: menuItems.length, rooms: roomsList.length, users: staffList.length }}
          canViewUsers={canViewUsers}
          isRestaurantManager={isRestaurantManager}
          isMotelManager={isMotelManager}
        />

        <main className="admin-main-panel">
      {tab === "overview" && (
      <>
      <section className="admin-dashboard-intro" aria-labelledby="admin-dashboard-heading">
        <div>
          <span className="admin-dashboard-eyebrow"><LayoutDashboard size={14} /> MANAGER OVERVIEW</span>
          <h1 id="admin-dashboard-heading">Good day{sessionUser?.name ? `, ${sessionUser.name.split(" ")[0]}` : ""}.</h1>
          <p>Bookings, money and property updates in one place.</p>
        </div>
        <div className={`admin-live-status ${busy ? "is-refreshing" : ""}`} aria-live="polite">
          <span className="admin-live-dot" />
          <span>{busy ? "Refreshing live records" : "Live records"}</span>
          <small>{busy ? "Updating bookings, invoices and activity" : "Malawi time · use Refresh to check again"}</small>
        </div>
      </section>

      <section className="admin-dashboard-categories" aria-label="Dashboard totals">
        <div className="admin-stat-category admin-stat-category-bookings">
          <div className="admin-stat-category-heading"><Calendar size={15} /><div><strong>Reservations</strong><small>Stay activity</small></div></div>
          <div className="admin-stats admin-stats-core">
            <div className="stat"><span>Total requests</span><strong>{stats.total}</strong></div>
            <div className="stat stat-warn"><span>Pending review{reminders && reminders.pendingCount > 0 ? ` (${reminders.pendingCount})` : ""}</span><strong>{stats.pending}</strong></div>
            <div className="stat stat-ok"><span>Confirmed / in-house</span><strong>{stats.confirmed}</strong></div>
          </div>
        </div>
        <div className="admin-stat-category admin-stat-category-money">
          <div className="admin-stat-category-heading"><CreditCard size={15} /><div><strong>Money</strong><small>Collections and balances</small></div></div>
          <div className="admin-stats admin-stats-core">
            <div className="stat stat-info"><span>Awaiting payment</span><strong>{stats.awaiting}</strong></div>
            <div className="stat"><span>Collected</span><strong>{money(stats.collected)}</strong></div>
            <div className="stat"><span>Outstanding</span><strong>{money(stats.outstanding)}</strong></div>
          </div>
        </div>
      </section>

      {dashboard && (
        <section className="admin-stat-category admin-stat-category-performance" aria-label="Performance by period">
          <div className="admin-stat-category-heading"><Flame size={15} /><div><strong>Performance</strong><small>Actual booking and revenue totals</small></div></div>
          <div className="admin-stats admin-stats-revenue">
            <div className="stat"><span>Today</span><strong>{dashboard.today.bookings} bookings</strong><em>{money(dashboard.today.revenue)} revenue</em></div>
            <div className="stat"><span>This week</span><strong>{dashboard.week.bookings} bookings</strong><em>{money(dashboard.week.revenue)} revenue</em></div>
            <div className="stat"><span>This month</span><strong>{dashboard.month.bookings} bookings</strong><em>{money(dashboard.month.revenue)} revenue</em></div>
            <div className="stat"><span>Paid bookings</span><strong>{dashboard.totals.paid}</strong><em>Collected {money(dashboard.totals.collected)}</em></div>
            <div className="stat stat-bad"><span>Cancelled loss</span><strong>{money(dashboard.totals.cancelledLoss)}</strong><em>{dashboard.totals.cancelled} cancelled</em></div>
          </div>
        </section>
      )}

      <section className="admin-action-center" aria-labelledby="admin-action-heading">
        <div className="admin-action-heading">
          <div><span className="admin-dashboard-eyebrow">NEXT ACTIONS</span><h2 id="admin-action-heading">What needs attention</h2></div>
          <span className="admin-action-total">Current records · refresh to update</span>
        </div>
        <div className="admin-action-grid">
          <button className="admin-action-card admin-action-card-warm" type="button" onClick={() => { selectTab("bookings"); setStatusFilter("pending"); }}>
            <span className="admin-action-icon"><Clock size={18} /></span>
            <span className="admin-action-copy"><strong>Review requests</strong><small>{reminders?.reminderDue.length ? `${reminders.reminderDue.length} waiting beyond the follow-up window` : "Pending guest bookings"}</small></span>
            <span className="admin-action-count">{stats.pending}</span>
          </button>
          <a className="admin-action-card admin-action-card-green" href="/desk?tab=money">
            <span className="admin-action-icon"><CreditCard size={18} /></span>
            <span className="admin-action-copy"><strong>Payments &amp; folios</strong><small>{stats.awaiting ? "Bookings still awaiting payment" : "Open the room-bill workspace"}</small></span>
            <span className="admin-action-count">{stats.awaiting}</span>
          </a>
          {canViewUsers && <a className="admin-action-card admin-action-card-ink" href="/admin/calendar">
            <span className="admin-action-icon"><BedDouble size={18} /></span>
            <span className="admin-action-copy"><strong>Room calendar</strong><small>{roomsList.filter((room) => room.isActive).length} active room types</small></span>
            <span className="admin-action-arrow">→</span>
          </a>}
          <button className="admin-action-card admin-action-card-content" type="button" onClick={() => selectTab("posts")}>
            <span className="admin-action-icon"><Flame size={18} /></span>
            <span className="admin-action-copy"><strong>Property updates</strong><small>{posts.filter((post) => post.isActive).length} live posts · {gallery.length} pictures</small></span>
            <span className="admin-action-arrow">→</span>
          </button>
        </div>
      </section>

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
      </>
      )}

          {/* ---------------- BOOKINGS ---------------- */}
          {tab === "bookings" && (
        <section className="admin-content-section">
          <div className="section-toolbar admin-bookings-toolbar">
            <div className="toolbar-info"><h2>Bookings</h2><p>Guest requests and stay progress.</p></div>
            <div className="admin-bookings-toolbar-meta">
              <span>{filtered.length} shown · {bookingsList.length} total</span>
              <label className="admin-booking-sort"><span>Sort</span>
                <select aria-label="Sort bookings" value={bookingSort} onChange={(event) => setBookingSort(event.target.value as typeof bookingSort)}>
                  <option value="recent">Newest request</option>
                  <option value="checkIn">Check-in soonest</option>
                  <option value="amount">Highest total</option>
                </select>
              </label>
            </div>
          </div>
          <div className="admin-search-row">
            <label className="admin-search">
              <Search size={16} />
              <input aria-label="Search bookings" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Booking or invoice number, guest, phone, email, room" />
              {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
            </label>
            <div className="filter-chips" role="group" aria-label="Filter bookings by status">
              {["all", ...STATUSES].map((s) => {
                const count = s === "all" ? bookingsList.length : bookingsList.filter((booking) => booking.status === s).length;
                return (
                  <button key={s} type="button" aria-pressed={statusFilter === s} className={statusFilter === s ? "active" : ""} onClick={() => setStatusFilter(s)}>
                    <span>{s === "all" ? "All" : s.replace("_", " ")}</span><em>{count}</em>
                  </button>
                );
              })}
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
          {invoices.length > 0 && (
            <div className="invoice-controls">
              <label className="admin-search">
                <Search size={16} />
                <input aria-label="Search invoices" value={invoiceQuery} onChange={(event) => setInvoiceQuery(event.target.value)} placeholder="Invoice number, booking reference, guest, email, or room" />
                {invoiceQuery && <button type="button" onClick={() => setInvoiceQuery("")} aria-label="Clear invoice search"><X size={14} /></button>}
              </label>
              <div className="invoice-filter-row">
                <div className="filter-chips" role="group" aria-label="Filter invoices by status">
                  {["all", "proforma", "sent", "paid", "cancelled"].map((status) => {
                    const count = status === "all" ? invoices.length : invoices.filter((invoice) => invoice.status.toLowerCase() === status).length;
                    return <button key={status} type="button" aria-pressed={invoiceStatus === status} className={invoiceStatus === status ? "active" : ""} onClick={() => setInvoiceStatus(status)}><span>{status === "all" ? "All" : status}</span><em>{count}</em></button>;
                  })}
                </div>
                <div className="admin-bookings-toolbar-meta">
                  <span>{filteredInvoices.length} shown · {invoices.length} total</span>
                  <label className="admin-booking-sort"><span>Sort</span>
                    <select aria-label="Sort invoices" value={invoiceSort} onChange={(event) => setInvoiceSort(event.target.value as typeof invoiceSort)}>
                      <option value="recent">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="amount">Highest total</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          )}
          {invoices.length === 0 ? (
            <div className="empty-state"><FileText size={34} /><p>No invoices yet.</p></div>
          ) : filteredInvoices.length === 0 ? (
            <div className="empty-state"><Search size={34} /><p>No invoices match these filters.</p></div>
          ) : (
            <div className="invoice-list">
              {filteredInvoices.map((inv) => (
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
                    <button className="btn-action btn-view" onClick={() => { const b = bookingsList.find((x) => x.reference === inv.bookingRef); if (b) { selectTab("bookings"); openBooking(b); } }}><Mail size={14} /> Email</button>
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
            <div className="toolbar-info"><h2>Pictures & gallery</h2><p>Manage the photos guests see across the website. Edit descriptions, group pictures, and set the order they appear.</p></div>
            {isMotelManager
              ? <button className="admin-btn admin-btn-primary" onClick={openAddImage}><Plus size={15} /> Add picture</button>
              : <small className="hint">Admins only — staff can view the gallery here.</small>}
          </div>

          <div className="gallery-admin-overview" aria-label="Gallery overview">
            <div><strong>{gallery.length}</strong><span>Total pictures</span></div>
            <div><strong>{new Set(gallery.map((image) => image.category)).size}</strong><span>Categories in use</span></div>
            <div><strong>{filteredGallery.length}</strong><span>Matching this view</span></div>
          </div>

          <div className="gallery-admin-controls">
            <label className="gallery-admin-search">
              <span className="sr-only">Search pictures</span>
              <Search size={16} aria-hidden="true" />
              <input type="search" value={galleryQuery} onChange={(event) => setGalleryQuery(event.target.value)} placeholder="Search title, caption or alt text" />
            </label>
            <label>
              <span className="sr-only">Filter by category</span>
              <select value={galleryCategory} onChange={(event) => setGalleryCategory(event.target.value)}>
                <option value="all">All categories</option>
                {["Rooms", "Property", "Dining", "Events", "Work"].map((category) => (
                  <option key={category} value={category}>{category} ({gallery.filter((image) => image.category === category).length})</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Sort pictures</span>
              <select value={gallerySort} onChange={(event) => setGallerySort(event.target.value as typeof gallerySort)}>
                <option value="order">Sort: website order</option>
                <option value="title">Sort: title A–Z</option>
                <option value="category">Sort: category</option>
              </select>
            </label>
          </div>

          {isMotelManager && gallery.length > 0 && (
            <div className="gallery-admin-bulkbar">
              <label>
                <input
                  type="checkbox"
                  checked={filteredGallery.length > 0 && filteredGallery.every((image) => selectedImageIds.has(image.id))}
                  onChange={toggleVisibleImageSelection}
                  aria-label="Select all visible pictures"
                />
                Select visible ({filteredGallery.length})
              </label>
              <span>{selectedImageIds.size} selected</span>
              <button className="btn-delete" onClick={removeSelectedImages} disabled={galleryBusy || selectedImageIds.size === 0}>
                <Trash2 size={13} /> Remove selected
              </button>
            </div>
          )}

          {filteredGallery.length === 0 ? (
            <div className="gallery-admin-empty">
              <ImageIcon size={24} aria-hidden="true" />
              <strong>{gallery.length === 0 ? "Your gallery is ready for its first picture" : "No pictures match these filters"}</strong>
              <p>{gallery.length === 0 ? "Add a real motel photo, then give it a clear title and description for guests." : "Try another search or category, or clear the filters to see all pictures."}</p>
              {gallery.length > 0 && <button className="admin-btn admin-btn-secondary" onClick={() => { setGalleryQuery(""); setGalleryCategory("all"); }}>Clear filters</button>}
              {gallery.length === 0 && isMotelManager && <button className="admin-btn admin-btn-primary" onClick={openAddImage}><Plus size={15} /> Add first picture</button>}
            </div>
          ) : (
          <div className="gallery-admin-grid">
            {filteredGallery.map((img) => (
              <article key={img.id} className={`gallery-admin-card ${selectedImageIds.has(img.id) ? "is-selected" : ""}`}>
                <div className="card-image-wrap">
                  <SafeImage src={img.imageUrl} alt={img.altText || img.title} width={1000} height={750} className="gallery-admin-photo" />
                  <span className="card-category-badge">{img.category}</span>
                  {isMotelManager && <label className="gallery-card-select"><input type="checkbox" checked={selectedImageIds.has(img.id)} onChange={() => setSelectedImageIds((prev) => { const next = new Set(prev); next.has(img.id) ? next.delete(img.id) : next.add(img.id); return next; })} aria-label={`Select ${img.title}`} /></label>}
                </div>
                <div className="card-body">
                  <div className="gallery-card-heading"><strong>{img.title}</strong><span>#{img.displayOrder}</span></div>
                  {img.caption && <p>{img.caption}</p>}
                  <small className="gallery-card-alt"><span>Image description</span>{img.altText || "Uses the title as its description."}</small>
                  {isMotelManager && <div className="card-actions"><button className="admin-btn admin-btn-secondary" onClick={() => openEditImage(img)}><FileText size={13} /> Edit details</button><button className="btn-delete" onClick={() => removeImage(img.id)} disabled={galleryBusy}><Trash2 size={13} /> Remove</button></div>}
                </div>
              </article>
            ))}
          </div>
          )}
        </section>
      )}

      {/* ---------------- POSTS ---------------- */}
      {tab === "posts" && (
        <section className="admin-content-section">
          <div className="section-toolbar">
            <div className="toolbar-info"><h2>Posts, events & offers</h2><p>Publish braai days, happy hour, match days and offers. Pause or delete anything that has passed.</p></div>
            {isRestaurantManager
              ? <button className="admin-btn admin-btn-primary" onClick={openNewPost}><Plus size={15} /> New post</button>
              : <small className="hint">Admins only — staff can view posts here.</small>}
          </div>
          {postsError && <div className="booking-error-banner" role="alert"><X size={14} /><span>{postsError}</span></div>}
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
                    {p.bookingAddonPrice !== null && <strong className="price-tag-badge">Booking add-on · {money(p.bookingAddonPrice)} / room-night</strong>}
                  </div>
                </div>
                {isRestaurantManager && (
                  <div className="post-admin-actions">
                    <button className="admin-btn admin-btn-secondary" onClick={() => openEditPost(p)}><FileText size={13} /> Edit details</button>
                    <button className={`btn-toggle ${p.isActive ? "btn-active" : "btn-paused"}`} onClick={() => togglePost(p)}>{p.isActive ? "Live" : "Paused"}</button>
                    <button className="btn-delete-post" onClick={() => removePost(p.id)}><Trash2 size={13} /> Delete</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- MENU MANAGEMENT ---------------- */}
      {tab === "menu" && isRestaurantManager && (
        <section className="admin-content-section">
          <div className="section-toolbar">
            <div className="toolbar-info">
              <h2>Restaurant menu &amp; prices</h2>
              <p>Prices are MWK per dish. Changes update the guest menu; front-desk staff can still only mark dishes sold out.</p>
            </div>
            <div className="inline-actions">
              <span className="admin-action-total">{menuItems.length} item{menuItems.length === 1 ? "" : "s"}</span>
              <button type="button" className="admin-btn admin-btn-primary" onClick={addMenuItem}><Plus size={14} /> Add menu item</button>
            </div>
          </div>
          {menuError && <div className="booking-error-banner" role="alert"><X size={14} /><span>{menuError}</span></div>}

          {menuLoading ? (
            <div className="empty-state" role="status"><Loader2 size={22} className="spin" /><p>Loading menu items…</p></div>
          ) : menuError ? null : menuItems.length === 0 ? (
            <div className="empty-state"><Utensils size={28} /><p>No menu items have been added yet.</p></div>
          ) : (
            <div className="invoice-list">
              {menuItems.map((item) => (
                <article key={item.id} className="invoice-row menu-admin-row">
                  <div className="menu-admin-item">
                    <SafeImage
                      src={item.imageUrl}
                      alt={`${item.name} meal`}
                      width={160}
                      height={120}
                      className="menu-admin-thumb"
                      fallbackLabel="Meal photo"
                    />
                    <div className="inv-main">
                      <strong>{item.name}{item.isSpecial ? " · Special" : ""}</strong>
                      <span>{item.category} · {item.description}</span>
                      <small>{item.isAvailable ? "Available to order" : "Sold out / unavailable"}</small>
                    </div>
                  </div>
                  <div className="inv-money"><strong>{money(item.price)}</strong><small>per item</small></div>
                  <div className="inv-actions">
                    <button className="admin-btn admin-btn-secondary" type="button" onClick={() => editMenuItem(item)}>Edit</button>
                    <button className="admin-btn" type="button" onClick={() => toggleMenuAvailability(item)}>{item.isAvailable ? "Mark sold out" : "Put back on sale"}</button>
                    <button className="btn-delete-post" type="button" onClick={() => removeMenuItem(item)}><Trash2 size={13} /> Remove</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {showMenuEditor && (
        <div
          className="modal-overlay"
          onClick={(event) => { if (event.target === event.currentTarget) closeMenuEditor(); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeMenuEditor();
            }
          }}
        >
          <div className="modal-dialog menu-edit-dialog" role="dialog" aria-modal="true" aria-labelledby={menuEditTitleId}>
            <button className="modal-close-btn" type="button" onClick={closeMenuEditor} aria-label="Close menu item editor" disabled={menuBusy}><X size={18} /></button>
            <div className="modal-head">
              <span className="eyebrow"><span className="eyebrow-line" /> RESTAURANT MENU</span>
              <h2 id={menuEditTitleId}>{editingMenuId ? "Edit menu item" : "Add a menu item"}</h2>
              <p>{editingMenuId ? "Update the dish details, price, photo, and availability. Changes will appear on the guest menu." : "Enter the dish details, price, and photo to add it to the guest menu."}</p>
            </div>
            <form onSubmit={saveMenuItem} className="admin-modal-form">
              <div className="form-grid-2">
                <label><span>Dish name *</span><input autoFocus required maxLength={160} value={menuForm.name} onChange={(event) => setMenuForm({ ...menuForm, name: event.target.value })} placeholder="e.g. Chambo with nsima" /></label>
                <label><span>Menu category *</span><input required maxLength={80} value={menuForm.category} onChange={(event) => setMenuForm({ ...menuForm, category: event.target.value })} placeholder="e.g. Mains, Drinks, Breakfast" /></label>
              </div>
              <div className="form-grid-2">
                <label><span>Price (MWK per item) *</span><input required type="number" min="0" max="50000000" step="1" inputMode="numeric" value={menuForm.price} onChange={(event) => setMenuForm({ ...menuForm, price: event.target.value })} placeholder="e.g. 18500" /></label>
                <label><span>Image path or HTTPS URL *</span><input required value={menuForm.imageUrl} onChange={(event) => setMenuForm({ ...menuForm, imageUrl: event.target.value })} placeholder="/images/food-grill.jpg" /></label>
              </div>
              <div className="menu-image-picker">
                <span className="admin-form-label">Dish photo</span>
                <p>Upload a new photo or choose an existing dining picture.</p>
                <ImageUploader
                  currentImage={menuForm.imageUrl}
                  previewAlt={menuForm.name || "Menu item photo"}
                  onUploadStateChange={setMenuImageUploading}
                  onUploadComplete={(url) => setMenuForm((current) => ({ ...current, imageUrl: url }))}
                />
                <label>
                  <span>Or use a picture from the gallery</span>
                  <select value="" onChange={(event) => {
                    const selectedImage = gallery.find((image) => image.id === event.target.value);
                    if (selectedImage) setMenuForm((current) => ({ ...current, imageUrl: selectedImage.imageUrl }));
                  }}>
                    <option value="">Choose a dining picture…</option>
                    {gallery.filter((image) => image.category === "Dining").map((image) => (
                      <option key={image.id} value={image.id}>{image.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label><span>Description *</span><textarea required maxLength={2000} rows={3} value={menuForm.description} onChange={(event) => setMenuForm({ ...menuForm, description: event.target.value })} placeholder="Describe ingredients, serving size, and what comes with the dish." /></label>
              <div className="inline-actions">
                <label><input type="checkbox" checked={menuForm.isAvailable} onChange={(event) => setMenuForm({ ...menuForm, isAvailable: event.target.checked })} /> Available to order</label>
                <label><input type="checkbox" checked={menuForm.isSpecial} onChange={(event) => setMenuForm({ ...menuForm, isSpecial: event.target.checked })} /> Mark as a special</label>
              </div>
              <div className="inline-actions menu-edit-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={closeMenuEditor} disabled={menuBusy}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={menuBusy || menuImageUploading}>
                  {menuBusy
                    ? <><Loader2 size={15} className="spin" /> Saving…</>
                    : editingMenuId
                      ? <><FileText size={14} /> Save menu changes</>
                      : <><Plus size={14} /> Add menu item</>}
                </button>
              </div>
            </form>
          </div>
        </div>
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
                  <div className="admin-form-label">Quick decision</div>
                  <div className="inline-actions" role="group" aria-label="Quick booking actions">
                    <button className="admin-btn admin-btn-primary" onClick={() => approveBooking(selected, "approve")}>Approve</button>
                    <button className="admin-btn admin-btn-secondary" onClick={() => approveBooking(selected, "confirm")}>Confirm</button>
                    <button className="admin-btn" onClick={() => approveBooking(selected, "follow_up")}><Send size={14} /> Follow-up</button>
                    <button className="admin-btn" onClick={() => extendBooking(selected)}>Extend stay</button>
                    {!isMotelManager && <small className="hint">Desk staff can approve, confirm, cancel and follow up; Motel Managers handle extensions and room controls.</small>}
                  </div>
                </div>
                <div className="admin-form-group">
                  <div className="admin-form-label">Status</div>
                  <div className="status-button-row" role="group" aria-label="Booking status">
                    {STATUSES.map((s) => (
                      <button key={s} type="button" aria-pressed={selected.status === s} className={`status-btn ${selected.status === s ? "active" : ""}`} disabled={!isManager && !["confirmed", "cancelled"].includes(s)} title={!isManager && !["confirmed", "cancelled"].includes(s) ? "Manager action" : undefined} onClick={() => patchBooking(selected.id, { status: s })}>{s.replace("_", " ")}</button>
                    ))}
                  </div>
                </div>
                {isMotelManager && (
                <div className="admin-form-group">
                  <label htmlFor="booking-room-input">Assign physical room (admin)</label>
                  <div className="input-with-button">
                    <input id="booking-room-input" value={roomInput} onChange={(e) => setRoomInput(e.target.value)} placeholder="e.g. Room 104" />
                    <button className="admin-btn admin-btn-primary" onClick={() => patchBooking(selected.id, { assignedRoom: roomInput })}>Save</button>
                  </div>
                </div>
                )}
                {isMotelManager && (
                <div className="admin-form-group">
                  <label htmlFor="booking-payment-input">Record payment received (MWK, admin)</label>
                  <div className="input-with-button">
                    <input id="booking-payment-input" type="number" min="0" step="1" value={paymentInput} onChange={(e) => setPaymentInput(e.target.value)} placeholder="e.g. 85000" />
                    <button className="admin-btn admin-btn-primary" onClick={() => patchBooking(selected.id, { amountPaid: Number(paymentInput) })}><CreditCard size={14} /> Record</button>
                  </div>
                  <small className="hint">Full payment automatically confirms the booking and turns the pro-forma into a receipt.</small>
                </div>
                )}
                <div className="admin-form-group">
                  <div className="admin-form-label">Invoice</div>
                  <div className="input-with-button">
                    <input id="booking-invoice-email" aria-label="Invoice recipient email" type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="guest@email.com" />
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
                  <div className="admin-form-label">Timeline</div>
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
                  <label htmlFor="booking-note-input">Add a manager note</label>
                  <div className="input-with-button">
                    <input id="booking-note-input" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="e.g. Guest called, arriving 21:00" />
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
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeImageEditor(); }}>
          <div className="modal-dialog modal-wide gallery-editor-dialog">
            <button className="modal-close-btn" onClick={closeImageEditor} aria-label="Close picture editor"><X size={18} /></button>
            <div className="modal-head"><span className="eyebrow"><span className="eyebrow-line" /> PICTURES & GALLERY</span><h2>{editingImage ? "Edit picture details" : "Add a picture"}</h2><p>Choose the photo, then decide how guests will find and understand it on the website.</p></div>
            <form onSubmit={addImage} className="admin-modal-form">
              <div className="gallery-editor-image">
                <ImageUploader currentImage={imgUrl || null} previewAlt={imgAlt || imgTitle || "Selected gallery picture"} onUploadStateChange={setImageUploading} onUploadComplete={(url) => { setImgUrl(url); if (!imgTitle) setImgTitle("Gallery photo"); notify("Photo uploaded — review its details, then save"); }} />
                <small>Use a clear, well-lit photo of the actual motel. Landscape images work best. Smaller WebP or JPEG files load faster for guests.</small>
                <label><span>Image URL</span><input required type="text" value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="Upload a photo above or paste a URL (https://…)" /><small>Choose an upload above, or paste the full address of an image already online.</small></label>
              </div>
              <div className="gallery-editor-fields">
                <label><span>Picture title <i>Shown to guests</i></span><input required maxLength={160} value={imgTitle} onChange={(e) => setImgTitle(e.target.value)} placeholder="e.g. Deluxe room with garden view" /><small>Use a short, specific name so guests know what they are looking at.</small></label>
                <label>
                  <span>Accessibility description <i>Optional · title used if blank</i></span>
                  <input maxLength={500} value={imgAlt} onChange={(e) => setImgAlt(e.target.value)} placeholder="e.g. King bed and work desk beside a window overlooking the garden" />
                  <small>Describe the important visual details. Do not start with “image of”; leave blank to use the title.</small>
                </label>
                <div className="form-grid-2">
                  <label><span>Website category</span><select value={imgCategory} onChange={(e) => setImgCategory(e.target.value)}><option>Rooms</option><option>Property</option><option>Dining</option><option>Events</option><option>Work</option></select><small>Helps visitors filter the public gallery.</small></label>
                  <label><span>Gallery position</span><input required type="number" min="0" step="1" value={imgOrder} onChange={(e) => setImgOrder(e.target.value)} /><small>Lower numbers appear earlier on the website.</small></label>
                </div>
                <label><span>Guest-facing caption <i>Optional</i></span><textarea maxLength={500} rows={3} value={imgCaption} onChange={(e) => setImgCaption(e.target.value)} placeholder="Add helpful context, such as the room type or a feature guests will notice." /><small>Keep it useful and brief (up to 500 characters).</small></label>
              </div>
              <div className="gallery-editor-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={closeImageEditor}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={!imgUrl.trim() || !imgTitle.trim() || galleryBusy || imageUploading}><FileText size={15} /> {galleryBusy ? "Saving…" : imageUploading ? "Photo uploading…" : editingImage ? "Save picture changes" : "Add picture to gallery"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- ADD POST ---------------- */}
      {showAddPost && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closePostEditor(); }}>
          <div className="modal-dialog">
            <button className="modal-close-btn" onClick={closePostEditor} aria-label="Close post editor"><X size={18} /></button>
            <div className="modal-head"><span className="eyebrow"><span className="eyebrow-line" /> POSTS & EVENTS</span><h2>{editingPost ? "Edit post or offer" : "Publish a post"}</h2></div>
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
              {post.category === "Offer" && (
                <label>
                  <span>Optional booking add-on (MWK per room-night)</span>
                  <input
                    type="number"
                    min="0"
                    max="50000000"
                    step="1"
                    inputMode="numeric"
                    value={post.bookingAddonPrice}
                    onChange={(e) => setPost({ ...post, bookingAddonPrice: e.target.value })}
                    placeholder="Leave blank if this is a display-only offer"
                  />
                  <small>Guests can select this when booking a room. The price is multiplied by the number of nights, per room. Enter 0 for a free booking add-on.</small>
                </label>
              )}
              <label><span>Picture</span>
                <ImageUploader currentImage={post.imageUrl || null} onUploadComplete={(url) => setPost({ ...post, imageUrl: url })} />
                <select value={post.imageUrl} onChange={(e) => setPost({ ...post, imageUrl: e.target.value })} style={{ marginTop: 8 }}>
                  <option value="">…or choose from gallery</option>
                  {gallery.map((g) => <option key={g.id} value={g.imageUrl}>{g.title} ({g.category})</option>)}
                </select>
              </label>
              <label><span>Details</span><textarea required rows={3} value={post.detail} onChange={(e) => setPost({ ...post, detail: e.target.value })} placeholder="What, when, price and any terms…" /></label>
              {!editingPost && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={notifyAppUsers} onChange={(e) => setNotifyAppUsers(e.target.checked)} />
                <span>Also send push notification to app users</span>
              </label>}
              <button type="submit" className="admin-btn admin-btn-primary admin-btn-wide">
                {editingPost ? <><FileText size={15} /> Save changes</> : <><Plus size={15} /> Publish</>}
              </button>
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
            <div className="toolbar-info"><h2>Rooms / services</h2><p>Manage room rates and connect room photos from the Pictures gallery. New prices apply to future bookings.</p></div>
            <button type="button" className="admin-btn admin-btn-primary" onClick={() => setShowAddRoom(true)}><Plus size={15} /> Add room</button>
          </div>
          {showAddRoom && (
          <div
            className="modal-overlay"
            onClick={(event) => { if (event.target === event.currentTarget) closeAddRoom(); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeAddRoom();
              }
            }}
          >
          <div className="modal-dialog room-edit-dialog room-add-dialog" role="dialog" aria-modal="true" aria-labelledby="room-add-dialog-title">
          <button className="modal-close-btn" type="button" onClick={closeAddRoom} aria-label="Close add room form" disabled={roomBusy}><X size={18} /></button>
          <div className="modal-head">
            <span className="eyebrow"><span className="eyebrow-line" /> ROOM SETUP</span>
            <h2 id="room-add-dialog-title">Add a room or service</h2>
            <p>Set the room type, nightly prices, inventory, and select its photos from the Pictures gallery.</p>
          </div>
          <form onSubmit={addRoom} className="admin-modal-form">
            <div className="form-grid-2">
              <label><span>ID (slug)</span><input autoFocus value={roomForm.id} onChange={(e) => setRoomForm({ ...roomForm, id: e.target.value })} placeholder="e.g. executive" /></label>
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
            {renderRoomImagePicker(roomImages, (url, checked) => {
              setRoomImages((selected) => checked
                ? selected.includes(url) ? selected : [...selected, url]
                : selected.filter((imageUrl) => imageUrl !== url));
            })}
            <div className="inline-actions menu-edit-actions">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={closeAddRoom} disabled={roomBusy}>Cancel</button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={roomBusy}>
                {roomBusy ? <><Loader2 size={15} className="spin" /> Adding room…</> : <><Plus size={15} /> Add room / service</>}
              </button>
            </div>
          </form>
          </div>
          </div>
          )}
          <div className="room-admin-grid">
            {roomsList.map((r) => {
              const images = roomImageUrls(r.images);
              const galleryImageCount = images.filter((url) => gallery.some((image) => image.category === "Rooms" && image.imageUrl === url)).length;
              const unlistedImageCount = images.length - galleryImageCount;
              return (
                <article key={r.id} className="room-admin-card">
                  <SafeImage src={images[0]} alt={`${r.name} at Sunrise Motel`} width={640} height={360} className="room-admin-photo" fallbackLabel="Add room photos from Pictures" />
                  <div className="room-admin-card-content">
                    <div className="room-admin-card-heading">
                      <div><h3>{r.name}</h3><small>{r.id} · {r.totalInventory} room{r.totalInventory === 1 ? "" : "s"} in this type</small></div>
                      <span className={r.isActive ? "room-live-status" : "room-live-status hidden"}>{r.isActive ? "Live" : "Hidden"}</span>
                    </div>
                    <strong className="room-admin-rate">{money(r.rate)} <span>/ night</span></strong>
                    {(r.weekendPrice ?? 0) > 0 && <small className="room-admin-weekend">Weekend · {money(r.weekendPrice ?? 0)} / night</small>}
                    <small>{galleryImageCount} picture{galleryImageCount === 1 ? "" : "s"} linked from Pictures{unlistedImageCount > 0 ? ` · ${unlistedImageCount} existing photo${unlistedImageCount === 1 ? "" : "s"}` : ""}</small>
                    <div className="room-admin-actions">
                      <button type="button" className="admin-btn admin-btn-secondary" onClick={() => openRoomEditor(r)}>Edit price &amp; photos</button>
                      <button type="button" className="admin-btn" onClick={() => toggleRoom(r.id, !r.isActive)}>{r.isActive ? "Hide" : "Show"}</button>
                      <button type="button" className="btn-delete-post" onClick={() => removeRoom(r.id)}>Remove</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {editingRoom && (
        <div
          className="modal-overlay"
          onClick={(event) => { if (event.target === event.currentTarget && !roomBusy) setEditingRoom(null); }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !roomBusy) {
              event.preventDefault();
              setEditingRoom(null);
            }
          }}
        >
          <div className="modal-dialog room-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="room-edit-dialog-title">
            <button className="modal-close-btn" type="button" onClick={() => !roomBusy && setEditingRoom(null)} aria-label="Close room editor" disabled={roomBusy}><X size={18} /></button>
            <div className="modal-head">
              <span className="eyebrow"><span className="eyebrow-line" /> ROOM PRICING &amp; PHOTOS</span>
              <h2 id="room-edit-dialog-title">Edit {editingRoom.name}</h2>
              <p>Update rates and link room photos from the admin Pictures gallery. New prices apply to future quotes; existing bookings keep their agreed price.</p>
            </div>
            <form className="admin-modal-form" onSubmit={saveRoom}>
              <div className="form-grid-2">
                <label><span>Standard rate (MWK per night) *</span><input autoFocus required type="number" min="1" max="50000000" step="1" value={roomEditForm.rate} onChange={(event) => setRoomEditForm({ ...roomEditForm, rate: event.target.value })} /></label>
                <label><span>Weekend rate (MWK per night)</span><input type="number" min="0" max="50000000" step="1" value={roomEditForm.weekendPrice} onChange={(event) => setRoomEditForm({ ...roomEditForm, weekendPrice: event.target.value })} /><small>Enter 0 to use the standard rate.</small></label>
              </div>
              <label><span>Rooms available in this type</span><input required type="number" min="1" max="1000" step="1" value={roomEditForm.totalInventory} onChange={(event) => setRoomEditForm({ ...roomEditForm, totalInventory: event.target.value })} /></label>
              {renderRoomImagePicker(roomEditImages, (url, checked) => {
                setRoomEditImages((selected) => checked
                  ? selected.includes(url) ? selected : [...selected, url]
                  : selected.filter((imageUrl) => imageUrl !== url));
              })}
              <div className="inline-actions menu-edit-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setEditingRoom(null)} disabled={roomBusy}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={roomBusy}>
                  {roomBusy ? <><Loader2 size={15} className="spin" /> Saving…</> : <><FileText size={14} /> Save room changes</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- REPORTS ---------------- */}
          {tab === "reports" && (
            <section className="admin-content-section admin-reports-page">
              <div className="section-toolbar admin-reports-heading">
                <div className="toolbar-info">
                  <span className="admin-dashboard-eyebrow">OPERATIONS REPORTS</span>
                  <h2>Reports &amp; exports</h2>
                  <p>Choose a register to print or export for your records.</p>
                </div>
              </div>

              <div className="report-summary" aria-label="Current booking totals">
                <div><span>Bookings</span><strong>{stats.total}</strong></div>
                <div><span>Collected</span><strong>{money(stats.collected)}</strong></div>
                <div><span>Outstanding</span><strong>{money(stats.outstanding)}</strong></div>
              </div>

              <div className="report-grid">
                <article className="report-card">
                  <span className="report-card-icon"><Calendar size={17} /></span>
                  <h3>Booking register</h3>
                  <p>Guest details, room, stay dates, status, and payment balances.</p>
                  <small>{stats.total} booking record{stats.total === 1 ? "" : "s"} · {money(stats.collected)} collected</small>
                  <div className="report-card-actions">
                    <a className="admin-btn admin-btn-secondary" href="/api/admin/reports" target="_blank" rel="noreferrer"><Printer size={14} /> Print / PDF</a>
                    <a className="admin-btn admin-btn-primary" href="/api/admin/reports?format=csv" download><Download size={14} /> CSV</a>
                  </div>
                </article>

                <article className="report-card">
                  <span className="report-card-icon report-card-icon-green"><CreditCard size={17} /></span>
                  <h3>Night audit</h3>
                  <p>Stored daily occupancy, room and POS revenue, expenses, and net totals.</p>
                  <small>Closed days · latest totals first</small>
                  <div className="report-card-actions">
                    <a className="admin-btn admin-btn-secondary" href="/api/admin/reports?report=night-audit" target="_blank" rel="noreferrer"><Printer size={14} /> Print / PDF</a>
                    <a className="admin-btn admin-btn-primary" href="/api/admin/reports?report=night-audit&amp;format=csv" download><Download size={14} /> CSV</a>
                  </div>
                </article>

                <article className="report-card">
                  <span className="report-card-icon report-card-icon-bronze"><FileText size={17} /></span>
                  <h3>Expense ledger</h3>
                  <p>Recorded expenses with category, date, payment method, and approver.</p>
                  <small>All expense entries · newest first</small>
                  <div className="report-card-actions">
                    <a className="admin-btn admin-btn-secondary" href="/api/admin/reports?report=expenses" target="_blank" rel="noreferrer"><Printer size={14} /> Print / PDF</a>
                    <a className="admin-btn admin-btn-primary" href="/api/admin/reports?report=expenses&amp;format=csv" download><Download size={14} /> CSV</a>
                  </div>
                </article>
              </div>
            </section>
          )}
          <footer className="admin-foot"><ShieldCheck size={13} /> Staff-only portal · guests never see a login · <Users size={13} /> {bookingsList.length} guest records</footer>
        </main>
      </div>
    </div>
  </div>
  );
}
