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
import { useAutonomousExpiry } from "@/hooks/useAutonomousExpiry";
import { useRepoSync } from "@/hooks/useRepoSync";
import { useRepoWatch } from "@/hooks/useRepoWatch";
import { useSystemHooks } from "@/hooks/useSystemHooks";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { ChangelogDialog, useChangelogOnUpdate } from "@/components/settings/ChangelogDialog";
import { getTransport } from "@/lib/transport";
import { ensureNgrokUpToDate } from "@/lib/ngrok-account";
import { resolveGlobalShortcut, shortcutPlatform } from "@/lib/shortcuts";

export default function App() {
  const init = useAppStore(state => state.init);
  const loaded = useAppStore(state => state.loaded);
  const screen = useAppStore(state => state.screen);
  const commPanelOpen = useAppStore(state => state.commPanelOpen);
  const diffPanelOpen = useAppStore(state => state.diffPanelOpen);
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
  useAutonomousExpiry();
  useRepoSync();
  useRepoWatch();
  useSystemHooks();
  const { open: changelogOpen, setOpen: setChangelogOpen } = useChangelogOnUpdate();

  // Every global shortcut is resolved from the one table in src/lib/shortcuts.ts, which is also
  // what the Ctrl+/ dialog documents, so the keys and their description cannot drift apart.
  /**
   * A card let go anywhere but on a column used to reload the whole window.
   *
   * An unhandled `drop` is the browser's to deal with, and what it does with one carrying text is
   * navigate to it — inside the app that reads as the screen reloading, and the card never moves.
   * The board prevents the default on its own columns; this covers everything around them.
   */
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

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
          const store = useAppStore.getState();
          const currentProjectId = store.currentProjectId;
          const projectTerminals = store.terminals.filter(t => t.projectId === currentProjectId);
          if (!state.termPanelOpen && projectTerminals.length === 0) {
            store.openTerminal();
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
        {/* The one dialog every `confirm()` on the desktop opens (src/lib/confirm.ts). */}
        <ConfirmDialogHost />
        {/* Opens itself once when the version changed under the user, wherever they are. */}
        <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />

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

        {(commPanelOpen || diffPanelOpen || termPanelOpen) && screen === "project" && <RightDock />}
      </div>

      <SettingsDialog />
      <SearchPalette />
      <ShortcutsDialog />
    </div>
  );
}
