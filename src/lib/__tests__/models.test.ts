import { describe, it, expect } from "vitest";
import { modelChoices } from "@/lib/models";
import { PROVIDERS } from "@/lib/providers";

describe("modelChoices", () => {
  it("dynamic list beats static fallback when non-empty", () => {
    const dynamic = [
      { id: "dynamic-1", label: "Dynamic One" },
      { id: "dynamic-2", label: "Dynamic Two" },
    ];
    const choices = modelChoices("claude", dynamic, []);
    expect(choices).toEqual(dynamic);
  });

  it("falls back to static PROVIDERS models when dynamic is undefined or empty", () => {
    const staticExpected = PROVIDERS.claude.models;
    expect(modelChoices("claude", undefined, [])).toEqual(staticExpected);
    expect(modelChoices("claude", [], [])).toEqual(staticExpected);
  });

  it("appends remembered models most-recent-first and deduped against static and dynamic", () => {
    // Dynamic has d1 and d2
    const dynamic = [
      { id: "d1", label: "Dynamic 1" },
      { id: "d2", label: "Dynamic 2" },
    ];
    // Remembered has d1 (already in dynamic), custom-new, custom-old, and a duplicate custom-new
    const remembered = ["custom-new", "d1", "custom-old", "custom-new"];
    const choices = modelChoices("claude", dynamic, remembered);

    expect(choices).toEqual([
      { id: "d1", label: "Dynamic 1" },
      { id: "d2", label: "Dynamic 2" },
      { id: "custom-new", label: "custom-new" },
      { id: "custom-old", label: "custom-old" },
    ]);
  });

  it("dedupes remembered models against static models when dynamic is empty", () => {
    const staticClaude = PROVIDERS.claude.models;
    const existingStaticId = staticClaude[0].id;
    const remembered = [existingStaticId, "custom-x", "custom-y", "custom-x"];
    const choices = modelChoices("claude", [], remembered);

    expect(choices).toEqual([
      ...staticClaude,
      { id: "custom-x", label: "custom-x" },
      { id: "custom-y", label: "custom-y" },
    ]);
  });

  it("handles unknown or empty provider safely", () => {
    // Provider without static models (or custom)
    const choices = modelChoices("custom", undefined, ["my-model"]);
    expect(choices).toEqual([
      { id: "my-model", label: "my-model" },
    ]);
  });
});
