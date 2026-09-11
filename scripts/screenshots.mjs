// Takes the README's screenshots, from the made-up workspace in `src/demo`.
//
// Photographing a real one means either an empty app or somebody's actual repositories and spending
// on the front page of a public project. So: vite serves the app, `?demo=<screen>` fills it with a
// fixture and opens the screen, and headless Chrome takes the picture.
//
// It drives Chrome over the DevTools protocol rather than `--screenshot`, because the shot has to
// wait for the app to have drawn — `data-demo-ready` on <html>, set from the demo installer — and a
// one-shot screenshot fires whenever the load event happens to land.
//
//   npm run screenshots            # all of them
//   npm run screenshots -- home    # one
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const PORT = 5179;
const OUT = "docs/screenshots";

/**
 * A size per screen, because one does not fit them.
 *
 * The board has six columns and cutting the sixth in half looks like a mistake rather than a
 * board that scrolls. The home is one centred column, and a wide viewport leaves it stranded in
 * the middle of an empty page.
 */
const DEFAULT_SIZE = { width: 1600, height: 1000 };

const SHOTS = [
  { screen: "home", file: "home.png", size: { width: 1400, height: 1400 } },
  { screen: "chat", file: "chat.png" },
  { screen: "board", file: "board.png", size: { width: 2100, height: 1000 } },
  { screen: "hierarchy", file: "hierarchy.png" },
  { screen: "settings", file: "settings-agents.png" },
];

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find(p => existsSync(p));

if (!CHROME) {
  console.error("No encontré Chrome ni Edge. Instalá uno, o sacá las capturas a mano.");
  process.exit(1);
}

const wanted = process.argv.slice(2);
const shots = wanted.length > 0 ? SHOTS.filter(s => wanted.includes(s.screen)) : SHOTS;
if (shots.length === 0) {
  console.error(`No conozco esa pantalla. Las que hay: ${SHOTS.map(s => s.screen).join(", ")}`);
  process.exit(1);
}

/** Waits for a URL to answer, so the browser is not pointed at a server that is still booting. */
async function waitFor(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  return false;
}

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});
let viteOutput = "";
vite.stdout.on("data", d => { viteOutput += d; });
vite.stderr.on("data", d => { viteOutput += d; });

const stop = () => { try { vite.kill(); } catch { /* already gone */ } };
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });

try {
  if (!await waitFor(`http://localhost:${PORT}/`, 60_000)) {
    console.error("El dev server no levantó:\n" + viteOutput);
    process.exit(1);
  }
  await mkdir(OUT, { recursive: true });

  for (const shot of shots) {
    await capture(shot);
    console.log(`  ${shot.file}`);
  }
  console.log(`\n${shots.length} en ${OUT}/`);
} finally {
  stop();
}

async function capture({ screen, file, size = DEFAULT_SIZE }) {
  const userDataDir = path.join(process.env.TEMP ?? ".", `ainess-shot-${screen}`);
  const debugPort = 9222 + SHOTS.findIndex(s => s.screen === screen);

  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${size.width},${size.height}`,
    // The app is dark; without this the shot has a white band where the page has not painted.
    "--force-dark-mode",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-gpu",
    `http://localhost:${PORT}/?demo=${screen}`,
  ], { stdio: "ignore" });

  try {
    const targets = await waitForJson(`http://localhost:${debugPort}/json`, 30_000);
    const page = targets.find(t => t.type === "page" && t.webSocketDebuggerUrl);
    if (!page) throw new Error(`sin página para ${screen}`);

    const data = await overSocket(page.webSocketDebuggerUrl, screen, size);
    await writeFile(path.join(OUT, file), Buffer.from(data, "base64"));
  } finally {
    try { chrome.kill(); } catch { /* already gone */ }
  }
}

async function waitForJson(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const list = await res.json();
        if (list.length > 0) return list;
      }
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error("Chrome no expuso ninguna página");
}

/**
 * Waits for the app to say it has drawn, then asks for the picture.
 *
 * The flag is set on the frame after the demo screen is opened, so it means "painted" and not
 * "mounted": a shot taken on `load` catches the app mid-layout.
 */
function overSocket(wsUrl, screen, size) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params) => new Promise(res => {
      const messageId = ++id;
      pending.set(messageId, res);
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });

    const fail = e => { try { ws.close(); } catch { /* closing */ } reject(e); };
    const timer = setTimeout(() => fail(new Error(`${screen}: la app nunca dijo estar dibujada`)), 45_000);

    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      const waiting = pending.get(msg.id);
      if (waiting) { pending.delete(msg.id); waiting(msg.result); }
    };
    ws.onerror = () => fail(new Error(`${screen}: no pude hablar con Chrome`));

    ws.onopen = async () => {
      try {
        // The viewport is set here rather than left to `--window-size`, which Chrome treats as a
        // hint and rounds: a board asked for at 2100 came out at 1744 and cut its last column.
        await send("Emulation.setDeviceMetricsOverride", {
          width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false,
        });
        for (let i = 0; i < 150; i++) {
          const { result } = await send("Runtime.evaluate", {
            expression: "document.documentElement.getAttribute('data-demo-ready') === '1'",
          });
          if (result?.value === true) break;
          await sleep(200);
        }
        // A beat for the last transitions to settle: several panels fade in on mount.
        await sleep(600);
        // Not `captureBeyondViewport`: the app scrolls an inner element, not the document, so the
        // page is never taller than the window and there is nothing beyond it to capture. A screen
        // that needs more room gets a taller window instead — see the sizes above.
        const shot = await send("Page.captureScreenshot", { format: "png" });
        clearTimeout(timer);
        ws.close();
        if (!shot?.data) return reject(new Error(`${screen}: Chrome no devolvió imagen`));
        resolve(shot.data);
      } catch (e) {
        clearTimeout(timer);
        fail(e);
      }
    };
  });
}
