// ACP client: talks to an agent that speaks the Agent Client Protocol over the stdio of a run
// started with `keepStdinOpen`. See src/lib/acp/session.ts for the entry point.
export { runAcpPrompt } from "@/lib/acp/session";
export type { AcpPromptOptions, AcpPromptResult } from "@/lib/acp/session";
export { createRunStream } from "@/lib/acp/stream";
export type { RunStream, RunStreamOptions } from "@/lib/acp/stream";
export { eventsFromSessionUpdate } from "@/lib/acp/events";
