// One question, two shapes: a dialog in the app, the island on the phone. The app and the phone
// page render the very same components, so which one appears cannot be up to the caller.
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ConfirmRequest } from "@/components/ui/confirm-dialog";

const islandConfirm = vi.fn(async (_request: ConfirmRequest) => true);
const askInDialog = vi.fn(async (_request: ConfirmRequest) => true);
let hostMounted = true;

vi.mock("@/components/ui/island", () => ({ island: { confirm: islandConfirm } }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  askInDialog,
  dialogAvailable: () => hostMounted,
}));

beforeEach(() => {
  vi.resetModules();
  islandConfirm.mockClear();
  askInDialog.mockClear();
  hostMounted = true;
});

describe("confirm", () => {
  it("opens the dialog in the desktop app", async () => {
    const { confirm } = await import("@/lib/confirm");
    await expect(confirm({ title: "¿Seguro?" })).resolves.toBe(true);
    expect(askInDialog).toHaveBeenCalledTimes(1);
    expect(islandConfirm).not.toHaveBeenCalled();
  });

  it("uses the island on the phone", async () => {
    const { markRemoteBuild } = await import("@/lib/platform");
    markRemoteBuild();
    const { confirm } = await import("@/lib/confirm");
    await expect(confirm({ title: "¿Seguro?" })).resolves.toBe(true);
    expect(islandConfirm).toHaveBeenCalledTimes(1);
    expect(askInDialog).not.toHaveBeenCalled();
  });

  it("falls back to the island when no dialog is mounted", async () => {
    // A component rendered on its own, or a test: the question still has to be asked somewhere.
    hostMounted = false;
    const { confirm } = await import("@/lib/confirm");
    await confirm({ title: "¿Seguro?" });
    expect(islandConfirm).toHaveBeenCalledTimes(1);
    expect(askInDialog).not.toHaveBeenCalled();
  });

  it("says what will be deleted, and that it cannot be undone", async () => {
    const { confirmDelete } = await import("@/lib/confirm");
    await confirmDelete("¿Eliminar el proyecto?", "uiness");
    const request = askInDialog.mock.calls[0][0];
    expect(request.description).toContain("uiness");
    expect(request.destructive).toBe(true);
  });
});
