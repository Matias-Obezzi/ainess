import { describe, it, expect } from "vitest";
import { mcpHeadersFromArgs } from "@/lib/mcp-headers";

describe("mcpHeadersFromArgs", () => {
  it("parses a new header", () => {
    const result = mcpHeadersFromArgs(["--header", "Authorization: Bearer abc"]);
    expect(result).toEqual({ Authorization: "Bearer abc" });
  });

  it("handles repeated headers by keeping the last value", () => {
    const result = mcpHeadersFromArgs([
      "--header", "X-Key: first",
      "--header", "X-Key: second",
    ]);
    expect(result).toEqual({ "X-Key": "second" });
  });

  it("parses multiple distinct headers", () => {
    const result = mcpHeadersFromArgs([
      "--header", "A: 1",
      "--header", "B: 2",
    ]);
    expect(result).toEqual({ A: "1", B: "2" });
  });

  it("preserves colons inside the value (e.g. URLs and timestamps)", () => {
    const result = mcpHeadersFromArgs([
      "--header", "X-Url: https://api.example.com:8080/v1/query?token=xyz:123",
    ]);
    expect(result).toEqual({
      "X-Url": "https://api.example.com:8080/v1/query?token=xyz:123",
    });
  });

  it("deletes an existing header when given an empty value with 'Nombre:'", () => {
    const existing = { Authorization: "Bearer token", "X-Trace": "123" };
    const result = mcpHeadersFromArgs(["--header", "Authorization:"], existing);
    expect(result).toEqual({ "X-Trace": "123" });
  });

  it("deletes an existing header when value has trailing whitespace 'Nombre:   '", () => {
    const existing = { Authorization: "Bearer token" };
    const result = mcpHeadersFromArgs(["--header", "Authorization:   "], existing);
    expect(result).toBeUndefined();
  });

  it("returns undefined when all existing headers are deleted", () => {
    const existing = { Authorization: "Bearer token" };
    const result = mcpHeadersFromArgs(["--header", "Authorization:"], existing);
    expect(result).toBeUndefined();
  });

  it("returns undefined when no headers are passed and there are no existing headers", () => {
    expect(mcpHeadersFromArgs([])).toBeUndefined();
    expect(mcpHeadersFromArgs(["--url", "http://localhost:3000"])).toBeUndefined();
  });

  it("merges new headers with existing ones", () => {
    const existing = { "X-Tenant": "org-42" };
    const result = mcpHeadersFromArgs(["--header", "Authorization: Bearer secret"], existing);
    expect(result).toEqual({
      "X-Tenant": "org-42",
      Authorization: "Bearer secret",
    });
  });

  it("preserves existing headers when no new header is passed", () => {
    const existing = { "X-Tenant": "org-42" };
    const result = mcpHeadersFromArgs(["--command", "echo"], existing);
    expect(result).toEqual({
      "X-Tenant": "org-42",
    });
  });

  it("overwrites existing header with new value", () => {
    const existing = { "X-Tenant": "org-42", "X-Version": "1" };
    const result = mcpHeadersFromArgs(["--header", "X-Version: 2"], existing);
    expect(result).toEqual({
      "X-Tenant": "org-42",
      "X-Version": "2",
    });
  });
});
