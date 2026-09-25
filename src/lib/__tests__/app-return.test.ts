import { describe, it, expect, vi } from "vitest";
import { appReturnTick, bumpAppReturn, subscribeAppReturn, watchAppReturn } from "@/lib/app-return";

describe("app-return", () => {
  it("counts up and tells whoever is listening", () => {
    const before = appReturnTick();
    const heard = vi.fn();
    const off = subscribeAppReturn(heard);
    bumpAppReturn();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(appReturnTick()).toBe(before + 1);
    off();
    bumpAppReturn();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("registers nothing where there is no Tauri to listen to", async () => {
    // jsdom is the browser preview and the phone's page: `listen()` would be reaching for an IPC
    // that is not there. Resolving quietly is the whole contract.
    await expect(watchAppReturn()).resolves.toBeUndefined();
  });
});
