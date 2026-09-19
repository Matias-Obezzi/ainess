import { projectInitials, readableTextColor, PROJECT_COLOR_FALLBACK } from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface Props {
  /** The project's name; only its initials are drawn. */
  name: string;
  /** The project's colour. Without one, the same blue every other project default uses. */
  color?: string;
  size?: number;
  className?: string;
  /** Native tooltip, for the places where the avatar carries something the row does not say. */
  title?: string;
}

/**
 * A project as a coloured circle with its initials. Round like `AgentAvatar`, so a row that has
 * both reads as one family; the letters are black or white by contrast, never by guess.
 */
export function ProjectAvatar({ name, color, size = 20, className, title }: Props) {
  const background = color || PROJECT_COLOR_FALLBACK;
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full shrink-0 font-semibold leading-none select-none", className)}
      style={{ width: size, height: size, background, color: readableTextColor(background), fontSize: Math.round(size * 0.42) }}
      title={title}
      // The name is always beside it (the sidebar row) or on the button that holds it (the rail).
      aria-hidden
    >
      {projectInitials(name)}
    </span>
  );
}
