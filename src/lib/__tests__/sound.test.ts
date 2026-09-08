// What a notification sounds like. The audio itself is the browser's; what is ours is which chime
// a piece of news gets, and that no setting can ask for something unplayable.
import { describe, it, expect } from "vitest";
import { chimeFor, notesFor, volumeOf, soundEnabled, DEFAULT_SOUND, MIN_HZ, MAX_HZ } from "@/lib/sound";
import { soundFileProblem } from "@/components/SoundDialog";

describe("which chime", () => {
  it("asks for you when something is waiting on you", () => {
    expect(chimeFor("approval")).toBe("attention");
    expect(chimeFor("question")).toBe("attention");
    expect(chimeFor("task-failed")).toBe("attention");
    expect(chimeFor("interrupted")).toBe("attention");
  });

  it("only reports for the rest", () => {
    expect(chimeFor("task-done")).toBe("done");
    expect(chimeFor("update")).toBe("done");
    expect(chimeFor("tunnel")).toBe("done");
    expect(chimeFor("info")).toBe("done");
  });
});

describe("the notes", () => {
  it("rise to ask and fall to report", () => {
    const asking = notesFor("attention");
    const telling = notesFor("done");
    expect(asking[0]).toBeLessThan(asking[1]);
    expect(telling).toEqual([asking[1], asking[0]]);
  });

  it("follows the setting", () => {
    expect(notesFor("attention", { notes: [300, 400] })).toEqual([300, 400]);
  });

  it("never leaves the range a person can stand", () => {
    expect(notesFor("attention", { notes: [1, 99999] })).toEqual([MIN_HZ, MAX_HZ]);
    expect(notesFor("attention", { notes: [NaN, NaN] })).toEqual([MIN_HZ, MIN_HZ]);
  });
});

describe("volume and the switch", () => {
  it("defaults to something soft and stays between 0 and 1", () => {
    expect(volumeOf()).toBe(DEFAULT_SOUND.volume);
    expect(volumeOf({ volume: 5 })).toBe(1);
    expect(volumeOf({ volume: -2 })).toBe(0);
  });

  it("is on for a config that never heard of it", () => {
    expect(soundEnabled()).toBe(true);
    expect(soundEnabled({})).toBe(true);
    expect(soundEnabled({ enabled: false })).toBe(false);
  });
});

describe("a sound of your own", () => {
  it("has to be audio, and small enough to live in the config", () => {
    expect(soundFileProblem({ type: "audio/mpeg", size: 1000 })).toBeNull();
    expect(soundFileProblem({ type: "image/png", size: 1000 })).toBe("type");
    expect(soundFileProblem({ type: "audio/wav", size: 5 * 1024 * 1024 })).toBe("size");
  });
});
