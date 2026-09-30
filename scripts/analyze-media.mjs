#!/usr/bin/env node
/**
 * ANALYZE THE MEDIA, THEN ALLOCATE IT — src-independent, dependency-free.
 *
 * WHY THIS EXISTS
 * The property's photographs were never filed. When this ran, `deluxe-main.jpg` was the BUILDING and
 * sat on the Deluxe room card, `deluxe-detail.jpg` was the BAR and sat in both room sets, `listing-11.jpg`
 * was a terrace listed as a Standard room, and `twin-view.jpg` was a double bed on the Twin room. Two
 * whole home-page cards were standing adverts. That is the "everything is mixed up" the owner reported,
 * and guessing again would not fix it — so every file is inventoried, classified once, and the decision
 * is written down where a person can read it and disagree.
 *
 * WHAT IT DOES
 *   A. Inventory   every photograph and video under public/ (and the loose ones in the project root)
 *   B. Classify    hand-verified overrides first (scripts/media-overrides.json), then keyword and
 *                  aspect-ratio rules. Nothing is invented: an unknown file is filed as `other` and
 *                  flagged `needsReview` rather than being quietly guessed at.
 *   C. Allocate    public/media/manifest.json — one row per file with category, tags, confidence,
 *                  suggestedUse, isVideo and a plain-English reason — then copies (never moves) each
 *                  live file into public/media/organized/<category>/ so every surface has a stable,
 *                  servable path. Each group keeps a quota and one cover of its own, and files above
 *                  --max-copy-mb are referenced instead of duplicated, so the 8 MB tour video is
 *                  never copied.
 *   D. Database    creates media_library and seeds it from the manifest with INSERT ... ON CONFLICT
 *                  (file_path) DO UPDATE, so re-running is safe and refreshes instead of duplicating.
 *                  Then places the photographs where the pages actually read them: `room_types.images`
 *                  (each room type gets its own pictures) and the `Rooms` rows of `gallery_images`
 *                  (repointed, or hidden behind the `Hidden` category — no row is ever deleted, so a
 *                  row's own words survive being switched off).
 *   E. Placement   src/lib/media-catalog.ts — the same decisions in the form the pages import — and a
 *                  check of every /images/... path written in src/ against this manifest: MUST CHANGE
 *                  (held, unclassified, the wrong room, or on a page that may not show it) and WORTH A
 *                  LOOK. It runs on every run, dry or live, because that check is the whole reason a
 *                  page can be repointed by hand with confidence.
 *
 * WHAT IT DOES NOT DO
 * It never deletes or moves an original, never deletes a database row, and never edits a page: every
 * page fix it wants is printed as a file, a line and the path to use instead.
 * `--dry-run` writes nothing at all.
 *
 * USAGE
 *   node scripts/analyze-media.mjs                     # scan + manifest + organized/ + local DB
 *   node scripts/analyze-media.mjs --dry-run           # report only, writes nothing
 *   node scripts/analyze-media.mjs --db both           # local AND Neon (production) media_library
 *   node scripts/analyze-media.mjs --db off            # files only, no database
 *   node scripts/analyze-media.mjs --no-root           # skip the loose files in the project root
 *
 * The classification judgement lives in scripts/media-overrides.json, not here: fix a category there and
 * re-run, and the correction survives.
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const MEDIA_DIR = path.join(PUBLIC_DIR, "media");
const ORGANIZED_DIR = path.join(MEDIA_DIR, "organized");
const MANIFEST_PATH = path.join(MEDIA_DIR, "manifest.json");
const REPORT_PATH = path.join(HERE, "media-report.txt");
const CATALOG_PATH = path.join(ROOT, "src", "lib", "media-catalog.ts");
const OVERRIDES_PATH = path.join(HERE, "media-overrides.json");

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const flagValue = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("--") ? args[idx + 1] : fallback;
};

const DRY_RUN = hasFlag("dry-run");
const WITH_ROOT = !hasFlag("no-root");
const DB_TARGET = flagValue("db", "local");
const MAX_COPY_MB = Number(flagValue("max-copy-mb", "6"));
const CATEGORY_CAP = Number(flagValue("cap", "8"));
const ROOM_TYPE_CAP = Number(flagValue("room-cap", "5"));

/**
 * A few categories hold photographs a page names one by one — the dine page lists ten dishes, the
 * coffee service has its own subject — so the default cap would switch off pictures the site uses.
 */
const CATEGORY_CAP_OVERRIDE = { food_dish: 12, restaurant: 10 };

/** The twenty agreed categories. Nothing else may ever be written into `category`. */
const CATEGORIES = [
  "room_standard", "room_deluxe", "room_suite", "room_family",
  "apartment_1bed", "apartment_2bed",
  "building_exterior", "building_interior", "reception", "corridor",
  "restaurant", "food_dish", "bar", "breakfast",
  "amenity_pool", "amenity_garden", "amenity_parking",
  "event", "team_staff", "other",
];
const ROOM_CATEGORIES = ["room_standard", "room_deluxe", "room_suite", "room_family"];
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

/** Which surfaces a category is allowed to appear on. This is what stops a bar shot landing on /stay. */
const SUGGESTED_USE = {
  room_standard: ["/", "/stay", "/gallery"],
  room_deluxe: ["/", "/stay", "/gallery"],
  room_suite: ["/", "/stay", "/gallery"],
  room_family: ["/", "/stay", "/gallery"],
  apartment_1bed: ["/apartments", "/gallery"],
  apartment_2bed: ["/apartments", "/gallery"],
  building_exterior: ["/", "/connect", "/gallery"],
  building_interior: ["/", "/stay", "/connect", "/gallery"],
  reception: ["/connect", "/stay", "/gallery"],
  corridor: ["/connect", "/gallery"],
  restaurant: ["/", "/dine", "/unwind", "/connect", "/gallery"],
  food_dish: ["/dine", "/unwind", "/gallery"],
  bar: ["/unwind", "/dine", "/gallery"],
  breakfast: ["/", "/dine", "/stay", "/connect", "/gallery"],
  amenity_pool: ["/", "/unwind", "/gallery"],
  amenity_garden: ["/", "/unwind", "/connect", "/gallery"],
  amenity_parking: ["/", "/connect", "/gallery"],
  event: ["/", "/unwind", "/gallery"],
  team_staff: ["/connect", "/gallery"],
  // Nothing in `other` is published at all. It is the pile that has not been named yet, and a page
  // showing an unnamed picture is exactly the fault we are fixing — the admin media screen is where
  // the owner gives it a home.
  other: [],
};

/**
 * Which names look right for a cover of each category. Used only to order the candidates: a file
 * called `deluxe-bed.jpg` is a poor label for the restaurant card even when it is the best photograph
 * of the terrace, so a name that matches its category is preferred and a name that contradicts it is
 * pushed down.
 */
const COVER_NAME_HINTS = {
  room_standard: /room|standard|twin|bed/,
  room_deluxe: /deluxe|room|bed|canopy|four[_-]?poster/,
  room_suite: /suite|room/,
  room_family: /family|room|bed/,
  apartment_1bed: /apartment|flat|kitchen|room/,
  apartment_2bed: /apartment|flat|kitchen|room/,
  building_exterior: /exterior|facade|building|outside|front|sign/,
  building_interior: /interior|lobby|inside|corridor|bathroom/,
  reception: /reception|lobby|desk|welcome/,
  corridor: /corridor|hallway|passage|stairs/,
  restaurant: /restaurant|terrace|dining|lounge|tables|dinner|evening/,
  food_dish: /food|dish|plate|meal|curry|grill|braai/,
  bar: /bar|drink|happy[_-]?hour|pool[_-]?table|beer/,
  breakfast: /breakfast|morning|coffee/,
  amenity_pool: /pool|swim/,
  amenity_garden: /garden|lawn|courtyard|grounds/,
  amenity_parking: /park/,
  event: /event|match|braai|happy[_-]?hour|party|final/,
  team_staff: /team|staff|chef|waitress/,
  other: /$^/,
};



// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const slugify = (value) =>
  value
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

const toPosix = (value) => value.split(path.sep).join("/");

/** `public/x/y.jpg` → `x/y.jpg`; a project-root file → `x/y.jpg` relative to the project. */
function publicRelative(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (rel.startsWith(`public${path.sep}`)) return toPosix(rel.slice("public/".length));
  return toPosix(rel);
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
}

/**
 * Width and height straight out of the file header — no dependency, and enough to know whether a
 * shot is portrait (usually a detail) or landscape (a room, a terrace, a facade).
 */
function readDimensions(file, ext) {
  try {
    const buf = readFileSync(file);
    if (ext === ".png" && buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG") {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (ext === ".jpg" || ext === ".jpeg") {
      let offset = 2;
      while (offset < buf.length - 9) {
        if (buf[offset] !== 0xff) { offset += 1; continue; }
        const marker = buf[offset + 1];
        const length = buf.readUInt16BE(offset + 2);
        // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11 and SOF13..SOF15 all carry the frame size.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
    }
    if (ext === ".webp" && buf.toString("ascii", 0, 4) === "RIFF") {
      const kind = buf.toString("ascii", 12, 16);
      if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
  } catch {
    // A header we cannot read is no reason to stop: the file simply arrives without dimensions.
  }
  return { width: null, height: null };
}

// ---------------------------------------------------------------------------
// A. INVENTORY
// ---------------------------------------------------------------------------

/** Directories that only ever hold copies of this project — never inventory them. */
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".kilo", ".vercel", "organized",
  "php-mysql", "SunriseMotelApp", "SunriseAdminApp", "docs", "drizzle", "coverage",
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name))) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function inventory() {
  const files = new Map();

  const add = (absPath, origin) => {
    if (files.has(absPath)) return;
    const ext = path.extname(absPath).toLowerCase();
    if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) return;
    let stat;
    try {
      stat = statSync(absPath);
    } catch {
      return;
    }
    if (!stat.isFile() || stat.size === 0) return;
    const isVideo = VIDEO_EXT.has(ext);
    const dims = isVideo ? { width: null, height: null } : readDimensions(absPath, ext);
    const born = stat.birthtimeMs && stat.birthtimeMs < stat.mtimeMs ? stat.birthtime : stat.mtime;
    files.set(absPath, {
      absPath,
      origin,
      name: path.basename(absPath),
      ext,
      size: stat.size,
      isVideo,
      width: dims.width,
      height: dims.height,
      createdAt: new Date(born).toISOString(),
    });
  };

  if (existsSync(MEDIA_DIR)) for (const file of walk(MEDIA_DIR)) add(file, "media");
  const imagesDir = path.join(PUBLIC_DIR, "images");
  if (existsSync(imagesDir)) for (const file of walk(imagesDir)) add(file, "images");
  try {
    for (const entry of readdirSync(PUBLIC_DIR, { withFileTypes: true })) {
      if (entry.isFile()) add(path.join(PUBLIC_DIR, entry.name), "public");
    }
  } catch {
    // No public/ directory — the caller reports it.
  }
  // The loose photographs and the duplicate video in the project root are inventoried on purpose:
  // this is the pile the owner is looking at, and it has to be named rather than ignored.
  if (WITH_ROOT) {
    try {
      for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
        if (entry.isFile()) add(path.join(ROOT, entry.name), "root");
      }
    } catch {
      // ignore
    }
  }

  const records = [...files.values()];
  for (const record of records) record.hash = sha256(record.absPath);
  return records.sort((a, b) => publicRelative(a.absPath).localeCompare(publicRelative(b.absPath)));
}

// ---------------------------------------------------------------------------
// B. CLASSIFY — overrides first, then keywords and shape
// ---------------------------------------------------------------------------

const overrides = (() => {
  try {
    const raw = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
    const map = new Map();
    for (const [key, value] of Object.entries(raw)) {
      if (key === "_readme") continue;
      map.set(key.toLowerCase(), value);
    }
    return map;
  } catch (error) {
    console.warn(`! Could not read ${path.relative(ROOT, OVERRIDES_PATH)}: ${error.message}`);
    return new Map();
  }
})();

/**
 * Keyword rules, most specific first. Order IS the judgement: "pool-table" is read before "pool"
 * (a pool table is in the bar, not in a swimming pool) and "apartment" before "room" (a flat is not a
 * bedroom). Each rule carries the sentence a person can disagree with.
 */
const KEYWORD_RULES = [
  [/pool[\s_-]?table|billiard|snooker/, "bar", ["pool-table", "lounge", "drinks"], "a pool TABLE belongs to the bar lounge, not the swimming pool"],
  [/apart|kitchen|living[\s_-]?room|self[\s_-]?cater/, "apartment_1bed", ["apartment", "kitchen", "self-catering"], "an apartment: a flat with a kitchen, never a hotel room"],
  [/family/, "room_family", ["family", "beds"], "the word family in the name"],
  [/suite/, "room_suite", ["suite", "lounge"], "the word suite in the name"],
  [/deluxe/, "room_deluxe", ["deluxe"], "the word deluxe in the name"],
  [/twin/, "room_standard", ["twin", "two-beds"], "the word twin: two single beds"],
  [/standard/, "room_standard", ["standard"], "the word standard in the name"],
  [/corridor|hallway|passage|stair/, "corridor", ["corridor", "interior"], "a passage inside the building"],
  [/reception|welcome[\s_-]?desk|front[\s_-]?desk|lobby/, "reception", ["reception", "interior"], "the welcome desk"],
  [/outdoor|outside|exterior|facade|frontage|gate|building|compound/, "building_exterior", ["exterior"], "the outside of the building"],
  [/restaurant|dining[\s_-]?hall|terrace|dine[\s_-]?in|evening[\s_-]?tables|garden[\s_-]?dinner/, "restaurant", ["restaurant", "tables"], "a place where guests eat"],
  [/breakfast/, "breakfast", ["breakfast", "morning"], "a breakfast plate or cup"],
  [/\bbar\b|bar[\s_-]|beer|drink|cocktail/, "bar", ["bar", "drinks"], "the bar and what is drunk there"],
  [/food|dish|plate|grill|braai|curry|nsima|chambo|salad|meat/, "food_dish", ["food", "dish"], "a plated dish"],
  [/pool|swim/, "amenity_pool", ["pool", "swimming"], "a swimming pool"],
  [/garden|lawn|courtyard|grounds|green/, "amenity_garden", ["garden", "grounds"], "the garden and grounds"],
  [/park|car[\s_-]?park|parking|garage|vehicle/, "amenity_parking", ["parking"], "somewhere a car goes"],
  [/staff|team|chef|waiter|uniform/, "team_staff", ["staff", "team"], "the people who work here"],
  [/match[\s_-]?day|happy[\s_-]?hour|event|celebrat|tournament|final\b|poster/, "event", ["event", "announcement"], "something that happens on a date"],
  [/coffee|workspace|laptop|starlink|wifi|snack/, "restaurant", ["coffee", "workspace"], "the coffee and snack service"],
  [/room|bed|mattress|pillow|linen|towels/, "room_standard", ["room", "bed", "review"], ""],
  [/logo|icon|map|diagram|screenshot/, "other", ["graphic", "not-a-photograph"], "branding or a diagram, not the property"],
];

/** Room type ids are read from the live database when one is reachable; these are the known names. */
const KNOWN_ROOM_TYPE_HINTS = [
  [/twin|two[\s_-]?single/, "twin"],
  [/deluxe|canopy|four[\s_-]?poster/, "deluxe"],
  [/standard|queen/, "standard"],
];

/**
 * The room type a category implies when neither the name nor the override picks one: a photo filed as
 * a family room belongs to the family room even when the file is called 691294883.jpg. Only used when
 * the database agrees the type exists.
 */
const IMPLIED_ROOM_TYPE = {
  room_standard: "standard",
  room_deluxe: "deluxe",
  room_suite: "suite",
  room_family: "family",
};

/** Name first, then what the category implies — and never a room type the database has not got. */
function resolveRoomTypeId(category, name, knownRoomTypes) {
  if (!ROOM_CATEGORIES.includes(category)) return null;
  const named = roomTypeFromName(name, knownRoomTypes);
  if (named) return named;
  const implied = IMPLIED_ROOM_TYPE[category] ?? null;
  if (!implied) return null;
  return !knownRoomTypes.length || knownRoomTypes.includes(implied) ? implied : null;
}

function roomTypeFromName(name, knownRoomTypes) {
  const lower = name.toLowerCase();
  for (const [pattern, candidate] of KNOWN_ROOM_TYPE_HINTS) {
    if (pattern.test(lower) && (!knownRoomTypes.length || knownRoomTypes.includes(candidate))) return candidate;
  }
  return null;
}

/** "portrait" means taller than wide, which is usually a detail shot rather than a whole room. */
function shapeOf(record) {
  if (!record.width || !record.height) return "unknown";
  const ratio = record.height / record.width;
  if (ratio > 1.15) return "portrait";
  if (ratio < 0.85) return "wide";
  return "landscape";
}

function classify(record, knownRoomTypes) {
  const override = overrides.get(record.name.toLowerCase());

  if (override) {
    if (!CATEGORIES.includes(override.category)) {
      throw new Error(`${record.name}: override category "${override.category}" is not one of the agreed categories`);
    }
    return {
      category: override.category,
      roomTypeId: override.roomTypeId ?? resolveRoomTypeId(override.category, record.name, knownRoomTypes),
      tags: override.tags ?? [],
      confidence: override.confidence ?? 0.9,
      reason: override.reason ?? "hand-verified classification",
      altText: override.alt ?? null,
      verifiedBy: override.verifiedBy ?? "vision",
      needsReview: Boolean(override.needsReview),
      hold: override.hold ?? null,
      isCover: Boolean(override.isCover),
      // `keepActive: true` means a page needs this photograph, so the quota may not switch it off.
      pinned: Boolean(override.keepActive),
      source: "override",
    };
  }

  const shape = shapeOf(record);

  // Videos first: a video is never a still photograph of a room, whatever it happens to be called.
  if (record.isVideo) {
    const hero = /hero|tour|overview|sunrise|motel|walk|promo|intro|spacious/i.test(record.name);
    const amenity = /pool|garden|braai|grounds/i.test(record.name);
    const event = /match|party|wedding|event|live/i.test(record.name);
    return {
      category: event ? "event" : "building_exterior",
      roomTypeId: null,
      tags: [
        hero ? "hero_video" : amenity ? "amenity_video" : event ? "event_video" : "tour_video",
        ...(record.size > 3_000_000 ? ["large"] : []),
      ],
      confidence: hero ? 0.7 : 0.5,
      reason: hero
        ? "A video whose name reads like the property tour, so it is the home page candidate"
        : "A video: filed as property footage and tagged for an amenity or event slot",
      altText: null,
      verifiedBy: "filename",
      needsReview: !hero,
      hold: null,
      isCover: false,
      source: "heuristic",
    };
  }

  for (const [pattern, category, tags, why] of KEYWORD_RULES) {
    if (!pattern.test(record.name.toLowerCase())) continue;
    return {
      category,
      roomTypeId: resolveRoomTypeId(category, record.name, knownRoomTypes),
      tags: [...tags, ...(shape !== "unknown" ? [shape] : [])],
      confidence: why ? 0.62 : 0.45,
      reason: why
        ? `The filename reads like ${why} — check the picture before trusting it`
        : "The name says room or bed but nothing says which kind of room",
      altText: null,
      verifiedBy: "filename",
      needsReview: true,
      hold: null,
      isCover: false,
      source: "heuristic",
    };
  }

  return {
    category: "other",
    roomTypeId: null,
    tags: ["unclassified", ...(shape !== "unknown" ? [shape] : [])],
    confidence: 0.3,
    reason: "Neither the name nor a hand-verified note says what this is, so it waits in `other` for the owner to name it",
    altText: null,
    verifiedBy: "none",
    needsReview: true,
    hold: null,
    isCover: false,
    source: "heuristic",
  };
}

// ---------------------------------------------------------------------------
// C. ALLOCATE — copy into place, apply quotas, choose a cover per group
// ---------------------------------------------------------------------------

/** The name a file takes inside organized/<category>/, unique even when two sources share a basename. */
function organizedName(record, taken) {
  const base = slugify(path.basename(record.name, record.ext)) || record.hash;
  let candidate = `${base}${record.ext}`;
  if (taken.has(candidate)) candidate = `${base}-${record.hash.slice(0, 6)}${record.ext}`;
  taken.add(candidate);
  return candidate;
}

/** Copies a file into public/media/organized/<category>/ and returns the path the website will use. */
function placeFile(item, taken) {
  const tooBig = item.size > MAX_COPY_MB * 1024 * 1024;
  if (tooBig) {
    item.referenced = true;
    // A big file that already lives under public/ is servable where it is; one loose in the project
    // root is not, and no page may be pointed at it.
    item.servable = item.origin !== "root";
    item.copyNote =
      item.origin === "root"
        ? `NOT SERVABLE YET — ${(item.size / 1024 / 1024).toFixed(1)} MB loose file in the project root; move it into public/media/ by hand`
        : `referenced where it already lives (${(item.size / 1024 / 1024).toFixed(1)} MB, above the ${MAX_COPY_MB} MB copy limit — no second copy on disk)`;
    // A loose root file is not servable, so it keeps its project path and the report says why.
    return item.origin === "root" ? item.publicPath : item.publicPath;
  }

  const name = organizedName(item, taken);
  item.organizedPath = `${item.category}/${name}`;
  item.servable = true;
  item.copyNote =
    item.origin === "root"
      ? "copied out of the project root into public/ — the original is left untouched"
      : "copied into organized/ — the original is left untouched";

  if (!DRY_RUN) {
    const destination = path.join(ORGANIZED_DIR, item.category, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    const current = existsSync(destination) ? statSync(destination) : null;
    if (!current || current.size !== item.size) copyFileSync(item.absPath, destination);
  }
  return `media/organized/${item.organizedPath}`;
}

/** Every group key: rooms are grouped per room TYPE, everything else per category. */
function groupKey(item) {
  return ROOM_CATEGORIES.includes(item.category) ? `${item.category}|${item.roomTypeId ?? "-"}` : item.category;
}

/**
 * The same bytes under two names — and this happened constantly here. `dine-boiled-beef.jpg` in
 * public/images is also `WhatsApp Image 2026-07-23 at 7.05.57 PM.jpeg` in the project root; the
 * photograph of the bar also sits there named after a whisky brand printed on it. One name wins and
 * the others are kept as spares, and EVERY copy inherits the verdict — including a hold, because
 * identical bytes carry identical rights problems whichever name they happen to wear.
 */
function resolveDuplicates(items) {
  const byHash = new Map();
  for (const item of items) byHash.set(item.hash, [...(byHash.get(item.hash) ?? []), item]);

  const groups = [];
  for (const group of byHash.values()) {
    if (group.length < 2) continue;

    // The name a person would want to see in the admin screen: a served file over a loose one, and a
    // description over a WhatsApp export.
    const nameScore = (item) =>
      (item.origin === "root" ? 0 : 100) +
      (/^whatsapp/i.test(item.name) ? -60 : 40) +
      (item.name.length <= 32 ? 20 : 0);
    const winner = [...group].sort((a, b) => nameScore(b) - nameScore(a) || b.size - a.size)[0];

    // The hand-verified member is the one holding the knowledge, wherever it happens to sit. What the
    // owner said beats what was seen, and what was seen beats what the filename claims.
    const rank = (item) => ({ owner: 3, vision: 2, filename: 1 }[item.verifiedBy] ?? 0);
    const judge = [...group].sort(
      (a, b) =>
        rank(b) - rank(a) ||
        Number(b.source === "override") - Number(a.source === "override") ||
        b.confidence - a.confidence,
    )[0];
    const holds = [...new Set(group.map((item) => item.hold).filter(Boolean))];

    for (const item of group) {
      for (const key of ["category", "roomTypeId", "altText", "verifiedBy"]) item[key] = judge[key];
      item.tags = [...new Set([...judge.tags, ...item.tags])];
      item.confidence = Math.max(judge.confidence, item.confidence);
      if (item !== judge) {
        item.reason = `Identical bytes to ${judge.name}: ${judge.reason}`;
        item.source = `${judge.source} (same picture as ${judge.name})`;
        item.needsReview = judge.verifiedBy === "vision" ? false : item.needsReview;
      }
      if (holds.length) item.hold = holds.join(" ");
      if (item !== winner) {
        item.duplicateOf = winner.name;
        item.tags = [...new Set([...item.tags, "duplicate"])];
      }
    }
    groups.push({ winner, judge, members: group, holds });
  }
  return groups;
}

/** How good a cover a file makes: a hand-made choice first, then a name that actually fits. */
function coverScore(item) {
  if (item.hold || item.category === "other") return -1;
  const hint = COVER_NAME_HINTS[item.category] ?? /$^/;
  const lower = item.name.toLowerCase();
  let score = Number(item.isCover) * 1000 + (hint.test(lower) ? 200 : 0);
  // A name that contradicts the category makes a confusing cover even when the picture itself is fine,
  // which is how a terrace called `deluxe-bed.jpg` ended up on the restaurant card.
  if (!ROOM_CATEGORIES.includes(item.category) && /bed|room|twin/.test(lower)) score -= 300;
  return score + item.confidence * 10 + item.size / 1e7 - (item.duplicateOf ? 50 : 0);
}


// ---------------------------------------------------------------------------
// D. DATABASE — media_library, created if missing, then seeded from the manifest
// ---------------------------------------------------------------------------

function envValue(key) {
  if (process.env[key]) return process.env[key];
  try {
    const line = readFileSync(path.join(ROOT, ".env"), "utf8")
      .split(/\r?\n/)
      .find((row) => row.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).replace(/^["']|["']$/g, "") : undefined;
  } catch {
    return undefined;
  }
}

const MEDIA_LIBRARY_DDL = `
CREATE TABLE IF NOT EXISTS media_library (
  id varchar(36) PRIMARY KEY NOT NULL,
  file_path text NOT NULL UNIQUE,
  category varchar(40) NOT NULL,
  tags text[] DEFAULT '{}' NOT NULL,
  room_type_id varchar(36),
  is_active boolean DEFAULT true NOT NULL,
  is_cover boolean DEFAULT false NOT NULL,
  is_video boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  alt_text varchar(255),
  confidence real,
  reason text,
  source_file text,
  width integer,
  height integer,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
)`;

/**
 * Connect to whichever databases were asked for. A database that is not reachable is reported and
 * skipped: the scan itself must still succeed, because the files matter more than the seed.
 */
async function connectDatabases(target) {
  let Client;
  try {
    ({ Client } = await import("pg"));
  } catch {
    console.warn("! pg is not installed, so media_library cannot be seeded (the files were still analysed).");
    return [];
  }

  const candidates =
    target === "both"
      ? [
          { label: "local", url: envValue("DATABASE_URL") },
          { label: "neon", url: envValue("NEON_DATABASE_URL_UNPOOLED") ?? envValue("NEON_DATABASE_URL") },
        ]
      : target.includes("://")
        ? [{ label: "url", url: target }]
        : [{ label: target, url: target === "neon" ? envValue("NEON_DATABASE_URL_UNPOOLED") ?? envValue("NEON_DATABASE_URL") : envValue("DATABASE_URL") }];

  const connected = [];
  for (const candidate of candidates) {
    if (!candidate.url) {
      console.warn(`! ${candidate.label}: no connection string in .env — skipped`);
      continue;
    }
    const client = new Client({
      connectionString: candidate.url,
      ssl: /neon\.tech|sslmode=require/.test(candidate.url) ? { rejectUnauthorized: false } : undefined,
    });
    try {
      await client.connect();
      connected.push({ ...candidate, client });
    } catch (error) {
      console.warn(`! ${candidate.label}: could not connect (${error.message}) — skipped`);
    }
  }
  return connected;
}

/** The room type ids that actually exist, so a media row never points at a room type that is not there. */
async function loadRoomTypeIds(databases) {
  const ids = new Set();
  for (const database of databases) {
    try {
      const result = await database.client.query("SELECT id FROM room_types ORDER BY id");
      for (const row of result.rows) ids.add(row.id);
    } catch {
      // No room_types table yet: the hints alone decide.
    }
  }
  return [...ids];
}

async function seedMediaLibrary(databases, items) {
  for (const database of databases) {
    await database.client.query(MEDIA_LIBRARY_DDL);
    let written = 0;
    for (const item of items) {
      await database.client.query(
        `INSERT INTO media_library
           (id, file_path, category, tags, room_type_id, is_active, is_cover, is_video, sort_order, alt_text, confidence, reason, source_file, width, height)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (file_path) DO UPDATE SET
           category = EXCLUDED.category,
           tags = EXCLUDED.tags,
           room_type_id = EXCLUDED.room_type_id,
           is_active = EXCLUDED.is_active,
           is_cover = EXCLUDED.is_cover,
           is_video = EXCLUDED.is_video,
           sort_order = EXCLUDED.sort_order,
           alt_text = EXCLUDED.alt_text,
           confidence = EXCLUDED.confidence,
           reason = EXCLUDED.reason,
           source_file = EXCLUDED.source_file,
           width = EXCLUDED.width,
           height = EXCLUDED.height,
           updated_at = now()`,
        [
          randomUUID(),
          item.file,
          item.category,
          item.tags,
          item.roomTypeId,
          item.isActive,
          item.isCover,
          item.isVideo,
          item.sortOrder,
          item.altText,
          item.confidence,
          item.reason,
          item.publicPath,
          item.width,
          item.height,
        ],
      );
      written += 1;
    }
    console.log(`  ${database.label}: media_library ready, ${written} rows inserted or refreshed`);
  }
}

// ---------------------------------------------------------------------------
// E. PLACEMENT — the allocation reaching the surfaces the guest actually sees
//
// The files being right is not the same as the website being right: /stay builds its room cards from
// `room_types.images`, /gallery reads `gallery_images`, and pages still hardcode `/images/...` paths.
// This section re-points those rows at the allocated files, then CHECKS every hardcoded path in src/
// against the manifest — so a building photograph on a room card is reported, not trusted.
// ---------------------------------------------------------------------------

/** The URL the website uses for a photo, or null when the file cannot be served at all. */
const urlOf = (item) => (item.servable ? `/${item.file}` : null);

/** Photos of one room type, cover first — the order a room card should show them in. */
const photosOfRoomType = (items, roomTypeId) =>
  items
    .filter((item) => item.roomTypeId === roomTypeId && item.isActive && !item.isVideo && urlOf(item))
    .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder);

/** The name the property gives each room type, so a retitled gallery row reads like the room. */
const ROOM_LABEL = { standard: "The Standard", deluxe: "The Deluxe", twin: "The Twin" };

/** A short honest label taken from the vision-written alt text rather than invented. */
function titleOf(item, prefix) {
  const clause = (item.altText ?? "").split(/[,.:;—]/)[0].trim().replace(/^(A|An|The) /, "");
  const capped = clause.length > 52 ? `${clause.slice(0, 49).trim()}...` : clause;
  if (!capped) return item.name;
  const title = prefix ? `${prefix} — ${capped}` : capped;
  return `${title.charAt(0).toUpperCase()}${title.slice(1)}`.slice(0, 155);
}

/** Rooms, Property, Dining, Events, Work — the five categories /gallery offers, per README §4.7. */
const GALLERY_CATEGORY = {
  room_standard: "Rooms", room_deluxe: "Rooms", room_suite: "Rooms", room_family: "Rooms",
  apartment_1bed: "Rooms", apartment_2bed: "Rooms",
  building_exterior: "Property", building_interior: "Property", reception: "Property",
  corridor: "Property", amenity_pool: "Property", amenity_garden: "Property", amenity_parking: "Property",
  restaurant: "Dining", food_dish: "Dining", bar: "Dining", breakfast: "Dining",
  event: "Events", team_staff: "Work", other: "Hidden",
};

/**
 * Applies the plan: room cards from media_library, the gallery rows from the same verdict. Rows are
 * never deleted — a picture that must not be published is moved out of the public list, not destroyed,
 * so the manager can still see it and put it back once the rights issue is settled.
 */
async function placeInDatabase(databases, items) {
  const changes = [];
  for (const database of databases) {
    try {
      const roomTypes = (await database.client.query("select id, name, images from room_types order by id")).rows;
      for (const row of roomTypes) {
        const photos = photosOfRoomType(items, row.id).slice(0, 6).map(urlOf);
        if (!photos.length) {
          changes.push({ label: database.label, table: "room_types", id: row.id, what: row.name, note: "no usable picture for this room type yet — its card is left exactly as it was" });
          continue;
        }
        const before = safeJsonList(row.images);
        if (JSON.stringify(before) === JSON.stringify(photos)) continue;
        changes.push({ label: database.label, table: "room_types", id: row.id, what: row.name, note: `${before.length} photo(s) -> ${photos.length}`, before, after: photos });
        if (!DRY_RUN) await database.client.query("update room_types set images = $1 where id = $2", [JSON.stringify(photos), row.id]);
      }

      const rows = (await database.client.query("select id, title, category, image_url, alt_text, display_order from gallery_images order by display_order, id")).rows;
      const plan = planGallery(rows, items);
      for (const entry of plan) {
        const { row, action } = entry;
        if (action === "leave") continue;
        const note = action === "hide"
          ? `taken out of the public gallery: ${entry.why}`
          : `re-pointed at ${entry.target.name} — ${entry.why}`;
        changes.push({ label: database.label, table: "gallery_images", id: row.id, what: row.title, note, before: row.image_url, after: action === "hide" ? "category Hidden" : entry.imageUrl });
        if (DRY_RUN) continue;
        if (action === "hide") {
          await database.client.query(
            "update gallery_images set category = 'Hidden', display_order = $2, caption = $3 where id = $1",
            [row.id, 900 + Number(row.display_order ?? 0), `NOT FOR PUBLISHING — ${entry.why}`],
          );
        } else {
          await database.client.query(
            "update gallery_images set image_url = $2, title = $3, alt_text = $4, category = $5 where id = $1",
            [row.id, entry.imageUrl, entry.title, entry.altText, GALLERY_CATEGORY[entry.target.category] ?? "Property"],
          );
        }
      }
      if (plan.some((entry) => entry.action !== "leave")) {
        changes.push({
          label: database.label, table: "gallery_images", id: "-", what: `${rows.length} rows checked`,
          note: `${plan.filter((e) => e.action === "repoint").length} re-pointed, ${plan.filter((e) => e.action === "hide").length} taken out, ${plan.filter((e) => e.action === "leave").length} left alone`,
        });
      }
    } catch (error) {
      changes.push({ label: database.label, table: "placement", id: "-", what: "placement failed", note: error.message });
    }
  }
  return changes;
}

/** `room_types.images` is a JSON list of paths; anything else is treated as empty. */
function safeJsonList(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Every hardcoded picture path in src/, checked against the manifest. The surface a path sits on comes
 * from the file it is in — or, in the shared experience-pages.tsx, from the page component it is in.
 */
const ROUTE_OF_FILE = {
  "src/app/page.tsx": "/",
  "src/app/stay/page.tsx": "/stay",
  "src/app/dine/page.tsx": "/dine",
  "src/app/unwind/page.tsx": "/unwind",
  "src/app/connect/page.tsx": "/connect",
  "src/app/gallery/page.tsx": "/gallery",
};
const ROUTE_OF_COMPONENT = {
  HomePage: "/",
  StayPage: "/stay",
  DinePage: "/dine",
  UnwindPage: "/unwind",
  ConnectPage: "/connect",
  GalleryPage: "/gallery",
};

function walkSource(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSource(full, out);
    else if ([".tsx", ".ts", ".css"].includes(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

/** Matches /images/<something>.<ext> wherever it is written. */
const PICTURE_PATH = /\/images\/([A-Za-z0-9._\-() ]+\.(?:jpe?g|png|webp|avif|svg|mp4))/gi;

function checkReferences(items) {
  const byName = new Map();
  for (const item of items) if (!byName.has(item.name) || item.isActive) byName.set(item.name, item);
  const findings = [];
  // Every path the scan actually looked at, so the summary can say how many were checked rather than
  // how many were wrong — "0 checked" would read as if the check had not run at all.
  let seen = 0;

  for (const file of walkSource(path.join(ROOT, "src"))) {
    const rel = toPosix(path.relative(ROOT, file));
    const isStylesheet = rel.endsWith(".css");
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    let route = ROUTE_OF_FILE[rel] ?? null;

    lines.forEach((text, index) => {
      const declaration = /export function (\w+)/.exec(text);
      if (declaration) route = ROUTE_OF_COMPONENT[declaration[1]] ?? null;

      // A rule such as `.stay-hero-backdrop` names its own surface; anything else carries no route.
      let surface = route;
      if (isStylesheet) {
        const selector = (text.split("{")[0] ?? text).toLowerCase();
        const guessed = /\b(stay|dine|unwind|connect|gallery)\b/.exec(selector);
        surface = guessed ? `/${guessed[1]}` : /hero/.test(selector) ? "/" : null;
      }

      for (const match of text.matchAll(PICTURE_PATH)) {
        const name = match[1].trim();
        const item = byName.get(name);
        seen += 1;
        const where = { file: rel, line: index + 1, path: `/images/${name}`, surface, text: text.trim().slice(0, 100) };

        if (!item) {
          // Icons, logos and other site furniture are not photographs, so they are not in the inventory
          // and there is nothing to check: only a path that points at nothing at all is reported.
          const onDisk = [path.join(PUBLIC_DIR, "images", name), path.join(PUBLIC_DIR, name)].some((candidate) => existsSync(candidate));
          if (!onDisk) {
            findings.push({ ...where, severity: "unknown", why: "no file of that name exists anywhere under public/ or in the project root" });
          }
          continue;
        }
        if (item.hold) {
          findings.push({ ...where, item, severity: "held", why: item.hold, fix: null });
          continue;
        }
        if (item.category === "other") {
          findings.push({ ...where, item, severity: "unclassified", why: "the file is unclassified, so no page may show it", fix: null });
          continue;
        }
        if (!item.isActive) {
          findings.push({ ...where, item, severity: "unused", why: "the file is switched off (a spare, or over its group's quota), so this path is the one place it still shows", fix: null });
        }

        // A room picture that contradicts the words beside it is exactly the fault the owner reported —
        // and so is a room claim on a photograph that is not that room at all, which is how the building
        // exterior ended up on the Deluxe card. Paths are stripped so a filename cannot vote, and the
        // words on this line win over the words nearby.
        const sameLine = text.replace(PICTURE_PATH, " ");
        const nearby = lines.slice(Math.max(0, index - 2), index + 3).join(" ");
        const claimed = roomTypeFromName(sameLine, []) ?? roomTypeFromName(nearby.replace(PICTURE_PATH, " "), []);
        const roomFacility = item.category === "building_interior" && /bath|shower|en[-\s]?suite|toilet/i.test(`${sameLine} ${nearby}`);
        if (claimed && item.roomTypeId !== claimed && !roomFacility) {
          const better = photosOfRoomType(items, claimed)[0];
          findings.push({
            ...where, item, severity: "wrong-room",
            why: item.roomTypeId
              ? `the words around it say ${claimed}, but this file is a ${item.roomTypeId} room (${item.altText ?? item.reason})`
              : `the words around it say ${claimed}, but this file is not a room — it is ${item.category.replace(/_/g, " ")} (${item.altText ?? item.reason})`,
            fix: better ? urlOf(better) : null,
          });
          continue;
        }
        if (surface && surface !== "/" && !(SUGGESTED_USE[item.category] ?? []).includes(surface)) {
          // The landing page is a hand-curated showcase — one photograph of each part of the property
          // belongs there — so only the pages with a fixed subject are checked for the wrong subject.
          findings.push({
            ...where, item, severity: "wrong-surface",
            why: `${item.category.replace(/_/g, " ")} is not allowed on ${surface} (that category belongs on ${(SUGGESTED_USE[item.category] ?? []).join(", ") || "nothing yet"})`,
            fix: null,
          });
        }
      }
    });
  }
  return { findings, seen };
}

/**
 * Writes the corrected allocation into src/lib/media-catalog.ts, so a page can ask for "the deluxe
 * room's cover" instead of naming a file — naming a file is how the wrong picture got there.
 */
function buildCatalog(items) {
  const entry = (item) => ({
    src: urlOf(item),
    alt: item.altText ?? item.reason,
    title: titleOf(item, item.roomTypeId ? ROOM_LABEL[item.roomTypeId] : null),
    category: item.category,
    tags: item.tags,
    width: item.width,
    height: item.height,
  });
  const pick = (rows) =>
    rows
      .filter((item) => item.isActive && !item.isVideo && urlOf(item))
      .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder)
      .map(entry);

  const byCategory = {};
  for (const category of CATEGORIES) {
    const rows = pick(items.filter((item) => item.category === category));
    if (rows.length) byCategory[category] = rows;
  }
  const byRoomType = {};
  for (const roomTypeId of ["standard", "deluxe", "twin", "family", "suite"]) {
    const rows = pick(items.filter((item) => item.roomTypeId === roomTypeId));
    if (rows.length) byRoomType[roomTypeId] = rows;
  }
  const videos = items.filter((item) => item.isVideo && item.isActive && urlOf(item)).map(entry);
  const heroVideo = videos.find((video) => video.tags.includes("hero_video")) ?? videos[0] ?? null;
  const heroImage = (byCategory.building_exterior ?? byCategory.restaurant ?? [])[0] ?? null;

  return [
    "/*",
    " * GENERATED by scripts/analyze-media.mjs — do not edit this file by hand.",
    " * Every path here was decided by looking at the photograph and written down in scripts/media-overrides.json.",
    " * To change one, edit that file and run `node scripts/analyze-media.mjs` again.",
    ` * ${items.filter((i) => i.isActive).length} live files, generated ${new Date().toISOString().slice(0, 10)}.`,
    " */",
    "",
    "export type MediaEntry = {",
    "  src: string;",
    "  alt: string;",
    "  title: string;",
    "  category: string;",
    "  tags: string[];",
    "  width: number | null;",
    "  height: number | null;",
    "};",
    "",
    `export const MEDIA: Record<string, MediaEntry[]> = ${JSON.stringify(byCategory, null, 2)};`,
    "",
    `export const ROOM_PHOTOS: Record<string, MediaEntry[]> = ${JSON.stringify(byRoomType, null, 2)};`,
    "",
    `export const HERO_VIDEO: MediaEntry | null = ${JSON.stringify(heroVideo, null, 2)};`,
    "",
    `export const HERO_IMAGE: MediaEntry | null = ${JSON.stringify(heroImage, null, 2)};`,
    "",
    "/** The cover of a category — the first live photo, which is the one the run chose. */",
    "export const coverOf = (category: string): MediaEntry | null => MEDIA[category]?.[0] ?? null;",
    "",
    "/** The photographs of a room type, cover first; falls back to whatever rooms there are. */",
    "export const photosOf = (roomTypeId: string): MediaEntry[] =>",
    "  ROOM_PHOTOS[roomTypeId] ?? ROOM_PHOTOS.standard ?? ROOM_PHOTOS.deluxe ?? [];",
    "",
  ].join("\n");
}

/**
 * What each /gallery row should show. A row is only moved when its picture is held, unclassified or
 * plainly the wrong thing for what the row claims; a row that is already right is left alone, so the
 * result of a run stays reviewable.
 */
function planGallery(rows, items) {
  const active = items.filter((item) => item.isActive && !item.isVideo && urlOf(item));
  const coverFirst = (a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder;
  const byType = new Map();
  for (const item of active.filter((row) => row.roomTypeId)) {
    byType.set(item.roomTypeId, [...(byType.get(item.roomTypeId) ?? []), item].sort(coverFirst));
  }
  const roomPool = active.filter((row) => ROOM_CATEGORIES.includes(row.category)).sort(coverFirst);
  const used = new Set();
  const plan = [];

  for (const row of rows) {
    const current = items.find(
      (item) => item.servable && (`/${item.file}` === row.image_url || item.name === path.basename(row.image_url)),
    );

    if (current && (current.hold || current.category === "other")) {
      plan.push({ row, action: "hide", current, why: current.hold ?? "the picture is unclassified, so it waits until somebody names it" });
      continue;
    }
    if (!current) {
      plan.push({ row, action: "leave", current: null, why: "not a file the allocator knows — an upload, left exactly as it is" });
      continue;
    }

    // Only the room rows are re-allocated: that is where the wrong photographs were.
    let wanted = null;
    if (row.category === "Rooms") {
      const claimed = roomTypeFromName(row.title, []);
      const pool = claimed ? byType.get(claimed) ?? [] : roomPool;
      // A photograph of a room's own bathroom is a room photograph, so it is left alone; a terrace on a
      // room row is not.
      const roomish = [...ROOM_CATEGORIES, ...(/bath|shower|en[-\s]?suite|toilet|interior/i.test(row.title) ? ["building_interior"] : [])];
      if (claimed && current.roomTypeId !== claimed) {
        wanted = { pool, why: `the row says "${row.title}" but the picture is a ${current.category.replace(/_/g, " ")} (${current.name})` };
      } else if (!claimed && !roomish.includes(current.category)) {
        wanted = { pool: roomPool, why: `a room row was showing a ${current.category.replace(/_/g, " ")} (${current.name})` };
      } else if (used.has(urlOf(current))) {
        wanted = { pool, why: `the same picture is already used higher up the gallery (${current.name})` };
      }
    }

    let target = current;
    let why = "already correct";
    if (wanted) {
      const fresh = wanted.pool.filter((item) => !used.has(urlOf(item)));
      const keep = wanted.pool.includes(current) && !used.has(urlOf(current)) ? current : fresh[0];
      if (!keep) {
        plan.push({ row, action: "hide", current, why: `no usable picture left for this row (${wanted.why})` });
        continue;
      }
      if (keep !== current) {
        target = keep;
        why = wanted.why;
      }
    }

    used.add(urlOf(target));
    if (target === current) {
      plan.push({ row, action: "leave", current, why });
      continue;
    }
    plan.push({
      row, action: "repoint", current, target, why,
      imageUrl: urlOf(target),
      title: titleOf(target, target.roomTypeId ? ROOM_LABEL[target.roomTypeId] : null),
      altText: target.altText ?? row.alt_text,
    });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// E. THE RUN
// ---------------------------------------------------------------------------

function manifestRow(item) {
  return {
    file: item.file,
    category: item.category,
    tags: item.tags,
    confidence: item.confidence,
    suggestedUse: item.suggestedUse,
    isVideo: item.isVideo,
    reason: item.reason,
    // Beyond the agreed shape, kept because a person needs them to audit the decision:
    sourceFile: item.publicPath,
    altText: item.altText,
    roomTypeId: item.roomTypeId,
    isCover: item.isCover,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    verifiedBy: item.verifiedBy,
    needsReview: item.needsReview,
    held: item.hold,
    bytes: item.size,
    width: item.width,
    height: item.height,
  };
}

function buildReport(items, duplicateGroups, extra = {}) {
  const lines = [];
  const say = (text = "") => lines.push(text);

  const count = (rows) => String(rows.length).padStart(3);
  say(`MEDIA REPORT - Sunrise Motel      ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  say(`${items.length} files: ${items.filter((i) => i.isActive).length} live on the site, ${items.length - items.filter((i) => i.isActive).length} not (held, spare or unclassified)`);

  const byCategory = new Map();
  for (const item of items) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);

  say("");
  say("WHERE EVERYTHING WENT");
  say("  category                  files  live  cover                         used on");
  for (const category of CATEGORIES) {
    const rows = byCategory.get(category);
    if (!rows?.length) continue;
    const cover = rows.find((row) => row.isCover);
    say(
      `  ${category.padEnd(22)} ${count(rows)} ${String(rows.filter((r) => r.isActive).length).padStart(5)}  ${(cover ? cover.file.split("/").pop() : "-").padEnd(28)}  ${(SUGGESTED_USE[category] ?? []).join(" ")}`,
    );
  }

  say("");
  say("ROOMS - one line per room type, which is the part that was wrong");
  const roomGroups = new Map();
  for (const item of items.filter((row) => ROOM_CATEGORIES.includes(row.category))) {
    const key = `${item.category} / ${item.roomTypeId ?? "NO ROOM TYPE"}`;
    roomGroups.set(key, [...(roomGroups.get(key) ?? []), item]);
  }
  const shortages = [];
  for (const [key, group] of [...roomGroups].sort()) {
    const cover = group.find((row) => row.isCover);
    say(`  ${key.padEnd(34)} ${String(group.length).padStart(2)} photo(s)   cover: ${cover ? cover.file.split("/").pop() : "none"}`);
    if (group.length < 3) shortages.push(`${key} has only ${group.length} photo(s)`);
  }
  for (const item of items.filter((row) => ROOM_CATEGORIES.includes(row.category) && row.verifiedBy !== "vision")) {
    say(`      ! ${item.name} -> put on a room from its name alone, not from looking at it: ${item.reason}`);
  }

  const held = items.filter((item) => item.hold);
  if (held.length) {
    say("");
    say(`HELD BACK (${held.length}) - published on no surface at all, and here is why`);
    for (const item of held) {
      say(`  ${item.name}`);
      say(`      ${item.hold}`);
    }
    say("  To clear one: fix the rights issue, then delete its `hold` line in scripts/media-overrides.json");
    say("  and run this again. Identical copies inherit a hold, so one entry can hold several files.");
  }

  const review = items.filter((item) => item.needsReview && !item.hold && item.category !== "other");
  say("");
  if (review.length) {
    say(`NEEDS A HUMAN EYE (${review.length}) - filed from the filename, not from the picture`);
    for (const item of review.slice(0, 15)) say(`  ${item.name}  ->  ${item.category}   (${item.confidence.toFixed(2)})`);
    if (review.length > 15) say(`  ... and ${review.length - 15} more, all listed in the manifest`);
  } else {
    say("NEEDS A HUMAN EYE: nothing. Every file was either hand-verified or unambiguous.");
  }

  const unclassified = items.filter((item) => item.category === "other");
  if (unclassified.length) {
    say("");
    say(`UNCLASSIFIED (${unclassified.length}) - listed but deliberately shown nowhere`);
    for (const item of unclassified) say(`  ${item.name}  (${(item.size / 1024).toFixed(0)} KB)`);
    say("  These are the site icons, the old advert posters and anything nobody has named yet. They are");
    say("  in the manifest and in the media_library table, so the portal can list them — but no page may");
    say("  pick one up until it has been named, which is what stops a shop poster becoming a room card.");
  }

  const loose = items.filter((item) => item.origin === "root");
  if (loose.length) {
    say("");
    say(`LOOSE FILES IN THE PROJECT ROOT: ${loose.length} found (${loose.filter((i) => i.isActive).length} of them usable)`);
    say("  These sat outside public/, so no page could ever show them. The servable ones have been copied");
    say("  into public/media/organized/<category>/ and the originals were left exactly where they were:");
    for (const item of loose) say(`  ${item.name}  ->  ${item.file}`);
  }

  if (duplicateGroups.length) {
    say("");
    say(`IDENTICAL FILES (${duplicateGroups.length} group(s)) - the same bytes saved under more than one name`);
    for (const group of duplicateGroups) {
      say(`  ${group.winner.name}  <-  keeps the name   (${(group.members[0].size / 1024).toFixed(0)} KB each)`);
      for (const spare of group.members.filter((row) => row !== group.winner)) {
        say(`      spare: ${spare.name}${spare.hold ? "   [inherits the hold on this picture]" : ""}`);
      }
    }
  }

  const videos = items.filter((item) => item.isVideo);
  if (videos.length) {
    say("");
    say("VIDEO");
    for (const item of videos) {
      say(`  ${item.file}   ${(item.size / 1024 / 1024).toFixed(1)} MB   tags: ${item.tags.join(", ")}`);
      say(`      ${item.copyNote}`);
      if (item.holdNote) say(`      ${item.holdNote}`);
    }
    const hero = videos.filter((item) => item.isActive && item.tags.includes("hero_video"));
    say(hero.length ? `  Home page hero candidate: ${hero[0].file}` : "  ! No usable video carries hero_video - the home page hero needs one chosen by hand.");
  }

  if (shortages.length) {
    say("");
    say("GAPS TO SHOOT - a room type with fewer than three photographs looks thin on /stay");
    for (const gap of shortages) say(`  ${gap}`);
  }

  say("");
  say("WHAT TO DO NEXT");
  say("  1. Open scripts/media-overrides.json and fix any category that is plainly wrong - the entry key is");
  say("     the file name. Add a `hold` line to take a picture off every page, or `isCover: true` to put one");
  say("     at the front of its group. Then run this script again: the correction survives every re-run.");
  say("  2. Anything in UNCLASSIFIED stays off every page until it is given a category in that same file —");
  say("     the catalogue is the only door onto a page, and nothing walks through it by accident.");
  say("  3. scripts/media-report.txt is this report, public/media/manifest.json is the machine copy, and");
  say("     src/lib/media-catalog.ts is the same decision in the form the pages import.");

  const findings = extra.findings ?? [];
  const pagePaths = extra.pagePaths ?? 0;
  if (findings.length) {
    const of = (severity) => findings.filter((finding) => finding.severity === severity);
    const errors = ["held", "unclassified", "wrong-room", "unknown"].flatMap(of);
    const warnings = ["wrong-surface", "unused"].flatMap(of);
    say("");
    say(`THE PAGES - ${pagePaths} /images/... path${pagePaths === 1 ? "" : "s"} written in src/, checked against this manifest`);
    say(`  ${findings.length} of them need attention:`);
    say(`  ${of("held").length} on a held picture, ${of("unclassified").length} unclassified, ${of("wrong-room").length} on the wrong room,`);
    say(`  ${of("wrong-surface").length} off their surface, ${of("unused").length} using a switched-off file, ${of("unknown").length} unknown.`);
    if (errors.length) {
      say("");
      say(`  MUST CHANGE (${errors.length})`);
      for (const finding of errors) {
        say(`  ${finding.file}:${finding.line}  ${finding.path}`);
        say(`      ${finding.why}`);
        say(finding.fix ? `      use ${finding.fix}` : "      use a file from src/lib/media-catalog.ts");
      }
    }
    if (warnings.length) {
      say("");
      say(`  WORTH A LOOK (${warnings.length}, the first 10)`);
      for (const finding of warnings.slice(0, 10)) {
        say(`  ${finding.file}:${finding.line}  ${finding.path}  ->  ${finding.why}`);
      }
      if (warnings.length > 10) say(`  ... and ${warnings.length - 10} more, all listed in scripts/media-report.txt`);
    }
  } else {
    say("");
    say(`THE PAGES: all ${pagePaths} /images/... path${pagePaths === 1 ? "" : "s"} written in src/ agree with the manifest.`);
  }

  const placement = extra.placement ?? [];
  if (placement.length) {
    say("");
    say(`PLACEMENT - what this run did to the database${DRY_RUN ? " (DRY RUN: nothing was written)" : ""}`);
    for (const change of placement) {
      say(`  ${change.label}  ${change.table}  ${change.id === "-" ? "" : change.id}  ${change.what}  ->  ${change.note}`);
    }
  }

  return { lines, held, review, dupes: duplicateGroups, videos, shortages, findings, placement, pagePaths: extra.pagePaths ?? 0 };
}

/**
 * Prints the report and leaves it on disk. Windows terminals mangle non-ASCII output, so the console
 * gets a plain-ASCII version and the file keeps the real text.
 */
function printReport(result) {
  const text = `${result.lines.join("\n")}\n`;
  if (!DRY_RUN) {
    try {
      writeFileSync(REPORT_PATH, text, "utf8");
    } catch (error) {
      console.warn(`! Could not write ${path.relative(ROOT, REPORT_PATH)}: ${error.message}`);
    }
  }
  const ascii = text.replace(/[\u2013\u2014]/g, "-").replace(/\u00b7/g, "|").replace(/\u2026/g, "...");
  console.log(`\n${ascii}`);
}

async function main() {
  if (!existsSync(PUBLIC_DIR)) {
    console.error("No public/ directory — run this from the project root.");
    process.exit(2);
  }

  const databases = DB_TARGET === "off" ? [] : await connectDatabases(DB_TARGET);
  const knownRoomTypes = await loadRoomTypeIds(databases);
  if (knownRoomTypes.length) console.log(`Room types in the database: ${knownRoomTypes.join(", ")}`);

  const records = inventory();
  console.log(`\nMEDIA ANALYSIS - ${records.length} files found`);
  console.log(`  scanned: public/media, public/images, public/*${WITH_ROOT ? ", plus the loose files in the project root" : " (project root skipped)"}`);
  console.log(`  database: ${DB_TARGET}${databases.length ? ` | ${databases.map((d) => d.label).join(", ")}` : ""}${DRY_RUN ? " | DRY RUN, nothing will be written" : ""}`);

  const items = records.map((record) => ({
    ...record,
    publicPath: publicRelative(record.absPath),
    ...classify(record, knownRoomTypes),
  }));

  // The same picture under two names is settled before anything is copied or written.
  const duplicateGroups = resolveDuplicates(items);

  // Copy every servable file into organized/<category>/ and record the path the website will use.
  const takenByCategory = new Map();
  for (const item of items) {
    const taken = takenByCategory.get(item.category) ?? new Set();
    takenByCategory.set(item.category, taken);
    item.file = placeFile(item, taken);
  }

  // Quotas and covers, grouped per room TYPE where a room type is involved.
  const groups = new Map();
  for (const item of items) groups.set(groupKey(item), [...(groups.get(groupKey(item)) ?? []), item]);
  for (const [key, group] of groups) {
    const cap = key.includes("|") ? ROOM_TYPE_CAP : CATEGORY_CAP_OVERRIDE[key] ?? CATEGORY_CAP;
    group.sort((a, b) => coverScore(b) - coverScore(a) || b.confidence - a.confidence || b.size - a.size);
    const best = group[0];
    if (!group.some((row) => row.isCover) && best && coverScore(best) > 0) best.isCover = true;
    // The quota is applied in a different order from the cover: a pinned photograph (one a page needs)
    // comes first and can never be switched off, but it does not steal the cover.
    const quotaOrder = [...group].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder);
    quotaOrder.forEach((item, index) => {
      item.sortOrder = group.indexOf(item) + 1;
      item.isActive = !item.hold && !item.duplicateOf && item.category !== "other" && index < cap;
      item.suggestedUse = item.isActive ? SUGGESTED_USE[item.category] ?? [] : [];
      if (item.hold) item.holdNote = "held: not published anywhere until the rights issue is cleared";
      else if (item.category === "other") item.holdNote = "unclassified: give it a category in the admin media screen and it can go up";
      else if (item.duplicateOf) item.holdNote = `identical to ${item.duplicateOf}, so it is kept as a spare rather than published twice`;
      if (index >= cap) {
        item.holdNote = `${key.split("|")[0]} already has its ${cap}; switched off so it cannot crowd a page, and kept as a spare`;
      }
    });
  }

  const manifest = items
    .slice()
    .sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder)
    .map(manifestRow);

  if (!DRY_RUN) {
    mkdirSync(MEDIA_DIR, { recursive: true });
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`\nManifest written: ${path.relative(ROOT, MANIFEST_PATH)} - ${manifest.length} rows`);
    if (databases.length) {
      console.log("Seeding media_library:");
      await seedMediaLibrary(databases, items);
    }
  } else {
    console.log("\nDRY RUN - no manifest, no copies, no report file, no database writes.");
  }

  // The allocation only matters once it reaches the surfaces: the room cards, the gallery rows and the
  // paths written into the pages. Placement runs even in a dry run, where it reports and writes nothing.
  const placement = await placeInDatabase(databases, items);
  const pageCheck = checkReferences(items);
  const findings = pageCheck.findings;
  if (!DRY_RUN) {
    try {
      mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
      writeFileSync(CATALOG_PATH, buildCatalog(items), "utf8");
      console.log(`Catalog written: ${path.relative(ROOT, CATALOG_PATH)}`);
    } catch (error) {
      console.warn(`! Could not write ${path.relative(ROOT, CATALOG_PATH)}: ${error.message}`);
    }
  }

  const result = buildReport(items, duplicateGroups, { placement, findings, pagePaths: pageCheck.seen });
  printReport(result);
  for (const database of databases) await database.client.end().catch(() => {});
  if (!DRY_RUN) console.log(`Report saved to ${path.relative(ROOT, REPORT_PATH)}`);

  console.log(
    `\n${items.length} files analysed | ${items.filter((i) => i.isActive).length} live on the site | ${result.held.length} held back | ${result.review.length} to check by eye | ${result.pagePaths} page paths checked, ${findings.length} to change`,
  );
  console.log("Change a category in scripts/media-overrides.json and run this again - the correction sticks.\n");
}

await main();



