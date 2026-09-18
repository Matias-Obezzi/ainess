// Everything this app knows about talking to GitHub Projects v2, and nothing about boards.
//
// It lives next to the provider rather than inside it because the two fail in completely different
// ways and are worth testing apart: this file is about a CLI that may not be installed, a token
// that may not carry the right scope, pagination and rate limits, while the provider above it is
// about columns, merges and `Task`. With the seam on top, every one of those cases would need a
// project, a store and a board to reproduce; here a fake transport and a JSON string are enough.
//
// Nothing here is user-facing text: the messages are English log lines, which is what CLAUDE.md
// says belongs in the source. The provider turns a `kind` into a translated sentence, not a string.
import { getTransport } from "@/lib/transport";

const GRAPHQL_URL = "https://api.github.com/graphql";

/**
 * Items are read a hundred at a time — the most the API gives in one page — and never more than
 * `MAX_PAGES` of them. The cap is not about size: a cursor that stops advancing, or a board being
 * written to while we read it, turns `hasNextPage` into a loop that never ends, and a request loop
 * against a live API burns the rate limit for every other feature that shares the token. Twenty
 * pages is two thousand cards, far past any board a person actually reads.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/** How many fields of a project, and how many set values of an item, are read in one go. */
const FIELD_PAGE_SIZE = 50;

export type GhBoardErrorKind =
  | "no-cli"
  | "no-token"
  | "no-scope"
  | "not-found"
  | "rate-limited"
  | "network"
  | "graphql";

/**
 * Every failure of this module, with what went wrong as a field rather than as a sentence.
 *
 * The provider above has to tell "set up your token" from "GitHub is down": the first is something
 * the user fixes and the board can say so, the second is something to retry while the board goes
 * stale. A plain `Error` would leave it matching on message text, which changes the day GitHub
 * rewords an error and breaks without anything noticing.
 */
export class GhBoardError extends Error {
  readonly kind: GhBoardErrorKind;

  constructor(kind: GhBoardErrorKind, message: string) {
    super(message);
    this.name = "GhBoardError";
    this.kind = kind;
  }
}

export interface GhProjectRef {
  owner: string;
  number: number;
}

export interface GhProject {
  id: string;
  title: string;
  /** The single select field the columns map to, when the project has one. */
  statusFieldId?: string;
  statusOptions: Array<{ id: string; name: string }>;
}

export interface GhItem {
  /** The `ProjectV2Item` id: what the board mutations take. */
  id: string;
  /**
   * The `DraftIssue` id, present only on draft items. It is not the same id as `id`, and
   * `updateProjectV2DraftIssue` takes this one: editing a draft goes through its content, not
   * through the card that shows it.
   */
  draftId?: string;
  /** Whether the card is a draft this app can edit, rather than a real issue or pull request. */
  isDraft: boolean;
  title: string;
  body: string;
  statusOptionId?: string;
  updatedAt: number;
  url?: string;
  /** Archived items stay in the project and are not on the board. Left for the caller to decide. */
  isArchived: boolean;
}

// -------------------------------------------------------------------------------------------
// The token, and the one request everything goes through.
// -------------------------------------------------------------------------------------------

/**
 * Asked of `gh` once and kept: the board polls, and spawning a process per request would cost more
 * than the request. Never logged, never put in an error message.
 */
let cachedToken: string | null = null;

/** Forgets the token. For the tests, and for whoever re-authenticates without restarting. */
export function clearGhTokenCache(): void {
  cachedToken = null;
}

/** Whether what `gh` printed on stderr reads as "that program is not here". */
function readsAsMissingCli(stderr: string): boolean {
  const text = stderr.toLowerCase();
  return text.includes("not found")
    || text.includes("not recognized")
    || text.includes("no such file")
    || text.includes("enoent");
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function ghToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  let result: { code: number | null; stdout: string; stderr: string };
  try {
    result = await getTransport().exec("gh", ["auth", "token"]);
  } catch (e) {
    throw new GhBoardError("no-cli", `could not run the gh CLI: ${describe(e)}`);
  }

  // `code: null` is what a transport with no processes behind it answers (the browser preview).
  if (result.code === null) {
    throw new GhBoardError("no-cli", "the gh CLI did not run here");
  }
  if (result.code !== 0) {
    const stderr = result.stderr.trim();
    if (readsAsMissingCli(stderr)) {
      throw new GhBoardError("no-cli", `the gh CLI is not installed: ${stderr}`);
    }
    throw new GhBoardError("no-token", `gh auth token failed: ${stderr || `exit code ${result.code}`}`);
  }

  const token = result.stdout.trim();
  if (!token) {
    throw new GhBoardError("no-token", "gh auth token printed nothing; run `gh auth login`");
  }
  cachedToken = token;
  return token;
}

interface GraphQlError {
  message?: string;
  type?: string;
}

/** An HTTP status that never carried a GraphQL body, as the kind it really is. */
function fromStatus(status: number, body: string): GhBoardError {
  const text = body.toLowerCase();
  const rateLimited = text.includes("rate limit") || text.includes("abuse detection");
  if (status === 429 || (status === 403 && rateLimited)) {
    return new GhBoardError("rate-limited", `GitHub is rate limiting this token (HTTP ${status})`);
  }
  if (status === 401) {
    const kind = text.includes("scope") ? "no-scope" : "no-token";
    return new GhBoardError(kind, `GitHub rejected the token (HTTP ${status})`);
  }
  // A 403 that is not a rate limit is a permission the token does not have; for Projects v2 that is
  // always the `project` scope (`read:project` for the queries alone).
  if (status === 403) {
    return new GhBoardError("no-scope", "the token is missing the `project` scope (HTTP 403)");
  }
  if (status === 404) {
    return new GhBoardError("not-found", "the GitHub GraphQL API answered HTTP 404");
  }
  return new GhBoardError("network", `the GitHub GraphQL API answered HTTP ${status}`);
}

/**
 * A GraphQL `errors[]` as the kind it really is. GitHub answers a missing scope and a missing
 * project with HTTP 200 and an error entry, so this is the path that actually runs, not the status
 * one above it.
 */
function fromGraphQlErrors(errors: GraphQlError[]): GhBoardError {
  for (const error of errors) {
    const type = (error.type || "").toUpperCase();
    const message = error.message || "";
    if (type === "INSUFFICIENT_SCOPES" || /\bscopes?\b/i.test(message)) {
      return new GhBoardError("no-scope", message || "the token is missing the `project` scope");
    }
    if (type === "RATE_LIMITED" || /rate limit/i.test(message)) {
      return new GhBoardError("rate-limited", message || "GitHub is rate limiting this token");
    }
    if (type === "NOT_FOUND") {
      return new GhBoardError("not-found", message || "GitHub could not resolve that project");
    }
  }
  return new GhBoardError("graphql", errors[0]?.message || "the GitHub GraphQL API answered with an error");
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await ghToken();

  let response: { status: number; body: string };
  try {
    response = await getTransport().httpPost(GRAPHQL_URL, JSON.stringify({ query, variables }), {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "AIS",
    });
  } catch (e) {
    throw new GhBoardError("network", `could not reach the GitHub GraphQL API: ${describe(e)}`);
  }

  if (response.status !== 200) throw fromStatus(response.status, response.body);

  let parsed: { data?: T; errors?: GraphQlError[] };
  try {
    parsed = JSON.parse(response.body) as { data?: T; errors?: GraphQlError[] };
  } catch {
    // A body that is not JSON on a 200 is a proxy or a captive portal, never GitHub.
    throw new GhBoardError("network", "the GitHub GraphQL API answered something that is not JSON");
  }

  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) throw fromGraphQlErrors(parsed.errors);
  if (!parsed.data) throw new GhBoardError("graphql", "the GitHub GraphQL API answered without data");
  return parsed.data;
}

// -------------------------------------------------------------------------------------------
// Resolving a project.
// -------------------------------------------------------------------------------------------

const PROJECT_PARTS = `fragment ProjectParts on ProjectV2 {
  id
  title
  fields(first: ${FIELD_PAGE_SIZE}) {
    nodes {
      ... on ProjectV2SingleSelectField { id name options { id name } }
    }
  }
}`;

const ORG_PROJECT_QUERY = `${PROJECT_PARTS}
query($owner: String!, $number: Int!) {
  organization(login: $owner) { projectV2(number: $number) { ...ProjectParts } }
}`;

const USER_PROJECT_QUERY = `${PROJECT_PARTS}
query($owner: String!, $number: Int!) {
  user(login: $owner) { projectV2(number: $number) { ...ProjectParts } }
}`;

interface RawSingleSelectField {
  id?: string;
  name?: string;
  options?: Array<{ id?: string; name?: string } | null>;
}

interface RawProject {
  id: string;
  title?: string;
  fields?: { nodes?: Array<RawSingleSelectField | null> | null } | null;
}

/**
 * Which single select field the columns map to. GitHub calls it "Status" on every board made from
 * a template, and when it was renamed the only other honest guess is the first single select field
 * — a project with none of them has no columns at all.
 */
function pickStatusField(project: RawProject): RawSingleSelectField | undefined {
  const fields = (project.fields?.nodes || []).filter(
    (f): f is RawSingleSelectField => !!f && Array.isArray(f.options) && typeof f.id === "string",
  );
  return fields.find(f => (f.name || "").toLowerCase() === "status") || fields[0];
}

function toProject(raw: RawProject): GhProject {
  const status = pickStatusField(raw);
  return {
    id: raw.id,
    title: raw.title || "",
    statusFieldId: status?.id,
    statusOptions: (status?.options || [])
      .filter((o): o is { id: string; name: string } => typeof o?.id === "string" && typeof o?.name === "string")
      .map(o => ({ id: o.id, name: o.name })),
  };
}

/**
 * The project behind `owner/number`, with its status field and every option of it.
 *
 * The field comes along because no column can be mapped without it, and asking for it separately
 * would be a second round trip for something no caller can work without.
 *
 * An owner is either an organisation or a user and the API has a different root field for each, so
 * the organisation is tried first and a personal project falls through to the second query. They
 * are two requests rather than one aliased query on purpose: a combined query would lean on GitHub
 * returning partial data next to a NOT_FOUND error, and this runs once per board, not per card.
 */
export async function resolveProject(ref: GhProjectRef): Promise<GhProject> {
  const variables = { owner: ref.owner, number: ref.number };

  let raw: RawProject | null = null;
  try {
    const data = await graphql<{ organization?: { projectV2?: RawProject | null } | null }>(ORG_PROJECT_QUERY, variables);
    raw = data.organization?.projectV2 || null;
  } catch (e) {
    // Only "there is no organisation by that name" is worth trying the other root field for.
    if (!(e instanceof GhBoardError) || e.kind !== "not-found") throw e;
  }

  if (!raw) {
    const data = await graphql<{ user?: { projectV2?: RawProject | null } | null }>(USER_PROJECT_QUERY, variables);
    raw = data.user?.projectV2 || null;
  }

  if (!raw?.id) {
    throw new GhBoardError("not-found", `no project number ${ref.number} under "${ref.owner}"`);
  }
  return toProject(raw);
}

// -------------------------------------------------------------------------------------------
// Reading the items.
// -------------------------------------------------------------------------------------------

const ITEMS_QUERY = `query($projectId: ID!, $cursor: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: ${PAGE_SIZE}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          isArchived
          updatedAt
          content {
            ... on DraftIssue { id title body }
            ... on Issue { title body url }
            ... on PullRequest { title body url }
          }
          fieldValues(first: ${FIELD_PAGE_SIZE}) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                optionId
                field { ... on ProjectV2FieldCommon { id } }
              }
            }
          }
        }
      }
    }
  }
}`;

interface RawFieldValue {
  optionId?: string | null;
  field?: { id?: string } | null;
}

interface RawItem {
  id: string;
  type?: string;
  isArchived?: boolean;
  updatedAt?: string;
  content?: { id?: string; title?: string; body?: string; url?: string } | null;
  fieldValues?: { nodes?: Array<RawFieldValue | null> | null } | null;
}

interface RawItemsPage {
  node?: {
    items?: {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
      nodes?: Array<RawItem | null> | null;
    } | null;
  } | null;
}

function toItem(raw: RawItem, statusFieldId?: string): GhItem {
  const isDraft = raw.type === "DRAFT_ISSUE";
  const values = (raw.fieldValues?.nodes || []).filter((v): v is RawFieldValue => !!v && typeof v.optionId === "string");
  // Only the value of the field we were told is the status: a project can have a Priority and a
  // Size single select too, and taking whichever came first would file cards under the wrong column.
  const status = statusFieldId ? values.find(v => v.field?.id === statusFieldId) : undefined;
  const updatedAt = Date.parse(raw.updatedAt || "");

  return {
    id: raw.id,
    draftId: isDraft ? raw.content?.id : undefined,
    isDraft,
    title: raw.content?.title || "",
    body: raw.content?.body || "",
    statusOptionId: status?.optionId || undefined,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    url: raw.content?.url,
    isArchived: raw.isArchived === true,
  };
}

/**
 * Every item of the project, page by page.
 *
 * Without `statusFieldId` the items come back with no `statusOptionId`: guessing which single
 * select is the status would silently put cards in a column they are not in, which is worse than
 * having no column at all. `resolveProject` is where that id comes from.
 */
export async function listItems(projectId: string, statusFieldId?: string): Promise<GhItem[]> {
  const items: GhItem[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    // Annotated rather than inferred: `cursor` is written from this very response further down,
    // and without the annotation the inference walks in a circle (TS7022).
    const data: RawItemsPage = await graphql<RawItemsPage>(ITEMS_QUERY, { projectId, cursor });
    const connection = data.node?.items;
    if (!connection) {
      throw new GhBoardError("not-found", `no project with id ${projectId}`);
    }
    for (const node of connection.nodes || []) {
      if (node?.id) items.push(toItem(node, statusFieldId));
    }
    const pageInfo = connection.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
  }

  return items;
}

// -------------------------------------------------------------------------------------------
// Writing.
// -------------------------------------------------------------------------------------------

const ADD_DRAFT_MUTATION = `mutation($projectId: ID!, $title: String!, $body: String!) {
  addProjectV2DraftIssue(input: { projectId: $projectId, title: $title, body: $body }) {
    projectItem {
      id
      type
      isArchived
      updatedAt
      content { ... on DraftIssue { id title body } }
    }
  }
}`;

const UPDATE_DRAFT_MUTATION = `mutation($draftId: ID!, $title: String!, $body: String!) {
  updateProjectV2DraftIssue(input: { draftIssueId: $draftId, title: $title, body: $body }) {
    draftIssue { id }
  }
}`;

const SET_STATUS_MUTATION = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId
    itemId: $itemId
    fieldId: $fieldId
    value: { singleSelectOptionId: $optionId }
  }) {
    projectV2Item { id }
  }
}`;

const DELETE_ITEM_MUTATION = `mutation($projectId: ID!, $itemId: ID!) {
  deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) { deletedItemId }
}`;

/** Opens a draft card and answers with it as `listItems` would have read it. */
export async function addDraftItem(projectId: string, title: string, body: string): Promise<GhItem> {
  const data = await graphql<{ addProjectV2DraftIssue?: { projectItem?: RawItem | null } | null }>(
    ADD_DRAFT_MUTATION,
    { projectId, title, body },
  );
  const created = data.addProjectV2DraftIssue?.projectItem;
  if (!created?.id) {
    throw new GhBoardError("graphql", "GitHub accepted the draft item and answered without one");
  }
  return toItem(created);
}

/**
 * Edits a draft card. Takes the `DraftIssue` id (`GhItem.draftId`) and not the item id, because
 * that is what `updateProjectV2DraftIssue` takes: the text belongs to the draft, and the item is
 * only where the project shows it.
 */
export async function updateDraftItem(draftId: string, title: string, body: string): Promise<void> {
  await graphql(UPDATE_DRAFT_MUTATION, { draftId, title, body });
}

/** Moves a card to a column, which for Projects v2 is one option of the status field. */
export async function setItemStatus(
  projectId: string,
  itemId: string,
  statusFieldId: string,
  optionId: string,
): Promise<void> {
  await graphql(SET_STATUS_MUTATION, { projectId, itemId, fieldId: statusFieldId, optionId });
}

/** Removes the card from the project. An issue behind it stays an issue. */
export async function deleteItem(projectId: string, itemId: string): Promise<void> {
  await graphql(DELETE_ITEM_MUTATION, { projectId, itemId });
}
