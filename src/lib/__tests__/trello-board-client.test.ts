// The conversation with Trello, without a board on top of it.
//
// Three things here are worth more than the rest. The board id, because a person pastes a URL and
// not an id and getting that wrong means nothing ever opens. The error `kind`, because the provider
// decides between "set up your key and token" and "Trello is down" by reading it, so every mapping
// gets a sample response of its own. And the credentials, because the whole reason this client
// sends them in a header is to keep them out of logs — a message that leaks one would undo it.
import { describe, it, expect, afterEach } from "vitest";
import {
  TrelloBoardError,
  addCard,
  listCards,
  parseBoardId,
  resolveBoard,
  updateCard,
} from "@/lib/board/trello-client";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { useAppStore } from "@/store";

interface Call {
  verb: "GET" | "POST" | "PUT";
  url: string;
  body?: string;
  headers: Record<string, string>;
}

type Reply = { status: number; body: string } | (() => { status: number; body: string });

/** A transport that answers each request in turn and records what it was asked. */
function transport(replies: Reply[]) {
  const calls: Call[] = [];
  let next = 0;
  const answer = () => {
    const reply = replies[Math.min(next++, replies.length - 1)];
    return typeof reply === "function" ? reply() : reply;
  };
  setTransport({
    ...nullTransport,
    httpGet: async (url: string, headers: Record<string, string>) => {
      calls.push({ verb: "GET", url, headers });
      return answer();
    },
    httpPost: async (url: string, body: string, headers: Record<string, string>) => {
      calls.push({ verb: "POST", url, body, headers });
      return answer();
    },
    httpPut: async (url: string, body: string, headers: Record<string, string>) => {
      calls.push({ verb: "PUT", url, body, headers });
      return answer();
    },
  });
  return calls;
}

const ok = (data: unknown) => ({ status: 200, body: JSON.stringify(data) });

const KEY = "trello_key_secret";
const TOKEN = "trello_token_secret";

function setCredentials(creds: { key: string; token: string } | undefined) {
  const { config } = useAppStore.getState();
  useAppStore.setState({ config: { ...config, boards: creds === undefined ? undefined : { trello: creds } } });
}

afterEach(() => {
  setCredentials(undefined);
});

/** With credentials in place, so a test about anything else does not have to say so. */
function withCredentials(replies: Reply[]) {
  setCredentials({ key: KEY, token: TOKEN });
  return transport(replies);
}

async function failure(run: () => Promise<unknown>): Promise<TrelloBoardError> {
  try {
    await run();
  } catch (e) {
    if (e instanceof TrelloBoardError) return e;
    throw new Error(`expected a TrelloBoardError, got ${String(e)}`);
  }
  throw new Error("expected the call to throw");
}

const BOARD = { id: "5f2b8c1e9a4d3b2c1e0f9a8b", name: "Roadmap", shortUrl: "https://trello.com/b/AbCd1234" };
const LISTS = [
  { id: "L_todo", name: "Por hacer" },
  { id: "L_done", name: "Hecho" },
];

describe("parseBoardId", () => {
  it("takes the short link out of a board URL", () => {
    expect(parseBoardId("https://trello.com/b/AbCd1234/el-nombre")).toBe("AbCd1234");
  });

  it("takes it out of the same URL without the slug, without https, and with www", () => {
    expect(parseBoardId("https://trello.com/b/AbCd1234")).toBe("AbCd1234");
    expect(parseBoardId("trello.com/b/AbCd1234/x")).toBe("AbCd1234");
    expect(parseBoardId("https://www.trello.com/b/AbCd1234/x")).toBe("AbCd1234");
  });

  it("leaves a bare id alone, short link or object id", () => {
    expect(parseBoardId("AbCd1234")).toBe("AbCd1234");
    expect(parseBoardId("5f2b8c1e9a4d3b2c1e0f9a8b")).toBe("5f2b8c1e9a4d3b2c1e0f9a8b");
    expect(parseBoardId("  AbCd1234  ")).toBe("AbCd1234");
  });

  it("answers with nothing for what is not a board", () => {
    expect(parseBoardId("")).toBe("");
    expect(parseBoardId("   ")).toBe("");
    expect(parseBoardId("https://github.com/acme/repo")).toBe("");
    // A card and a workspace are trello.com URLs that name no board.
    expect(parseBoardId("https://trello.com/c/AbCd1234/1-una-tarjeta")).toBe("");
    expect(parseBoardId("https://trello.com/w/acme")).toBe("");
    expect(parseBoardId("not an id")).toBe("");
  });
});

describe("resolveBoard", () => {
  it("answers with the board and its lists", async () => {
    const calls = withCredentials([ok(BOARD), ok(LISTS)]);
    const board = await resolveBoard("https://trello.com/b/AbCd1234/el-nombre");

    expect(board.id).toBe(BOARD.id);
    expect(board.name).toBe("Roadmap");
    expect(board.url).toBe(BOARD.shortUrl);
    expect(board.lists).toEqual([
      { id: "L_todo", name: "Por hacer" },
      { id: "L_done", name: "Hecho" },
    ]);

    // The short link out of the URL is what goes on the wire, both times.
    expect(calls[0].url).toBe("https://api.trello.com/1/boards/AbCd1234?fields=name,url,shortUrl");
    expect(calls[1].url).toBe("https://api.trello.com/1/boards/AbCd1234/lists?filter=open&fields=name");
  });

  it("drops an archived list even if one comes back", async () => {
    withCredentials([ok(BOARD), ok([...LISTS, { id: "L_old", name: "Viejo", closed: true }])]);
    const board = await resolveBoard(BOARD.id);
    expect(board.lists.map(l => l.id)).toEqual(["L_todo", "L_done"]);
  });

  it("does not even ask when what was pasted is not a board", async () => {
    const calls = withCredentials([ok(BOARD)]);
    const error = await failure(() => resolveBoard("https://github.com/acme/repo"));
    expect(error.kind).toBe("not-found");
    expect(calls).toHaveLength(0);
  });
});

describe("listCards", () => {
  const cards = [
    {
      id: "C_1",
      idList: "L_todo",
      name: "Migrar el parser",
      desc: "cuerpo",
      closed: false,
      dateLastActivity: "2026-09-17T10:00:00.000Z",
      shortUrl: "https://trello.com/c/aaaa1111",
    },
    { id: "C_2", idList: "L_done", name: "Archivada", desc: "", closed: true, dateLastActivity: "2026-09-16T10:00:00.000Z" },
    { id: "C_3", idList: "L_done", name: "Sin fecha", desc: "", closed: false },
  ];

  it("reads the whole board in one request and drops the archived ones", async () => {
    const calls = withCredentials([ok(cards)]);
    const read = await listCards(BOARD.id);

    // One request: this endpoint answers with every open card of the board and takes no cursor.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://api.trello.com/1/boards/${BOARD.id}/cards`);

    expect(read.map(c => c.id)).toEqual(["C_1", "C_3"]);
    expect(read[0]).toEqual({
      id: "C_1",
      idList: "L_todo",
      name: "Migrar el parser",
      desc: "cuerpo",
      updatedAt: Date.parse("2026-09-17T10:00:00.000Z"),
      url: "https://trello.com/c/aaaa1111",
    });
    // A card with no activity date is still a card; it sorts oldest rather than disappearing.
    expect(read[1].updatedAt).toBe(0);
  });

  it("calls a body that is not a list an API failure", async () => {
    withCredentials([ok({ message: "nope" })]);
    const error = await failure(() => listCards(BOARD.id));
    expect(error.kind).toBe("api");
  });
});

describe("writing", () => {
  it("creates a card in a list, with the fields in the JSON body", async () => {
    const calls = withCredentials([ok({ id: "C_new", idList: "L_todo", name: "Nueva", desc: "d" })]);
    const card = await addCard("L_todo", "Nueva", "d");

    expect(card.id).toBe("C_new");
    expect(calls[0].verb).toBe("POST");
    expect(calls[0].url).toBe("https://api.trello.com/1/cards");
    expect(JSON.parse(calls[0].body || "")).toEqual({ idList: "L_todo", name: "Nueva", desc: "d", pos: "bottom" });
  });

  it("calls a create that answers without a card an API failure", async () => {
    withCredentials([ok({})]);
    const error = await failure(() => addCard("L_todo", "Nueva", "d"));
    expect(error.kind).toBe("api");
  });

  it("moves a card with PUT and sends only what changed", async () => {
    const calls = withCredentials([ok({ id: "C_1" })]);
    await updateCard("C_1", { idList: "L_done" });

    expect(calls[0].verb).toBe("PUT");
    expect(calls[0].url).toBe("https://api.trello.com/1/cards/C_1");
    expect(JSON.parse(calls[0].body || "")).toEqual({ idList: "L_done" });
  });

  it("sends an empty description when that is the change, and nothing at all when there is none", async () => {
    const calls = withCredentials([ok({ id: "C_1" })]);
    await updateCard("C_1", { desc: "" });
    expect(JSON.parse(calls[0].body || "")).toEqual({ desc: "" });

    await updateCard("C_1", {});
    expect(calls).toHaveLength(1);
  });
});

/**
 * One sample response per `kind`. The provider picks what the board says out of these, so a mapping
 * that changes without a test changing is a message shown to the wrong person.
 */
describe("what each failure turns into", () => {
  const cases: Array<[string, { status: number; body: string }]> = [
    ["invalid-token", { status: 401, body: "invalid token" }],
    ["no-permission", { status: 403, body: "unauthorized board permission requested" }],
    ["not-found", { status: 404, body: "The requested resource was not found." }],
    ["rate-limited", { status: 429, body: "API_TOKEN_LIMIT_EXCEEDED" }],
    ["api", { status: 500, body: "internal error" }],
  ];

  for (const [kind, reply] of cases) {
    it(`reads HTTP ${reply.status} as ${kind}`, async () => {
      withCredentials([reply]);
      const error = await failure(() => resolveBoard(BOARD.id));
      expect(error.kind).toBe(kind);
    });
  }

  it("reads a 400 about an id as a board that is not there", async () => {
    withCredentials([{ status: 400, body: "invalid id" }]);
    const error = await failure(() => resolveBoard(BOARD.id));
    expect(error.kind).toBe("not-found");
  });

  it("reads any other 400 as an API failure", async () => {
    withCredentials([{ status: 400, body: "invalid value for name" }]);
    const error = await failure(() => addCard("L_todo", "", ""));
    expect(error.kind).toBe("api");
  });

  it("reads a 200 that is not JSON as an API failure", async () => {
    withCredentials([{ status: 200, body: "<html>captive portal</html>" }]);
    const error = await failure(() => resolveBoard(BOARD.id));
    expect(error.kind).toBe("api");
  });

  it("reads a transport that throws as a network failure", async () => {
    setCredentials({ key: KEY, token: TOKEN });
    setTransport({
      ...nullTransport,
      httpGet: async () => { throw new Error("getaddrinfo ENOTFOUND api.trello.com"); },
    });
    const error = await failure(() => resolveBoard(BOARD.id));
    expect(error.kind).toBe("network");
  });

  it("reads a board that answers without an id as a board that is not there", async () => {
    withCredentials([ok({ name: "Roadmap" })]);
    const error = await failure(() => resolveBoard(BOARD.id));
    expect(error.kind).toBe("not-found");
  });
});

describe("the credentials", () => {
  it("sends both in the Authorization header and nothing in the URL", async () => {
    const calls = withCredentials([ok(BOARD), ok(LISTS)]);
    await resolveBoard(BOARD.id);

    for (const call of calls) {
      expect(call.headers.Authorization).toBe(`OAuth oauth_consumer_key="${KEY}", oauth_token="${TOKEN}"`);
      expect(call.url).not.toContain(KEY);
      expect(call.url).not.toContain(TOKEN);
    }
  });

  it("trims what was typed", async () => {
    setCredentials({ key: `  ${KEY}  `, token: `  ${TOKEN}  ` });
    const calls = transport([ok(BOARD), ok(LISTS)]);
    await resolveBoard(BOARD.id);
    expect(calls[0].headers.Authorization).toBe(`OAuth oauth_consumer_key="${KEY}", oauth_token="${TOKEN}"`);
  });

  it("fails with no-credentials when either one is missing, and asks nothing", async () => {
    for (const creds of [undefined, { key: KEY, token: "" }, { key: "", token: TOKEN }, { key: "  ", token: TOKEN }]) {
      setCredentials(creds);
      const calls = transport([ok(BOARD)]);
      const error = await failure(() => resolveBoard(BOARD.id));
      expect(error.kind).toBe("no-credentials");
      expect(calls).toHaveLength(0);
    }
  });

  it("never puts the key or the token in a message, whatever went wrong", async () => {
    const failures: Array<[Reply[], () => Promise<unknown>]> = [
      [[{ status: 401, body: `invalid token ${TOKEN}` }], () => resolveBoard(BOARD.id)],
      [[{ status: 429, body: "API_KEY_LIMIT_EXCEEDED" }], () => listCards(BOARD.id)],
      [[{ status: 500, body: "boom" }], () => addCard("L_todo", "x", "")],
      [[{ status: 200, body: "not json" }], () => updateCard("C_1", { name: "x" })],
    ];

    for (const [replies, run] of failures) {
      withCredentials(replies);
      const error = await failure(run);
      expect(error.message).not.toContain(KEY);
      expect(error.message).not.toContain(TOKEN);
    }

    setCredentials(undefined);
    const missing = await failure(() => resolveBoard(BOARD.id));
    expect(missing.message).not.toContain(KEY);
    expect(missing.message).not.toContain(TOKEN);
  });
});
