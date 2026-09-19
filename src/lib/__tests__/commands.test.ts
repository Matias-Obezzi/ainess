import { describe, it, expect } from "vitest";
import { COMMANDS, activeCommandQuery, matchCommands, parseCommand } from "@/lib/commands";

describe("activeCommandQuery", () => {
  it("opens on a lone slash", () => {
    expect(activeCommandQuery("/")).toBe("");
  });

  it("gives back what is being typed, lowercased", () => {
    expect(activeCommandQuery("/com")).toBe("com");
    expect(activeCommandQuery("/COST")).toBe("cost");
  });

  it("is not a command when there is anything else in the box", () => {
    expect(activeCommandQuery("")).toBeNull();
    expect(activeCommandQuery("mirá el /compact de Claude")).toBeNull();
    expect(activeCommandQuery("/compact y después andá")).toBeNull();
    expect(activeCommandQuery("/compact\n")).toBeNull();
    expect(activeCommandQuery(" /compact")).toBeNull();
  });
});

describe("matchCommands", () => {
  it("offers everything on an empty query", () => {
    expect(matchCommands("")).toHaveLength(COMMANDS.length);
  });

  it("narrows by prefix", () => {
    expect(matchCommands("c").map(c => c.id)).toEqual(["compact", "clear", "cost", "chat"]);
    expect(matchCommands("co").map(c => c.id)).toEqual(["compact", "cost"]);
    expect(matchCommands("cos").map(c => c.id)).toEqual(["cost"]);
    expect(matchCommands("w").map(c => c.id)).toEqual(["wipe"]);
    expect(matchCommands("zz")).toEqual([]);
  });
});

describe("parseCommand", () => {
  it("only recognises a command that exists", () => {
    expect(parseCommand("/compact")?.id).toBe("compact");
    expect(parseCommand("  /cost  ")?.id).toBe("cost");
    // The two that used to be one command: `/clear` lets the agents go, `/wipe` deletes the record.
    expect(parseCommand("/clear")?.id).toBe("clear");
    expect(parseCommand("/wipe")?.id).toBe("wipe");
    expect(parseCommand("/comp")).toBeUndefined();
    expect(parseCommand("/nope")).toBeUndefined();
    expect(parseCommand("hola")).toBeUndefined();
  });
});
