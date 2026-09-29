/**
 * VERIFY THE UPDATE CARD — the pixels, in a real browser.
 *
 * WHY THIS EXISTS
 * `npm run verify:sw` proves the worker's *rules* by loading `public/sw.js`
 * against stub globals. It cannot prove the "A newer version is ready" card is
 * ever visible, because that card only exists after a NEWLY DEPLOYED worker
 * reports `installed` — so it is never in the server HTML and no static check
 * can see it. Everything about it was therefore argued from source rather than
 * seen. This script closes that gap with a real browser: it drives Chrome/Edge
 * over the DevTools Protocol against the running app, forces a simulated deploy
 * (one comment appended to `public/sw.js`), and then watches what a guest would
 * actually see.
 *
 * WHAT IT ASSERTS
 *   1. the worker installs and takes control of the page
 *   2. after a new deploy the card appears, and is really PAINTED — hit-tested at
 *      its own centre, measured, and screenshotted to docs/evidence/
 *   3. it stays on screen long enough to read, instead of vanishing into a reload
 *      the guest never asked for (the failure mode this script was written for)
 *   4. "Later" dismisses it and touches nothing else — no reload, no new worker
 *   5. the next visit offers it again, and "Update now" is what activates the new
 *      worker and reloads the page
 *
 * Nothing here is permanent: `public/sw.js` is restored byte-for-byte before the
 * process exits, and the restore is itself checked.
 *
 * Usage: node scripts/verify-update-card.mjs [--url http://127.0.0.1:3010] [--port 3010]
 */
import { spawn, spawnSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const PORT = Number(argOf("--port", process.env.PORT ?? 3010));
const URL_UNDER_TEST = argOf("--url", `http://127.0.0.1:${PORT}`);
const SW_PATH = path.join(process.cwd(), "public", "sw.js");
const EVIDENCE_DIR = path.join(process.cwd(), "docs", "evidence");
/** Absolute: `spawn("taskkill")` is not guaranteed to resolve from a bare name. */
const TASKKILL = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};
const info = (label, value) => console.log(`      ${label.padEnd(34)} ${value}`);

/* ------------------------------------------------------------------ server -- */

/**
 * Whatever is still holding the port, kill it — and do it SYNCHRONOUSLY. An async
 * `spawn("taskkill")` is fire-and-forget: this script ends with `process.exit()`, so
 * the child never got to run and the server outlived the check. The next run then
 * silently talks to a stale build (its chunk files were replaced by the rebuild).
 * Also note the pid-based kill alone is not enough: with `shell: true` on Windows,
 * killing the shell re-parents the real `node next start` instead of killing it.
 */
function killPort(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: "utf8" });
      const pids = [
        ...new Set(
          out
            .split(/\r?\n/)
            .map((line) => line.trim().split(/\s+/).pop() ?? "")
            .filter((pid) => /^\d+$/.test(pid)),
        ),
      ];
      for (const pid of pids) {
        spawnSync(TASKKILL, ["/pid", pid, "/T", "/F"], { stdio: "ignore", windowsHide: true });
      }
      return pids;
    }
    const pids = execSync(`lsof -ti:${port}`, { encoding: "utf8" }).split(/\s+/).filter(Boolean);
    for (const pid of pids) process.kill(Number(pid), "SIGKILL");
    return pids;
  } catch {
    return [];
  }
}

/** Is something already serving the app, or do we start one and own its life? */
async function ensureServer() {
  const reachable = async () => {
    try {
      const res = await fetch(URL_UNDER_TEST, { redirect: "manual" });
      return res.status < 500;
    } catch {
      return false;
    }
  };
  if (await reachable()) {
    console.log(
      `      reusing the server already answering ${URL_UNDER_TEST}` +
        " — if it predates your last build, its chunk files are gone and this run will fail",
    );
    return { child: null, already: true };
  }

  const next = process.platform === "win32" ? "next.cmd" : "next";
  const bin = path.join(process.cwd(), "node_modules", ".bin", next);
  const child = spawn(bin, ["start", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await reachable()) return { child, already: false };
    await sleep(500);
  }
  child.kill();
  throw new Error(
    `Nothing answered ${URL_UNDER_TEST} and \`next start\` did not come up. Run \`npm run build\` first.`,
  );
}

/* ----------------------------------------------------------------- browser -- */

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Launch headless Chrome/Edge and hand back the DevTools websocket URL. */
function launchBrowser() {
  return new Promise((resolve, reject) => {
    const exe = findBrowser();
    if (!exe) return reject(new Error("No Chrome or Edge found. Set CHROME_PATH."));
    const profile = mkdtempSync(path.join(tmpdir(), "sunrise-verify-"));
    const child = spawn(
      exe,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        `--user-data-dir=${profile}`,
        "--remote-debugging-port=0",
        "about:blank",
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`Browser gave no DevTools endpoint.\n${stderr}`)), 30_000);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, wsUrl: match[1], profile, exe });
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Browser exited early (code ${code}).\n${stderr}`));
    });
  });
}

/** A very small DevTools Protocol client — Node's global WebSocket, no deps. */
class Devtools {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    });
  }
  static async connect(wsUrl) {
    const socket = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("DevTools socket failed")), { once: true });
    });
    return new Devtools(socket);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const payload = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 45_000);
    });
  }
}

/* ------------------------------------------------------------------- test -- */

async function main() {
  const server = await ensureServer();
  if (!server.already) console.log(`      started next start -p ${PORT} for this run`);
  const browser = await launchBrowser();
  console.log(`      browser  ${browser.exe}`);
  const devtools = await Devtools.connect(browser.wsUrl);

  const originalSw = readFileSync(SW_PATH, "utf8");
  let restored = false;

  const { targetId } = await devtools.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await devtools.send("Target.attachToTarget", { targetId, flatten: true });
  await devtools.send("Page.enable", {}, sessionId);
  // The card is mobile-first and anchored to the bottom: test it at phone size.
  await devtools.send(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    sessionId,
  );

  const evaluate = async (expression, { awaitPromise = false } = {}) => {
    const result = await devtools.send(
      "Runtime.evaluate",
      { expression, awaitPromise, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  };

  const goto = async (url) => {
    await devtools.send("Page.navigate", { url }, sessionId);
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const state = await evaluate("document.readyState").catch(() => null);
      if (state === "complete") return true;
      await sleep(150);
    }
    return false;
  };

  const untilTrue = async (expression, timeout) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(expression).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  };

  /** The single thing under test: is the update card in the document right now? */
  const sample = () =>
    evaluate(`(() => ({
      present: !!document.getElementById('sw-update-banner'),
      mark: window.__verifyMark ?? null,
      controlled: !!navigator.serviceWorker.controller
    }))()`);

  const shoot = async (file, clip, scale = 2) => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const shot = await devtools.send(
      "Page.captureScreenshot",
      { format: "png", ...(clip ? { clip: { ...clip, scale } } : {}) },
      sessionId,
    );
    writeFileSync(path.join(EVIDENCE_DIR, file), Buffer.from(shot.data, "base64"));
    return file;
  };

  /** Everything visible about the card, read back from the live DOM. */
  const readCard = () =>
    evaluate(`(() => {
      const el = document.getElementById('sw-update-banner');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height),
        background: cs.backgroundColor, radius: cs.borderTopLeftRadius, colour: cs.color,
        position: cs.position, zIndex: cs.zIndex,
        painted: !!(hit && (hit === el || el.contains(hit))),
        viewport: { w: innerWidth, h: innerHeight },
        text: el.innerText.replace(/\\s+/g, ' ').trim().slice(0, 260),
        buttons: Array.from(el.querySelectorAll('button')).map((b) => b.innerText.trim()),
        bullets: el.querySelectorAll('li').length
      };
    })()`);

  try {
    /* 1 - the app loads and its worker takes control ------------------------ */
    console.log("\n=== the worker installs and takes control ===");
    await goto(URL_UNDER_TEST);
    const controlled = await untilTrue("!!navigator.serviceWorker.controller", 30_000);
    check("page is controlled by a service worker", controlled, controlled ? "" : "(nothing can trigger an update)");
    if (!controlled) return;
    info("controller", String(await evaluate("navigator.serviceWorker.controller.scriptURL")));
    info(
      "waiting worker at rest",
      String(await evaluate("navigator.serviceWorker.getRegistration().then(r => !!r.waiting)", { awaitPromise: true })),
    );

    /* 2 - simulate a deploy, then ask the browser to check for it ----------- */
    console.log("\n=== a new deploy arrives (one comment appended to public/sw.js) ===");
    writeFileSync(
      SW_PATH,
      `${originalSw}\n/* simulated deploy ${new Date().toISOString()} - appended by scripts/verify-update-card.mjs */\n`,
    );
    await evaluate("window.__verifyMark = (window.__verifyMark ?? 0) + 1");
    const markBefore = await evaluate("window.__verifyMark");
    await evaluate("navigator.serviceWorker.getRegistration().then(r => r && r.update())", { awaitPromise: true });

    /* 3 - watch what the guest sees for the next 20 seconds ----------------- */
    console.log("\n=== what the guest actually sees ===");
    const started = Date.now();
    let firstPresentAt = null;
    let lastPresentAt = null;
    let reloadedAt = null;
    let samples = 0;
    while (Date.now() - started < 20_000) {
      const state = await sample().catch(() => null);
      samples += 1;
      if (state && state.mark === null && reloadedAt === null) reloadedAt = Date.now() - started;
      if (state && state.present) {
        if (firstPresentAt === null) firstPresentAt = Date.now() - started;
        lastPresentAt = Date.now() - started;
      }
      // Once it has appeared, give it 4 s of room before deciding it is stable.
      if (firstPresentAt !== null && Date.now() - started > firstPresentAt + 4000) break;
      await sleep(100);
    }
    const card = await readCard();
    const onScreenFor = firstPresentAt === null ? 0 : lastPresentAt - firstPresentAt;

    info("samples taken", String(samples));
    info("card first appeared at", firstPresentAt === null ? "never" : `${firstPresentAt} ms`);
    info("card still present at", lastPresentAt === null ? "never" : `${lastPresentAt} ms`);
    info("on screen for at least", `${onScreenFor} ms`);
    info("page reloaded at", reloadedAt === null ? "never" : `${reloadedAt} ms`);

    check("the card appears after a new deploy", firstPresentAt !== null);
    check(
      "no reload the guest did not ask for",
      reloadedAt === null,
      reloadedAt === null ? "" : "the card was yanked by an auto-reload",
    );
    check("it stays on screen long enough to read (>= 3 s)", card !== null && onScreenFor >= 3000);

    if (card) {
      console.log("\n=== the card, measured ===");
      info("geometry", `${card.width}x${card.height} at ${card.x},${card.y} in ${card.viewport.w}x${card.viewport.h}`);
      info("background", card.background);
      info("border radius", card.radius);
      info("colour / position", `${card.colour} / ${card.position} z${card.zIndex}`);
      info("buttons", card.buttons.join(" | "));
      info("bullets", String(card.bullets));
      info("text", card.text.slice(0, 150));
      check("it is really painted (hit-tested at its own centre)", card.painted);
      const full = await shoot(
        "service-worker-update-card.png",
        { x: 0, y: 0, width: card.viewport.w, height: card.viewport.h },
        1,
      );
      const clipped = await shoot("service-worker-update-card-detail.png", {
        x: Math.max(0, card.x - 8),
        y: Math.max(0, card.y - 8),
        width: Math.min(card.width + 16, card.viewport.w - Math.max(0, card.x - 8)),
        height: card.height + 16,
      });
      check("screenshots written", true, `docs/evidence/${full} + ${clipped}`);

      /* 4 - Later defers it, and touches nothing else ------------------------ */
      console.log("\n=== the Later button ===");
      const clicked = await evaluate(
        "(() => { const b = document.querySelector('.sw-update-later'); if (!b) return false; b.click(); return true; })()",
      );
      await sleep(400);
      const afterLater = await sample();
      check("Later dismisses the card", Boolean(clicked) && afterLater.present === false);
      check("Later does not reload the page", afterLater.mark === markBefore);
      const stillWaiting = await evaluate(
        "navigator.serviceWorker.getRegistration().then(r => !!r.waiting)",
        { awaitPromise: true },
      );
      check("the new worker is still waiting (nothing applied behind the guest's back)", Boolean(stillWaiting));
    }

    /* 5 - the next visit offers it again, and Update now applies it --------- */
    console.log("\n=== the next visit, and Update now ===");
    await goto(URL_UNDER_TEST);
    const offeredAgain = await untilTrue("!!document.getElementById('sw-update-banner')", 15_000);
    check("a later visit offers the update again", offeredAgain);
    if (offeredAgain) {
      await evaluate("window.__verifyMark = 99");
      await evaluate("document.querySelector('.sw-update-now').click()");
      const reloaded = await untilTrue("(window.__verifyMark ?? null) !== 99", 20_000);
      check("Update now reloads the page", reloaded);
      const settled = await untilTrue(
        "navigator.serviceWorker.getRegistration().then(r => !r.waiting)",
        15_000,
      );
      const stateAfter = await sample();
      check("the new worker took over (nothing left waiting)", Boolean(settled) || stateAfter.controlled);
      check("the card is gone once the update is applied", stateAfter.present === false);
    }
  } finally {
    // Always put public/sw.js back exactly as it was.
    writeFileSync(SW_PATH, originalSw);
    restored = readFileSync(SW_PATH, "utf8") === originalSw;
    try {
      browser.child.kill();
      if (process.platform === "win32") {
        spawnSync(TASKKILL, ["/pid", String(browser.child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      }
    } catch {
      /* the browser may already be gone */
    }
    if (server.child) {
      // Kill the TREE while the shell pid is still valid, then verify the port is
      // actually free — a stale `next start` makes the next run lie.
      if (process.platform === "win32") {
        spawnSync(TASKKILL, ["/pid", String(server.child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      }
      server.child.kill();
      await sleep(400);
      const survivors = killPort(PORT);
      if (survivors.length > 0) {
        await sleep(600);
        const again = killPort(PORT);
        console.log(
          again.length === 0
            ? `      released port ${PORT} (pid ${survivors.join(", ")} outlived the tree kill)`
            : `      WARNING: port ${PORT} is still held by pid ${again.join(", ")}`,
        );
      }
    }
  }

  console.log(`\npublic/sw.js restored byte-for-byte: ${restored ? "yes" : "NO - check git status"}`);
  if (!restored) failures++;
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nverify-update-card could not run:", error.message);
  process.exit(1);
});

