// Everything this app knows about talking to Trello, and nothing about boards.
//
// Same split as `github-client.ts` next door, and for the same reason: this file is about two
// credentials that may be missing or wrong, about Trello's own vocabulary (a board has lists, a
// list has cards) and about the handful of HTTP statuses it answers with, while the provider above
// it is about columns, merges and `Task`. A fake transport and a JSON string reproduce every case
// here; through the provider each one would need a project, a store and a board.
//
// Nothing here is user-facing text: the messages are English log lines, which is what CLAUDE.md
// says belongs in the source. The provider turns a `kind` into a translated sentence, not a string.
import { getTransport } from "@/lib/transport";
import { useAppStore } from "@/store";

const API = "https://api.trello.com/1";

export type TrelloBoardErrorKind =
  | "no-credentials"
  | "invalid-token"
  | "no-permission"
  | "not-found"
  | "rate-limited"
  | "network"
  | "api";

/**
 * Every failure of this module, with what went wrong as a field rather than as a sentence.
 *
 * The provider above has to tell "set up your key and token" from "Trello is down": the first is
 * something the user fixes and the board can say so, the second is something to retry while the
 * board goes stale. A plain `Error` would leave it matching on message text, which changes the day
 * Trello rewords an error and breaks without anything noticing.
 */
export class TrelloBoardError extends Error {
  readonly kind: TrelloBoardErrorKind;

  constructor(kind: TrelloBoardErrorKind, message: string) {
    super(message);
    this.name = "TrelloBoardError";
    this.kind = kind;
  }
}

export interface TrelloList {
  id: string;
  name: string;
}

export interface TrelloBoard {
  /** The 24-character id Trello answers with, not the short link that may have been pasted in. */
  id: string;
  name: string;
  url: string;
  /** The open lists, in board order. These are the columns. */
  lists: TrelloList[];
}

export interface TrelloCard {
  id: string;
  /** The list the card is in: what moving a card between columns writes. */
  idList: string;
  name: string;
  desc: string;
  updatedAt: number;
  url?: string;
}

// -------------------------------------------------------------------------------------------
// The board id, which a person is going to paste as a URL.
// -------------------------------------------------------------------------------------------

/**
 * The board id inside whatever was pasted: a bare id, or the URL Trello's own share button hands
 * out (`https://trello.com/b/AbCd1234/el-nombre`).
 *
 * Trello takes either the 24-hex id or the 8-character short link wherever the REST API writes
 * `{id}`, so the short link out of the URL goes straight through and nothing has to resolve it
 * first. Pure on purpose: it is the one piece here worth testing without a transport at all.
 */
export function parseBoardId(idOrUrl: string): string {
  const text = (idOrUrl || "").trim();
  if (!text) return "";

  // `/b/<shortLink>` is the only shape a board URL has; `/c/<id>` is a card and `/w/<name>` a
  // workspace, and neither one names a board we could open.
  const fromUrl = /^(?:https?:\/\/)?(?:www\.)?trello\.com\/b\/([a-zA-Z0-9]+)/.exec(text);
  if (fromUrl) return fromUrl[1];

  // A bare id: either the 24-hex object id or the short link. Anything else is not an id at all,
  // and answering "" here beats sending junk to Trello and reading back a 400.
  if (/^[a-zA-Z0-9]{8,24}$/.test(text)) return text;

  return "";
}

// -------------------------------------------------------------------------------------------
// The credentials, and the one request everything goes through.
// -------------------------------------------------------------------------------------------

/**
 * The key and token typed in Configuración → Tableros. Unlike GitHub there is no CLI to fall back
 * to: Trello has no local credential a developer machine already carries, so missing means missing.
 */
function credentials(): { key: string; token: string } {
  const trello = useAppStore.getState().config.boards?.trello;
  const key = trello?.key?.trim() || "";
  const token = trello?.token?.trim() || "";
  if (!key || !token) {
    throw new TrelloBoardError("no-credentials", "Trello needs both an API key and a token");
  }
  return { key, token };
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * The credentials as a header rather than as `?key=&token=`.
 *
 * Trello documents all three ways (query string, this header, or the JSON body) and the query
 * string is the one its own examples use — but a query string is what ends up in a proxy log, in a
 * browser history and in the `GET <url> failed` line `http.rs` writes when a request dies. The
 * header keeps both secrets out of every one of those. The quoting is Trello's, not OAuth 1.0a
 * signing: there is no signature, the two values are sent as they are.
 */
function authHeaders(): Record<string, string> {
  const { key, token } = credentials();
  return {
    Authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`,
    Accept: "application/json",
  };
}

/**
 * An HTTP status as the kind it really is.
 *
 * The bodies Trello answers with are short strings ("invalid token", "unauthorized card permission
 * requested") and not JSON, so the status carries almost all of it. The one exception is 400: a
 * board id that is not an id at all comes back as `400 invalid id`, which is a board the user
 * cannot open and not a bug in the request we built.
 */
function fromStatus(status: number, body: string, what: string): TrelloBoardError {
  const text = body.toLowerCase();
  if (status === 401) {
    return new TrelloBoardError("invalid-token", `Trello rejected the key or the token (HTTP 401) on ${what}`);
  }
  if (status === 403) {
    return new TrelloBoardError("no-permission", `the token has no permission for ${what} (HTTP 403)`);
  }
  if (status === 404) {
    return new TrelloBoardError("not-found", `Trello has nothing at ${what} (HTTP 404)`);
  }
  // Both `API_KEY_LIMIT_EXCEEDED` (300 requests per 10s) and `API_TOKEN_LIMIT_EXCEEDED` (100 per
  // 10s) arrive as a 429. The provider retries either one the same way.
  if (status === 429) {
    return new TrelloBoardError("rate-limited", `Trello is rate limiting this token (HTTP 429) on ${what}`);
  }
  if (status === 400 && (text.includes("invalid id") || text.includes("model not found"))) {
    return new TrelloBoardError("not-found", `Trello does not recognise that id (HTTP 400) on ${what}`);
  }
  return new TrelloBoardError("api", `Trello answered HTTP ${status} on ${what}`);
}

type Verb = "GET" | "POST" | "PUT";

/**
 * One request, with the credentials attached and the answer parsed.
 *
 * `what` is the path, and it goes into every error message. The URL never carries a secret — that
 * is the whole point of the header above — so putting it in the message is safe and is the only
 * way the log says which call failed.
 */
async function request<T>(verb: Verb, path: string, body?: Record<string, unknown>): Promise<T> {
  const headers = authHeaders();
  const url = `${API}${path}`;

  let response: { status: number; body: string };
  try {
    const transport = getTransport();
    if (verb === "GET") {
      response = await transport.httpGet(url, headers);
    } else {
      // Trello takes the write parameters either in the query string or as a JSON body, and the
      // body is the only one of the two that survives a description with a newline in it.
      const payload = JSON.stringify(body || {});
      const withType = { ...headers, "Content-Type": "application/json" };
      response = verb === "POST"
        ? await transport.httpPost(url, payload, withType)
        : await transport.httpPut(url, payload, withType);
    }
  } catch (e) {
    throw new TrelloBoardError("network", `could not reach the Trello API on ${path}: ${describe(e)}`);
  }

  if (response.status < 200 || response.status >= 300) throw fromStatus(response.status, response.body, path);

  try {
    return JSON.parse(response.body) as T;
  } catch {
    // A body that is not JSON on a 2xx is a proxy or a captive portal, never Trello.
    throw new TrelloBoardError("api", `Trello answered something that is not JSON on ${path}`);
  }
}

// -------------------------------------------------------------------------------------------
// Reading.
// -------------------------------------------------------------------------------------------

interface RawList {
  id?: string;
  name?: string;
  closed?: boolean;
}

interface RawBoard {
  id?: string;
  name?: string;
  url?: string;
  shortUrl?: string;
}

/**
 * The board behind a pasted id or URL, with its open lists.
 *
 * The lists come along because no column can be mapped without them, and they are a second request
 * rather than `?lists=open` on the first: the nested form returns every field of every list and its
 * shape is documented only as "a ViewFilter", while `/boards/{id}/lists` takes `fields` and `filter`
 * in the spec. This runs once per board, not per card.
 */
export async function resolveBoard(idOrUrl: string): Promise<TrelloBoard> {
  const id = parseBoardId(idOrUrl);
  if (!id) {
    throw new TrelloBoardError("not-found", "that is not a Trello board id or board URL");
  }

  const board = await request<RawBoard>("GET", `/boards/${id}?fields=name,url,shortUrl`);
  if (!board?.id) {
    throw new TrelloBoardError("not-found", `no Trello board at "${id}"`);
  }

  const lists = await request<RawList[]>("GET", `/boards/${id}/lists?filter=open&fields=name`);

  return {
    id: board.id,
    name: board.name || "",
    url: board.shortUrl || board.url || "",
    lists: (Array.isArray(lists) ? lists : [])
      .filter((l): l is RawList & { id: string } => typeof l?.id === "string" && l.closed !== true)
      .map(l => ({ id: l.id, name: l.name || "" })),
  };
}

interface RawCard {
  id?: string;
  idList?: string;
  name?: string;
  desc?: string;
  closed?: boolean;
  dateLastActivity?: string;
  shortUrl?: string;
  url?: string;
}

function toCard(raw: RawCard & { id: string }): TrelloCard {
  const updatedAt = Date.parse(raw.dateLastActivity || "");
  return {
    id: raw.id,
    idList: raw.idList || "",
    name: raw.name || "",
    desc: raw.desc || "",
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    url: raw.shortUrl || raw.url,
  };
}

/**
 * Every card on the board that is not archived.
 *
 * There is no pagination to do here, and that is worth saying out loud because on GitHub next door
 * skipping it would have dropped cards in silence. Trello's spec documents `/boards/{id}/cards`
 * with no parameter but the board id and describes it as "all of the open Cards on a Board": one
 * request, the whole board, no cursor and no `limit` to run into. The nested form
 * (`/boards/{id}?cards=open`) is the one that caps at 1000 and needs paging, which is the other
 * reason not to use it. No `fields` either — the spec lists none for this endpoint, and asking for
 * an undocumented parameter to save a few kilobytes is how a request starts coming back empty
 * after a Trello deploy.
 *
 * `closed` is filtered again on top of that. The endpoint already promises open cards only, but a
 * card archived between the request and the answer is cheap to drop and expensive to show.
 */
export async function listCards(boardId: string): Promise<TrelloCard[]> {
  const cards = await request<RawCard[]>("GET", `/boards/${boardId}/cards`);
  if (!Array.isArray(cards)) {
    throw new TrelloBoardError("api", `Trello answered no card list for board ${boardId}`);
  }
  return cards
    .filter((c): c is RawCard & { id: string } => typeof c?.id === "string" && c.closed !== true)
    .map(toCard);
}

// -------------------------------------------------------------------------------------------
// Writing.
// -------------------------------------------------------------------------------------------

/** Opens a card at the bottom of a list and answers with it as `listCards` would have read it. */
export async function addCard(idList: string, name: string, desc: string): Promise<TrelloCard> {
  const created = await request<RawCard>("POST", "/cards", { idList, name, desc, pos: "bottom" });
  if (!created?.id) {
    throw new TrelloBoardError("api", "Trello accepted the card and answered without one");
  }
  return toCard(created as RawCard & { id: string });
}

/**
 * Edits a card: its title, its description, or the list it sits in. Moving a card between columns
 * is `idList` and nothing else — Trello has no separate endpoint for it.
 *
 * Only the given fields are sent, so passing `{ idList }` alone cannot blank a description.
 */
export async function updateCard(
  cardId: string,
  changes: { name?: string; desc?: string; idList?: string },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (changes.name !== undefined) body.name = changes.name;
  if (changes.desc !== undefined) body.desc = changes.desc;
  if (changes.idList !== undefined) body.idList = changes.idList;
  if (Object.keys(body).length === 0) return;

  await request<RawCard>("PUT", `/cards/${cardId}`, body);
}
