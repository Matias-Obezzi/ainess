// A binary that is not on this machine is asked for once, not once a minute for the rest of the
// session. See src/lib/missing-binary.ts.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  execUnlessMissing,
  forgetMissingBinaries,
  isBinaryMissing,
  readsAsNotInstalled,
} from "@/lib/missing-binary";
import { nullTransport } from "@/lib/transport-null";
import { setTransport } from "@/lib/transport";

/** Counts the calls that actually reached the transport, and answers however the test says. */
function countingTransport(answer: () => Promise<{ code: number | null; stdout: string; stderr: string }>) {
  const calls: string[] = [];
  setTransport({
    ...nullTransport,
    exec: async (program: string) => {
      calls.push(program);
      return answer();
    },
  } as typeof nullTransport);
  return calls;
}

const notFound = () => Promise.reject(new Error("No se pudo ejecutar gh: program not found"));

beforeEach(() => forgetMissingBinaries());
afterEach(() => setTransport(nullTransport));

describe("readsAsNotInstalled", () => {
  it("reads the ways an OS says the program does not exist", () => {
    expect(readsAsNotInstalled(new Error("No se pudo ejecutar gh: program not found"))).toBe(true);
    expect(readsAsNotInstalled("'gh' is not recognized as an internal or external command")).toBe(true);
    expect(readsAsNotInstalled(new Error("The system cannot find the file specified. (os error 2)"))).toBe(true);
    expect(readsAsNotInstalled(new Error("No such file or directory (os error 2)"))).toBe(true);
  });

  it("does not read a busy machine as a machine without the program", () => {
    // This is the one that matters: a spawn can fail because the app ran out of handles under a
    // storm of git reads. Writing `git` off for the rest of the session over that would be a much
    // worse bug than the log noise this whole thing exists to stop.
    expect(readsAsNotInstalled(new Error("No se pudo ejecutar git: too many open files"))).toBe(false);
    expect(readsAsNotInstalled(new Error("Falló la ejecución de git: broken pipe"))).toBe(false);
    expect(readsAsNotInstalled(new Error("git no respondió en 10 s: se canceló la ejecución."))).toBe(false);
  });
});

describe("execUnlessMissing", () => {
  it("asks once for a program that is not installed, and never again", async () => {
    const calls = countingTransport(notFound);

    expect(await execUnlessMissing("gh", ["pr", "list"])).toBeNull();
    expect(await execUnlessMissing("gh", ["auth", "token"])).toBeNull();
    expect(await execUnlessMissing("gh", ["pr", "list"])).toBeNull();

    expect(calls).toEqual(["gh"]);
    expect(isBinaryMissing("gh")).toBe(true);
  });

  it("keeps asking a program that failed for any other reason", async () => {
    const calls = countingTransport(() => Promise.reject(new Error("git no respondió en 10 s")));

    expect(await execUnlessMissing("git", ["status"])).toBeNull();
    expect(await execUnlessMissing("git", ["status"])).toBeNull();

    expect(calls).toEqual(["git", "git"]);
    expect(isBinaryMissing("git")).toBe(false);
  });

  it("writes off one program without touching the next", async () => {
    const calls = countingTransport(notFound);

    await execUnlessMissing("gh", ["auth", "token"]);
    expect(isBinaryMissing("gh")).toBe(true);
    expect(isBinaryMissing("git")).toBe(false);

    await execUnlessMissing("git", ["status"]);
    expect(calls).toEqual(["gh", "git"]);
  });

  it("tries again once the user says the machine changed", async () => {
    const calls = countingTransport(notFound);

    await execUnlessMissing("gh", ["auth", "token"]);
    expect(calls).toHaveLength(1);

    // "Detectar de nuevo" in Configuración, or an override that now points somewhere.
    forgetMissingBinaries();
    await execUnlessMissing("gh", ["auth", "token"]);
    expect(calls).toHaveLength(2);
  });

  it("passes the answer through when the program is there", async () => {
    countingTransport(async () => ({ code: 0, stdout: "ok", stderr: "" }));
    expect(await execUnlessMissing("gh", ["auth", "token"])).toEqual({ code: 0, stdout: "ok", stderr: "" });
  });

  it("does not write off a program that ran and failed", async () => {
    // `gh auth token` with nobody logged in exits non-zero, and gh is very much installed.
    const calls = countingTransport(async () => ({ code: 1, stdout: "", stderr: "gh auth login required" }));

    await execUnlessMissing("gh", ["auth", "token"]);
    await execUnlessMissing("gh", ["auth", "token"]);

    expect(calls).toEqual(["gh", "gh"]);
    expect(isBinaryMissing("gh")).toBe(false);
  });
});
