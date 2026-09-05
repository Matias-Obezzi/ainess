import { useCallback, useRef } from "react";
import { useAppStore, MIN_DOCK_SPLIT, MAX_DOCK_SPLIT } from "@/store";
import { CommDockSection } from "./CommDockSection";
import { TerminalDockSection } from "./TerminalDockSection";

/**
 * Right dock: Comunicación on top, Terminales below. With only one section open it
 * takes the whole height; with both, a draggable divider splits it (`dockSplit`).
 */
export function RightDock() {
  const commPanelOpen = useAppStore(state => state.commPanelOpen);
  const termPanelOpen = useAppStore(state => state.termPanelOpen);
  const dockSplit = useAppStore(state => state.dockSplit);
  const setDockSplit = useAppStore(state => state.setDockSplit);
  const columnRef = useRef<HTMLDivElement | null>(null);

  const onDividerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const column = columnRef.current;
    if (!column) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const rect = column.getBoundingClientRect();
      if (rect.height <= 0) return;
      const fraction = (ev.clientY - rect.top) / rect.height;
      setDockSplit(Math.min(MAX_DOCK_SPLIT, Math.max(MIN_DOCK_SPLIT, fraction)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [setDockSplit]);

  const both = commPanelOpen && termPanelOpen;

  return (
    // Under ~1100px it floats over the thread instead of squeezing it.
    <aside className="w-[380px] shrink-0 border-l border-border bg-card flex flex-col max-[1100px]:absolute max-[1100px]:right-0 max-[1100px]:top-0 max-[1100px]:bottom-0 max-[1100px]:z-20 max-[1100px]:shadow-xl">
      {both ? (
        <div ref={columnRef} className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 overflow-hidden" style={{ flex: `${dockSplit} 1 0%` }}>
            <CommDockSection />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            title="Arrastrá para repartir el alto"
            onPointerDown={onDividerDown}
            className="h-1.5 shrink-0 cursor-row-resize bg-border hover:bg-accent"
          />
          <div className="min-h-0 overflow-hidden" style={{ flex: `${1 - dockSplit} 1 0%` }}>
            <TerminalDockSection />
          </div>
        </div>
      ) : commPanelOpen ? (
        <CommDockSection />
      ) : (
        <TerminalDockSection />
      )}
    </aside>
  );
}
