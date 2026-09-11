// The headers of a hosted MCP server, edited as text.
//
// The value here is a credential, which is what makes the parsing worth its own module and its own
// tests: a split in the wrong place hands the server half a token, and the failure surfaces much
// later as an authentication error nobody traces back to a colon. The other half is the `${VAR}`
// form — expanding or escaping it here would defeat the point of using a variable, which is that
// the secret never gets written into the config file.
import { describe, it, expect } from "vitest";
import { parseHeaders, formatHeaders } from "@/lib/mcp-headers";

describe("parseHeaders", () => {
  it("reads a name and its value", () => {
    expect(parseHeaders("Authorization: Bearer abc")).toEqual({ Authorization: "Bearer abc" });
  });

  it("cuts on the first colon, so a value that holds colons survives whole", () => {
    expect(parseHeaders("X-Url: https://a.com/b")).toEqual({ "X-Url": "https://a.com/b" });
  });

  it("trims around the name and the value", () => {
    expect(parseHeaders("  X-Key  :   secreto  ")).toEqual({ "X-Key": "secreto" });
  });

  it("skips a blank line and one with no colon", () => {
    expect(parseHeaders("A: 1\n\nsin dos puntos\nB: 2")).toEqual({ A: "1", B: "2" });
  });

  it("skips a line with no name before the colon", () => {
    expect(parseHeaders(": huerfano\n  : tambien\nA: 1")).toEqual({ A: "1" });
  });

  it("gives an empty object for empty text", () => {
    expect(parseHeaders("")).toEqual({});
  });

  it("keeps an env variable in the value untouched, for the client to expand", () => {
    expect(parseHeaders("Authorization: Bearer ${MI_VARIABLE}")).toEqual({
      Authorization: "Bearer ${MI_VARIABLE}",
    });
  });
});

describe("formatHeaders", () => {
  it("writes one header per line", () => {
    expect(formatHeaders({ Authorization: "Bearer abc", "X-Id": "7" })).toBe("Authorization: Bearer abc\nX-Id: 7");
  });

  it("gives empty text when there are no headers", () => {
    expect(formatHeaders(undefined)).toBe("");
    expect(formatHeaders({})).toBe("");
  });

  it("comes back around without losing anything", () => {
    const text = "Authorization: Bearer ${MI_VARIABLE}\nX-Url: https://a.com/b\nX-Id: 7";
    expect(formatHeaders(parseHeaders(text))).toBe(text);
  });
});
