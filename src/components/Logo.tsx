import { useId } from "react";

/** Head, eyes and smile of the ainess mark. Same geometry as app-icon.svg and public/logo.svg. */
const HEAD = "M256 8c184 0 248 64 248 248s-64 248-248 248S8 440 8 256 72 8 256 8Z";
const SMILE = "M182 348q74 86 148 0q-74 34-148 0Z";
/** Eyes as a single path so the mono variant can punch them out with `evenodd`. */
const EYES =
  "M174 176a34 34 0 0 0-34 34v60a34 34 0 0 0 68 0v-60a34 34 0 0 0-34-34Z" +
  "M338 176a34 34 0 0 0-34 34v60a34 34 0 0 0 68 0v-60a34 34 0 0 0-34-34Z";

interface LogoProps {
  /** Rendered width and height in px. */
  size?: number;
  className?: string;
  /**
   * `color`: violet head with white face, the one on the app icon.
   * `mono`: single silhouette in `currentColor`, with the face punched out.
   */
  variant?: "color" | "mono";
}

/** The app mark: a little face. Used in the title bar, Acerca de and the remote header. */
export function Logo({ size = 20, className, variant = "color" }: LogoProps) {
  // Two logos on the same screen must not share gradient ids.
  const id = useId();

  if (variant === "mono") {
    return (
      <svg width={size} height={size} viewBox="0 0 512 512" className={className} aria-hidden="true">
        <path fill="currentColor" fillRule="evenodd" d={`${HEAD} ${EYES} ${SMILE}`} />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-face`} x1="64" y1="32" x2="448" y2="480" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A855F7" />
          <stop offset="0.55" stopColor="#6366F1" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="96" y1="48" x2="288" y2="288" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.26" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id}-face)`} d={HEAD} />
      <path fill={`url(#${id}-shine)`} d={HEAD} />
      <g fill="#FFFFFF">
        <path d={EYES} />
        <path d={SMILE} />
      </g>
    </svg>
  );
}
