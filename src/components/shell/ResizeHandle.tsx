import React, { useCallback } from "react";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * The vertical bar between a side pane and the content: drag it and the pane changes width.
 * `side` is the side of the window the pane sits on, which is what decides the sign of the drag.
 */
export function ResizeHandle({ side, width, min, max, onResize, onResizingChange, className }: {
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  onResize(width: number): void;
  onResizingChange?(resizing: boolean): void;
  className?: string;
}) {
  const t = useT();

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    onResizingChange?.(true);

    const move = (ev: PointerEvent) => {
      const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      onResize(Math.min(max, Math.max(min, startWidth + delta)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onResizingChange?.(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [side, width, min, max, onResize, onResizingChange]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={t("dock.dragToResize")}
      onPointerDown={onPointerDown}
      // Thin to the eye, wide to the pointer: the hit area sticks out on both sides.
      className={cn(
        "relative z-10 w-px shrink-0 cursor-col-resize bg-border hover:bg-accent",
        "after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-['']",
        className,
      )}
    />
  );
}
