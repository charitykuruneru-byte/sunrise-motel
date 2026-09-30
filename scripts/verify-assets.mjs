/**
 * VERIFY THE ASSETS AND THE LINKS — the two ways a page can look fine to the
 * developer and look broken to the guest.
 *
 * `npm run dev` serves whatever is on disk, so a picture can be sitting on the
 * laptop, render perfectly, and still be a broken-image icon the moment the site
 * is deployed: it was never committed, so it is not in the build at all. That is
 * exactly how the home page's `/media/organized/**` photographs and the hero film
 * were lost — every file present, `git ls-files public/media` empty.
 *
 * Static only: no server, no browser, so it can run in CI or before a commit.
 * Five questions, each answered with the file it came from:
 *
 *   1. does every asset path the code asks for exist under `public/`?
 *   2. **is every one of those assets tracked by git** (the deploy guard — the
 *      check that was missing when the media library was never added)
 *   3. does every file the DATABASE points at exist under `public/`?
 *      (skipped, not failed, when no database is reachable)
 *   4. does every internal link resolve to a real route or a real file?
 *   5. is every page reachable from somewhere? — reported as a note, because a
 *      token-only page such as `/activate` is meant to be unlinked
 *
 * Usage:  node scripts/verify-assets.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const appDir = path.join(srcDir, "app");
const publicDir = path.join(root, "public");

const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};
const note = (line) => console.log(`NOTE  ${line}`);

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const toPosix = (value) => value.split(path.sep).join("/");

/** What a `git commit` right now would publish: everything in the index. */
let tracked = null;
try {
  tracked = new Set(
    execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
} catch {
  note("not a git checkout (or git is unavailable) — the tracking checks were skipped");
}

/** Everything under public/, as `/served/paths`. */
const served = new Set();
for (const file of walk(publicDir)) {
  served.add("/" + toPosix(path.relative(publicDir, file)));
}

// ---------------------------------------------------------------- 1 & 2 — the code
// A path is only counted when it sits in quotes, so a path built by string
// concatenation is never half-read as a filename.
const ASSET_RE = /["'`](\/(?:images|media|icons|fonts|downloads)\/[A-Za-z0-9._@%\-/ ()'+,&!]+)["'`]/g;

const codeFiles = walk(srcDir).filter((file) => /\.(tsx?|css|json)$/.test(file));
const referenced = new Map(); // asset path -> the files that ask for it
for (const file of codeFiles) {
  const text = fs.readFileSync(file, "utf8");
  let match;
  ASSET_RE.lastIndex = 0;
  while ((match = ASSET_RE.exec(text))) {
    if (!referenced.has(match[1])) referenced.set(match[1], new Set());
    referenced.get(match[1]).add(toPosix(path.relative(root, file)));
  }
}

const missingOnDisk = [];
const missingFromGit = [];
for (const [asset, files] of [...referenced].sort()) {
  const where = [...files].join(", ");
  if (!served.has(asset)) missingOnDisk.push(`${asset}  <- ${where}`);
  else if (tracked && !tracked.has("public" + asset)) missingFromGit.push(`${asset}  <- ${where}`);
}

check(
  `every asset the code references exists in public/ (${referenced.size} paths)`,
  missingOnDisk.length === 0,
  missingOnDisk.length ? `${missingOnDisk.length} missing` : "",
);
missingOnDisk.forEach((line) => console.log(`        ${line}`));

if (tracked) {
  check(
    "every referenced asset is tracked by git (so it survives a deploy)",
    missingFromGit.length === 0,
    missingFromGit.length ? `${missingFromGit.length} never committed` : "",
  );
  missingFromGit.forEach((line) => console.log(`        ${line}`));

  // The media library as a whole: a directory that is present but untracked is the
  // failure mode that looks most like success, because dev serves it anyway.
  const mediaOnDisk = [...served].filter((p) => p.startsWith("/media/"));
  const mediaUntracked = mediaOnDisk.filter((p) => !tracked.has("public" + p));
  check(
    `the whole media library is tracked (${mediaOnDisk.length} files under /media/)`,
    mediaUntracked.length === 0,
    mediaUntracked.length ? `${mediaUntracked.length} untracked` : "",
  );
  if (mediaUntracked.length) {
    note(`run: git add public/media — those ${mediaUntracked.length} files are absent from every deploy until you do`);
  }
}

// ---------------------------------------------------------------- 3 — the database
const dbSources = [
  ["gallery_images", "SELECT id, title AS label, image_url AS url FROM gallery_images"],
  ["menu_items", "SELECT id, name AS label, image_url AS url FROM menu_items"],
  ["posts", "SELECT id, title AS label, image_url AS url FROM posts"],
  ["room_types", "SELECT id, name AS label, images AS url FROM room_types"],
];

function envValue(key) {
  if (process.env[key]) return process.env[key];
  try {
    const file = fs.readFileSync(path.join(root, ".env"), "utf8");
    const line = file.split(/\r?\n/).find((row) => row.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).replace(/^["']|["']$/g, "") : undefined;
  } catch {
    return undefined;
  }
}

const DATABASE_URL = envValue("DATABASE_URL");
if (DATABASE_URL) {
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    const FILE_RE = /\/[A-Za-z0-9._\-/]+\.(?:jpg|jpeg|png|webp|gif|svg|mp4|pdf)/g;
    const bad = [];
    let dbChecked = 0;
    for (const [table, sql] of dbSources) {
      let rows = [];
      try {
        rows = (await client.query(sql)).rows;
      } catch {
        continue; // a table this deployment does not have yet is not a broken picture
      }
      for (const row of rows) {
        for (const found of String(row.url ?? "").match(FILE_RE) ?? []) {
          dbChecked += 1;
          if (!served.has(found)) bad.push(`${table} ${row.id} "${row.label}" -> ${found}`);
        }
      }
    }
    await client.end();
    check(
      `every picture the database points at exists in public/ (${dbChecked} URLs)`,
      bad.length === 0,
      bad.length ? `${bad.length} missing` : "",
    );
    bad.forEach((line) => console.log(`        ${line}`));
  } catch (error) {
    note(`database not reachable (${error.message}) — its picture URLs were not checked`);
  }
} else {
  note("DATABASE_URL is not set — the database's picture URLs were not checked");
}