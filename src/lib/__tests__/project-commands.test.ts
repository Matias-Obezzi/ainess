// Reading a project's own files to find out what it can be told to do.
//
// The one that matters most is `isSafeCommandName`. These strings are typed into a real shell, so a
// script name is not data — it is code the moment it gets there. Everything else here is about not
// putting a button on screen that fails when pressed.
import { describe, it, expect } from "vitest";
import {
  cargoCommands,
  isSafeCommandName,
  makeCommands,
  npmCommands,
  packageRunner,
  projectCommands,
  sortCommands,
} from "@/lib/project-commands";

describe("isSafeCommandName", () => {
  it("takes the names real scripts have", () => {
    for (const name of ["dev", "build:cli", "test-watch", "tauri.dev", "e2e_2"]) {
      expect({ name, ok: isSafeCommandName(name) }).toEqual({ name, ok: true });
    }
  });

  it("refuses anything that would keep going after the command", () => {
    // `npm run foo && curl x | sh` runs the second half whatever npm thinks of the first.
    for (const name of ["foo && rm -rf /", "a; b", "a | b", "a`b`", "$(b)", "a\nb", "a b", "-rf", ""]) {
      expect({ name, ok: isSafeCommandName(name) }).toEqual({ name, ok: false });
    }
  });
});

describe("packageRunner", () => {
  it("follows the lockfile", () => {
    expect(packageRunner(["pnpm-lock.yaml"])).toBe("pnpm");
    expect(packageRunner(["yarn.lock"])).toBe("yarn");
    expect(packageRunner(["bun.lockb"])).toBe("bun");
    expect(packageRunner(["package-lock.json"])).toBe("npm");
  });

  it("falls back to npm when nothing was installed yet", () => {
    expect(packageRunner([])).toBe("npm");
  });

  it("prefers pnpm when several lockfiles are lying around", () => {
    expect(packageRunner(["package-lock.json", "pnpm-lock.yaml"])).toBe("pnpm");
  });
});

describe("npmCommands", () => {
  const pkg = JSON.stringify({ scripts: { dev: "vite", "build:cli": "tsc", test: "vitest" } });

  it("turns every script into a command", () => {
    expect(npmCommands(pkg, "npm").map(c => c.command))
      .toEqual(["npm run dev", "npm run build:cli", "npm run test"]);
  });

  it("yarn takes the name without `run`", () => {
    expect(npmCommands(pkg, "yarn")[0].command).toBe("yarn dev");
  });

  it("drops a script whose name would not be safe to type", () => {
    const evil = JSON.stringify({ scripts: { dev: "vite", "x && whoami": "echo" } });
    expect(npmCommands(evil, "npm").map(c => c.label)).toEqual(["dev"]);
  });

  it("says nothing rather than throwing on a broken package.json", () => {
    expect(npmCommands("{ not json", "npm")).toEqual([]);
  });

  it("handles a package.json with no scripts at all", () => {
    expect(npmCommands(JSON.stringify({ name: "x" }), "npm")).toEqual([]);
    expect(npmCommands(JSON.stringify({ scripts: null }), "npm")).toEqual([]);
    expect(npmCommands(JSON.stringify({ scripts: ["dev"] }), "npm")).toEqual([]);
  });
});

describe("makeCommands", () => {
  it("finds the targets", () => {
    const makefile = ["build:", "\tgo build ./...", "", "test: build", "\tgo test ./..."].join("\n");
    expect(makeCommands(makefile).map(c => c.command)).toEqual(["make build", "make test"]);
  });

  it("leaves out what is not a target", () => {
    const makefile = [
      ".PHONY: build",   // a directive
      "CFLAGS := -O2",   // an assignment
      "VERSION = 1.0",   // another one, no colon at all
      "%.o: %.c",        // a pattern rule
      "\tnested: thing", // a recipe line
      "real:",
    ].join("\n");
    expect(makeCommands(makefile).map(c => c.label)).toEqual(["real"]);
  });

  it("names a target once even when it appears twice", () => {
    expect(makeCommands("build:\n\techo a\nbuild:\n\techo b").map(c => c.label)).toEqual(["build"]);
  });
});

describe("sortCommands", () => {
  it("puts the ones people reach for first", () => {
    const of = (label: string) => ({ id: label, label, command: label, source: "npm" as const });
    const sorted = sortCommands([of("zip"), of("build"), of("dev"), of("apple"), of("test")]);
    expect(sorted.map(c => c.label)).toEqual(["dev", "build", "test", "apple", "zip"]);
  });
});

describe("projectCommands", () => {
  it("reads several manifests at once", () => {
    const found = projectCommands({
      packageJson: JSON.stringify({ scripts: { dev: "vite" } }),
      lockfiles: ["pnpm-lock.yaml"],
      hasCargo: true,
      makefile: "deploy:\n\techo",
    });
    expect(found.map(c => c.command)).toContain("pnpm run dev");
    expect(found.map(c => c.command)).toContain("cargo run");
    expect(found.map(c => c.command)).toContain("make deploy");
  });

  it("is empty for a project with none of them", () => {
    expect(projectCommands({})).toEqual([]);
  });

  it("cargo always offers the same four", () => {
    expect(cargoCommands().map(c => c.command))
      .toEqual(["cargo run", "cargo build", "cargo test", "cargo check"]);
  });
});
