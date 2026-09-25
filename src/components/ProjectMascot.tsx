import { useId } from "react";
import { ProviderLogo } from "@/components/ProviderLogo";
import { mascotHash, mascotTraits, type MascotMood } from "@/lib/mascot";
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
  /**
   * What the agent behind it is doing, from `lib/mascot.ts#mascotMood`. Without one the creature
   * is decoration: it floats and blinks and nothing more.
   */
  mood?: MascotMood;
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
export function ProjectMascot({ projectId, projectName, color, provider, mood, size = 128, className }: Props) {
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
  // Out of tokens is the one mood that is not movement: the colour drains out of the whole
  // creature, props included, which is what tells it apart from sleeping at the size this is drawn.
  const drift = {
    animationDelay: `${hash % 1200}ms`,
    ...(mood === "quota" ? { filter: "grayscale(0.85)", opacity: 0.68 } : null),
  };
  const blinkDelay = { animationDelay: `${hash % 3100}ms`, transformOrigin: "center", transformBox: "fill-box" as const };
  // The whole creature leans into the swing while working and sags while it has no tokens left;
  // the rest only add props, so the body keeps floating as it always did.
  const bodyAnim = mood === "working" ? "animate-mascot-work"
    : mood === "quota" ? "animate-mascot-deflate"
    : mood === "error" ? "animate-mascot-shiver"
    : undefined;
  const bodyStyle = {
    animationDelay: `${hash % 700}ms`,
    // Both of those turn on the feet rather than the middle: a creature that rotates around its
    // navel reads as a sticker being spun.
    transformOrigin: "50% 100%",
    transformBox: "fill-box" as const,
  };

  return (
    <div data-testid="mascot" className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
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
          {mood === "waiting" && <Feet base={base} />}
          <g className={bodyAnim} style={bodyStyle}>
            <Crown variant={crown} fill={fill} stroke={base} />
            <Body variant={body} fill={fill} />
            {/* Asleep the eyes stay shut and broken they are crossed out, so in neither case is
                there anything left to blink. */}
            {mood === "idle" ? (
              <ClosedEyes pupil={pupil} />
            ) : mood === "error" ? (
              <CrossedEyes pupil={pupil} />
            ) : (
              <g className="animate-mascot-blink" style={blinkDelay}>
                {/* Watching what is being typed means watching the box, and the box is below. */}
                <Eyes variant={eyes} sclera={sclera} pupil={pupil} drop={mood === "typing" ? 3 : 0} />
              </g>
            )}
          </g>
          {mood === "working" && <Hammer base={base} light={light} />}
          {mood === "waiting" && <Clock base={base} light={light} />}
          {mood === "idle" && <Snores base={base} delay={hash % 900} />}
          {mood === "quota" && <EmptyCoin base={base} />}
          {mood === "error" && <Alarm base={base} light={light} />}
          {mood === "typing" && <Binoculars shade={shade} light={light} />}
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

/**
 * The four faces. `drop` lowers the pupils inside eyes that stay where they are, which is how a
 * mood aims the gaze: at 0 the creature looks straight out, at 3 it is looking down at the box.
 * The whites, the visor and the wink do not move — an eye that slides down its own socket reads as
 * the face melting rather than as a glance.
 */
function Eyes({ variant, sclera, pupil, drop = 0 }: { variant: 0 | 1 | 2 | 3; sclera: string; pupil: string; drop?: number }) {
  if (variant === 0) {
    return (
      <g>
        <circle cx="39" cy="58" r="9" style={{ fill: sclera }} />
        <circle cx="61" cy="58" r="9" style={{ fill: sclera }} />
        <circle cx="40" cy={59 + drop} r="4.4" style={{ fill: pupil }} />
        <circle cx="62" cy={59 + drop} r="4.4" style={{ fill: pupil }} />
        <circle cx="37.5" cy={55.5 + drop} r="1.8" style={{ fill: "white" }} />
        <circle cx="59.5" cy={55.5 + drop} r="1.8" style={{ fill: "white" }} />
      </g>
    );
  }
  if (variant === 1) {
    return (
      <g>
        <rect x="29" y="48" width="42" height="22" rx="11" style={{ fill: pupil }} />
        {/* The visor has no pupils to lower, so the light inside it is what moves. */}
        <path d={`M41 ${60 + drop} Q50 ${67 + drop} 59 ${60 + drop}`} fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: sclera }} />
      </g>
    );
  }
  if (variant === 2) {
    return (
      <g>
        <circle cx="39" cy="58" r="8" style={{ fill: sclera }} />
        <circle cx="40" cy={59 + drop} r="4" style={{ fill: pupil }} />
        <circle cx="37.7" cy={55.7 + drop} r="1.6" style={{ fill: "white" }} />
        <path d="M54 60 Q61 52 68 60" fill="none" strokeWidth="3.4" strokeLinecap="round" style={{ stroke: pupil }} />
      </g>
    );
  }
  return (
    <g>
      <circle cx="38" cy="56" r="10" style={{ fill: sclera }} />
      <circle cx="62" cy="60" r="6" style={{ fill: sclera }} />
      <circle cx="39" cy={57 + drop} r="5" style={{ fill: pupil }} />
      <circle cx="63" cy={61 + drop * 0.6} r="3" style={{ fill: pupil }} />
      <circle cx="36" cy={53 + drop} r="1.9" style={{ fill: "white" }} />
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

/**
 * Working: a hammer that swings from the handle and lands on nothing in particular.
 *
 * Every prop a mood adds is drawn outside the body, straight over the conversation, so it is in the
 * project colour and not in the near-black the face is drawn in: that one disappears against a dark
 * thread, which is where the hammer went the first time.
 */
function Hammer({ base, light }: { base: string; light: string }) {
  return (
    <g className="animate-mascot-hammer" style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}>
      <rect x="83" y="50" width="4" height="30" rx="2" style={{ fill: light }} />
      <rect x="74" y="42" width="19" height="11" rx="3" style={{ fill: base }} />
    </g>
  );
}

/** Waiting: a look at the clock every few seconds, over a foot that never stops. */
function Clock({ base, light }: { base: string; light: string }) {
  return (
    <g className="animate-mascot-clock">
      <circle cx="84" cy="70" r="9" style={{ fill: light, stroke: base, strokeWidth: 2.6 }} />
      <path d="M84 70 L84 64 M84 70 L88 72" fill="none" strokeWidth="2.2" strokeLinecap="round" style={{ stroke: base }} />
    </g>
  );
}

function Feet({ base }: { base: string }) {
  return (
    <g style={{ fill: base }}>
      <ellipse cx="38" cy="94" rx="7" ry="3" />
      <ellipse className="animate-mascot-tap" cx="62" cy="94" rx="7" ry="3" />
    </g>
  );
}

/** Asleep: two shut lids, drawn where the eyes would have been. */
function ClosedEyes({ pupil }: { pupil: string }) {
  return (
    <g fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: pupil }}>
      <path d="M32 58 Q39 64 46 58" />
      <path d="M54 58 Q61 64 68 58" />
    </g>
  );
}

/** Broken: two eyes crossed out, the one face nobody reads as asleep or as looking at anything. */
function CrossedEyes({ pupil }: { pupil: string }) {
  return (
    <g fill="none" strokeWidth="3.2" strokeLinecap="round" style={{ stroke: pupil }}>
      <path d="M34 53 L45 64 M45 53 L34 64" />
      <path d="M55 53 L66 64 M66 53 L55 64" />
    </g>
  );
}

/** Broken: the warning sign beside it, so the mood reads even in a frame with no movement. */
function Alarm({ base, light }: { base: string; light: string }) {
  return (
    <g>
      <path d="M82 58 L93 78 L71 78 Z" strokeWidth="2.6" strokeLinejoin="round" style={{ fill: light, stroke: base }} />
      <path d="M82 65 L82 71" fill="none" strokeWidth="2.8" strokeLinecap="round" style={{ stroke: base }} />
      <circle cx="82" cy="74.6" r="1.6" style={{ fill: base }} />
    </g>
  );
}

/**
 * Typing: binoculars held up to the face and aimed at the box below, scanning slowly across.
 *
 * In `light`, not in the project colour like the props that hang off to the side: these are drawn
 * over the creature itself, and the base tone against a body painted in it is no prop at all. The
 * pale tube also holds up over a visor, which is the one face already drawn in near-black.
 */
function Binoculars({ shade, light }: { shade: string; light: string }) {
  return (
    <g
      data-testid="mascot-binoculars"
      className="animate-mascot-peek"
      style={{ transformOrigin: "50% 15%", transformBox: "fill-box" }}
    >
      {/* Two tubes and the bridge between them, held just under the eyes and pointing down: low
          enough that the lowered pupils stay above the rim, so the glance down into them is still
          part of the picture rather than something hidden behind it. */}
      <g strokeWidth="1.8" strokeLinejoin="round" style={{ fill: light, stroke: shade }}>
        <rect x="30.5" y="65" width="14" height="18" rx="7" />
        <rect x="55.5" y="65" width="14" height="18" rx="7" />
        <rect x="43.5" y="69" width="13" height="5" rx="2.5" />
      </g>
      {/* The far end of each tube: the glass, seen at the angle it is being held. */}
      <g style={{ fill: shade }}>
        <ellipse cx="37.5" cy="81.5" rx="5.2" ry="2.4" />
        <ellipse cx="62.5" cy="81.5" rx="5.2" ry="2.4" />
      </g>
    </g>
  );
}

/** Three z's on their way up and out. The delays are what keeps them from leaving as one block. */
function Snores({ base, delay }: { base: string; delay: number }) {
  return (
    <g fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: base }}>
      {[0, 1, 2].map(i => (
        <g key={i} transform={`translate(${68 + i * 3} ${34 - i * 7}) scale(${1 - i * 0.18})`}>
          <path
            className="animate-mascot-sleep"
            style={{ animationDelay: `${delay + i * 900}ms`, transformOrigin: "center", transformBox: "fill-box" }}
            d="M0 0 H8 L0 8 H8"
          />
        </g>
      ))}
    </g>
  );
}

/** Out of tokens: a coin with nothing on it, turning over next to a creature that has deflated. */
function EmptyCoin({ base }: { base: string }) {
  return (
    <circle
      className="animate-mascot-coin"
      cx="82"
      cy="72"
      r="8"
      fill="none"
      strokeWidth="3"
      strokeDasharray="4 3"
      style={{ stroke: base, transformOrigin: "center", transformBox: "fill-box" }}
    />
  );
}
