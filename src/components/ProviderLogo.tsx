import { siClaude, siGithubcopilot, siGooglegemini, siOllama, siOpencode } from "simple-icons";
import { Bot, Terminal } from "lucide-react";
import type { ProviderId } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Brand mark per provider (simple-icons paths), so an agent is recognizable at a glance.
 * Providers without a well-known mark fall back to a generic icon.
 */
const MARKS: Partial<Record<ProviderId, { path: string; hex: string }>> = {
  claude: { path: siClaude.path, hex: siClaude.hex },
  antigravity: { path: siGooglegemini.path, hex: siGooglegemini.hex },
  gemini: { path: siGooglegemini.path, hex: siGooglegemini.hex },
  copilot: { path: siGithubcopilot.path, hex: "8b5cf6" },
  ollama: { path: siOllama.path, hex: "9ca3af" },
  opencode: { path: siOpencode.path, hex: "9ca3af" },
};

interface Props {
  provider: ProviderId;
  /** Pixel size of the mark. */
  size?: number;
  /** Paint the brand colour; otherwise inherit `currentColor`. */
  colored?: boolean;
  className?: string;
  title?: string;
}

export function ProviderLogo({ provider, size = 16, colored = true, className, title }: Props) {
  const mark = MARKS[provider];
  if (!mark) {
    const Icon = provider === "custom" ? Terminal : Bot;
    return <Icon className={cn("shrink-0", className)} style={{ width: size, height: size }} aria-label={title} />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? provider}
      className={cn("shrink-0", className)}
      style={{ fill: colored ? `#${mark.hex}` : "currentColor" }}
    >
      {title && <title>{title}</title>}
      <path d={mark.path} />
    </svg>
  );
}

/** Round avatar: the provider's mark on a soft disc of the agent's colour. */
export function AgentAvatar({ provider, color, size = 28, className }: { provider: ProviderId; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full shrink-0", className)}
      style={{ width: size, height: size, background: `color-mix(in oklch, ${color || "#888"} 22%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color || "#888"} 45%, transparent)` }}
    >
      <ProviderLogo provider={provider} size={Math.round(size * 0.55)} />
    </span>
  );
}
