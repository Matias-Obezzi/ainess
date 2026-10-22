import { describe, it, expect } from "vitest";
import { escapeShouldStop, ESCAPE_TWICE_WINDOW_MS } from "@/lib/escape-stop";

describe("what Escape does while an agent is working", () => {
  it("stops on the first press when the setting is missing or 'always'", () => {
    expect(escapeShouldStop(undefined, null, 1000)).toEqual({ stop: true, armedAt: null });
    expect(escapeShouldStop("always", null, 1000)).toEqual({ stop: true, armedAt: null });
  });

  it("never stops on 'never', however often it is pressed", () => {
    expect(escapeShouldStop("never", null, 1000)).toEqual({ stop: false, armedAt: null });
    expect(escapeShouldStop("never", 900, 1000)).toEqual({ stop: false, armedAt: null });
  });

  it("on 'twice', arms on the first press and stops on a second one in time", () => {
    const first = escapeShouldStop("twice", null, 1000);
    expect(first).toEqual({ stop: false, armedAt: 1000 });
    expect(escapeShouldStop("twice", first.armedAt, 1000 + ESCAPE_TWICE_WINDOW_MS)).toEqual({ stop: true, armedAt: null });
  });

  it("on 'twice', a second press too late only arms again", () => {
    const late = 1000 + ESCAPE_TWICE_WINDOW_MS + 1;
    expect(escapeShouldStop("twice", 1000, late)).toEqual({ stop: false, armedAt: late });
  });
});
