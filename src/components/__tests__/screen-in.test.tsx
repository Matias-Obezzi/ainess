// The arrival animation, from the side that matters: which element carries it, and what it costs.
//
// What it must not cost is a remount. The obvious way to replay a CSS animation is a `key` that
// changes, and that throws away the scroll position and everything the children were holding — so
// the child here counts its own mounts, and the count staying at one is the whole point.
import { useEffect } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, resetStore } from "@/test/render";
import { useScreenIn } from "@/hooks/use-screen-in";
import { SCREEN_IN_CLASS } from "@/lib/screen-in";
import { useAppStore } from "@/store";

let mounts = 0;

/** Stands in for everything a thread is holding: it is mounted once and it says so. */
function Child() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <span data-testid="child" />;
}

/** A title bar that persists across screens, and a body that arrives with each one. */
function Harness({ where }: { where: string }) {
  const body = useScreenIn([where]);
  return (
    <div>
      <div data-testid="chrome">title bar</div>
      <div data-testid="body" ref={body}>
        <Child />
      </div>
    </div>
  );
}

/** Stops matching `(prefers-reduced-motion: reduce)` from being the "no" jsdom answers by default. */
function stubReducedMotion(reduce: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe("useScreenIn", () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    mounts = 0;
    resetStore();
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("animates the body and leaves the chrome alone", () => {
    render(<Harness where="home" />);
    expect(screen.getByTestId("body")).toHaveClass(SCREEN_IN_CLASS);
    expect(screen.getByTestId("chrome")).not.toHaveClass(SCREEN_IN_CLASS);
  });

  it("plays again on the next screen without remounting what is inside", () => {
    const { rerender } = render(<Harness where="home" />);
    const body = screen.getByTestId("body");
    const child = screen.getByTestId("child");
    expect(mounts).toBe(1);

    // The class comes off and goes back on, which is what restarts the animation. Watching the
    // attribute is the only way to see both halves: by the time the render is over it is on again.
    const observer = new MutationObserver(() => {});
    observer.observe(body, { attributes: true, attributeFilter: ["class"] });
    rerender(<Harness where="project" />);
    const changes = observer.takeRecords();
    observer.disconnect();

    expect(changes.length).toBe(2);
    expect(body).toHaveClass(SCREEN_IN_CLASS);
    // Same elements, same child, mounted once: nothing was thrown away to get the animation back.
    expect(screen.getByTestId("body")).toBe(body);
    expect(screen.getByTestId("child")).toBe(child);
    expect(mounts).toBe(1);
  });

  it("does nothing at all once the setting is off", () => {
    useAppStore.setState(state => ({ config: { ...state.config, screenAnimations: false } }));
    render(<Harness where="home" />);
    expect(screen.getByTestId("body")).not.toHaveClass(SCREEN_IN_CLASS);
  });

  it("does nothing at all when the system asked for less motion", () => {
    restore = stubReducedMotion(true);
    render(<Harness where="home" />);
    expect(screen.getByTestId("body")).not.toHaveClass(SCREEN_IN_CLASS);
  });

  it("forces the reflow between the two, or the browser collapses them into no change", () => {
    const reads: string[] = [];
    const spy = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      reads.push(this.dataset.testid ?? "");
      return 0;
    });
    render(<Harness where="home" />);
    spy.mockRestore();
    expect(reads).toContain("body");
  });
});
