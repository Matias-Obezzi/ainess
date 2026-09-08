import React, { useCallback, useRef } from "react";
import { useAppStore } from "@/store";
import { CommDockSection } from "./CommDockSection";
import { DiffDockSection } from "./DiffDockSection";
import { TerminalDockSection } from "./TerminalDockSection";
import { useT } from "@/i18n/useT";
import type { DockSectionId } from "@/types";

/**
 * Right dock: Communication on top, Diff in the middle, Terminals below.
 * Shows only the open sections. Between consecutive open sections, a draggable
 * divider splits the flex weights (dockSizes).
 */
export function RightDock() {
  const t = useT();
  const commPanelOpen = useAppStore(state => state.commPanelOpen);
  const diffPanelOpen = useAppStore(state => state.diffPanelOpen);
  const termPanelOpen = useAppStore(state => state.termPanelOpen);
  const dockSizes = useAppStore(state => state.dockSizes);
  const setDockSizes = useAppStore(state => state.setDockSizes);
  
  const sectionsRef = useRef<Record<DockSectionId, HTMLDivElement | null>>({ comm: null, diff: null, term: null });

  const onDividerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, idA: DockSectionId, idB: DockSectionId) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const elA = sectionsRef.current[idA];
    const elB = sectionsRef.current[idB];
    if (!elA || !elB) return;

    // Math for dragging: when grabbing the divider between section A (top) and B (bottom),
    // save the rects of A and B. total = rectA.height + rectB.height and sum = dockSizes[A] + dockSizes[B].
    const rectA = elA.getBoundingClientRect();
    const rectB = elB.getBoundingClientRect();
    const total = rectA.height + rectB.height;
    const sum = dockSizes[idA] + dockSizes[idB];
    const MIN_SECTION_PX = 80;

    const move = (ev: PointerEvent) => {
      if (total <= 2 * MIN_SECTION_PX) return;
      
      const newAPx = Math.max(MIN_SECTION_PX, Math.min(ev.clientY - rectA.top, total - MIN_SECTION_PX));
      setDockSizes({
        [idA]: (newAPx / total) * sum,
        [idB]: sum - (newAPx / total) * sum,
      });
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
  }, [dockSizes, setDockSizes]);

  const sections: { id: DockSectionId; component: React.ReactNode; open: boolean }[] = [
    { id: "comm", component: <CommDockSection />, open: commPanelOpen },
    { id: "diff", component: <DiffDockSection />, open: diffPanelOpen },
    { id: "term", component: <TerminalDockSection />, open: termPanelOpen },
  ];
  
  const openSections = sections.filter(s => s.open);

  return (
    <aside className="w-[380px] shrink-0 border-l border-border bg-card flex flex-col max-[1100px]:absolute max-[1100px]:right-0 max-[1100px]:top-12 max-[1100px]:bottom-0 max-[1100px]:z-20 max-[1100px]:shadow-xl">
      {openSections.length === 1 ? (
        openSections[0].component
      ) : openSections.length > 1 ? (
        <div className="flex h-full min-h-0 flex-col">
          {openSections.map((s, idx) => (
            <React.Fragment key={s.id}>
              {idx > 0 && (
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  title={t("dock.dragToSplit")}
                  onPointerDown={e => onDividerDown(e, openSections[idx - 1].id, s.id)}
                  className="h-1.5 shrink-0 cursor-row-resize bg-border hover:bg-accent"
                />
              )}
              <div
                ref={el => { sectionsRef.current[s.id] = el; }}
                className="min-h-0 overflow-hidden flex flex-col"
                style={{ flex: `${dockSizes[s.id]} 1 0%` }}
              >
                {s.component}
              </div>
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
