// The Plugins section with nothing installed — the state everyone starts in.
//
// Its selector used to hand zustand a new empty array on every read, which React reads as a store
// that never settles: it looped until it gave up and the whole window went black.
import { describe, it, expect, beforeEach } from "vitest";
import { render, resetStore } from "@/test/render";
import { PluginsSection, PluginsSectionActions, PluginsSectionProvider } from "@/components/settings/PluginsSection";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";

describe("PluginsSection", () => {
  beforeEach(() => {
    resetStore();
    setTransport(nullTransport);
    useAppStore.setState(state => ({ config: { ...state.config, plugins: undefined } }));
  });

  it("renders its empty state when no plugin was ever installed", () => {
    render(
      <PluginsSectionProvider>
        <PluginsSectionActions />
        <PluginsSection />
      </PluginsSectionProvider>,
    );
    expect(document.body.textContent).toContain("Todavía no hay plugins");
  });
});
