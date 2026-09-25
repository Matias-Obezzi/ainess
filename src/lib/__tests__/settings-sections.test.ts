// Tests for B-12: the single list of settings sections.
// Verifies that SETTINGS_SECTIONS_META has the expected fifteen ids without duplicates,
// and that SettingsDialog's SECTION_UI map covers all of them.
import { describe, it, expect } from "vitest";
import { SETTINGS_SECTIONS_META, ALL_SETTINGS_SECTION_IDS } from "@/components/settings/sections";
// Imported statically on purpose: pulling the dialog in from inside a test made the whole settings
// UI load against the per-test timeout, which a cold run could not always meet.
import { SETTINGS_SECTIONS } from "@/components/settings/SettingsDialog";

/** Every section the app has, in the order they are shown. Adding one is a deliberate act. */
const EXPECTED_IDS = [
  "general",
  "appearance",
  "agents",
  "teams",
  "profile",
  "presets",
  "skills",
  "mcp",
  "hooks",
  "context",
  "remote",
  "boards",
  "messaging",
  "diagnostics",
  "about",
] as const;

describe("settings sections list (B-12)", () => {
  it("has exactly the expected ids, in order", () => {
    expect(ALL_SETTINGS_SECTION_IDS).toEqual(EXPECTED_IDS);
  });

  it("has no duplicates", () => {
    const ids = SETTINGS_SECTIONS_META.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every section has a labelKey, helpKey, group, icon and optionKeys", () => {
    for (const s of SETTINGS_SECTIONS_META) {
      expect(typeof s.labelKey, s.id).toBe("string");
      expect(typeof s.helpKey, s.id).toBe("string");
      expect(typeof s.group, s.id).toBe("string");
      expect(s.icon, s.id).toBeTruthy();
      expect(Array.isArray(s.optionKeys), s.id).toBe(true);
    }
  });

  it("SettingsDialog SECTION_UI covers all section ids", () => {
    const dialogIds = SETTINGS_SECTIONS.map(s => s.id).sort();
    const expectedSorted = [...EXPECTED_IDS].sort();
    expect(dialogIds).toEqual(expectedSorted);
  });

  it("every SETTINGS_SECTIONS entry has a component", () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(typeof s.component, s.id).toBe("function");
    }
  });
});

describe("the teams section", () => {
  it("comes right after agents, in the same group", () => {
    const ids = SETTINGS_SECTIONS_META.map(s => s.id);
    expect(ids[ids.indexOf("agents") + 1]).toBe("teams");
    const agents = SETTINGS_SECTIONS_META.find(s => s.id === "agents")!;
    const teams = SETTINGS_SECTIONS_META.find(s => s.id === "teams")!;
    expect(teams.group).toBe(agents.group);
  });

  it("took the team options and left the AI ones behind", () => {
    const agents = SETTINGS_SECTIONS_META.find(s => s.id === "agents")!;
    const teams = SETTINGS_SECTIONS_META.find(s => s.id === "teams")!;
    expect(teams.optionKeys).toEqual([
      "settings.option.teams.formations",
      "settings.option.teams.newFormation",
      "settings.option.teams.defaultFormation",
    ]);
    expect(agents.optionKeys).toEqual([
      "settings.option.agents.installed",
      "settings.option.agents.detect",
      "settings.option.agents.cliVersion",
      "settings.option.agents.quota",
      "settings.option.agents.binaryPath",
    ]);
  });
});
