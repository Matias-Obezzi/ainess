// The initials and the readable text colour behind `ProjectAvatar`. Pure on purpose: a project is
// named by whoever made the folder — `desde-abajo`, `miProyecto`, `日本語`, an emoji — and the two
// letters drawn in a 20px circle must never come out empty or half a surrogate pair.
import { cssColorToHex } from "@/lib/color";

/** The colour a project without one is drawn in, the same one `ProjectMascot` falls back to. */
export const PROJECT_COLOR_FALLBACK = "#4f8cff";

/** What separates words in a project name: spaces and every path-ish character a folder holds. */
const SEPARATORS = /[\s\-_./\\:|@+]+/;

/** A name with nothing usable in it still has to draw something. */
const NO_NAME = "?";

/** The first character of `word`, uppercased, counted in code points so an emoji stays whole. */
function firstChar(word: string): string {
  return Array.from(word.toUpperCase())[0] ?? "";
}

/**
 * The first letter of each of the first two words, uppercased: `desde-abajo` → `DA`,
 * `hola mundo` → `HM`. A single word gives its first two characters: `ainess` → `AI`.
 */
export function projectInitials(name: string): string {
  const words = String(name ?? "")
    // A camelCase or PascalCase run is two words to a reader: `miProyecto` → `mi Proyecto`.
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")
    .split(SEPARATORS)
    .filter(Boolean);
  if (words.length === 0) return NO_NAME;
  if (words.length === 1) return Array.from(words[0].toUpperCase()).slice(0, 2).join("") || NO_NAME;
  return firstChar(words[0]) + firstChar(words[1]) || NO_NAME;
}

/** WCAG relative luminance of a `#rrggbb`, on the linearized channels. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/**
 * Black or white, whichever has more contrast on `color` — so a yellow project reads black and a
 * navy one reads white instead of both being guessed at.
 *
 * The contrast ratio against white is `1.05 / (l + 0.05)` and against black `(l + 0.05) / 0.05`;
 * black wins when `(l + 0.05)² > 0.0525`, which is the comparison below with no square roots.
 */
export function readableTextColor(color: string): "#000000" | "#ffffff" {
  const l = luminance(cssColorToHex(color, PROJECT_COLOR_FALLBACK));
  return (l + 0.05) * (l + 0.05) > 0.05 * 1.05 ? "#000000" : "#ffffff";
}
