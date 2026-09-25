// Whether a screen arriving should animate, and the class that animates it. Pure and DOM-free: the
// hook in `hooks/use-screen-in.ts` is the part that touches an element, and this is the part worth
// pinning down in a test.

/** The utility in `index.css` that fades a body up from 8px below. */
export const SCREEN_IN_CLASS = "animate-screen-in";

/**
 * Two things have to agree before anything moves: the setting in Appearance, and the system.
 *
 * `prefers-reduced-motion: reduce` is not a preference to weigh against the app's own — somebody
 * who asked their machine for less movement asked every app on it, and an app that animates anyway
 * because its own switch is on is the one they set it for. So the system's answer is a veto, not a
 * vote, and the setting only decides among people who never said anything either way.
 *
 * `undefined` is the default and the default is on: animations are the app as shipped, and the
 * config file of somebody who upgraded says nothing about them.
 */
export function shouldAnimateScreen(setting: boolean | undefined, reducedMotion: boolean): boolean {
  return (setting ?? true) && !reducedMotion;
}
