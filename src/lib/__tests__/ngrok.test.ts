import { describe, expect, it } from "vitest";
import {
  isMissingBinaryError,
  looksLikeNgrokCredential,
  ngrokApiKey,
  ngrokConfigKeys,
  ngrokUpdateOutcome,
  parseNgrokConfigPath,
  parseNgrokVersion,
  parseReservedDomains,
} from "@/lib/ngrok";

describe("ngrok update", () => {
  it("reads the version out of `ngrok --version`", () => {
    expect(parseNgrokVersion("ngrok version 3.20.1")).toBe("3.20.1");
    expect(parseNgrokVersion("ngrok version 3.3.1\n")).toBe("3.3.1");
    expect(parseNgrokVersion("command not found")).toBeNull();
  });

  it("recognises the error of a binary that is no longer where it was", () => {
    expect(isMissingBinaryError("No se pudo ejecutar C:\\x\\ngrok.exe: The system cannot find the file specified. (os error 2)")).toBe(true);
    expect(isMissingBinaryError("spawn ngrok ENOENT")).toBe(true);
    expect(isMissingBinaryError("ngrok terminó con código 1")).toBe(false);
  });

  it("tells apart an update, an already current agent and a failure", () => {
    expect(ngrokUpdateOutcome("Update successful!", 0)).toBe("updated");
    expect(ngrokUpdateOutcome("No update available, ngrok is already the latest version", 0)).toBe("current");
    expect(ngrokUpdateOutcome("permission denied", 1)).toBe("failed");
    expect(ngrokUpdateOutcome("", null)).toBe("failed");
    // Anything unreadable that still exited fine means nothing changed.
    expect(ngrokUpdateOutcome("algo raro", 0)).toBe("current");
    // A Microsoft Store install cannot replace itself; the Store keeps it current.
    expect(ngrokUpdateOutcome("ERROR: in-place upgrades are not supported for this ngrok installation", 1)).toBe("current");
  });
});

describe("parseNgrokConfigPath", () => {
  it("extracts the path from a valid-config message", () => {
    const out = "Valid configuration file at C:\\Users\\x\\AppData\\Local\\ngrok\\ngrok.yml\n";
    expect(parseNgrokConfigPath(out)).toBe("C:\\Users\\x\\AppData\\Local\\ngrok\\ngrok.yml");
  });

  it("returns null on an error message", () => {
    expect(parseNgrokConfigPath("ERROR: failed to open configuration file")).toBeNull();
  });

  it("returns null on empty text", () => {
    expect(parseNgrokConfigPath("")).toBeNull();
  });
});

describe("ngrokConfigKeys", () => {
  it("reads the v2 (top-level) layout", () => {
    const yaml = "version: 2\nauthtoken: abc123\n";
    expect(ngrokConfigKeys(yaml)).toEqual({ authtoken: true, apiKey: false });
  });

  it("reads the v3 layout, nested under agent:", () => {
    const yaml = "version: 3\nagent:\n  authtoken: abc123\napi_key: xyz789\n";
    expect(ngrokConfigKeys(yaml)).toEqual({ authtoken: true, apiKey: true });
  });

  it("ignores a commented-out key", () => {
    const yaml = "version: 2\n# authtoken: abc123\n";
    expect(ngrokConfigKeys(yaml)).toEqual({ authtoken: false, apiKey: false });
  });

  it("treats an empty value as absent", () => {
    const yaml = "version: 2\nauthtoken:\n";
    expect(ngrokConfigKeys(yaml)).toEqual({ authtoken: false, apiKey: false });
  });

  it("returns both false for null", () => {
    expect(ngrokConfigKeys(null)).toEqual({ authtoken: false, apiKey: false });
  });
});

describe("ngrokApiKey", () => {
  it("strips double quotes", () => {
    expect(ngrokApiKey('api_key: "abc123"')).toBe("abc123");
  });

  it("strips single quotes", () => {
    expect(ngrokApiKey("api_key: 'abc123'")).toBe("abc123");
  });

  it("works unquoted with a trailing comment", () => {
    expect(ngrokApiKey("api_key: abc123 # my key")).toBe("abc123");
  });

  it("returns null when absent", () => {
    expect(ngrokApiKey("version: 2\nauthtoken: abc123\n")).toBeNull();
    expect(ngrokApiKey(null)).toBeNull();
  });
});

describe("parseReservedDomains", () => {
  it("reads the domains out of the normal response shape", () => {
    const body = JSON.stringify({
      reserved_domains: [{ id: "1", domain: "one.ngrok-free.app" }, { id: "2", domain: "two.ngrok-free.app" }],
      next_page_uri: null,
    });
    expect(parseReservedDomains(body)).toEqual(["one.ngrok-free.app", "two.ngrok-free.app"]);
  });

  it("tolerates a bare array", () => {
    const body = JSON.stringify([{ domain: "one.ngrok-free.app" }]);
    expect(parseReservedDomains(body)).toEqual(["one.ngrok-free.app"]);
  });

  it("returns an empty list for an empty object", () => {
    expect(parseReservedDomains("{}")).toEqual([]);
  });

  it("returns an empty list for invalid JSON", () => {
    expect(parseReservedDomains("not json")).toEqual([]);
  });
});

describe("looksLikeNgrokCredential", () => {
  it("accepts a plausible credential", () => {
    expect(looksLikeNgrokCredential("2abcDEF0123456789ghijKLMN")).toBe(true);
  });

  it("rejects empty, short and whitespace-containing values", () => {
    expect(looksLikeNgrokCredential("")).toBe(false);
    expect(looksLikeNgrokCredential("short")).toBe(false);
    expect(looksLikeNgrokCredential("has a space in it 12345")).toBe(false);
  });
});
