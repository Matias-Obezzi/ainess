// Proves the managed runtime is enough on its own: that the bun and the adapter the app installed
// into its own folder (see src-tauri/src/acp_setup.rs) speak ACP on a machine where node does not
// exist.
//
// Which is why this script runs with **bun** and not with node — node is exactly what it is meant
// to do without. It spawns the adapter the way `acp_managed_status` says to, with the PATH cut down
// to the two system folders, writes one `initialize` frame to its stdin and prints the answer.
// Nothing is prompted: a handshake costs no quota and an answer to `initialize` is all this claims.
//
//   $env:PATH = "C:\Windows\System32;C:\Windows"
//   <install-dir>\..\runtime\bun\bun.exe scripts/acp-managed-check.mjs <install-dir>
//
// `<install-dir>` is the `acp/` folder (the app's config dir + `acp`); it defaults to the one the
// installed marker sits in beside this script's own runtime. Exits non-zero when there is no answer.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const installDir = resolve(process.argv[2] ?? ".");
const root = dirname(installDir);
const bun = join(root, "runtime", "bun", process.platform === "win32" ? "bun.exe" : "bun");
const entry = join(installDir, "node_modules", "@agentclientprotocol", "claude-agent-acp", "dist", "index.js");
const marker = join(installDir, "installed.json");

for (const [what, path] of [["bun", bun], ["adapter", entry], ["marker", marker]]) {
  if (!existsSync(path)) {
    console.error(`no ${what} at ${path}`);
    process.exit(2);
  }
}
console.log("marker:", readFileSync(marker, "utf-8").trim());
console.log("bun:   ", bun);
console.log("adapter:", entry);

// The whole point: nothing of the user's own PATH survives, so nothing can be found by name.
const PATH = process.platform === "win32" ? "C:\\Windows\\System32;C:\\Windows" : "/usr/bin:/bin";
const env = { ...process.env, PATH, Path: PATH, NO_COLOR: "1" };
// The engine is beside the adapter in the same node_modules; whether the adapter needs to be told
// so is what the second argument decides, and what the report is about.
if (process.argv[3]) {
  env.CLAUDE_CODE_EXECUTABLE = process.argv[3];
  console.log("CLAUDE_CODE_EXECUTABLE:", process.argv[3]);
}

const child = spawn(bun, ["run", entry], { env, stdio: ["pipe", "pipe", "pipe"] });

let out = "";
child.stdout.on("data", (d) => {
  out += d.toString();
  const line = out.split("\n").find((l) => l.trim().startsWith("{"));
  if (!line) return;
  console.log("\ninitialize ->", line.trim());
  child.stdin.end();
  child.kill();
  process.exit(0);
});
child.stderr.on("data", (d) => process.stderr.write(`[adapter] ${d}`));
child.on("error", (e) => {
  console.error("could not start the adapter:", e.message);
  process.exit(1);
});

child.stdin.write(
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: 1, clientCapabilities: {} },
  }) + "\n",
);

setTimeout(() => {
  console.error("\nno answer to initialize in 30s");
  child.kill();
  process.exit(1);
}, 30_000);
