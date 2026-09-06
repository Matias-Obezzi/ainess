import { useEffect } from "react";
import { useAppStore } from "@/store";
import { useNotifications } from "@/hooks/useNotifications";
import { useSystemNotifications } from "@/hooks/useSystemNotifications";
import { Island } from "@/components/ui/island";
import { Toaster } from "@/components/ui/toast";
import { ApprovalsPanel } from "@/components/ApprovalsPanel";
import { Sidebar } from "@/components/shell/Sidebar";
import { TitleBar } from "@/components/shell/TitleBar";
import { SearchPalette } from "@/components/shell/SearchPalette";
import { ShortcutsDialog } from "@/components/shell/ShortcutsDialog";
import { HomeScreen } from "@/components/shell/HomeScreen";
import { ProjectScreen } from "@/components/shell/ProjectScreen";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { RightDock } from "@/components/shell/RightDock";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useRemoteSync } from "@/hooks/useRemoteSync";
import { useNoDefaultContextMenu } from "@/hooks/useNoDefaultContextMenu";
import { useQuotaSync } from "@/hooks/useQuotaSync";
import { useRepoSync } from "@/hooks/useRepoSync";
import { getTransport } from "@/lib/transport";
import { ensureNgrokUpToDate } from "@/lib/ngrok-account";
import { resolveGlobalShortcut, shortcutPlatform } from "@/lib/shortcuts";

export default function App() {
  const init = useAppStore(state => state.init);
  const loaded = useAppStore(state => state.loaded);
  const screen = useAppStore(state => state.screen);
  const commPanelOpen = useAppStore(state => state.commPanelOpen);
  const termPanelOpen = useAppStore(state => state.termPanelOpen);

  useEffect(() => {
    void init();
  }, [init]);

  // ngrok refuses to connect when the agent is older than the minimum its account asks for, and
  // winget's package lags behind, so the app keeps it current on its own as soon as it finds it.
  useEffect(() => {
    void getTransport()
      .tunnelDetect()
      .then(found => {
        if (found.ngrok) void ensureNgrokUpToDate(found.ngrok);
      })
      .catch(() => {
        /* no tunnel binaries here (browser preview): nothing to update */
      });
  }, []);

  useNotifications();
  useSystemNotifications();
  useUpdateCheck();
  useRemoteSync();
  useNoDefaultContextMenu();
  useQuotaSync();
  useRepoSync();

  // Every global shortcut is resolved from the one table in src/lib/shortcuts.ts, which is also
  // what the Ctrl+/ dialog documents, so the keys and their description cannot drift apart.
  useEffect(() => {
    const platform = shortcutPlatform();
    const handler = (e: KeyboardEvent) => {
      const shortcut = resolveGlobalShortcut(e, platform);
      if (!shortcut) return;
      e.preventDefault();
      const state = useAppStore.getState();
      switch (shortcut.id) {
        case "terminals": {
          state.toggleTermPanel();
          // Opening an empty dock straight into its empty state helps nobody.
          if (!state.termPanelOpen && useAppStore.getState().terminals.length === 0) {
            useAppStore.getState().openTerminal();
          }
          break;
        }
        case "settings":
          state.openSettings();
          break;
        case "palette":
          state.toggleSearch();
          break;
        case "sidebar":
          state.toggleSidebar();
          break;
        case "shortcuts":
          state.toggleShortcuts();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!loaded) return null;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden relative">
      <TitleBar />

      <div className="flex-1 min-h-0 flex relative">
        <Island position="top" idle={false} />
        <Toaster position="bottom-right" richColors />

        <Sidebar />

        <main className="flex-1 min-w-0 flex flex-col relative">
          {screen === "home" && (
            <>
              {/* Pending approvals stay visible outside the project screen too. */}
              <div className="px-6 pt-4 empty:hidden">
                <ApprovalsPanel all />
              </div>
              <HomeScreen />
            </>
          )}
          {screen === "project" && <ProjectScreen />}
        </main>

        {(commPanelOpen || termPanelOpen) && screen === "project" && <RightDock />}
      </div>

      <SettingsDialog />
      <SearchPalette />
      <ShortcutsDialog />
    </div>
  );
}
