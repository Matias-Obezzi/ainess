/**
 * Which chat platform this provider connects to.
 * The provider itself knows nothing about the app's business logic, only how to talk to the platform.
 */
export type BridgeProviderId = "telegram" | "discord" | "slack";

/**
 * A raw message received from the platform.
 */
export interface IncomingMessage {
  chatId: string;
  text: string;
  from?: string;
}

/**
 * The provider contract. It only shuttles text strings back and forth.
 * Who can speak, what it means, and what happens next is decided by the runner.
 */
export interface BridgeProvider {
  id: BridgeProviderId;
  start(onMessage: (m: IncomingMessage) => void | Promise<void>): Promise<void>;
  stop(): Promise<void>;
  send(chatId: string, text: string): Promise<void>;
}
