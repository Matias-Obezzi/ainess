// The conversation with GitHub Projects v2, without a board on top of it.
//
// Two things here are worth more than the rest. One is pagination: a real board goes past the
// hundred items of the first page, and a client that stops there loses cards silently, which is the
// worst way this can fail. The other is the error `kind`: the provider decides between "set up your
// token" and "GitHub is down" by reading it, so every mapping gets a sample response of its own.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  GhBoardError,
  addDraftItem,
  clearGhTokenCache,
  deleteItem,
  listItems,
  resolveProject,
  setItemStatus,
  updateDraftItem,
} from "@/lib/board/github-client";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { useAppStore } from "@/store";

interface Post {
  url: string;
  query: string;
  variables: Record<string, unknown>;
  headers: Record<string, string>;
}

type Reply = { status: number; body: string } | (() => { status: number; body: string });

/**
 * A transport that answers each POST in turn and records what it was asked. The last reply is
 * repeated once the list runs out, which is what the pagination tests need.
 */
function transport(replies: Reply[], token = { code: 0 as number | null, stdout: "ghp_secret\n", stderr: "" }) {
  const posts: Post[] = [];
  const calls = { token: 0 };
  let next = 0;
  setTransport({
    ...nullTransport,
    exec: async () => {
      calls.token++;
      return token;
    },
    httpPost: async (url: string, body: string, headers: Record<string, string>) => {
      const parsed = JSON.parse(body) as { query: string; variables: Record<string, unknown> };
      posts.push({ url, query: parsed.query, variables: parsed.variables, headers });
      const reply = replies[Math.min(next++, replies.length - 1)];
      return typeof reply === "function" ? reply() : reply;
    },
  });
  return { posts, calls };
}

const ok = (data: unknown) => ({ status: 200, body: JSON.stringify({ data }) });
const graphQlErrors = (errors: unknown[]) => ({ status: 200, body: JSON.stringify({ errors }) });

const PROJECT = {
  id: "PVT_1",
  title: "Roadmap",
  fields: {
    nodes: [
      {},
      { id: "F_size", name: "Size", options: [{ id: "s1", name: "S" }] },
      { id: "F_status", name: "Status", options: [{ id: "o_todo", name: "Todo" }, { id: "o_done", name: "Done" }] },
    ],
  },
};

const orgReply = ok({ organization: { projectV2: PROJECT } });
const noOrg = graphQlErrors([{ type: "NOT_FOUND", message: "Could not resolve to an Organization with the login of 'ana'." }]);
const userReply = ok({ user: { projectV2: PROJECT } });

/** One page of items, with the cursor it hands to the next one. */
function itemsPage(nodes: unknown[], endCursor: string | null) {
  return ok({ node: { items: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes } } });
}

const draftNode = {
  id: "PVTI_draft",
  type: "DRAFT_ISSUE",
  isArchived: false,
  updatedAt: "2026-09-17T10:00:00Z",
  content: { id: "DI_1", title: "Migrar el parser", body: "cuerpo" },
  fieldValues: {
    nodes: [
      { optionId: "s1", field: { id: "F_size" } },
      { optionId: "o_done", field: { id: "F_status" } },
    ],
  },
};

const issueNode = {
  id: "PVTI_issue",
  type: "ISSUE",
  isArchived: false,
  updatedAt: "2026-09-16T10:00:00Z",
  content: { title: "Crash on start", body: "steps", url: "https://github.com/a/b/issues/7" },
  fieldValues: { nodes: [] },
};

/** The `kind` of the error a call threw, or the error itself when it was not one of ours. */
async function kindOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof GhBoardError) return e.kind;
    throw e;
  }
  throw new Error("expected the call to throw");
}

/** The message a call threw, so a test can assert no secret found its way into it. */
async function messageOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("expected the call to throw");
}

beforeEach(() => {
  clearGhTokenCache();
});

describe("resolveProject", () => {
  it("answers with the id, the title and the options of the status field", async () => {
    transport([orgReply]);
    const project = await resolveProject({ owner: "acme", number: 3 });
    expect(project.id).toBe("PVT_1");
    expect(project.title).toBe("Roadmap");
    expect(project.statusFieldId).toBe("F_status");
    expect(project.statusOptions).toEqual([{ id: "o_todo", name: "Todo" }, { id: "o_done", name: "Done" }]);
  });

  it("asks the organisation first and stops there when it is one", async () => {
    const { posts } = transport([orgReply]);
    await resolveProject({ owner: "acme", number: 3 });
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("https://api.github.com/graphql");
    expect(posts[0].query).toContain("organization(login: $owner)");
    expect(posts[0].variables).toEqual({ owner: "acme", number: 3 });
  });

  it("falls through to the user query when there is no organisation by that name", async () => {
    const { posts } = transport([noOrg, userReply]);
    const project = await resolveProject({ owner: "ana", number: 7 });
    expect(project.id).toBe("PVT_1");
    expect(posts).toHaveLength(2);
    expect(posts[0].query).toContain("organization(login: $owner)");
    expect(posts[1].query).toContain("user(login: $owner)");
  });

  it("says not-found when neither an organisation nor a user has that project", async () => {
    transport([ok({ organization: null }), ok({ user: null })]);
    expect(await kindOf(() => resolveProject({ owner: "ana", number: 7 }))).toBe("not-found");
  });

  it("leaves the status field out when the project has no single select at all", async () => {
    transport([ok({ organization: { projectV2: { id: "PVT_2", title: "Bare", fields: { nodes: [{}] } } } })]);
    const project = await resolveProject({ owner: "acme", number: 1 });
    expect(project.statusFieldId).toBeUndefined();
    expect(project.statusOptions).toEqual([]);
  });

  it("sends the token as a bearer and asks gh for it only once", async () => {
    const { posts, calls } = transport([orgReply]);
    await resolveProject({ owner: "acme", number: 3 });
    await resolveProject({ owner: "acme", number: 3 });
    expect(calls.token).toBe(1);
    expect(posts[0].headers.Authorization).toBe("Bearer ghp_secret");
    expect(posts[0].headers["Content-Type"]).toBe("application/json");
  });
});

describe("listItems", () => {
  it("follows the cursor and answers with the items of every page", async () => {
    const { posts } = transport([
      itemsPage([{ ...draftNode, id: "a" }], "CUR_1"),
      itemsPage([{ ...draftNode, id: "b" }], null),
    ]);
    const items = await listItems("PVT_1", "F_status");
    expect(items.map(i => i.id)).toEqual(["a", "b"]);
    expect(posts).toHaveLength(2);
    expect(posts[0].variables.cursor).toBeNull();
    expect(posts[1].variables.cursor).toBe("CUR_1");
  });

  it("stops at the page cap instead of following a cursor that never ends", async () => {
    const { posts } = transport([itemsPage([draftNode], "CUR")]);
    const items = await listItems("PVT_1", "F_status");
    expect(posts).toHaveLength(20);
    expect(items).toHaveLength(20);
  });

  it("tells a draft from an issue, and keeps the draft id apart from the item id", async () => {
    transport([itemsPage([draftNode, issueNode], null)]);
    const [draft, issue] = await listItems("PVT_1", "F_status");

    expect(draft.isDraft).toBe(true);
    expect(draft.id).toBe("PVTI_draft");
    expect(draft.draftId).toBe("DI_1");
    expect(draft.title).toBe("Migrar el parser");
    expect(draft.body).toBe("cuerpo");
    expect(draft.url).toBeUndefined();
    expect(draft.updatedAt).toBe(Date.parse("2026-09-17T10:00:00Z"));

    expect(issue.isDraft).toBe(false);
    expect(issue.draftId).toBeUndefined();
    expect(issue.url).toBe("https://github.com/a/b/issues/7");
  });

  it("takes the status of the field it was given and not of any other single select", async () => {
    transport([itemsPage([draftNode], null)]);
    const [item] = await listItems("PVT_1", "F_status");
    expect(item.statusOptionId).toBe("o_done");
  });

  it("leaves the status empty when it was not told which field holds it", async () => {
    transport([itemsPage([draftNode], null)]);
    const [item] = await listItems("PVT_1");
    expect(item.statusOptionId).toBeUndefined();
  });

  it("says not-found when the id is not a project", async () => {
    transport([ok({ node: null })]);
    expect(await kindOf(() => listItems("PVT_nope"))).toBe("not-found");
  });
});

describe("the mutations", () => {
  it("opens a draft and answers with it", async () => {
    const { posts } = transport([ok({ addProjectV2DraftIssue: { projectItem: draftNode } })]);
    const item = await addDraftItem("PVT_1", "Migrar el parser", "cuerpo");
    expect(item.id).toBe("PVTI_draft");
    expect(item.draftId).toBe("DI_1");
    expect(posts[0].query).toContain("addProjectV2DraftIssue");
    expect(posts[0].variables).toEqual({ projectId: "PVT_1", title: "Migrar el parser", body: "cuerpo" });
  });

  it("says so when GitHub accepts the draft and answers without one", async () => {
    transport([ok({ addProjectV2DraftIssue: { projectItem: null } })]);
    expect(await kindOf(() => addDraftItem("PVT_1", "t", "b"))).toBe("graphql");
  });

  it("edits a draft through its draft id, not through the item id", async () => {
    const { posts } = transport([ok({ updateProjectV2DraftIssue: { draftIssue: { id: "DI_1" } } })]);
    await updateDraftItem("DI_1", "otro título", "otro cuerpo");
    expect(posts[0].query).toContain("draftIssueId: $draftId");
    expect(posts[0].variables).toEqual({ draftId: "DI_1", title: "otro título", body: "otro cuerpo" });
  });

  it("moves a card by setting the single select option of the status field", async () => {
    const { posts } = transport([ok({ updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_draft" } } })]);
    await setItemStatus("PVT_1", "PVTI_draft", "F_status", "o_done");
    expect(posts[0].query).toContain("singleSelectOptionId: $optionId");
    expect(posts[0].variables).toEqual({
      projectId: "PVT_1",
      itemId: "PVTI_draft",
      fieldId: "F_status",
      optionId: "o_done",
    });
  });

  it("removes a card from the project", async () => {
    const { posts } = transport([ok({ deleteProjectV2Item: { deletedItemId: "PVTI_draft" } })]);
    await deleteItem("PVT_1", "PVTI_draft");
    expect(posts[0].query).toContain("deleteProjectV2Item");
    expect(posts[0].variables).toEqual({ projectId: "PVT_1", itemId: "PVTI_draft" });
  });
});

describe("what went wrong, as a kind", () => {
  const ref = { owner: "acme", number: 3 };

  it("no-cli when gh is not installed", async () => {
    transport([orgReply], { code: 127, stdout: "", stderr: "bash: gh: command not found" });
    expect(await kindOf(() => resolveProject(ref))).toBe("no-cli");
  });

  it("no-cli when there is no process to run it", async () => {
    transport([orgReply], { code: null, stdout: "", stderr: "" });
    expect(await kindOf(() => resolveProject(ref))).toBe("no-cli");
  });

  it("no-token when gh is there and nobody is logged in", async () => {
    transport([orgReply], { code: 1, stdout: "", stderr: "gh: To get started with GitHub CLI, please run: gh auth login" });
    expect(await kindOf(() => resolveProject(ref))).toBe("no-token");
  });

  it("no-token when gh answers nothing at all", async () => {
    transport([orgReply], { code: 0, stdout: "  \n", stderr: "" });
    expect(await kindOf(() => resolveProject(ref))).toBe("no-token");
  });

  it("no-scope when the token was never granted the project scope", async () => {
    transport([graphQlErrors([{
      type: "INSUFFICIENT_SCOPES",
      message: "Your token has not been granted the required scopes to execute this query. "
        + "The 'projectV2' field requires one of the following scopes: ['read:project'].",
    }])]);
    expect(await kindOf(() => resolveProject(ref))).toBe("no-scope");
  });

  it("no-scope on an HTTP 403 that is not a rate limit", async () => {
    transport([{ status: 403, body: JSON.stringify({ message: "Resource not accessible by integration" }) }]);
    expect(await kindOf(() => resolveProject(ref))).toBe("no-scope");
  });

  it("no-token when GitHub rejects the credentials outright", async () => {
    transport([{ status: 401, body: JSON.stringify({ message: "Bad credentials" }) }]);
    expect(await kindOf(() => resolveProject(ref))).toBe("no-token");
  });

  it("rate-limited on an HTTP 429", async () => {
    transport([{ status: 429, body: "" }]);
    expect(await kindOf(() => resolveProject(ref))).toBe("rate-limited");
  });

  it("rate-limited on the 403 that carries the rate limit message", async () => {
    transport([{ status: 403, body: JSON.stringify({ message: "API rate limit exceeded for user ID 1." }) }]);
    expect(await kindOf(() => resolveProject(ref))).toBe("rate-limited");
  });

  it("rate-limited when it comes back as a GraphQL error instead", async () => {
    transport([graphQlErrors([{ type: "RATE_LIMITED", message: "API rate limit exceeded" }])]);
    expect(await kindOf(() => resolveProject(ref))).toBe("rate-limited");
  });

  it("not-found on an HTTP 404", async () => {
    transport([{ status: 404, body: JSON.stringify({ message: "Not Found" }) }]);
    expect(await kindOf(() => resolveProject(ref))).toBe("not-found");
  });

  it("graphql, with the first message, for anything else GitHub complains about", async () => {
    transport([graphQlErrors([{ message: "Argument 'number' on Field 'projectV2' has an invalid value." }])]);
    try {
      await resolveProject(ref);
      throw new Error("expected the call to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(GhBoardError);
      expect((e as GhBoardError).kind).toBe("graphql");
      expect((e as GhBoardError).message).toContain("invalid value");
    }
  });

  it("network when the request never gets out", async () => {
    setTransport({
      ...nullTransport,
      exec: async () => ({ code: 0, stdout: "ghp_secret", stderr: "" }),
      httpPost: async () => { throw new Error("getaddrinfo ENOTFOUND api.github.com"); },
    });
    expect(await kindOf(() => resolveProject(ref))).toBe("network");
  });

  it("network when what comes back is not JSON", async () => {
    transport([{ status: 200, body: "<html>captive portal</html>" }]);
    expect(await kindOf(() => resolveProject(ref))).toBe("network");
  });

  it("never puts the token in the message it throws", async () => {
    transport([{ status: 401, body: JSON.stringify({ message: "Bad credentials" }) }]);
    try {
      await resolveProject(ref);
    } catch (e) {
      expect((e as Error).message).not.toContain("ghp_secret");
    }
  });
});

/**
 * Where the token comes from. The CLI is the fallback and not the source: `gh` is not installed on
 * most machines, so a token typed in Configuración has to be enough on its own — and has to take
 * effect the moment it changes, which is the whole reason only the CLI's token is cached.
 */
describe("the token, and where it comes from", () => {
  const ref = { owner: "acme", number: 3 };

  const setConfigToken = (token: string | undefined) => {
    const { config } = useAppStore.getState();
    useAppStore.setState({ config: { ...config, boards: token === undefined ? undefined : { github: { token } } } });
  };

  afterEach(() => {
    setConfigToken(undefined);
  });

  it("uses the token from the config and never spawns gh", async () => {
    setConfigToken("github_pat_configured");
    const { posts, calls } = transport([orgReply]);
    await resolveProject(ref);
    expect(calls.token).toBe(0);
    expect(posts[0].headers.Authorization).toBe("Bearer github_pat_configured");
  });

  it("trims what was typed and ignores a field with only spaces in it", async () => {
    setConfigToken("  github_pat_padded  ");
    const { posts, calls } = transport([orgReply]);
    await resolveProject(ref);
    expect(calls.token).toBe(0);
    expect(posts[0].headers.Authorization).toBe("Bearer github_pat_padded");
  });

  it("falls back to gh auth token when the config has none", async () => {
    setConfigToken("");
    const { posts, calls } = transport([orgReply]);
    await resolveProject(ref);
    expect(calls.token).toBe(1);
    expect(posts[0].headers.Authorization).toBe("Bearer ghp_secret");
  });

  it("picks up a token changed in Configuración on the very next call", async () => {
    setConfigToken("github_pat_first");
    const { posts } = transport([orgReply]);
    await resolveProject(ref);
    setConfigToken("github_pat_second");
    await resolveProject(ref);
    expect(posts.map(p => p.headers.Authorization)).toEqual([
      "Bearer github_pat_first",
      "Bearer github_pat_second",
    ]);
  });

  it("goes back to the CLI when the field is emptied again", async () => {
    setConfigToken("github_pat_first");
    const { posts, calls } = transport([orgReply]);
    await resolveProject(ref);
    setConfigToken("");
    await resolveProject(ref);
    expect(calls.token).toBe(1);
    expect(posts[1].headers.Authorization).toBe("Bearer ghp_secret");
  });

  it("no-token when neither the config nor a logged-in gh has one", async () => {
    setConfigToken("");
    transport([orgReply], { code: 0, stdout: "", stderr: "" });
    expect(await kindOf(() => resolveProject(ref))).toBe("no-token");
  });

  it("no-cli when there is no config token and gh is not installed either", async () => {
    setConfigToken("");
    transport([orgReply], { code: 127, stdout: "", stderr: "bash: gh: command not found" });
    expect(await kindOf(() => resolveProject(ref))).toBe("no-cli");
  });

  it("never puts the configured token in the message it throws", async () => {
    setConfigToken("github_pat_configured");
    transport([{ status: 401, body: JSON.stringify({ message: "Bad credentials" }) }]);
    const message = await messageOf(() => resolveProject(ref));
    expect(message).not.toContain("github_pat_configured");
  });

  it("keeps the configured token out of every error the client can raise", async () => {
    setConfigToken("github_pat_configured");
    const failures: Array<() => { status: number; body: string }> = [
      () => ({ status: 403, body: JSON.stringify({ message: "Resource not accessible by integration" }) }),
      () => ({ status: 429, body: "" }),
      () => ({ status: 500, body: "" }),
      () => ({ status: 200, body: "<html>captive portal</html>" }),
      () => graphQlErrors([{ type: "INSUFFICIENT_SCOPES", message: "token has not been granted the required scopes" }]),
    ];
    for (const reply of failures) {
      transport([reply]);
      expect(await messageOf(() => resolveProject(ref))).not.toContain("github_pat_configured");
    }
  });
});
