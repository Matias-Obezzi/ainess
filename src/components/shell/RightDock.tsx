import React, { useCallback, useRef, useState } from "react";
import { useAppStore, PANE_MIN_WIDTH, PANE_MAX_WIDTH, selectPanelOpen, selectPreviewFile } from "@/store";
import { ResizeHandle } from "./ResizeHandle";
import { CommDockSection } from "./CommDockSection";
import { DiffDockSection } from "./DiffDockSection";
import { TerminalDockSection } from "./TerminalDockSection";
import { FileDockSection } from "./FileDockSection";
import { useCurrentProjectId } from "./project-pane";
import { useT } from "@/i18n/useT";
import type { DockSectionId } from "@/types";

/**
 * The most of its column a dock may take. Inside a pane an absolute width is not a width: the
 * same 600px is half of one column and all of the next. Below `PANE_MIN_WIDTH.dock` the share
 * loses — a dock too narrow to read is not a dock.
 */
const DOCK_MAX_SHARE = 0.6;

/**
 * Right dock: Communication on top, Diff in the middle, Terminals below.
 * Shows only the open sections. Between consecutive open sections, a draggable
 * divider splits the flex weights (dockSizes).
 *
 * One dock per project pane, drawn inside the pane that opened it. It reads the same per-project
 * flags the buttons in the pane's top bar read, so a button lit and a section drawn cannot drift
 * apart: they are the same boolean. Two projects side by side each keep their own dock open.
 */
export function RightDock() {
  const t = useT();
  const projectId = useCurrentProjectId();
  const commPanelOpen = useAppStore(state => selectPanelOpen(state, projectId, "comm"));
  const diffPanelOpen = useAppStore(state => selectPanelOpen(state, projectId, "diff"));
  const termPanelOpen = useAppStore(state => selectPanelOpen(state, projectId, "term"));
  const previewOpen = useAppStore(state => selectPreviewFile(state, projectId) !== null);
  const dockSizes = useAppStore(state => state.dockSizes);
  const savedWidth = useAppStore(state => state.paneWidths.dock);
  const setPaneWidth = useAppStore(state => state.setPaneWidth);
  const setDockSizes = useAppStore(state => state.setDockSizes);

  // The column this dock sits in, measured: it is what the width is a share of. Same callback-ref
  // observer `ProjectPanes` counts its columns with.
  const [rowWidth, setRowWidth] = useState(0);
  const attach = useCallback((el: HTMLElement | null) => {
    const row = el?.parentElement;
    if (!row) return;
    setRowWidth(row.clientWidth);
    const observer = new ResizeObserver(entries => setRowWidth(entries[0].contentRect.width));
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  
  const sectionsRef = useRef<Record<DockSectionId, HTMLDivElement | null>>({ comm: null, diff: null, term: null, file: null });

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
    { id: "file", component: <FileDockSection />, open: previewOpen },
  ];
  
  const openSections = sections.filter(s => s.open);
  if (openSections.length === 0) return null;

  // Dragged wide in one pane and then shown in a narrower one, the dock would eat the thread.
  const max = rowWidth > 0
    ? Math.max(PANE_MIN_WIDTH.dock, Math.min(PANE_MAX_WIDTH.dock, rowWidth * DOCK_MAX_SHARE))
    : PANE_MAX_WIDTH.dock;
  // The handle drags the clamped value, not the saved one, so it answers the moment you pull back.
  const width = Math.min(savedWidth, max);

  return (
    <>
    <ResizeHandle
      side="right"
      width={width}
      min={PANE_MIN_WIDTH.dock}
      max={max}
      onResize={w => setPaneWidth("dock", w)}
    />
    <aside
      ref={attach}
      data-testid="right-dock"
      data-project-id={projectId ?? undefined}
      className="shrink-0 border-l border-border bg-card flex flex-col"
      style={{ width }}
    >
      {openSections.length === 1 ? (
        openSections[0].component
      ) : (
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
      )}
    </aside>
    </>
  );
}
