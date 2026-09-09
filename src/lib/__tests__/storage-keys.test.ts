import { describe, it, expect } from "vitest";
import { readWithLegacy } from "../storage-keys";

describe("readWithLegacy", () => {
  it("reads the new key when it exists", () => {
    const store = new Map<string, string>([
      ["ainess.ui", "new-value"],
      ["ais.ui", "old-value"],
    ]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
    } as unknown as Storage;

    expect(readWithLegacy(storage, "ainess.ui", "ais.ui")).toBe("new-value");
  });

  it("falls back to the legacy key when the new one is not present", () => {
    const store = new Map<string, string>([
      ["ais.ui", "old-value"],
    ]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
    } as unknown as Storage;

    expect(readWithLegacy(storage, "ainess.ui", "ais.ui")).toBe("old-value");
  });

  it("returns null when neither key exists", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
    } as unknown as Storage;

    expect(readWithLegacy(storage, "ainess.ui", "ais.ui")).toBeNull();
  });

  it("returns null instead of throwing when getItem throws an exception", () => {
    const storage = {
      getItem: () => {
        throw new Error("SecurityError: localStorage is disabled in private mode");
      },
    } as unknown as Storage;

    expect(readWithLegacy(storage, "ainess.ui", "ais.ui")).toBeNull();
  });
});
