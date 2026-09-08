export type BridgeCommand =
  | { kind: "prompt"; text: string }
  | { kind: "status" }
  | { kind: "tasks" }
  | { kind: "approve"; id: string; note?: string }
  | { kind: "reject"; id: string; note?: string }
  | { kind: "answer"; id?: string; text: string }
  | { kind: "stop" }
  | { kind: "project"; name?: string }
  | { kind: "help" };

export function parseBridgeCommand(text: string): BridgeCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return { kind: "prompt", text };
  }

  // Handle multi-line texts by extracting the first word of the first line as command
  const spaceMatch = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  if (!spaceMatch) {
    return { kind: "prompt", text };
  }

  let cmd = spaceMatch[1].toLowerCase();
  const args = spaceMatch[2] ? spaceMatch[2].trim() : "";

  // Telegram groups suffix @botname
  const atIndex = cmd.indexOf("@");
  if (atIndex !== -1) {
    cmd = cmd.substring(0, atIndex);
  }

  switch (cmd) {
    case "/status":
      return { kind: "status" };
    case "/tasks":
      return { kind: "tasks" };
    case "/approve": {
      const parts = args.split(/\s+/);
      const id = parts[0];
      if (!id) return { kind: "prompt", text };
      const note = parts.slice(1).join(" ");
      return { kind: "approve", id, note: note || undefined };
    }
    case "/reject": {
      const parts = args.split(/\s+/);
      const id = parts[0];
      if (!id) return { kind: "prompt", text };
      const note = parts.slice(1).join(" ");
      return { kind: "reject", id, note: note || undefined };
    }
    case "/answer": {
      const parts = args.split(/\s+/);
      if (parts.length === 0 || !parts[0]) return { kind: "prompt", text };
      // UUID check for optional id
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (isUuid.test(parts[0])) {
        return { kind: "answer", id: parts[0], text: parts.slice(1).join(" ") };
      }
      return { kind: "answer", text: args };
    }
    case "/stop":
      return { kind: "stop" };
    case "/project":
      return { kind: "project", name: args || undefined };
    case "/help":
      return { kind: "help" };
    default:
      // Unknown commands fall back to prompt
      return { kind: "prompt", text };
  }
}
