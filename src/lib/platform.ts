// Which build is running. The same components render in the desktop app and in the page the phone
// loads (see src/remote/), and a couple of things have to differ between the two: a confirmation
// is a dialog on a desktop and the island on a phone, where a modal in the middle of the screen is
// the wrong shape for a thumb.
//
// It is a flag set by the entry point rather than something sniffed at runtime: the desktop UI also
// runs in a plain browser during development, and that preview should behave like the app it is.
let remoteBuild = false;

/** Called once by the phone page's entry point (src/remote/main.tsx). */
export function markRemoteBuild(): void {
  remoteBuild = true;
}

/** True only in the page served to the phone. */
export function isRemoteBuild(): boolean {
  return remoteBuild;
}
