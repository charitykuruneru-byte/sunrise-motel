/**
 * VERIFY THE MEDIA FLOW — posts and images, end to end.
 *
 * Answers one question with evidence rather than opinion: does uploading an image
 * and publishing a post actually work, and does the published post reach the
 * surfaces guests see (the website and the guest app)?
 *
 * What it does, against a running server:
 *   1. signs in as the manager (ADMIN_PASSWORD from .env, or ADMIN_PASSWORD env)
 *   2. uploads a real file to /api/upload              (Blob → Postgres fallback)
 *   3. adds that image to the gallery through /api/admin/gallery, with alt text
 *   4. re-reads the gallery and proves the alt text was kept
 *   5. publishes a post through /api/admin/posts using the uploaded image
 *   6. reads the PUBLIC feed /api/posts and proves the post is there with its image
 *   7. deletes both again, so the check is repeatable and leaves nothing behind
 *
 * Usage:  node scripts/verify-media-flow.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://127.0.0.1:3112";

function envValue(key) {
  if (process.env[key]) return process.env[key];
  try {
    const file = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const line = file.split(/\r?\n/).find((row) => row.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).replace(/^["']|["']$/g, "") : undefined;
  } catch {
    return undefined;
  }
}

const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const adminPassword = envValue("ADMIN_PASSWORD");
if (!adminPassword) {
  console.error("ADMIN_PASSWORD is not set in .env or the environment — cannot sign in.");
  process.exit(2);
}

// ---- 1. sign in -----------------------------------------------------------------
const login = await fetch(`${BASE}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: adminPassword }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
check("Manager sign-in", login.ok, `HTTP ${login.status}`);
if (!login.ok) process.exit(1);

// ---- 2. upload a real photograph -------------------------------------------------
const filePath = path.join(process.cwd(), "public", "images", "courtyard.jpg");
const bytes = readFileSync(filePath);
const form = new FormData();
form.append("file", new Blob([bytes], { type: "image/jpeg" }), "verify-courtyard.jpg");
const upload = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { cookie }, body: form });
const uploaded = await upload.json().catch(() => ({}));
check(
  "Image upload (/api/upload)",
  upload.ok && Boolean(uploaded.url),
  `HTTP ${upload.status} · ${uploaded.storage ?? "?"} · ${uploaded.url ?? uploaded.error}`,
);
if (!uploaded.url) process.exit(1);

// ---- 3. add it to the gallery ----------------------------------------------------
const ALT = "Sunrise Motel courtyard with garden seating and evening lanterns, Area 5, Lilongwe";
const addImage = await fetch(`${BASE}/api/admin/gallery`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({
    title: "Verification courtyard photo",
    category: "Property",
    imageUrl: uploaded.url,
    altText: ALT,
    caption: "Temporary row created by scripts/verify-media-flow.mjs",
  }),
});
const addedImage = await addImage.json().catch(() => ({}));
check("Gallery add (/api/admin/gallery)", addImage.status === 201 && Boolean(addedImage.image?.id), `HTTP ${addImage.status}`);
const imageId = addedImage.image?.id;

// ---- 4. the gallery keeps the alt text -------------------------------------------
const gallery = await (await fetch(`${BASE}/api/admin/gallery`)).json();
const storedImage = (gallery.images ?? []).find((row) => row.id === imageId);
check(
  "Alt text stored with the picture",
  storedImage?.altText === ALT,
  storedImage ? `"${storedImage.altText}"` : "row not found",
);

// ---- 5. publish a post that uses the uploaded image ------------------------------
const addPost = await fetch(`${BASE}/api/admin/posts`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({
    title: "Verification post",
    category: "Event",
    day: "SAT",
    date: "26",
    time: "12:00 — 20:00",
    detail: "Temporary post created by scripts/verify-media-flow.mjs to prove publishing works.",
    priceTag: "Temporary",
    imageUrl: uploaded.url,
  }),
});
const addedPost = await addPost.json().catch(() => ({}));
check("Post publish (/api/admin/posts)", addPost.status === 201 && Boolean(addedPost.post?.id), `HTTP ${addPost.status}`);
const postId = addedPost.post?.id;

// ---- 6. the public feed the website and the app both read ------------------------
const feed = await (await fetch(`${BASE}/api/posts`)).json();
const inFeed = (feed.posts ?? []).find((row) => row.id === postId);
check("Post appears in the public feed (/api/posts)", Boolean(inFeed), inFeed ? `image: ${inFeed.imageUrl}` : "not found");
check("Feed image is the uploaded file, not a placeholder", inFeed?.imageUrl === uploaded.url);

// ---- 7. clean up ------------------------------------------------------------------
if (postId) {
  const delPost = await fetch(`${BASE}/api/admin/posts?id=${postId}`, { method: "DELETE", headers: { cookie } });
  check("Post delete", delPost.ok, `HTTP ${delPost.status}`);
}
if (imageId) {
  const delImage = await fetch(`${BASE}/api/admin/gallery?id=${imageId}`, { method: "DELETE", headers: { cookie } });
  check("Gallery image delete", delImage.ok, `HTTP ${delImage.status}`);
}
const feedAfter = await (await fetch(`${BASE}/api/posts`)).json();
check("Feed is clean again", !(feedAfter.posts ?? []).some((row) => row.id === postId));

const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);

