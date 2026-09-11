// Putting a chat's file back together with what happened while it was being read.
//
// Loading a chat is a file read, and a file read takes time. Sending a message in that window
// appends to memory, and the read then landed on top of it: the message you had just sent, and the
// bubble the agent was answering into, were replaced by a file written before either existed.
//
// Memory wins. The guard in `loadChatMessages` means we only get here when the chat had nothing in
// memory to begin with, so anything in memory now arrived during the read and is newer than every
// line of the file — which makes "the file first, then memory" the true order and not a guess.
import type { ChatMessage } from "@/types";

/** The file's messages and memory's, in order, with nothing lost and nothing shown twice. */
export function mergeLoaded(fromFile: ChatMessage[], inMemory: ChatMessage[]): ChatMessage[] {
  if (inMemory.length === 0) return fromFile;
  const have = new Set(inMemory.map(m => m.id));
  const older = fromFile.filter(m => !have.has(m.id));
  return older.length === 0 ? inMemory : [...older, ...inMemory];
}
