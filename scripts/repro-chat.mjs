// Sends a message into a chat and reports what the app does with it.
//
// Three fixes have gone out for "the chat goes black when I send a message", each reasoned from the
// code and none of them reproduced. This drives the real app instead: vite serves it, the demo
// fixture opens a one-on-one chat with history, and the store is asked to send — which is exactly
// what the box does — while the browser's console, its uncaught exceptions and the DOM are watched.
//
// It reports the thread's own text before and after. A thread that goes black is a thread whose
// bubbles stopped rendering, and that shows up here as the text disappearing.
//
//   node scripts/repro-chat.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const PORT = 5187;
const DEBUG_PORT = 9341;

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(p => existsSync(p));

if (!CHROME) {
  console.error("No encontré Chrome ni Edge.");
  process.exit(1);
}

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"], shell: true,
});
let viteOut = "";
vite.stdout.on("data", d => { viteOut += d; });
vite.stderr.on("data", d => { viteOut += d; });

let chrome;
/**
 * Kills the trees, not the handles.
 *
 * `npx vite` under a shell is a shell with vite underneath it: killing the handle leaves vite
 * holding the port and node's pipes to it holding the event loop, so the script finishes its work
 * and then never exits.
 */
const stop = () => {
  for (const child of [chrome, vite]) {
    if (!child?.pid) continue;
    try {
      if (process.platform === "win32") spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
      else child.kill();
    } catch { /* gone */ }
  }
};
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });

try {
  if (!await until(() => fetch(`http://localhost:${PORT}/`).then(r => r.ok).catch(() => false), 60_000)) {
    console.error("El dev server no levantó:\n" + viteOut);
    process.exit(1);
  }

  chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${path.join(process.env.TEMP ?? ".", "ainess-repro")}`,
    "--window-size=1400,900",
    "--no-first-run",
    "--disable-gpu",
    `http://localhost:${PORT}/?demo=onechat`,
  ], { stdio: "ignore" });

  const page = await until(async () => {
    const list = await fetch(`http://localhost:${DEBUG_PORT}/json`).then(r => r.json()).catch(() => []);
    return list.find(t => t.type === "page" && t.webSocketDebuggerUrl);
  }, 30_000);
  if (!page) throw new Error("Chrome no expuso ninguna página");

  await drive(page.webSocketDebuggerUrl);
} finally {
  stop();
  // The tree is gone but node keeps the pipes it opened; nothing here needs to outlive the report.
  setTimeout(() => process.exit(0), 500).unref();
}

async function until(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(250);
  }
  return null;
}

function drive(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const problems = [];

    const send = (method, params) => new Promise(res => {
      const messageId = ++id;
      pending.set(messageId, res);
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
    const evaluate = async expression => {
      const { result, exceptionDetails } = await send("Runtime.evaluate", {
        expression, awaitPromise: true, returnByValue: true,
      });
      if (exceptionDetails) problems.push(`evaluate: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ""}`);
      return result?.value;
    };

    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const waiting = pending.get(msg.id);
        pending.delete(msg.id);
        waiting(msg.result ?? {});
        return;
      }
      // Anything the page complains about, from either channel.
      if (msg.method === "Runtime.exceptionThrown") {
        problems.push(`excepción: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
      }
      if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
        problems.push(`console.${msg.params.type}: ${msg.params.args.map(a => a.description ?? a.value).join(" ")}`);
      }
      if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
        problems.push(`log: ${msg.params.entry.text}`);
      }
    };
    ws.onerror = () => reject(new Error("no pude hablar con Chrome"));

    ws.onopen = async () => {
      try {
        await send("Runtime.enable");
        await send("Log.enable");
        await send("Page.enable");

        const ready = await until(
          () => evaluate("document.documentElement.getAttribute('data-demo-ready') === '1'"),
          20_000,
        );
        if (!ready) {
          // Saying why beats hanging: what stopped the app from drawing is in what it complained
          // about on the way, and that is already being collected.
          console.log("la app nunca dijo estar dibujada. Lo que la consola dijo:");
          for (const p of problems) console.log("  - " + p.slice(0, 400));
          if (problems.length === 0) console.log("  (nada)");
          const shown = await evaluate("document.body.innerText.slice(0, 300)");
          console.log("En pantalla:", shown || "(vacío)");
          ws.close();
          return resolve();
        }
        await sleep(800);

        // What the thread shows before. The bubbles are the only thing that matters here.
        const before = await evaluate(`document.body.innerText.split("\\n").filter(Boolean).length`);
        const beforeText = await evaluate(`document.body.innerText.includes("applyDiscount")`);

        console.log(`antes:  ${before} líneas en pantalla, el hilo tiene su historia: ${beforeText}`);
        console.log("mandando un mensaje…\n");

        await evaluate(`window.__ainess.getState().sendChatMessage("c-demo", "y si el descuento es un monto fijo?")`);

        // Long enough for the turn to start, the bubble to appear and any crash to land.
        await sleep(2500);

        const after = await evaluate(`document.body.innerText.split("\\n").filter(Boolean).length`);
        const afterText = await evaluate(`document.body.innerText.includes("applyDiscount")`);
        const mine = await evaluate(`document.body.innerText.includes("monto fijo")`);

        console.log(`después: ${after} líneas en pantalla, el hilo conserva su historia: ${afterText}`);
        console.log(`         el mensaje que mandé está en pantalla: ${mine}`);

        if (problems.length === 0) {
          console.log("\nla consola no dijo nada.");
        } else {
          console.log(`\n${problems.length} cosa(s) de la consola:`);
          for (const p of problems) console.log("  - " + p.slice(0, 300));
        }

        if (!afterText && beforeText) {
          console.log("\nEL HILO SE VACIÓ. Reproducido.");
        }

        ws.close();
        resolve();
      } catch (e) {
        ws.close();
        reject(e);
      }
    };
  });
}
