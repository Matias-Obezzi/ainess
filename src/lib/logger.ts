// File logging for the frontend and the CLI. Every line goes to the same daily file the
// Rust backend writes (`%LOCALAPPDATA%\com.matias.ais\logs\ainess-<fecha>.log`) through
// `Transport.logAppend`, and the last lines stay in memory for "Copiar diagnóstico".
//
// Rules: never throw, never block, never use `console` (installConsoleCapture wraps it and
// a call from here would recurse forever).
import { getTransport } from "@/lib/transport";
import type { LogLevel } from "@/types";

export type { LogLevel };

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_MESSAGE_LEN = 10 * 1024;
const BUFFER_SIZE = 500;

let minLevel: LogLevel = "info";
const buffer: string[] = [];

/** Minimum level actually written (config.logLevel). */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function getLogLevel(): LogLevel {
  return minLevel;
}

/** Last lines logged in this process, newest last. Used by the diagnostics button. */
export function getRecentLogs(limit = BUFFER_SIZE): string[] {
  return buffer.slice(Math.max(0, buffer.length - limit));
}

/** Replaces the value of `token=…`, `"token":"…"` and `Bearer …` with `***`. */
export function maskSecrets(text: string): string {
  return text
    .replace(/(token=)[^&\s"']+/gi, "$1***")
    .replace(/("token"\s*:\s*")[^"]*"/gi, '$1***"')
    .replace(/(Bearer )[^\s"',}]+/gi, "$1***");
}

function formatArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function formatMessage(args: unknown[]): string {
  const text = args.map(formatArg).join(" ");
  const masked = maskSecrets(text);
  return masked.length > MAX_MESSAGE_LEN ? `${masked.slice(0, MAX_MESSAGE_LEN)}…` : masked;
}

function write(level: LogLevel, source: string, args: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  let message: string;
  try {
    message = formatMessage(args);
  } catch {
    return;
  }
  buffer.push(`${new Date().toISOString()} [${level}] [${source}] ${message.replace(/\r?\n/g, "\\n")}`);
  if (buffer.length > BUFFER_SIZE) buffer.splice(0, buffer.length - BUFFER_SIZE);
  try {
    void getTransport().logAppend(level, source, message).catch(() => {});
  } catch {
    /* logging must never break the caller */
  }
}

export const log = {
  debug: (source: string, ...args: unknown[]) => write("debug", source, args),
  info: (source: string, ...args: unknown[]) => write("info", source, args),
  warn: (source: string, ...args: unknown[]) => write("warn", source, args),
  error: (source: string, ...args: unknown[]) => write("error", source, args),
};

let installed = false;

/**
 * Mirrors `console.*`, uncaught errors and unhandled promise rejections into the log file.
 * The original console methods keep working. Call it as early as possible.
 */
export function installConsoleCapture(): void {
  if (installed) return;
  installed = true;

  const levels: Array<[keyof Console, LogLevel]> = [
    ["log", "info"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
    ["debug", "debug"],
  ];
  for (const [method, level] of levels) {
    const original = (console as unknown as Record<string, unknown>)[method];
    if (typeof original !== "function") continue;
    const fn = original as (...args: unknown[]) => void;
    (console as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      try {
        write(level, "console", args);
      } catch {
        /* ignore */
      }
      fn.apply(console, args);
    };
  }

  if (typeof window !== "undefined") {
    window.addEventListener("error", (e) => {
      write("error", "window", [e.message, `${e.filename}:${e.lineno}:${e.colno}`, e.error]);
    });
    window.addEventListener("unhandledrejection", (e) => {
      write("error", "unhandledrejection", [e.reason]);
    });
  } else if (typeof process !== "undefined" && typeof process.on === "function") {
    // `uncaughtExceptionMonitor` observes without swallowing the crash, unlike
    // `uncaughtException`/`unhandledRejection`, which would change the CLI's exit behaviour.
    process.on("uncaughtExceptionMonitor", (err) => write("error", "process", [err]));
  }
}
