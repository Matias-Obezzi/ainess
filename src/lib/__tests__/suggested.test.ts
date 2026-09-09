import { describe, it, expect } from "vitest";
import { SUGGESTED_MCP, SUGGESTED_SKILLS } from "@/lib/suggested";
import { dictionaries, LANGUAGES, translate, baseDictionary } from "@/i18n";

describe("suggested catalog", () => {
  it("defines every description and requires key in all 7 languages", () => {
    const keys: string[] = [];
    for (const mcp of SUGGESTED_MCP) {
      keys.push(mcp.descriptionKey);
      if (mcp.requiresKey) {
        keys.push(mcp.requiresKey);
      }
    }
    for (const skill of SUGGESTED_SKILLS) {
      keys.push(skill.descriptionKey);
    }

    expect(keys.length).toBeGreaterThan(0);

    for (const lang of LANGUAGES) {
      const dict = dictionaries[lang];
      for (const key of keys) {
        const resolved = translate(dict, baseDictionary, key);
        expect(resolved, `Missing key "${key}" in language "${lang}"`).not.toBe(key);
        expect(dict[key], `Direct dictionary entry for "${key}" in "${lang}" should exist`).toBeDefined();
        expect(dict[key]?.trim().length, `Entry for "${key}" in "${lang}" should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it("ensures agent-facing skill content and names are in English", () => {
    // Heuristic check: verifies that skill names and content do not contain characters
    // that exclusively appear in non-English languages (such as á é í ó ú ü ñ ¿ ¡ and uppercase variants).
    // This is a practical heuristic, not a full natural language detector: it is specifically designed
    // to catch leaving Spanish text in agent instructions without overcomplicating test infrastructure.
    const nonEnglishPattern = /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/;

    for (const skill of SUGGESTED_SKILLS) {
      expect(
        skill.name,
        `Skill name "${skill.name}" contains non-English characters`
      ).not.toMatch(nonEnglishPattern);

      expect(
        skill.content,
        `Skill content for "${skill.name}" contains non-English characters`
      ).not.toMatch(nonEnglishPattern);
    }
  });
});
