import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Preset } from "@/types";

interface Props {
  presets: Preset[];
  onPick(preset: Preset): void;
  className?: string;
}

/** How far one press of an arrow moves the strip. */
const STEP = 160;

/**
 * The saved orders as a single scrollable row above the input, so they are one click away instead
 * of hidden behind a select. Only the ones that apply to the current target get here (see the
 * caller). When the row overflows, both ends fade out and an arrow appears on the side that has
 * more to show.
 */
export function PresetStrip({ presets, onPick, className }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    // A fractional scroll width is normal at odd zoom levels: a pixel of slack avoids a flickering
    // arrow on a row that is not really scrollable.
    const max = el.scrollWidth - el.clientWidth;
    setOverflow({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, presets.length]);

  if (presets.length === 0) return null;

  /**
   * Instant on purpose: `scroll-behavior: smooth` does not animate in the WebView the app runs in,
   * where an animated scroll is simply dropped and the arrows end up doing nothing. That same
   * WebView does not always emit `scroll` for a programmatic move either, so every scroll from
   * here re-measures instead of waiting for the event.
   */
  const scrollBy = (delta: number) => {
    trackRef.current?.scrollBy({ left: delta, behavior: "auto" });
    // Synchronous on purpose: an instant scroll has already landed, and a frame callback would
    // never run in a window that is not painting.
    measure();
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={trackRef}
        onScroll={measure}
        // A vertical wheel over the row scrolls it sideways, which is what the hand expects here.
        onWheel={e => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) scrollBy(e.deltaY);
        }}
        className="flex gap-1.5 overflow-x-auto scrollbar-none"
      >
        {presets.map(preset => (
          <Tooltip key={preset.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onPick(preset)}
                className="shrink-0 max-w-[180px] truncate rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {preset.name}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm whitespace-pre-wrap">{preset.prompt}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {overflow.left && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-background/80 shadow-sm"
            aria-label="Ver las órdenes anteriores"
            onClick={() => scrollBy(-STEP)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {overflow.right && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-background/80 shadow-sm"
            aria-label="Ver las órdenes siguientes"
            onClick={() => scrollBy(STEP)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
