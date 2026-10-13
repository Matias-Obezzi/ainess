// The room's wire format: what a machine says, signed with the room's key so nobody without it can
// speak for anyone. Same shape, same topic and same signature as ai-connector (a Python app that
// does this outside ainess), so both can sit in one room.

export const MAX_TEXT = 20_000;

export type RoomKind = "human" | "agent" | "hello";

export interface RoomMessage {
  id: string;
  machine: string;
  machine_name: string;
  /** Who on that machine: an agent's name, the person's name, or empty for `hello`. */
  sender: string;
  kind: RoomKind;
  text: string;
  ts: number;
  sig: string;
}

/**
 * The body that is signed, written the way Python's `json.dumps(sort_keys=True, ensure_ascii=False)`
 * writes it — keys sorted, `", "` and `": "` between them — or the two apps would never agree on a
 * signature.
 */
export function canonical(m: Omit<RoomMessage, "sig">): string {
  const keys = Object.keys(m).sort() as (keyof typeof m)[];
  return "{" + keys.map(k => `${JSON.stringify(k)}: ${JSON.stringify(m[k])}`).join(", ") + "}";
}

async function hmac(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function makeMessage(
  secret: string,
  from: { machine: string; machineName: string },
  sender: string,
  text: string,
  kind: RoomKind,
): Promise<RoomMessage> {
  const m = {
    id: crypto.randomUUID().replace(/-/g, ""),
    machine: from.machine,
    machine_name: from.machineName,
    sender,
    kind,
    text: text.slice(0, MAX_TEXT),
    ts: Date.now(),
  };
  return { ...m, sig: await hmac(secret, canonical(m)) };
}

/** Whether a message is well formed and was signed with this room's key. Anything else is dropped. */
export async function isValidMessage(m: unknown, secret: string): Promise<boolean> {
  if (!m || typeof m !== "object") return false;
  const r = m as Record<string, unknown>;
  for (const k of ["id", "machine", "machine_name", "sender", "kind", "text", "sig"]) {
    if (typeof r[k] !== "string") return false;
  }
  if (!["human", "agent", "hello"].includes(r.kind as string) || (r.text as string).length > MAX_TEXT) return false;
  const { sig, ...body } = r as unknown as RoomMessage;
  const expected = await hmac(secret, canonical(body));
  // Same length, compared in full: a timing-safe compare is overkill in a browser, an early exit is not needed.
  return expected.length === sig.length && [...expected].every((c, i) => c === sig[i]);
}

/** How a message is shown and quoted: who said it, on which machine. */
export function roomLabel(m: Pick<RoomMessage, "sender" | "machine_name">, human: string): string {
  return `${m.sender || human} @ ${m.machine_name}`;
}

/**
 * Whether the local agents should answer `text` at all.
 *
 * A message that names somebody with `@` is for them: when it names agents and none of ours, ours
 * keep quiet. And after `maxTurns` agent messages in a row with no human in between, everybody
 * stops — two machines whose agents answer each other would otherwise go on forever.
 */
export function shouldAnswer(text: string, localNames: string[], knownNames: string[], agentStreak: number, maxTurns: number): boolean {
  if (agentStreak >= maxTurns) return false;
  const lower = text.toLowerCase();
  const mentioned = [...new Set([...knownNames, ...localNames])].filter(n => n && lower.includes(`@${n.toLowerCase()}`));
  if (mentioned.length === 0) return true;
  return mentioned.some(n => localNames.some(l => l.toLowerCase() === n.toLowerCase()));
}

/** What an agent answers when it has nothing to add (ai-connector's word for it). */
export const PASS = "[PASO]";

export function isPass(text: string): boolean {
  const t = text.trim();
  return t === PASS || t === "[PASS]";
}
