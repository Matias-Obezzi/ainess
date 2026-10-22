import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { nodeRemote } from "@/lib/remote-node";

describe("nodeRemote security and body parsing order", () => {
  afterEach(async () => {
    await nodeRemote.remoteStop();
  });

  it("rejects unauthenticated POST to /api/fs with 401 before reading large body", async () => {
    const testPort = 48200 + Math.floor(Math.random() * 500);
    await nodeRemote.remoteStart(testPort, "valid-secret-token");

    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${testPort}/api/fs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // No authorization header or token query
          },
        },
        (res) => {
          resolve(res.statusCode ?? 0);
          res.resume();
        },
      );

      req.on("error", (err) => {
        reject(err);
      });

      // Write initial chunk of a large payload
      req.write(JSON.stringify({ op: "writeBytes", path: "/test", base64: "a".repeat(10000) }));
      req.end();
    });

    expect(status).toBe(401);
  });
});
