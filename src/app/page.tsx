"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  BedDouble,
  BriefcaseBusiness,
  Calendar,
  CalendarCheck,
  Camera,
  CarFront,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Compass,
  Download,
  Layers,
  Loader2,
  MapPin,
  MessageCircle,
  Minus,
  MoveRight,
  Pause,
  Phone,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Waves,
  Wifi,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import InstallAppButton from "@/components/install-app";
import InstallAppPopup from "@/components/InstallAppPopup";
import Reveal from "@/components/reveal";
import SafeImage from "@/components/safe-image";
import SiteNav from "@/components/site-nav";
import StickyStayBar from "@/components/sticky-stay-bar";
import { PageLoadingSplash, SunriseFullLogo } from "@/components/sunrise-logo";
import { HERO_IMAGE, HERO_VIDEO } from "@/lib/media-catalog";

// The landing page's own design system, imported HERE and not in the root layout
// so it rides only on the route that needs it: every rule inside is `hp-`-
// prefixed or scoped to `.hp-root`, and no other page in `src/` renders a single
// one of those classes. Imported here it still lands after the sheets the layout
// loads (globals → inner-pages → enhancements → site-nav → animations), which is
// the layering the file was written for. Typography stays on the system stack on
// purpose: a self-hosted webfont is a nice-to-have, a render-blocking font
// request on a prepaid bundle is not — and Georgia is the fallback it assumes.
import "./home-premium.css";

export const dynamic = "force-dynamic";

type RoomData = {
  id: string;
  name: string;
  slug: string;
  description: string;
  rate: number;
  totalInventory: number;
  bookedCount: number;
  availableCount: number;
  isSoldOut: boolean;
  statusText: string;
  bed: string;
  sleeps: string;
  size: string;
  badge?: string | null;
  features: string[];
  images: string[];
};

type PostData = { id: string; title: string; category: string; day: string | null; date: string | null; time: string | null; detail: string; priceTag: string | null; imageUrl: string | null; isActive: boolean };
/** One photograph as /api/admin/gallery returns it (its GET is public read). */
type GalleryImageData = { id: string; title: string; category: string; imageUrl: string; altText: string; caption: string | null };
/** A published review exactly as /api/reviews returns it. */
type ReviewData = {
  id: string;
  guestName: string;
  stayMonth: string | null;
  rating: number;
  comment: string | null;
  source: string;
  isFeatured: boolean;
};


const formatMoney = (value: number) => `MWK ${Math.round(value).toLocaleString("en-US")}`;

function getNights(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return 1;
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function isoPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The nights stepper counts from the GUEST'S check-in date, which `isoPlus`
 * (today-relative) cannot do. Built from the local calendar getters rather than
 * `toISOString()`, so a guest in a timezone ahead of UTC does not lose a day.
 */
function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** One night is the shortest real stay; thirty is where a phone booking stops. */
const MIN_NIGHTS = 1;
const MAX_NIGHTS = 30;

const WA = "https://wa.me/265998688332?text=";

/**
 * THE FOUR WAYS (redesign §2.5) — the copy lives here, the photographs are of
 * this actual property, and each card is ONE anchor wrapping the whole card: no
 * nested links, no duplicate targets, one clean stop for the keyboard.
 */
const WAYS = [
  {
    n: "01",
    title: "Stay",
    body: "Rooms with space to exhale — Standard, Deluxe and Twin, from MWK 85 000 a night.",
    cta: "Explore rooms",
    href: "/stay",
    img: "/media/organized/room_deluxe/listing-12.jpg",
    alt: "A Deluxe room at Sunrise Motel: the four-poster bed under its mosquito net, net drawn back over the pillows",
    icon: BedDouble,
  },
  {
    n: "02",
    title: "Dine",
    body: "Grilled favourites, nsima and beef, chambo, garden salads, and something cold.",
    cta: "See the menu",
    href: "/dine",
    img: "/images/food-grill.jpg",
    alt: "A grilled plate served at Sunrise Motel's kitchen, with salad on the side",
    icon: Utensils,
  },
  {
    n: "03",
    title: "Unwind",
    body: "Braai days, happy hour by the pool, match days on the big screen.",
    cta: "What's on",
    href: "/unwind",
    img: "/images/drinks-poolside.jpg",
    alt: "Cold drinks on the terrace beside the pool in the afternoon sun",
    icon: Waves,
  },
  {
    n: "04",
    title: "Connect",
    body: "Coffee, power, a quiet table and Starlink Wi-Fi that keeps up.",
    cta: "Find your flow",
    href: "/connect",
    img: "/images/workspace-coffee.jpg",
    alt: "A quiet table by the window with a laptop, a notebook and a cup of coffee",
    icon: BriefcaseBusiness,
  },
] as const;

/**
 * THE SHOWCASE — the photographs that came with the four ways, the kitchen, the
 * bar and the workspace, collected in one place so a guest can see what we
 * actually have without opening five pages.
 *
 * Two rules, both inherited from the image standard (Part 5.4-5.9): every
 * picture is of THIS property, and the slideshow only ever holds one of them in
 * the DOM at a time — the next one is fetched just before it is needed — so
 * scrolling past it cannot spend a prepaid bundle on photographs nobody looked
 * at.
 */
type ShowcaseChapter = "Stay" | "Dine" | "Unwind" | "Connect" | "The property";

const SHOWCASE_FILTERS = ["Everything", "Stay", "Dine", "Unwind", "Connect", "The property"] as const;

const SHOWCASE: { src: string; alt: string; title: string; caption: string; chapter: ShowcaseChapter }[] = [
  // --- Stay -----------------------------------------------------------------
  {
    src: "/media/organized/room_deluxe/listing-12.jpg",
    alt: "The four-poster double bed in a Sunrise Motel deluxe room, with the mosquito net drawn back",
    title: "The Deluxe",
    caption: "A four-poster bed under a drawn-back net, polished floors and room either side of it — 32 m² for a slow weekend.",
    chapter: "Stay",
  },
  {
    src: "/media/organized/room_standard/691294046.jpg",
    alt: "A standard room at Sunrise Motel: the double bed with its wardrobe and armchair on polished wooden floors",
    title: "The Standard",
    caption: "Standard, Deluxe and Twin, from MWK 85 000 a night — the rate you are quoted is the rate you pay.",
    chapter: "Stay",
  },
  {
    src: "/images/twin-main.jpg",
    alt: "The Twin room at Sunrise Motel with two single beds and space to move between them",
    title: "The Twin",
    caption: "Two proper single beds and room to spread out — colleagues, friends or family.",
    chapter: "Stay",
  },
  {
    src: "/images/bathroom.jpg",
    alt: "An en-suite bathroom at Sunrise Motel with a walk-in shower and hot water",
    title: "Hot water, every room",
    caption: "En-suite bathroom, a walk-in shower, and pressure that holds up at half past six in the morning.",
    chapter: "Stay",
  },

  // --- Dine -----------------------------------------------------------------
  {
    src: "/images/food-nsima-beef.jpg",
    alt: "Nsima and beef stew served at Sunrise Motel, the house classic",
    title: "Nsima and beef stew",
    caption: "The house classic — the plate most guests order again before they leave.",
    chapter: "Dine",
  },
  {
    src: "/images/dine-roast-beef.jpg",
    alt: "Roast beef carved at Sunrise Motel, served with potatoes and greens",
    title: "Roast beef, carved at the pass",
    caption: "Served with potatoes and greens, and it arrives hot because the kitchen is ten steps away.",
    chapter: "Dine",
  },
  {
    src: "/images/dine-mutton-curry.jpg",
    alt: "Mutton curry and rice served at Sunrise Motel",
    title: "Mutton curry",
    caption: "Slow-cooked until it gives, with rice or nsima — the one to order when it is cold outside.",
    chapter: "Dine",
  },
  {
    src: "/images/food-chambo.jpg",
    alt: "Grilled chambo fish plated at Sunrise Motel",
    title: "Chambo from the lake",
    caption: "Lake Malawi fish, grilled to order rather than sitting under a lamp.",
    chapter: "Dine",
  },
  {
    src: "/images/breakfast-full.jpg",
    alt: "A full breakfast plate served at Sunrise Motel in the morning",
    title: "Breakfast from seven",
    caption: "The kitchen opens at 07:00. Breakfast is cooked and served, not pointed at from across the room.",
    chapter: "Dine",
  },

  // --- Unwind ---------------------------------------------------------------
  {
    src: "/images/unwind-braai-chef.jpg",
    alt: "A chef working the fire on a braai day at Sunrise Motel",
    title: "Braai day, chef on the fire",
    caption: "Flagship braai days through the year — the fire is lit, the meat goes on, and the smoke does the advertising.",
    chapter: "Unwind",
  },
  {
    src: "/images/unwind-happy-hour-board.jpg",
    alt: "The happy hour board by the bar at Sunrise Motel with the day's drinks prices",
    title: "Happy hour, written up",
    caption: "The prices on the board are the prices at the bar — same numbers, no small print.",
    chapter: "Unwind",
  },
  {
    src: "/media/organized/event/match-day.jpg",
    alt: "Guests watching a football match on the big screen at Sunrise Motel",
    title: "Match day on the big screen",
    caption: "Platters, drinks specials and the game — the one night the bar is louder than the road.",
    chapter: "Unwind",
  },
  {
    src: "/media/organized/bar/520576151.jpg",
    alt: "The bar at Sunrise Motel: guests at the counter under the SuperSport and Manchester United flags",
    title: "The bar, after work",
    caption: "Stools at the counter, the shelf behind it and the big screen above — where the evening starts.",
    chapter: "Unwind",
  },
  {
    src: "/images/night-terrace.jpg",
    alt: "The terrace at Sunrise Motel after dark, tables and chairs under warm lights",
    title: "The terrace after dark",
    caption: "Tables, warm lights and the bar a few steps away — this is where the evening actually happens.",
    chapter: "Unwind",
  },

  // --- Connect --------------------------------------------------------------
  {
    src: "/images/workspace-coffee.jpg",
    alt: "A quiet table by the window at Sunrise Motel with a laptop, a notebook and a cup of coffee",
    title: "A quiet table, from seven",
    caption: "Coffee, power and a chair that does not punish a long morning of work.",
    chapter: "Connect",
  },
  {
    src: "/media/organized/building_interior/connect-coffee-snacks.jpg",
    alt: "Sunrise Motel's own board by reception: fuel up with Sunrise coffee, stay connected with fast Starlink internet, try our coffee and snacks",
    title: "Coffee & Starlink, in our own words",
    caption: "The board by reception says it in one line: the coffee, the fast Starlink and the quiet table to use them at.",
    chapter: "Connect",
  },
  {
    src: "/images/connect-hospitality-team.jpg",
    alt: "The Sunrise Motel team on the floor, looking after guests",
    title: "Someone walks past often enough",
    caption: "You should never have to go looking for a person — that is the whole job.",
    chapter: "Connect",
  },

  // --- The property ---------------------------------------------------------
  {
    src: "/images/reception.jpg",
    alt: "The welcome desk at Sunrise Motel, lit and staffed",
    title: "The welcome desk",
    caption: "Manned all night: if you are arriving late, say so and the desk keeps your key.",
    chapter: "The property",
  },
  {
    src: "/images/courtyard.jpg",
    alt: "The open-air courtyard at Sunrise Motel",
    title: "The courtyard",
    caption: "Open air, shaded by the afternoon and warm by night — the middle of the building.",
    chapter: "The property",
  },
  {
    src: "/images/lobby-lights.jpg",
    alt: "The lounge at Sunrise Motel with warm hanging lights in the evening",
    title: "Warm evenings in the lounge",
    caption: "Hanging lights, a low table and no rush to go anywhere.",
    chapter: "The property",
  },
];

export default function HomePage() {
  const [checkIn, setCheckIn] = useState(isoPlus(1));
  // ONE night, not two: a booking starts at the shortest stay there is and the
  // guest taps + to add more (`changeNights` below).
  const [checkOut, setCheckOut] = useState(isoPlus(2));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);

  const [rooms, setRooms] = useState<RoomData[]>([]);
  // Starts TRUE, not false: the first paint has no rooms yet, and while
  // `totalRoomsFree` is 0 the hero badge announced "Fully booked for these
  // dates" for a frame before the real numbers arrived.
  const [loadingRooms, setLoadingRooms] = useState(true);
  // A failed call used to be swallowed (console only) and the section fell back
  // to "Rooms are loading…" — which reads as a slow load, not a fault, and
  // stayed there for ever because `finally` had already cleared the spinner.
  const [roomsError, setRoomsError] = useState("");
  const [posts, setPosts] = useState<PostData[]>([]);

  const [slideshow, setSlideshow] = useState<{ room: RoomData; index: number } | null>(null);

  const [bookingRoom, setBookingRoom] = useState<RoomData | null>(null);
  const [step, setStep] = useState<"form" | "done">("form");
  const [result, setResult] = useState<{ reference: string; invoiceUrl: string; trackUrl: string; total: number; emailNote: string | null } | null>(null);
  const [bookingError, setBookingError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [breakfastQty, setBreakfastQty] = useState(0);
  const [transfer, setTransfer] = useState(false);
  const [lateCheckout, setLateCheckout] = useState(false);

  const nights = useMemo(() => getNights(checkIn, checkOut), [checkIn, checkOut]);

  /**
   * THE NIGHTS STEPPER. The guest sets the stay one night at a time, starting at
   * ONE, and check-out is DERIVED here and never typed — so the two can never
   * disagree: one more night simply pushes the departure date along.
   */
  const changeNights = (next: number) => {
    const wanted = Math.min(MAX_NIGHTS, Math.max(MIN_NIGHTS, next));
    setCheckOut(addDaysIso(checkIn, wanted));
  };

  const fetchAvailability = async (inDate: string, outDate: string) => {
    setLoadingRooms(true);
    setRoomsError("");
    try {
      // `no-store`: availability is the one thing on this page that must never
      // come out of a cache. The response is then CHECKED rather than assumed —
      // a 500 carries a JSON body that is not a room list, and treating it as
      // one is what left this page saying "Rooms are loading…" for ever.
      const res = await fetch(`/api/availability?checkIn=${inDate}&checkOut=${outDate}`, { cache: "no-store" });
      const data: { rooms?: RoomData[]; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Availability check failed (${res.status}).`);
      const list = Array.isArray(data.rooms) ? data.rooms : [];
      setRooms(list);
      if (list.length === 0) setRoomsError("No rooms came back for these dates. Try other dates, or WhatsApp the front desk.");
    } catch (e) {
      console.error(e);
      setRoomsError(e instanceof Error ? e.message : "Could not load rooms. Check your connection and try again.");
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchAvailability(checkIn, checkOut);
  }, [checkIn, checkOut]);

  // ---- The gallery strip, the app banner, the promos (redesign §2.7-§2.11) ----
  // All three read data the property already publishes; none of them is a
  // second copy of anything, and each one hides itself when it has nothing
  // honest to show.
  const [gallery, setGallery] = useState<GalleryImageData[]>([]);
  const [appBannerOpen, setAppBannerOpen] = useState(true);

  useEffect(() => {
    // GET on /api/admin/gallery is public read — the same set the gallery page
    // shows. Only the mutations behind it need a manager.
    fetch("/api/admin/gallery", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGallery((d.images ?? []) as GalleryImageData[]))
      .catch(() => setGallery([]));
  }, []);

  useEffect(() => {
    // The app banner is dismissible and remembered for seven days (§2.11):
    // useful once, wallpaper after that.
    try {
      const until = Number(window.localStorage.getItem("hpAppBannerDismissedUntil") ?? 0);
      if (until > Date.now()) setAppBannerOpen(false);
    } catch {
      /* private mode — the banner simply stays */
    }
  }, []);

  const dismissAppBanner = () => {
    setAppBannerOpen(false);
    try {
      window.localStorage.setItem("hpAppBannerDismissedUntil", String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    // The public feed (addendum Part 7): the same published posts the guest app's
    // What's on tab shows. Pausing a post in the manager portal removes it from both.
    fetch("/api/posts", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPosts((d.posts ?? []) as PostData[]))
      .catch(() => setPosts([]));
  }, []);

  // NOTE: the reviews fetch and the `?checkIn=&checkOut=` prefill live below, after the
  // state they depend on is declared.

  // ---- The hero film (§2.3) -------------------------------------------------
  // The property's own tour of the grounds, playing silently behind the words.
  // Muted is not a preference here, it is the price of autoplay in every browser;
  // the loop is what makes it footage rather than a video someone has to babysit.
  // Two things are deliberate. First, the photograph underneath stays the real
  // hero: if the file is missing, the codec is one this phone will not play, or
  // the guest taps Pause, what is left is still a finished hero and not a black
  // rectangle — `src` is held in state only so a failed load can put the
  // photograph back on top for good. Second, 8 MB is a week of somebody's airtime,
  // so the film is HELD BACK until the browser has told us the connection is a
  // cheap one — the first paint is the photograph for everybody, which is the only
  // way a metered or Save-Data phone is certain never to start the download. Those
  // guests, and anyone whose device asks for reduced motion, keep the photograph
  // and a Play button; the file moves only if they ask for it.
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const [heroVideoSrc, setHeroVideoSrc] = useState<string | null>(HERO_VIDEO?.src ?? null);
  const [heroFilmHeld, setHeroFilmHeld] = useState(true); // poster first, Play on request
  const [heroPlaying, setHeroPlaying] = useState(false);
  const [heroMuted, setHeroMuted] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    // No Network Information API (Safari, iOS) means we cannot know, and a guest
    // who came to look at the hotel should not be punished for that: autoplay.
    const metered =
      !!connection && (connection.saveData === true || /^(slow-2g|2g|3g)$/.test(connection.effectiveType ?? ""));
    if (reducedMotion || metered) return;
    setHeroFilmHeld(false);
    setHeroPlaying(true);
  }, []);

  useEffect(() => {
    const film = heroVideoRef.current;
    if (!film || heroFilmHeld) return;
    film.muted = heroMuted;
    if (!heroPlaying) {
      film.pause();
      return;
    }
    film.play().catch(() => {
      /* the browser said no (autoplay policy, or a background tab) — the
         photograph stays exactly where it is and nothing else changes */
    });
  }, [heroPlaying, heroMuted, heroFilmHeld, heroVideoSrc]);

  // ---- The showcase slideshow (§2.5b) ---------------------------------------
  // One photograph at a time, of this property, playing by itself. Three things
  // keep it honest: only the active frame is in the DOM, only the NEXT one is
  // fetched ahead of time, and the moment the guest touches it — hover, focus,
  // Pause, a hidden tab, or a device set to reduced motion — it stops moving on
  // its own and answers to the arrows and the dots instead.
  const [showcaseChapter, setShowcaseChapter] = useState<(typeof SHOWCASE_FILTERS)[number]>("Everything");
  const [slideIndex, setSlideIndex] = useState(0);
  const [slidePlaying, setSlidePlaying] = useState(true);
  const [slideHeld, setSlideHeld] = useState(false); // the pointer or the keyboard is inside it
  const [tabHidden, setTabHidden] = useState(false);

  const slides = useMemo(
    () => (showcaseChapter === "Everything" ? SHOWCASE : SHOWCASE.filter((shot) => shot.chapter === showcaseChapter)),
    [showcaseChapter],
  );
  const activeShot = slides[slideIndex] ?? slides[0];

  useEffect(() => {
    // Nothing plays while the tab is in the background: a slideshow that keeps
    // running off-screen is a battery cost with no audience.
    const read = () => setTabHidden(document.visibilityState === "hidden");
    const timer = window.setTimeout(read, 0);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);

  useEffect(() => {
    if (!slidePlaying || slideHeld || tabHidden || slides.length < 2) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setSlideIndex((current) => (current + 1) % slides.length), 6500);
    return () => window.clearInterval(timer);
  }, [slidePlaying, slideHeld, tabHidden, slides.length]);

  useEffect(() => {
    // Warm exactly ONE frame ahead — never all twenty-one.
    if (slides.length < 2) return;
    const next = slides[(slideIndex + 1) % slides.length];
    if (!next) return;
    const image = new window.Image();
    image.src = next.src;
  }, [slideIndex, slides]);

  const chooseChapter = (next: (typeof SHOWCASE_FILTERS)[number]) => {
    setShowcaseChapter(next);
    setSlideIndex(0);
  };

  const stepSlide = (step: number) => {
    if (slides.length === 0) return;
    setSlideIndex((current) => (current + step + slides.length) % slides.length);
  };

  const extras = useMemo(() => {
    const list: { label: string; amount: number }[] = [];
    if (breakfastQty > 0) list.push({ label: `Daily breakfast × ${breakfastQty} guest${breakfastQty > 1 ? "s" : ""} (${nights} night${nights > 1 ? "s" : ""})`, amount: breakfastQty * 8500 * nights });
    if (transfer) list.push({ label: "Kamuzu Airport transfer (one-way)", amount: 25000 });
    if (lateCheckout) list.push({ label: "Late check-out until 15:00", amount: 15000 });
    return list;
  }, [breakfastQty, transfer, lateCheckout, nights]);
  const extrasTotal = extras.reduce((s, e) => s + e.amount, 0);
  const grandTotal = bookingRoom ? bookingRoom.rate * nights + extrasTotal : 0;
  const totalRoomsFree = rooms.reduce((s, r) => s + r.availableCount, 0);
  // While a call is in flight, or has failed, the number of free rooms is
  // UNKNOWN — not zero. Both badges below key their "nothing free" styling off
  // this, so an error can never be dressed up as a sold-out weekend.
  const availabilityUnknown = loadingRooms || Boolean(roomsError);
  // "Rooms from …" — the cheapest real rate for the dates being searched, never a made-up number.
  const lowestRate = rooms.length ? Math.min(...rooms.map((room) => room.rate)) : 0;

  // ---- Guest reviews (addendum "landing page", Part 2.4) --------------------
  // Everything below comes from /api/reviews: real published rows, real average.
  // Until a guest has actually left one, the section says so instead of inventing stars.
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [reviewSummary, setReviewSummary] = useState<{ count: number; average: number; averageDisplay: string | null } | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);

  // ---- The sold-out waitlist (Part 3.4) ------------------------------------
  // A sold-out week is a lead, not a dead end: capture it and call the guest first.
  const [waitForm, setWaitForm] = useState({ fullName: "", email: "", phone: "", note: "" });
  const [waitState, setWaitState] = useState<{ state: "idle" | "busy" | "done" | "error"; message: string }>({
    state: "idle",
    message: "",
  });

  // Reviews + the real average. Re-run when the guest asks for the rest of them.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reviews?limit=${showAllReviews ? 50 : 6}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setReviews((d.reviews ?? []) as ReviewData[]);
        setReviewSummary(d.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showAllReviews]);

  useEffect(() => {
    // The waitlist email links back here with the dates the guest asked for
    // (`/?checkIn=…&checkOut=…`), so the dates they land on are already filled in.
    // A link carrying only the arrival day still gets ONE night — the shortest stay
    // — rather than a departure date that lands before the arrival.
    const params = new URLSearchParams(window.location.search);
    const inDate = params.get("checkIn");
    const outDate = params.get("checkOut");
    if (inDate) {
      setCheckIn(inDate);
      setCheckOut(outDate ?? addDaysIso(inDate, MIN_NIGHTS));
    } else if (outDate) {
      setCheckOut(outDate);
    }
  }, []);

  const joinWaitlist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWaitState({ state: "busy", message: "" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...waitForm, checkIn, checkOut }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add you to the list.");
      setWaitState({ state: "done", message: data.message as string });
      setWaitForm({ fullName: "", email: "", phone: "", note: "" });
    } catch (error) {
      setWaitState({
        state: "error",
        message: error instanceof Error ? error.message : "Could not add you to the list.",
      });
    }
  };

  const lockScroll = (locked: boolean) => {
    document.body.style.overflow = locked ? "hidden" : "auto";
  };

  const openSlideshow = (room: RoomData) => {
    setSlideshow({ room, index: 0 });
    lockScroll(true);
  };
  const closeSlideshow = () => {
    setSlideshow(null);
    lockScroll(false);
  };
  const moveSlide = (dir: number) => setSlideshow((s) => (s ? { ...s, index: (s.index + dir + s.room.images.length) % s.room.images.length } : s));

  const openBooking = (room: RoomData) => {
    setBookingRoom(room);
    setStep("form");
    setResult(null);
    setBookingError("");
    setBreakfastQty(0);
    setTransfer(false);
    setLateCheckout(false);
    lockScroll(true);
  };
  const closeBooking = () => {
    setBookingRoom(null);
    lockScroll(false);
  };

  const submitBooking = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!bookingRoom) return;
    setSubmitting(true);
    setBookingError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomTypeId: bookingRoom.id,
          checkIn,
          checkOut,
          adults,
          children,
          extras,
          guestName: fd.get("guestName"),
          phone: fd.get("phone"),
          email: fd.get("email"),
          arrival: fd.get("arrival"),
          requests: fd.get("requests"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send your request.");
      setResult({ reference: data.booking.reference, invoiceUrl: data.booking.invoiceUrl, trackUrl: data.booking.trackUrl, total: data.booking.totalAmount, emailNote: data.booking.emailNote ?? null });
      setStep("done");
      fetchAvailability(checkIn, checkOut);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sunrise-app-root hp-root">
      <a className="hp-skip" href="#hp-main">Skip to content</a>
      <InstallAppPopup />
      <PageLoadingSplash />

      {/* THREE-TIER SITE NAVIGATION (addendum "navigation & image standards", Part 2):
          utility bar → six primary items with descriptors → Check availability + Track booking.
          Relative links only, and the manager portal never competes with the booking action.
          On this page the sticky bar is OUR bar (StickyStayBar), because it carries the
          dates the guest already picked instead of a generic button. */}
      <SiteNav active="Home" bookingHref="#hp-availability" showStickyBar={false} />

      <main id="hp-main">
        {/* HERO — the property's own footage with its own photograph behind it,
            left-aligned, never centred (redesign §2.3). The photograph is the
            only eagerly loaded image on the page and it is also the film's
            poster, so the first thing painted is a finished hero either way. */}
        <section className="hp-hero">
          <SafeImage
            src={HERO_IMAGE?.src ?? null}
            alt={HERO_IMAGE?.alt ?? "The Sunrise Motel facade and its sign, with potted plants along the veranda"}
            width={HERO_IMAGE?.width ?? 1400}
            height={HERO_IMAGE?.height ?? 800}
            priority
            imgClassName="hp-hero-img"
            fallbackLabel="Sunrise Motel · Area 5, Lilongwe"
          />
          {heroVideoSrc && !heroFilmHeld ? (
            <video
              ref={heroVideoRef}
              className="hp-hero-video"
              src={heroVideoSrc}
              poster={HERO_IMAGE?.src}
              autoPlay
              muted={heroMuted}
              loop
              playsInline
              preload="auto"
              aria-hidden="true"
              tabIndex={-1}
              onError={() => {
                /* a file this device will not decode is dropped for the rest of
                   the visit: the photograph stays and no data is spent twice */
                setHeroVideoSrc(null);
              }}
            />
          ) : null}
          <div className="hp-hero-scrim" aria-hidden="true" />
          {heroVideoSrc ? (
            <div className="hp-hero-media-controls">
              {heroFilmHeld ? (
                <button
                  type="button"
                  className="hp-hero-media-btn"
                  onClick={() => {
                    setHeroFilmHeld(false);
                    setHeroPlaying(true);
                  }}
                  aria-label="Play the short film of the property"
                >
                  <Play size={13} />
                  <span>Play film</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="hp-hero-media-btn"
                  onClick={() => setHeroPlaying((playing) => !playing)}
                  aria-label={heroPlaying ? "Pause the film in the background" : "Play the film"}
                >
                  {heroPlaying ? <Pause size={13} /> : <Play size={13} />}
                  <span>{heroPlaying ? "Pause" : "Play"}</span>
                </button>
              )}
              {!heroFilmHeld ? (
                <button
                  type="button"
                  className="hp-hero-media-btn"
                  onClick={() => setHeroMuted((muted) => !muted)}
                  aria-label={heroMuted ? "Turn the sound on" : "Mute the film"}
                >
                  {heroMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  <span>{heroMuted ? "Sound on" : "Mute"}</span>
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="hp-hero-inner hp-wrap">
            <p className="hp-hero-eyebrow hp-anim hp-anim-1">Area 5 · Lilongwe · Mzimba Road</p>
            <h1 className="hp-h1 hp-anim hp-anim-2">A warm room, a full plate, and a quiet evening.</h1>
            <p className="hp-tagline hp-anim hp-anim-3">When you are here, you are family.</p>
            <p className="hp-hero-sub hp-anim hp-anim-4">
              Comfortable rooms, generous local meals, braai evenings and dependable Starlink Wi-Fi — ten rooms, five
              minutes off Mzimba Road.
            </p>
            <div className="hp-hero-actions hp-anim hp-anim-5">
              <a className="hp-hero-jump" href="#rooms-section">
                See available rooms <ArrowDown size={15} />
              </a>
              <a className="hp-hero-call" href="tel:+265998688332">
                <Phone size={15} /> +265 998 688 332
              </a>
            </div>
          </div>
        </section>

        {/* THE AVAILABILITY BAR — inside the hero, floating over its bottom edge
            (redesign §2.3). The single most important action on the site belongs
            where the eye already is, not in a card halfway down the page. */}
        <div className="hp-avail-float" id="hp-availability">
          <Reveal className="hp-avail-bar">
            <div className="hp-avail-top">
              <span className="hp-avail-title">
                <CalendarCheck size={16} className="accent-orange" /> Check availability
              </span>
              <span className={`hp-avail-live ${availabilityUnknown ? "" : totalRoomsFree === 0 ? "is-none" : ""}`}>
                {loadingRooms ? <Loader2 size={12} className="spin" /> : <span className="hp-dot" />}
                {loadingRooms
                  ? "Checking real bookings…"
                  : roomsError
                    ? "Could not read the book just now"
                    : totalRoomsFree > 0
                      ? `${totalRoomsFree} room${totalRoomsFree === 1 ? "" : "s"} free`
                      : "Fully booked for these dates"}
              </span>
            </div>

            <div className="hp-avail-fields">
              <div className="hp-field">
                <label htmlFor="hp-checkin">Check-in</label>
                <input
                  id="hp-checkin"
                  type="date"
                  value={checkIn}
                  min={isoPlus(0)}
                  onChange={(e) => {
                    setCheckIn(e.target.value);
                    // Moving the arrival day keeps the LENGTH of the stay, not the old
                    // departure date — the guest chose nights, so nights is what travels
                    // with them.
                    if (e.target.value) setCheckOut(addDaysIso(e.target.value, nights));
                  }}
                />
              </div>
              <div className="hp-field">
                <label id="hp-nights-label">Nights</label>
                {/* Two taps and no keyboard: the stay starts at ONE night and + adds
                    another each time. Check-out is read out underneath, worked out from
                    the arrival date and this count — the guest never types it. */}
                <div className="hp-stepper" role="group" aria-labelledby="hp-nights-label">
                  <button
                    type="button"
                    onClick={() => changeNights(nights - 1)}
                    disabled={nights <= MIN_NIGHTS}
                    aria-label="One night fewer"
                  >
                    <Minus size={15} />
                  </button>
                  <span aria-live="polite">
                    {nights} night{nights === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeNights(nights + 1)}
                    disabled={nights >= MAX_NIGHTS}
                    aria-label="One more night"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <small className="hp-field-note">Out {checkOut} · by 10:00</small>
              </div>
              <div className="hp-field">
                <label htmlFor="hp-adults">Guests</label>
                <select
                  id="hp-adults"
                  value={adults}
                  onChange={(e) => setAdults(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} adult{n === 1 ? "" : "s"}
                      {n === 1 && children === 0 ? "" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="hp-avail-submit" onClick={() => {
                document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}>
                Check availability <Search size={15} />
              </button>
            </div>

            <div className="hp-avail-readout">
              <span className={availabilityUnknown ? "hp-avail-count" : totalRoomsFree === 0 ? "hp-avail-count is-none" : "hp-avail-count"}>
                {loadingRooms
                  ? "Reading the book…"
                  : roomsError
                    ? "Availability is not reachable right now — try again in a moment"
                    : totalRoomsFree > 0
                      ? `${totalRoomsFree} room${totalRoomsFree === 1 ? "" : "s"} free for these ${nights} night${nights === 1 ? "" : "s"}`
                      : "No rooms free for these nights — try shifting by a day"}
              </span>
              <span className="hp-avail-dates">
                {checkIn} → {checkOut} · {nights} night{nights === 1 ? "" : "s"} · {adults} guest{adults === 1 ? "" : "s"}
              </span>
            </div>

            <p className="hp-avail-trust">
              Counts come from real bookings — a room is only shown if it is free every night of your stay. No account,
              no password, no waiting.
            </p>
          </Reveal>
        </div>

        {/* THE THREE FACTS STRIP — quiet, icon-led, one line each (§2.4). */}
        <section className="hp-facts" aria-label="What comes with every stay">
          <div className="hp-wrap">
            <Reveal className="hp-facts-grid">
              <div className="hp-fact">
                <span className="hp-fact-icon"><Wifi size={19} /></span>
                <div>
                  <strong>Starlink Wi-Fi</strong>
                  <small>Dependable, fast internet — in the rooms and the workspace</small>
                </div>
              </div>
              <div className="hp-fact">
                <span className="hp-fact-icon"><Utensils size={19} /></span>
                <div>
                  <strong>Kitchen &amp; bar</strong>
                  <small>07:00 — 22:00 daily · room service to your door</small>
                </div>
              </div>
              <div className="hp-fact">
                <span className="hp-fact-icon"><CarFront size={19} /></span>
                <div>
                  <strong>Secure parking</strong>
                  <small>Gated and guarded, 24 hours</small>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

      {/* THE FOUR WAYS (redesign §2.5) — photographs of this actual property, and
          ONE anchor wrapping each whole card: no nested links, no duplicate
          targets, one clean tab stop each. */}
      <section className="hp-section" aria-labelledby="hp-ways-heading">
        <div className="hp-wrap">
          <div className="hp-head">
            <p className="hp-eyebrow">Four ways to spend your time here</p>
            <h2 className="hp-h2" id="hp-ways-heading">Stay. Dine. Unwind. Connect.</h2>
            <span className="hp-rule" aria-hidden="true" />
            <p className="hp-sub">
              Each one has its own page with live details, real photographs of this property and a simple form — no
              account and no password needed to ask a question.
            </p>
          </div>
          <Reveal className="hp-ways-grid">
            {WAYS.map((way) => (
              <a key={way.n} className="hp-way" href={way.href}>
                <div className="hp-way-media">
                  <SafeImage src={way.img} alt={way.alt} width={900} height={1125} fallbackLabel={way.title} />
                  <span className="hp-way-num">{way.n}</span>
                </div>
                <div className="hp-way-body">
                  <div className="hp-way-title">
                    <span className="hp-way-icon"><way.icon size={17} /></span>
                    <h3>{way.title}</h3>
                  </div>
                  <p>{way.body}</p>
                  <span className="hp-way-cta">{way.cta} <MoveRight size={15} /></span>
                </div>
              </a>
            ))}
          </Reveal>
        </div>
      </section>

      {/* THE SHOWCASE (§2.5b) — the photographs added with the four ways, the
          kitchen, the bar and the workspace, in one place, on its own. The
          chapter buttons are the same words the cards above use, so the page
          reads Stay → Dine → Unwind → Connect in both. Only the active frame is
          in the DOM and only the next one is fetched ahead (Part 5.4). */}
      <section className="hp-section hp-section--sand" aria-labelledby="hp-showcase-heading">
        <div className="hp-wrap">
          <div className="hp-head-row">
            <div className="hp-head">
              <p className="hp-eyebrow">What we actually have</p>
              <h2 className="hp-h2" id="hp-showcase-heading">Have a look, one frame at a time</h2>
              <span className="hp-rule" aria-hidden="true" />
              <p className="hp-sub">
                The rooms, the plates, the braai, the table by the window and the courtyard after dark — every
                photograph in here was taken on this property, none of it stock.
              </p>
            </div>
            <a className="hp-more" href="/gallery">Open the full gallery <MoveRight size={15} /></a>
          </div>

          <div className="hp-showcase-filters" role="group" aria-label="Choose what to look at">
            {SHOWCASE_FILTERS.map((chapter) => (
              <button
                key={chapter}
                type="button"
                className={`hp-showcase-filter ${showcaseChapter === chapter ? "is-active" : ""}`}
                aria-pressed={showcaseChapter === chapter}
                onClick={() => chooseChapter(chapter)}
              >
                {chapter}
              </button>
            ))}
          </div>

          {activeShot ? (
            <Reveal>
              <div
                className="hp-showcase"
                role="group"
                aria-roledescription="slideshow"
                aria-label={`Photographs of Sunrise Motel — ${showcaseChapter}`}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    stepSlide(1);
                  }
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    stepSlide(-1);
                  }
                }}
                onMouseEnter={() => setSlideHeld(true)}
                onMouseLeave={() => setSlideHeld(false)}
                onFocus={() => setSlideHeld(true)}
                onBlur={() => setSlideHeld(false)}
              >
                <div className="hp-showcase-stage">
                  {/* `key` on the source makes the frame a new element, so the
                      fade-in replays on every slide rather than only once. */}
                  <SafeImage
                    key={activeShot.src}
                    src={activeShot.src}
                    alt={activeShot.alt}
                    width={1400}
                    height={875}
                    fallbackLabel={activeShot.chapter}
                  />
                  <div className="hp-showcase-scrim" aria-hidden="true" />
                  <span className="hp-showcase-count">
                    {slideIndex + 1} / {slides.length}
                  </span>
                  <button
                    type="button"
                    className="hp-showcase-nav is-prev"
                    aria-label="Previous photograph"
                    onClick={() => stepSlide(-1)}
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    className="hp-showcase-nav is-next"
                    aria-label="Next photograph"
                    onClick={() => stepSlide(1)}
                  >
                    <ChevronRight size={22} />
                  </button>
                  <div className="hp-showcase-caption">
                    <span className="hp-showcase-chip">{activeShot.chapter}</span>
                    <strong>{activeShot.title}</strong>
                    <p>{activeShot.caption}</p>
                  </div>
                </div>

                <div className="hp-showcase-bar">
                  <div className="hp-showcase-dots">
                    {slides.map((shot, index) => (
                      <button
                        key={shot.src}
                        type="button"
                        className={`hp-showcase-dot ${index === slideIndex ? "is-active" : ""}`}
                        aria-label={`Show ${shot.title}`}
                        aria-current={index === slideIndex}
                        onClick={() => setSlideIndex(index)}
                      />
                    ))}
                  </div>
                  <div className="hp-showcase-foot">
                    <span className="hp-showcase-honest">
                      <Camera size={13} /> Only the frame on screen is downloaded — nothing waits in the background
                    </span>
                    <button
                      type="button"
                      className="hp-showcase-play"
                      aria-pressed={slidePlaying}
                      onClick={() => setSlidePlaying((playing) => !playing)}
                    >
                      {slidePlaying ? <Pause size={14} /> : <Play size={14} />}
                      {slidePlaying ? "Pause" : "Play"}
                    </button>
                  </div>
                </div>
              </div>
            </Reveal>
          ) : (
            <p className="hp-empty">No photographs of this part of the property have been published yet.</p>
          )}
        </div>
      </section>

      {/* WHAT'S ON — whatever the manager publishes, in the same feed the guest app's
          "What's on" tab reads (§2.6). Pausing a post in the manager portal removes
          it from both places at once, so nothing here can quietly go stale. */}
      <section className="hp-section hp-section--sand" aria-labelledby="hp-promos-heading">
        <div className="hp-wrap">
          <div className="hp-head-row">
            <div className="hp-head">
              <p className="hp-eyebrow">This week at Sunrise</p>
              <h2 className="hp-h2" id="hp-promos-heading">Events, specials &amp; offers</h2>
              <span className="hp-rule" aria-hidden="true" />
              <p className="hp-sub">
                Published by the team the moment they are confirmed — what you read here is what is actually happening.
              </p>
            </div>
            <a className="hp-more" href="/unwind">What&apos;s on <MoveRight size={15} /></a>
          </div>

          {posts.length > 0 ? (
            <Reveal className="hp-promos-grid">
              {posts.slice(0, 3).map((post) => (
                <article key={post.id} className="hp-promo">
                  <div className="hp-promo-media">
                    {post.imageUrl ? (
                      <SafeImage
                        src={post.imageUrl}
                        alt={`${post.title} — ${post.category} at Sunrise Motel, Area 5, Lilongwe`}
                        width={1200}
                        height={675}
                        fallbackLabel={post.category}
                      />
                    ) : (
                      <div className="img-placeholder">{post.category}</div>
                    )}
                    <span className="hp-promo-cat">{post.category}</span>
                    {post.priceTag && <span className="hp-promo-price">{post.priceTag}</span>}
                  </div>
                  <div className="hp-promo-body">
                    <span className="hp-promo-date">
                      <Clock3 size={13} /> {[post.day, post.date].filter(Boolean).join(" · ") || "On now"}
                    </span>
                    <h3>{post.title}</h3>
                    <p>{post.detail}</p>
                    <div className="hp-promo-foot">
                      <span className="hp-promo-time"><Clock3 size={13} /> {post.time || "All day"}</span>
                      <a className="hp-more" href="/unwind">Plan it <MoveRight size={14} /></a>
                    </div>
                  </div>
                </article>
              ))}
            </Reveal>
          ) : (
            <p className="hp-empty">
              Nothing on the board right now. The kitchen and bar are open 07:00 — 22:00 daily and the front desk answers
              on +265 998 688 332 at any hour, so call if there is something you want to arrange.
            </p>
          )}
        </div>
      </section>

      {/* ROOMS — live availability with the honest numbers. The card markup itself
          is the shared one; only the surfaces change, so anything that renders a
          room card elsewhere keeps working. */}
      <section id="rooms-section" className="hp-section hp-rooms" aria-labelledby="hp-rooms-heading">
        <div className="hp-wrap">
          <div className="hp-head">
            <p className="hp-eyebrow">Live availability · {checkIn} → {checkOut}</p>
            <h2 className="hp-h2" id="hp-rooms-heading">Rooms made for real rest</h2>
            <span className="hp-rule" aria-hidden="true" />
            <p className="hp-sub">
              Numbers only drop when a real booking overlaps those nights, so nothing is double-booked. Each card shows
              what is free for your dates, what is already taken, and the total for the stay.
            </p>
          </div>

        <Reveal className="rooms-cards-list stagger-list">
          {rooms.map((room) => (
            <article key={room.id} className={`room-card-structured ${room.isSoldOut ? "card-sold-out" : ""}`}>
              <div className="room-photo-header photo-frame">
                {/* A real photograph of this actual room type (Part 5.5), with real alt
                    text describing the scene, a reserved box so nothing jumps, and a
                    clean fallback instead of a broken-image icon. */}
                <SafeImage
                  src={room.images[0]}
                  alt={`${room.name} at Sunrise Motel: ${room.bed}, ${room.sleeps}, ${room.size} in Area 5, Lilongwe`}
                  width={1200}
                  height={800}
                  fallbackLabel={room.name}
                />
                <div className="photo-tag-overlay">
                  <span className={`availability-chip ${room.isSoldOut ? "chip-sold-out" : room.availableCount === 1 ? "chip-low" : "chip-available"}`}>{room.statusText}</span>
                  {room.badge && <span className="badge-chip">{room.badge}</span>}
                </div>
                <button className="btn-view-slideshow" onClick={() => openSlideshow(room)}><Layers size={14} /> {room.images.length} photos</button>
              </div>
              <div className="room-card-content">
                <div className="room-title-rate-row">
                  <div><h3>{room.name}</h3><p className="room-desc">{room.description}</p></div>
                  <div className="room-pricing-box"><span className="from-label">Per night</span><strong className="rate-amount">{formatMoney(room.rate)}</strong><small className="stay-calc-hint">{formatMoney(room.rate * nights)} for {nights} night{nights > 1 ? "s" : ""}</small></div>
                </div>
                <div className="room-specs-row"><span><BedDouble size={14} className="accent-orange" /> {room.bed}</span><span><Users size={14} className="accent-orange" /> {room.sleeps}</span><span><Compass size={14} className="accent-orange" /> {room.size}</span></div>
                <div className="availability-meta">
                  <span className={room.isSoldOut ? "meta-bad" : "meta-good"}>{room.isSoldOut ? "No rooms free for these nights" : `${room.availableCount} free`}</span>
                  <span>{room.bookedCount === 0 ? "No other bookings on these dates" : `${room.bookedCount} already booked on these dates`}</span>
                  <span>{room.totalInventory} rooms of this type</span>
                </div>
                <div className="room-features-pills">{room.features.slice(0, 4).map((f) => <span key={f} className="feature-pill"><Check size={12} className="accent-sage" /> {f}</span>)}</div>
                <div className="room-card-actions">
                  <button className="btn-open-slideshow-secondary" onClick={() => openSlideshow(room)}><Layers size={14} /> View photos</button>
                  {room.isSoldOut ? <button className="btn-book-room btn-disabled" disabled>Fully booked</button> : <button className="btn-book-room btn-active-book" onClick={() => openBooking(room)}>Book this room <ArrowRight size={15} /></button>}
                </div>
              </div>
            </article>
          ))}
          {/* The empty state says which empty state it is. This branch used to
              print "Rooms are loading…" after a FAILED fetch too — so a guest
              whose availability call died was told, permanently, that rooms were
              still coming. A failure now says so and offers the one action that
              helps. A genuinely empty list is its own message, set above. */}
          {rooms.length === 0 && !loadingRooms && (
            roomsError ? (
              <div className="empty-state">
                <AlertCircle size={30} />
                <p>{roomsError}</p>
                <button type="button" className="btn-open-slideshow-secondary" onClick={() => fetchAvailability(checkIn, checkOut)}>
                  <Loader2 size={14} /> Try again
                </button>
              </div>
            ) : (
              <div className="empty-state"><BedDouble size={30} /><p>Rooms are loading…</p></div>
            )
          )}
        </Reveal>

        {/* The add-ons, named plainly before anyone commits (Part 3.2) — they are
            chosen in the booking sheet, so the total is never a surprise. */}
        <div className="hp-extras-note">
          <strong>Optional add-ons</strong>
          <span>
            Daily breakfast from MWK 8 500 a guest, a Kamuzu Airport transfer at MWK 25 000 one-way and late check-out
            until 15:00 for MWK 15 000. All three are chosen inside the booking sheet, all are optional, and all are
            added to the total before you send anything.
          </span>
        </div>

        {/* SOLD OUT — never a dead end. The dates go back to the guest as a lead
            (addendum "landing page", Part 3.4): the waitlist, and the desk is told. */}
        {!loadingRooms && rooms.length > 0 && totalRoomsFree === 0 && (
          <form onSubmit={joinWaitlist} className="hp-waitlist">
            <h3>Every room is taken for {checkIn} → {checkOut}</h3>
            <p className="hp-waitlist-intro">
              That happens on long weekends and around the festivals. Leave a way to reach you and we tell you first the
              moment a cancellation or a late release frees one of those nights — before the dates go back on this page.
              No deposit, and you are not committed to anything.
            </p>
            {waitState.state === "done" ? (
              <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                {waitState.message}
              </p>
            ) : (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Your name
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                      value={waitForm.fullName}
                      onChange={(event) => setWaitForm({ ...waitForm, fullName: event.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Email
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                      type="email"
                      value={waitForm.email}
                      onChange={(event) => setWaitForm({ ...waitForm, email: event.target.value })}
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Phone or WhatsApp
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                      value={waitForm.phone}
                      onChange={(event) => setWaitForm({ ...waitForm, phone: event.target.value })}
                      placeholder="+265 …"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Anything we should know?
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                      value={waitForm.note}
                      onChange={(event) => setWaitForm({ ...waitForm, note: event.target.value })}
                      placeholder="Two rooms next to each other, arriving late …"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  An email or a phone number is enough — we only need one way to reach you.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button className="admin-btn admin-btn-primary" type="submit" disabled={waitState.state === "busy"}>
                    {waitState.state === "busy" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Tell me if a room frees up
                  </button>
                  <button
                    className="admin-btn admin-btn-secondary"
                    type="button"
                    onClick={() => {
                      setCheckIn(isoPlus(1));
                      setCheckOut(isoPlus(2));
                    }}
                  >
                    <Calendar size={14} /> Try different dates
                  </button>
                </div>
              </>
            )}
            {waitState.state === "error" && (
              <p className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{waitState.message}</p>
            )}
            <p className="mt-3 text-xs text-[var(--muted)]">
              Need somewhere tonight? Call the desk on +265 998 688 332 — they can see every room in the building, not just
              what this page shows.
            </p>
          </form>
        )}
        </div>
      </section>

      {/* REVIEWS — the published rows and the real average, or an honest "none yet".
          Nothing on this page is invented: when there is nothing to show, the
          section says so instead of offering stars nobody left. */}
      <section id="reviews-section" className="hp-section hp-section--sand" aria-labelledby="hp-reviews-heading">
        <div className="hp-wrap">
          <div className="hp-head">
            <p className="hp-eyebrow">In their own words</p>
            <h2 className="hp-h2" id="hp-reviews-heading">What guests said</h2>
            <span className="hp-rule" aria-hidden="true" />
            <p className="hp-sub">
              {reviewSummary && reviewSummary.count > 0
                ? "Nothing here is edited and nothing is bought — the reviews that tell us what to fix are on this page too, and the score is the plain average of every one of them."
                : "We only publish the reviews guests actually left, so this fills up as people check out — no invented stars, ever."}
            </p>
          </div>

          {reviewSummary && reviewSummary.count > 0 && (
            <div className="hp-reviews-top">
              <div className="hp-score">
                <strong>{reviewSummary.averageDisplay ?? reviewSummary.average.toFixed(1)}</strong>
                <div>
                  <span className="hp-stars" aria-label={`${reviewSummary.averageDisplay ?? reviewSummary.average} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={15}
                        fill="currentColor"
                        className={n <= Math.round(reviewSummary.average) ? undefined : "hp-star-off"}
                      />
                    ))}
                  </span>
                  <small>{reviewSummary.count} published review{reviewSummary.count === 1 ? "" : "s"}</small>
                </div>
              </div>
            </div>
          )}

        {reviews.length > 0 && (
            <Reveal className="hp-reviews-grid">
              {reviews.map((review) => (
                <article key={review.id} className="hp-review">
                  <span className="hp-stars" aria-label={`${review.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} size={15} fill="currentColor" className={n <= review.rating ? undefined : "hp-star-off"} />
                    ))}
                  </span>
                  {review.comment && <blockquote>“{review.comment}”</blockquote>}
                  <div>
                    <p className="hp-review-by">
                      {review.guestName}
                      {review.stayMonth ? ` · stayed ${review.stayMonth}` : ""}
                    </p>
                    {review.source === "google" && <span className="hp-review-via">Via Google</span>}
                    {review.isFeatured && <span className="hp-review-via">Featured</span>}
                  </div>
                </article>
              ))}
            </Reveal>
          )}

          {reviews.length === 0 && (
            <p className="hp-empty">
              No reviews have been published yet. When a guest leaves one at check-out it appears here exactly as they
              wrote it — we would rather show an empty space than a filled-in one.
            </p>
          )}

        <div className="hp-reviews-actions">
            {!showAllReviews && (reviewSummary?.count ?? 0) > 6 && (
              <button className="admin-btn admin-btn-secondary" type="button" onClick={() => setShowAllReviews(true)}>
                Show all {reviewSummary?.count} reviews
              </button>
            )}
            <a className="admin-btn admin-btn-primary" href="/review">Rate your stay</a>
            <span className="hp-reviews-note">
              Stayed with us? One tap, five stars and a sentence if you have one — the same link works from your
              check-out email, and it takes a minute.
            </span>
          </div>
        </div>
      </section>

      {/* GALLERY — the proof section, and the one that costs the most data, so every
          photograph below the fold lazy-loads (Part 5.4). One horizontal strip
          keeps the page from growing a second page's worth of height. */}
      <section className="hp-section hp-section--tight" aria-labelledby="hp-gallery-heading">
        <div className="hp-wrap">
          <div className="hp-head-row">
            <div className="hp-head">
              <p className="hp-eyebrow">The property, as it is</p>
              <h2 className="hp-h2" id="hp-gallery-heading">Have a look around</h2>
              <span className="hp-rule" aria-hidden="true" />
            </div>
            <a className="hp-more" href="/gallery">Open the full gallery <MoveRight size={15} /></a>
          </div>

          {gallery.length > 0 ? (
            <Reveal className="hp-strip">
              {gallery.slice(0, 14).map((shot) => (
                <figure key={shot.id}>
                  <SafeImage
                    src={shot.imageUrl}
                    alt={shot.altText || `${shot.title} at Sunrise Motel, Area 5, Lilongwe`}
                    width={600}
                    height={600}
                    fallbackLabel={shot.category}
                  />
                  <figcaption>{shot.caption || shot.title}</figcaption>
                </figure>
              ))}
            </Reveal>
          ) : (
            <p className="hp-empty">
              Photographs of the rooms, the kitchen, the pool and the garden live on the gallery page — every one of
              them taken here, none of them stock.
            </p>
          )}
        </div>
      </section>

      {/* FIND US, AND HOW TO PAY — the two questions that decide a booking, answered
          in one place instead of being left to a footer nobody scrolls to. */}
      <section className="hp-section" aria-labelledby="hp-find-heading">
        <div className="hp-wrap">
          <div className="hp-head">
            <p className="hp-eyebrow">Mzimba Road · Area 5, Lilongwe</p>
            <h2 className="hp-h2" id="hp-find-heading">Finding us, and paying</h2>
            <span className="hp-rule" aria-hidden="true" />
            <p className="hp-sub">
              About twenty minutes from Kamuzu International Airport. If you are arriving late, say so in the booking
              sheet and the desk keeps your key.
            </p>
          </div>

          <div className="hp-find">
            <div className="hp-find-card">
              <h3>Getting here</h3>
              <div className="hp-find-row">
                <MapPin size={16} />
                <div>
                  Mzimba Road, behind Bwasila Secondary School, Area 5, Lilongwe, Malawi
                  <small>Look for the gold sign at the end of the driveway — the gate is manned all night.</small>
                </div>
              </div>
              <div className="hp-find-row">
                <Phone size={16} />
                <div>
                  <a href="tel:+265998688332">+265 998 688 332</a>
                  <small>Front desk, any hour — before you book, during your stay, or to move a date.</small>
                </div>
              </div>
              <div className="hp-find-row">
                <MessageCircle size={16} />
                <div>
                  <a
                    href={`${WA}${encodeURIComponent("Hello Sunrise Motel front desk.")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp the front desk
                  </a>
                  <small>Send your dates and we answer with what is free — usually within minutes.</small>
                </div>
              </div>
              <div className="hp-find-row">
                <Compass size={16} />
                <div>
                  <a
                    href="https://maps.google.com/?q=Sunrise+Motel+Mzimba+Road+Area+5+Lilongwe"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open directions
                  </a>
                  <small>Check-in from 14:00 · check-out by 10:00 · secure, guarded parking on site.</small>
                </div>
              </div>
            </div>

            <div className="hp-find-card">
              <h3>How to pay</h3>
              <div className="hp-pay-grid">
                <div className="hp-pay-chip">National Bank<span>Card or transfer</span></div>
                <div className="hp-pay-chip">Airtel Money<span>Mobile money</span></div>
                <div className="hp-pay-chip">TNM Mpamba<span>Mobile money</span></div>
                <div className="hp-pay-chip">Cash<span>At the desk, in MWK</span></div>
              </div>
              <p className="hp-pay-note">
                Booking needs no account and no password: you send a request, we hold the room and send a pro-forma
                invoice carrying your reference. A deposit confirms the nights and the balance is settled on arrival.
                Every booking is followed from <a href="/track">the tracking page</a> with the reference and the phone
                number you gave us.
              </p>
              <div className="hp-pay-grid" style={{ marginTop: 18, marginBottom: 0 }}>
                <div className="hp-pay-chip">Tonight<span>Need a room today? Call the desk</span></div>
                <div className="hp-pay-chip">Invoice<span>PDF pro-forma with every reference</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRACK A BOOKING — the same offer the confirmation screen makes, so a guest
          who has lost the email still has a way back in without an account. */}
      <section className="hp-section hp-section--tight">
        <div className="hp-wrap">
          <div className="zip-card zip-card-track">
            <div className="zip-icon-wrap"><Search size={24} /></div>
            <div className="zip-info"><strong>Already requested a room?</strong><p>Follow your booking, see payments and download your invoice with just your reference and phone number.</p></div>
            <a href="/track" className="btn-download-zip"><Search size={16} /> Track my booking</a>
          </div>
        </div>
      </section>

      {/* THE SLIM APP BANNER (redesign §2.11) — useful once, wallpaper after that,
          so it remembers being dismissed for seven days and then stays gone. */}
      {appBannerOpen && (
        <section className="hp-section hp-section--tight" aria-label="Get the Sunrise app">
          <div className="hp-wrap">
            <div className="hp-app-banner">
              <Smartphone size={22} />
              <p>
                Keep the booking in your pocket: the Android app holds your reference, your dates and your invoice, and
                reads the same rooms and prices this page does.
              </p>
              <div className="hp-app-banner-actions">
                {/* This used to be a link to /download. It opens the install popup
                    on the spot instead — Install now or Not now, and no page in
                    between. The button hides itself once the app is on the phone. */}
                <InstallAppButton label="Get the Android app" className="hp-app-banner-cta" />
                <a className="hp-more" href="/app">Open my account</a>
                <button
                  className="hp-app-banner-close"
                  type="button"
                  onClick={dismissAppBanner}
                  aria-label="Dismiss this banner"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      </main>

      {/* FOOTER */}
      <footer className="hp-footer">
        <div className="hp-wrap">
          {/* Four columns, then the tagline (§2.12). Every link here resolves, and
              each one is a page that exists rather than a promise. */}
          <div className="hp-footer-top">
            <div className="hp-footer-brand">
              <SunriseFullLogo className="footer-full-logo" />
              <p>
                Comfortable rooms, generous meals, lively evenings and dependable connectivity — all in Area 5,
                Lilongwe.
              </p>
              <div className="hp-footer-col" style={{ marginTop: 24 }}>
                <strong>Contact</strong>
                <p><Phone size={13} /> <a href="tel:+265998688332">+265 998 688 332</a></p>
                <a
                  href={`${WA}${encodeURIComponent("Hello Sunrise Motel front desk.")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={13} /> WhatsApp the front desk
                </a>
                <a
                  href="https://maps.google.com/?q=Sunrise+Motel+Mzimba+Road+Area+5+Lilongwe"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Compass size={13} /> Directions
                </a>
                <p><MapPin size={13} /> Mzimba Road, behind Bwasila Secondary School, Area 5, Lilongwe, Malawi</p>
              </div>
            </div>

            <div className="hp-footer-col">
              <strong>Stay</strong>
              <a href="/stay">Rooms &amp; availability</a>
              <Link href="/#rooms-section">Book a room</Link>
              <a href="/track">Track a booking</a>
              <a href="/room">Your room menu</a>
            </div>

            <div className="hp-footer-col">
              <strong>Food &amp; events</strong>
              <a href="/dine">Restaurant &amp; room service</a>
              <a href="/unwind">Braai, events &amp; functions</a>
              <a href="/gallery">Gallery</a>
              <a href="/review">Rate your stay</a>
            </div>

            <div className="hp-footer-col">
              <strong>Practical</strong>
              <a href="/connect">Wi-Fi &amp; workspace</a>
              <a href="/download">Android app download</a>
              <a href="/app">Guest account &amp; bookings</a>
              <a href="/admin">Manager portal</a>
            </div>
          </div>

          <div className="hp-footer-tagline">
            <em>When you are here, you are family.</em>
            <div className="hp-footer-legal">
              <span>© 2026 Sunrise Motel · Check-in 14:00 · Check-out 10:00 · secure, guarded parking</span>
              <a href="/app">Get the app</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ROOM SLIDESHOW */}
      {slideshow && (
        <div className="slideshow-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeSlideshow(); }}>
          <div className="slideshow-modal-card">
            <button className="slideshow-close-btn" onClick={closeSlideshow} aria-label="Close slideshow"><X size={20} /></button>
            <div className="slideshow-top-header">
              <div><span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> ROOM PHOTOS</span><h2>{slideshow.room.name}</h2></div>
              <span className="slide-counter">{slideshow.index + 1} of {slideshow.room.images.length}</span>
            </div>
            <div className="slideshow-viewport">
              <img src={slideshow.room.images[slideshow.index]} alt={`${slideshow.room.name} photo ${slideshow.index + 1}`} />
              <button className="slide-nav-btn prev-btn" onClick={() => moveSlide(-1)} aria-label="Previous photo"><ChevronLeft size={24} /></button>
              <button className="slide-nav-btn next-btn" onClick={() => moveSlide(1)} aria-label="Next photo"><ChevronRight size={24} /></button>
            </div>
            <div className="slideshow-thumbnails-row">
              {slideshow.room.images.map((img, i) => <button key={img} className={`thumbnail-btn ${i === slideshow.index ? "active" : ""}`} onClick={() => setSlideshow({ ...slideshow, index: i })}><img src={img} alt="" /></button>)}
            </div>
            <div className="slideshow-specs-footer">
              <div className="specs-info"><strong>{formatMoney(slideshow.room.rate)} / night</strong><small>{slideshow.room.bed} · {slideshow.room.sleeps} · {slideshow.room.size} · {slideshow.room.statusText}</small></div>
              {!slideshow.room.isSoldOut && <button className="btn-book-from-slideshow" onClick={() => { const r = slideshow.room; closeSlideshow(); openBooking(r); }}>Book this room <ArrowRight size={15} /></button>}
            </div>
          </div>
        </div>
      )}

      {/* BOOKING SHEET */}
      {bookingRoom && (
        <div className="booking-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeBooking(); }}>
          <div className="booking-modal-sheet">
            <button className="sheet-close-btn" onClick={closeBooking} aria-label="Close"><X size={20} /></button>

            {step === "form" ? (
              <form onSubmit={submitBooking} className="booking-dynamic-form">
                <div className="modal-sheet-header">
                  <span className="eyebrow"><span className="eyebrow-line" /> DIRECT REQUEST · NO ACCOUNT</span>
                  <h2>Request {bookingRoom.name}</h2>
                  <p>{bookingRoom.availableCount} of {bookingRoom.totalInventory} rooms free for your dates. Your room is protected the moment you send this.</p>
                </div>

                <div className="booking-stay-card">
                  <img src={bookingRoom.images[0]} alt="" />
                  <div className="stay-card-info"><strong>{bookingRoom.name}</strong><span>{checkIn} → {checkOut} · {nights} night{nights > 1 ? "s" : ""}</span><small>{adults} adult{adults > 1 ? "s" : ""}{children ? ` · ${children} child` : ""} · {bookingRoom.bed}</small></div>
                  <div className="stay-card-price"><span>Room total</span><strong>{formatMoney(bookingRoom.rate * nights)}</strong></div>
                </div>

                <div className="extras-calculator-box">
                  <div className="extras-header"><Sparkles size={16} className="accent-orange" /><strong>Add extras — the total updates instantly</strong></div>
                  <div className="extra-item-row">
                    <div className="extra-left"><Coffee size={16} className="accent-orange" /><div><strong>Daily breakfast</strong><small>MWK 8,500 per guest per day</small></div></div>
                    <div className="extra-stepper"><button type="button" onClick={() => setBreakfastQty(Math.max(0, breakfastQty - 1))} aria-label="Fewer"><Minus size={13} /></button><span>{breakfastQty}</span><button type="button" onClick={() => setBreakfastQty(Math.min(adults, breakfastQty + 1))} aria-label="More"><Plus size={13} /></button></div>
                  </div>
                  <div className="extra-item-row">
                    <div className="extra-left"><Compass size={16} className="accent-orange" /><div><strong>Kamuzu Airport transfer</strong><small>One-way · MWK 25,000</small></div></div>
                    <label className="switch-toggle"><input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} /><span className="toggle-slider" /></label>
                  </div>
                  <div className="extra-item-row">
                    <div className="extra-left"><Clock3 size={16} className="accent-orange" /><div><strong>Late check-out (15:00)</strong><small>Subject to availability · MWK 15,000</small></div></div>
                    <label className="switch-toggle"><input type="checkbox" checked={lateCheckout} onChange={(e) => setLateCheckout(e.target.checked)} /><span className="toggle-slider" /></label>
                  </div>
                  <div className="live-calculation-summary">
                    <div className="calc-row"><span>{bookingRoom.name} × {nights} night{nights > 1 ? "s" : ""} @ {formatMoney(bookingRoom.rate)}</span><span>{formatMoney(bookingRoom.rate * nights)}</span></div>
                    {extras.map((x) => <div key={x.label} className="calc-row extras-line"><span>{x.label}</span><span>+{formatMoney(x.amount)}</span></div>)}
                    <div className="calc-row total-line"><strong>Total for this stay</strong><strong>{formatMoney(grandTotal)}</strong></div>
                  </div>
                </div>

                <div className="form-fields-group">
                  <label className="form-input-label"><span>Full name *</span><input name="guestName" required placeholder="e.g. Kondwani Phiri" autoComplete="name" /></label>
                  <div className="form-grid-2">
                    <label className="form-input-label"><span>Phone / WhatsApp *</span><input name="phone" required placeholder="+265 …" autoComplete="tel" inputMode="tel" /></label>
                    <label className="form-input-label"><span>Email (invoice PDF)</span><input name="email" type="email" placeholder="you@example.com" autoComplete="email" /></label>
                  </div>
                  <div className="form-grid-2">
                    <label className="form-input-label"><span>Expected arrival</span><select name="arrival" defaultValue=""><option value="">Choose a time</option><option>Morning (before 14:00)</option><option>Afternoon (14:00 — 18:00)</option><option>Evening (18:00 — 22:00)</option><option>Late night (after 22:00)</option></select></label>
                    <label className="form-input-label"><span>Requests</span><input name="requests" placeholder="Quiet room, ground floor…" /></label>
                  </div>
                </div>

                {bookingError && <div className="booking-error-banner"><AlertCircle size={16} /><span>{bookingError}</span></div>}

                <button type="submit" className="btn-submit-booking-request" disabled={submitting}>{submitting ? <><Loader2 size={18} className="spin" /> Protecting your room & issuing pro-forma…</> : <>Send booking request · {formatMoney(grandTotal)} <Send size={16} /></>}</button>
                <p className="no-account-guarantee"><ShieldCheck size={14} className="accent-sage" /> Saved first, then the front desk is alerted. You get a reference, a PDF pro-forma and a tracking link.</p>
              </form>
            ) : (
              result && (
                <div className="booking-success-view">
                  <div className="success-icon-bubble"><CheckCircle2 size={44} /></div>
                  <span className="eyebrow"><span className="eyebrow-line" /> REQUEST RECEIVED</span>
                  <h2>Your room is held.</h2>
                  <p>We have your request for <strong>{bookingRoom.name}</strong>, {checkIn} → {checkOut}. The front desk will confirm on WhatsApp.</p>
                  {result.emailNote && <p className="email-status-note"><CheckCircle2 size={14} /> {result.emailNote}</p>}
                  <div className="booking-confirmed-card">
                    <span className="ref-label">Booking reference</span>
                    <strong className="ref-code">{result.reference}</strong>
                    <div className="ref-details"><span>Total <strong>{formatMoney(result.total)}</strong></span><span>Status <strong className="status-badge">Pending confirmation</strong></span></div>
                  </div>
                  <div className="success-actions-row">
                    <a className="btn-submit-booking-request" href={result.invoiceUrl} download><Download size={16} /> Download pro-forma invoice (PDF)</a>
                    <a href={`${WA}${encodeURIComponent(`Hello Sunrise Motel, I have sent booking request ${result.reference} for ${bookingRoom.name} (${checkIn} to ${checkOut}).`)}`} target="_blank" rel="noreferrer" className="btn-whatsapp-success"><MessageCircle size={18} /> Chat with the front desk</a>
                    <a className="btn-done-dismiss" href={result.trackUrl}>Track this booking</a>
                    <button className="btn-done-dismiss" onClick={closeBooking}>Back to the website</button>
                  </div>
                  {/* The desk sets the account up now, so this is an explanation rather
                      than an offer — and the promise that nothing about this booking
                      depends on it still stands. */}
                  <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--ivory)] p-3 text-left text-xs text-[var(--muted)]">
                    <p className="font-semibold text-[var(--ink)]">Want your stay on your phone?</p>
                    <p className="mt-1">
                      The front desk sets up a guest app account for you when you arrive: they take your email, the
                      system sets a password, and it is handed to you on a card. After that your room number, your bill
                      and ordering to the room are all on your phone. It stays optional — your reference and phone
                      number are all you need to follow this booking, and everything can be done at the counter.
                    </p>
                    <a
                      className="btn-whatsapp-success mt-2 inline-flex"
                      href={`${WA}${encodeURIComponent(`Hello Sunrise Motel, please set up a guest app account for booking ${result.reference}.`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle size={16} /> Ask for a guest app account
                    </a>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
{/* THE MOBILE STICKY STAY BAR (redesign §2.13) — the dates the guest already
          chose riding along at the bottom of a phone screen once the hero is behind
          them, and stepping out of the way the moment a field has focus. */}
      <StickyStayBar
        checkIn={checkIn}
        checkOut={checkOut}
        nights={nights}
        guests={adults + children}
        href="#rooms-section"
      />
    </div>
  );
}
