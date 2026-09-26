// Reading a file back as bytes, which is what lets a thread draw the image somebody attached to a
// message. The Rust side of this has the same contract (`read_file_bytes` in src-tauri).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nodeTransport } from "@/lib/transport-node";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = path.join(os.tmpdir(), `ainess-bytes-${process.pid}`);
const png = path.join(dir, "shot.png");
// The first bytes of a real PNG: what matters is that they survive the round trip unchanged.
const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

beforeAll(() => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(png, bytes);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("readFileBytes", () => {
  it("gives the file back byte for byte", async () => {
    const b64 = await nodeTransport.readFileBytes(png, 1024);
    expect(b64).toBe(bytes.toString("base64"));
    expect(Buffer.from(b64!, "base64")).toEqual(bytes);
  });

  it("answers nothing for a file past the cap, rather than dragging it across", async () => {
    expect(await nodeTransport.readFileBytes(png, bytes.length - 1)).toBeNull();
    // Exactly at the cap is still inside it.
    expect(await nodeTransport.readFileBytes(png, bytes.length)).not.toBeNull();
  });

  it("answers nothing for what is not there, and for what is not a file", async () => {
    expect(await nodeTransport.readFileBytes(path.join(dir, "nope.png"), 1024)).toBeNull();
    expect(await nodeTransport.readFileBytes(dir, 1024)).toBeNull();
  });
});
