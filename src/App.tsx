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
import { HomeScreen } from "@/components/shell/HomeScreen";
import { ProjectScreen } from "@/components/shell/ProjectScreen";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { RightDock } from "@/components/shell/RightDock";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { getTransport } from "@/lib/transport";
import { ensureNgrokUpToDate } from "@/lib/ngrok-account";

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

  // Ctrl+, opens Configuración, Ctrl+K the search palette, Ctrl+B toggles the sidebar
  // and Ctrl+` the terminals dock.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // `code` covers layouts where the backtick is a dead key and never reaches `key`.
      if (key === "`" || e.code === "Backquote") {
        e.preventDefault();
        const state = useAppStore.getState();
        state.toggleTermPanel();
        // Opening an empty dock straight into its empty state helps nobody.
        if (!state.termPanelOpen && useAppStore.getState().terminals.length === 0) {
          useAppStore.getState().openTerminal();
        }
      } else if (key === ",") {
        e.preventDefault();
        useAppStore.getState().openSettings();
      } else if (key === "k") {
        e.preventDefault();
        useAppStore.getState().toggleSearch();
      } else if (key === "b") {
        e.preventDefault();
        useAppStore.getState().toggleSidebar();
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
    </div>
  );
}
