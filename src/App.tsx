import { useEffect } from "react";
import { useAppStore } from "@/store";
import { useActivityIsland } from "@/hooks/useActivityIsland";
import { useNotifications } from "@/hooks/useNotifications";
import { useSystemNotifications } from "@/hooks/useSystemNotifications";
import { Island } from "@/components/ui/island";
import { Toaster } from "@/components/ui/toast";
import { ApprovalsPanel } from "@/components/ApprovalsPanel";
import { Sidebar } from "@/components/shell/Sidebar";
import { HomeScreen } from "@/components/shell/HomeScreen";
import { ProjectScreen } from "@/components/shell/ProjectScreen";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { CommSidePanel } from "@/components/shell/CommSidePanel";

export default function App() {
  const init = useAppStore(state => state.init);
  const loaded = useAppStore(state => state.loaded);
  const screen = useAppStore(state => state.screen);
  const commPanelOpen = useAppStore(state => state.commPanelOpen);

  useEffect(() => {
    void init();
  }, [init]);

  useActivityIsland();
  useNotifications();
  useSystemNotifications();

  // Ctrl+, opens Configuración, same shortcut as most desktop apps.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        useAppStore.getState().openSettings();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!loaded) return null;

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden relative">
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

      {commPanelOpen && screen === "project" && <CommSidePanel />}
      <SettingsDialog />
    </div>
  );
}
