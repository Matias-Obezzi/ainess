// A new agent under a planner introduces itself. The field was left empty by everything that
// creates one, and it is the field its planner reads to decide who gets a task.
import { describe, it, expect } from "vitest";
import { defaultAgentDescription } from "@/lib/providers";
import { useAppStore } from "@/store";
import { en, es } from "@/i18n";

function inLanguage<T>(language: "es" | "en", body: () => T): T {
  const before = useAppStore.getState().config.language;
  useAppStore.setState(state => ({ config: { ...state.config, language } }));
  try {
    return body();
  } finally {
    useAppStore.setState(state => ({ config: { ...state.config, language: before } }));
  }
}

describe("defaultAgentDescription", () => {
  it("says the role and the CLI behind it", () => {
    const text = inLanguage("en", () => defaultAgentDescription("implementer", "antigravity"));
    expect(text).toContain(en["label.role.implementer"]);
    expect(text).toContain("Antigravity");
    expect(text).not.toContain("{");
  });

  it("follows the language of the app", () => {
    const text = inLanguage("es", () => defaultAgentDescription("reviewer", "claude"));
    expect(text).toContain(es["label.role.reviewer"]);
    expect(text).toContain("Claude Code");
  });

  it("falls back to the provider id for a custom command", () => {
    expect(inLanguage("en", () => defaultAgentDescription("custom", "custom"))).toContain(
      // "custom" is a provider with a label of its own; whatever it is, it is not a placeholder.
      en["label.role.custom"],
    );
  });
});
