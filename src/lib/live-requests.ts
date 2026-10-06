// What an agent asks the user in the middle of a turn, while it waits: a permission for a tool
// call, or a form of questions (ACP `session/request_permission` and `elicitation/create`).
//
// Unlike an ```ask block, which ends the run and is answered by starting the next one, these hold
// the turn open until someone answers. So they live here, in memory, next to the promise the agent
// is waiting on — never on disk: a request does not outlive the process that asked it, and a run
// that ends (finished, stopped, crashed) takes its requests with it (`cancelLiveRequests`).
import { useSyncExternalStore } from "react";
import { touchRun } from "@/lib/stall";

/** One field of a question form, already reduced to what the card can draw. */
export interface LiveFormField {
  key: string;
  title: string;
  description?: string;
  kind: "choice" | "multi" | "text" | "number" | "boolean";
  options: { value: string; label: string; description?: string }[];
  required: boolean;
  default?: string | number | boolean | string[];
}

export interface LivePermissionOption {
  id: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
}

interface LiveBase {
  id: string;
  runId: string;
  projectId: string;
  agentId: string;
  createdAt: number;
}

export type LiveRequest =
  | (LiveBase & { kind: "permission"; title: string; detail?: string; options: LivePermissionOption[] })
  | (LiveBase & { kind: "form"; message: string; fields: LiveFormField[] });

export type LiveAnswer =
  | { kind: "permission"; optionId: string }
  | { kind: "form"; action: "accept"; content: Record<string, string | number | boolean | string[]> }
  | { kind: "form"; action: "decline" }
  /** Nobody will answer: the run ended, or the app is shutting it down. */
  | { kind: "cancelled" };

type NewLiveRequest =
  | Omit<Extract<LiveRequest, { kind: "permission" }>, "id" | "createdAt">
  | Omit<Extract<LiveRequest, { kind: "form" }>, "id" | "createdAt">;

let requests: LiveRequest[] = [];
const resolvers = new Map<string, (answer: LiveAnswer) => void>();
const listeners = new Set<() => void>();
let added: ((request: LiveRequest) => void) | null = null;

function publish(next: LiveRequest[]): void {
  requests = next;
  for (const listener of listeners) listener();
}

/** Called for every new request, so the app can tell the user someone is waiting on them. */
export function onLiveRequestAdded(handler: ((request: LiveRequest) => void) | null): void {
  added = handler;
}

/** Puts a request in front of the user and resolves with their answer. */
export function askLive(request: NewLiveRequest): Promise<LiveAnswer> {
  const full = { ...request, id: crypto.randomUUID(), createdAt: Date.now() } as LiveRequest;
  return new Promise(resolve => {
    resolvers.set(full.id, resolve);
    publish([...requests, full]);
    added?.(full);
  });
}

export function answerLive(id: string, answer: LiveAnswer): void {
  const request = requests.find(r => r.id === id);
  // The silence the agent kept while it waited was the user's, not its own: the clock starts again.
  if (request) touchRun(request.runId);
  const resolve = resolvers.get(id);
  resolvers.delete(id);
  if (requests.some(r => r.id === id)) publish(requests.filter(r => r.id !== id));
  resolve?.(answer);
}

/** Ends whatever a run still had waiting: nobody is going to answer a turn that is over. */
export function cancelLiveRequests(runId: string): void {
  for (const request of requests.filter(r => r.runId === runId)) answerLive(request.id, { kind: "cancelled" });
}

/** Whether a run is waiting on the user, which is not the same as having gone quiet. */
export function hasLiveRequest(runId: string): boolean {
  return requests.some(r => r.runId === runId);
}

export function liveRequests(): readonly LiveRequest[] {
  return requests;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every request waiting right now, in the order they were asked. */
export function useLiveRequests(): readonly LiveRequest[] {
  return useSyncExternalStore(subscribe, liveRequests, liveRequests);
}
