// What each account linked to opencode has been used for. The numbers come from the table
// `opencode stats --models` prints (captured from version 1.18.29) and the account names from
// `opencode auth list`; opencode reports no ceiling, because the ceiling belongs to the account.
import { describe, it, expect } from "vitest";
import { parseHumanNumber, parseOpencodeAccounts, parseOpencodeStats } from "@/lib/quota";

/** Real output, boxes included. Two models of the same account plus one of another. */
const STATS = `┌────────────────────────────────────────────────────────┐
│                       OVERVIEW                         │
├────────────────────────────────────────────────────────┤
│Sessions                                             12 │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                      MODEL USAGE                       │
├────────────────────────────────────────────────────────┤
│ opencode/big-pickle                                    │
│  Messages                                           12 │
│  Input Tokens                                    82.2K │
│  Output Tokens                                    1.3K │
│  Cache Read                                      38.6K │
│  Cache Write                                         0 │
│  Cost                                          $0.0000 │
├────────────────────────────────────────────────────────┤
│ google/gemini-3-flash                                  │
│  Messages                                            5 │
│  Input Tokens                                     1.5K │
│  Output Tokens                                     300 │
│  Cache Read                                          0 │
│  Cache Write                                         0 │
│  Cost                                          $0.0120 │
├────────────────────────────────────────────────────────┤
│ google/gemini-3-pro-image-preview                      │
│  Messages                                            2 │
│  Input Tokens                                        0 │
│  Output Tokens                                       0 │
│  Cache Read                                          0 │
│  Cache Write                                         0 │
│  Cost                                          $0.0000 │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                      TOOL USAGE                        │
├────────────────────────────────────────────────────────┤
│ webfetch           ████████████████████   1 (100.0%)   │
└────────────────────────────────────────────────────────┘`;

const AUTH = `
┌  Credentials ~\\.local\\share\\opencode\\auth.json
│
●  Google api
│
└  1 credentials
`;

describe("parseHumanNumber", () => {
  it("reads the shorthand of the table", () => {
    expect(parseHumanNumber("82.2K")).toBe(82200);
    expect(parseHumanNumber("1.3M")).toBe(1_300_000);
    expect(parseHumanNumber("300")).toBe(300);
    expect(parseHumanNumber("$0.0120")).toBeCloseTo(0.012, 4);
    expect(parseHumanNumber("—")).toBe(0);
  });
});

describe("parseOpencodeStats", () => {
  it("adds the models of one account up into one line", () => {
    const usage = parseOpencodeStats(STATS);
    const google = usage.find(u => u.id === "google")!;
    expect(google.models).toBe(2);
    expect(google.messages).toBe(7);
    expect(google.inputTokens).toBe(1500);
    expect(google.outputTokens).toBe(300);
    expect(google.costUsd).toBeCloseTo(0.012, 4);
  });

  it("keeps the accounts apart", () => {
    const usage = parseOpencodeStats(STATS);
    expect(usage.map(u => u.id).sort()).toEqual(["google", "opencode"]);
    const own = usage.find(u => u.id === "opencode")!;
    expect(own.messages).toBe(12);
    expect(own.cachedTokens).toBe(38600);
  });

  it("stops at the table's end, so the sections around it never leak in", () => {
    const usage = parseOpencodeStats(STATS);
    // "webfetch 1 (100.0%)" of TOOL USAGE is not a model and belongs to nobody.
    expect(usage.some(u => u.id === "webfetch")).toBe(false);
    expect(parseOpencodeStats("no hay ninguna tabla acá")).toEqual([]);
  });
});

describe("parseOpencodeAccounts", () => {
  it("reads the linked accounts, without their auth type", () => {
    expect(parseOpencodeAccounts(AUTH)).toEqual([{ id: "google", label: "Google" }]);
  });

  it("takes a name with a space as one account", () => {
    // `github-copilot` in a model id, «GitHub Copilot» here: the id is what pairs the two.
    expect(parseOpencodeAccounts("●  GitHub Copilot oauth")).toEqual([
      { id: "githubcopilot", label: "GitHub Copilot" },
    ]);
  });

  it("says nothing when nothing is linked", () => {
    expect(parseOpencodeAccounts("┌  Credentials\n└  0 credentials")).toEqual([]);
  });
});
