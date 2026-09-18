import { useId } from "react";
import { ProviderLogo } from "@/components/ProviderLogo";
import { mascotHash, mascotTraits } from "@/lib/mascot";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";
import type { ProviderId } from "@/types";

interface Props {
  /** The seed. See `lib/mascot.ts` for why the name is not part of it. */
  projectId: string;
  /** Only for the label a screen reader reads out. */
  projectName: string;
  /** The project's colour. Without one the mascot falls back to the hue in its traits. */
  color?: string;
  /** The planner's provider, drawn as a small badge on the corner. */
  provider?: ProviderId;
  size?: number;
  className?: string;
}

/**
 * The project's own creature, drawn inline so it costs no request and no asset: the traits come out
 * of the project id, so the face is stable per project and different between projects.
 *
 * It breathes and blinks through CSS alone (see `.animate-mascot-float` / `.animate-mascot-blink`
 * in `index.css`); nothing here runs per frame.
 */
export function ProjectMascot({ projectId, projectName, color, provider, size = 128, className }: Props) {
  const t = useT();
  const { body, eyes, crown, hue } = mascotTraits(projectId);
  const hash = mascotHash(projectId);
  // useId() comes back with colons, which are legal in an id but awkward inside url(#…).
  const gradId = `mascot-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const base = color ?? `hsl(${hue} 70% 58%)`;
  const light = `color-mix(in oklab, ${base} 55%, white)`;
  const shade = `color-mix(in oklab, ${base} 70%, black)`;
  const sclera = `color-mix(in oklab, white 90%, ${base})`;
  const pupil = `color-mix(in oklab, black 72%, ${base})`;
  const fill = `url(#${gradId})`;

  // Two mascots on the same screen must not breathe in step, or the pair reads as one animation.
  const drift = { animationDelay: `${hash % 1200}ms` };
  const blinkDelay = { animationDelay: `${hash % 3100}ms`, transformOrigin: "center", transformBox: "fill-box" as const };

  return (
    <div className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={t("mascot.alt", { name: projectName })}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={light} />
            <stop offset="100%" stopColor={base} />
          </linearGradient>
        </defs>
        {/* The ground stays put while the creature floats above it. */}
        <ellipse cx="50" cy="95" rx="22" ry="3.5" style={{ fill: `color-mix(in oklab, ${shade} 30%, transparent)` }} />
        <g className="animate-mascot-float" style={drift}>
          <Crown variant={crown} fill={fill} stroke={base} />
          <Body variant={body} fill={fill} />
          <g className="animate-mascot-blink" style={blinkDelay}>
            <Eyes variant={eyes} sclera={sclera} pupil={pupil} />
          </g>
        </g>
      </svg>
      {provider && (
        <span
          className="absolute bottom-0 right-0 flex items-center justify-center rounded-full bg-background p-1 shadow-sm ring-1 ring-border"
          aria-hidden
        >
          <ProviderLogo provider={provider} size={Math.max(12, Math.round(size * 0.16))} />
        </span>
      )}
    </div>
  );
}

function Body({ variant, fill }: { variant: 0 | 1 | 2 | 3; fill: string }) {
  if (variant === 0) return <rect x="24" y="32" width="52" height="58" rx="26" style={{ fill }} />;
  if (variant === 1) return <rect x="21" y="34" width="58" height="56" rx="20" style={{ fill }} />;
  if (variant === 2) return <path d="M50 30 C69 30 80 46 80 64 C80 80 67 90 50 90 C33 90 20 80 20 64 C20 46 31 30 50 30 Z" style={{ fill }} />;
  // The hexagon gets its rounded corners from a thick stroke of its own colour, which is cheaper
  // than writing six arcs by hand and reads the same at this size.
  return <path d="M50 34 L74 47 L74 75 L50 88 L26 75 L26 47 Z" strokeWidth="9" strokeLinejoin="round" style={{ fill, stroke: fill }} />;
}

function Eyes({ variant, sclera, pupil }: { variant: 0 | 1 | 2 | 3; sclera: string; pupil: string }) {
  if (variant === 0) {
    return (
      <g>
        <circle cx="39" cy="58" r="9" style={{ fill: sclera }} />
        <circle cx="61" cy="58" r="9" style={{ fill: sclera }} />
        <circle cx="40" cy="59" r="4.4" style={{ fill: pupil }} />
        <circle cx="62" cy="59" r="4.4" style={{ fill: pupil }} />
        <circle cx="37.5" cy="55.5" r="1.8" style={{ fill: "white" }} />
        <circle cx="59.5" cy="55.5" r="1.8" style={{ fill: "white" }} />
      </g>
    );
  }
  if (variant === 1) {
    return (
      <g>
        <rect x="29" y="48" width="42" height="22" rx="11" style={{ fill: pupil }} />
        <path d="M41 60 Q50 67 59 60" fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: sclera }} />
      </g>
    );
  }
  if (variant === 2) {
    return (
      <g>
        <circle cx="39" cy="58" r="8" style={{ fill: sclera }} />
        <circle cx="40" cy="59" r="4" style={{ fill: pupil }} />
        <circle cx="37.7" cy="55.7" r="1.6" style={{ fill: "white" }} />
        <path d="M54 60 Q61 52 68 60" fill="none" strokeWidth="3.4" strokeLinecap="round" style={{ stroke: pupil }} />
      </g>
    );
  }
  return (
    <g>
      <circle cx="38" cy="56" r="10" style={{ fill: sclera }} />
      <circle cx="62" cy="60" r="6" style={{ fill: sclera }} />
      <circle cx="39" cy="57" r="5" style={{ fill: pupil }} />
      <circle cx="63" cy="61" r="3" style={{ fill: pupil }} />
      <circle cx="36" cy="53" r="1.9" style={{ fill: "white" }} />
    </g>
  );
}

function Crown({ variant, fill, stroke }: { variant: 0 | 1 | 2 | 3; fill: string; stroke: string }) {
  if (variant === 0) {
    return (
      <g>
        <path d="M50 34 L50 18" fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke }} />
        <circle cx="50" cy="14" r="5" style={{ fill }} />
      </g>
    );
  }
  if (variant === 1) {
    return (
      <g style={{ fill }}>
        <path d="M30 38 L33 15 L47 31 Z" />
        <path d="M70 38 L67 15 L53 31 Z" />
      </g>
    );
  }
  if (variant === 2) {
    return (
      <path
        d="M26 24 Q50 8 74 24"
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        style={{ stroke: `color-mix(in oklab, ${stroke} 65%, white)`, opacity: 0.85 }}
      />
    );
  }
  // A bare head is a variant too, not a missing one.
  return null;
}
