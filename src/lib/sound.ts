// The sound a notification makes.
//
// Synthesised by default, not a file: two sine notes through the Web Audio API are a handful of
// lines, they weigh nothing in the installer and they play the same in the app, in the browser
// preview and on the phone. An asset would need a format every one of those accepts, and a licence.
//
// Two of them, because the two pieces of news are not the same: something needs you (a rising pair,
// which asks) and something finished (the same pair falling, which reports). The notes, the wave
// and the volume are settings, and a sound of your own replaces the lot (see SoundDialog).
import type { NotificationKind, SoundSettings } from "@/types";

/** Which notifications ask for you rather than tell you something. */
const ASKS_FOR_YOU: NotificationKind[] = ["approval", "question", "task-failed", "interrupted"];

export type Chime = "attention" | "done";

export function chimeFor(kind: NotificationKind): Chime {
  return ASKS_FOR_YOU.includes(kind) ? "attention" : "done";
}

/** What the app sounds like out of the box: a fifth, low enough not to pierce. */
export const DEFAULT_SOUND: Required<Pick<SoundSettings, "notes" | "wave" | "volume">> = {
  notes: [660, 880],
  wave: "sine",
  volume: 0.25,
};

/** Nothing outside this is a note anybody wants to hear at three in the morning. */
export const MIN_HZ = 100;
export const MAX_HZ = 2000;

/** A file of your own travels inside the config as a data URL, so it has to stay small. */
export const MAX_SOUND_BYTES = 512 * 1024;
export const MAX_SOUND_LABEL = "512 KB";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** The two notes of one chime: the "done" one is the same pair the other way round. */
export function notesFor(chime: Chime, settings?: SoundSettings): [number, number] {
  const [first, second] = settings?.notes ?? DEFAULT_SOUND.notes;
  const pair: [number, number] = [clamp(first, MIN_HZ, MAX_HZ), clamp(second, MIN_HZ, MAX_HZ)];
  return chime === "attention" ? pair : [pair[1], pair[0]];
}

export function volumeOf(settings?: SoundSettings): number {
  return clamp(settings?.volume ?? DEFAULT_SOUND.volume, 0, 1);
}

/** Off only when it was turned off: a config that never heard of this makes noise. */
export function soundEnabled(settings?: SoundSettings): boolean {
  return settings?.enabled !== false;
}

let context: AudioContext | null = null;

/** The one context, made on the first sound: making it before a gesture leaves it suspended. */
function audio(): AudioContext | null {
  if (context) return context;
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

/**
 * Plays one. Never throws and never blocks: a machine with no sound, a browser that has not been
 * touched yet, a webview that refuses — all of them are silence, not an error.
 */
export function playChime(chime: Chime, settings?: SoundSettings): void {
  // A sound of your own says everything; the notes are the app's own voice.
  if (settings?.file) {
    try {
      const player = new Audio(settings.file);
      player.volume = volumeOf(settings);
      void player.play().catch(() => {});
    } catch {
      /* an unreadable data URL is silence */
    }
    return;
  }

  const ctx = audio();
  if (!ctx) return;
  try {
    // A window that was hidden comes back suspended.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});

    const volume = volumeOf(settings);
    const wave = settings?.wave ?? DEFAULT_SOUND.wave;
    const start = ctx.currentTime;
    for (const [i, frequency] of notesFor(chime, settings).entries()) {
      const at = start + i * 0.12;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      // A ramp at both ends: a square-edged note clicks.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.2);
    }
  } catch {
    // Sound is a courtesy, never a step of anything.
  }
}
