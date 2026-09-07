// Tests for B-12: the single list of settings sections.
// Verifies that SETTINGS_SECTIONS_META has the expected eleven ids without duplicates,
// and that SettingsDialog's SECTION_UI map covers all of them.
import { describe, it, expect } from "vitest";
import { SETTINGS_SECTIONS_META, ALL_SETTINGS_SECTION_IDS } from "@/components/settings/sections";

/** The eleven section ids the app has always had. */
const EXPECTED_IDS = [
  "general",
  "agents",
  "profile",
  "presets",
  "skills",
  "mcp",
  "hooks",
  "context",
  "remote",
  "diagnostics",
  "about",
] as const;

describe("settings sections list (B-12)", () => {
  it("has exactly the eleven expected ids", () => {
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

  it("SettingsDialog SECTION_UI covers all section ids", async () => {
    // Import the compiled dialog module and check that SETTINGS_SECTIONS has one entry per id.
    const { SETTINGS_SECTIONS } = await import("@/components/settings/SettingsDialog");
    const dialogIds = SETTINGS_SECTIONS.map(s => s.id).sort();
    const expectedSorted = [...EXPECTED_IDS].sort();
    expect(dialogIds).toEqual(expectedSorted);
  });

  it("every SETTINGS_SECTIONS entry has a component", async () => {
    const { SETTINGS_SECTIONS } = await import("@/components/settings/SettingsDialog");
    for (const s of SETTINGS_SECTIONS) {
      expect(typeof s.component, s.id).toBe("function");
    }
  });
});
