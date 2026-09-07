// What the phone page can do about notifications depends on two things the browser decides, and
// both of them look like "nothing happened" from the outside: an insecure context (the LAN address
// is plain HTTP) and a permission that was never asked for or was refused.
import { describe, it, expect, afterEach, vi } from "vitest";
import { notificationState } from "@/remote/web-notifications";

function browser(opts: { notification?: boolean; secure: boolean; permission?: NotificationPermission }) {
  if (opts.notification === false) {
    vi.stubGlobal("Notification", undefined);
  } else {
    vi.stubGlobal("Notification", { permission: opts.permission ?? "default" });
  }
  vi.stubGlobal("isSecureContext", opts.secure);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notificationState", () => {
  it("says when the browser has no notifications at all", () => {
    browser({ notification: false, secure: true });
    expect(notificationState()).toBe("unsupported");
  });

  // The LAN server is plain HTTP, and there the API exists and refuses to work.
  it("says when the page is not in a secure context", () => {
    browser({ secure: false });
    expect(notificationState()).toBe("insecure");
  });

  it("reports the permission when it can be asked for", () => {
    browser({ secure: true, permission: "default" });
    expect(notificationState()).toBe("default");

    browser({ secure: true, permission: "granted" });
    expect(notificationState()).toBe("granted");

    browser({ secure: true, permission: "denied" });
    expect(notificationState()).toBe("denied");
  });
});
