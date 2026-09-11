import type { BridgeButton } from "./actions";

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
  /**
   * The token of a button that was pressed, when this came from a press rather than from typing.
   *
   * A press arrives through the same door as a message on purpose: the allowlist is checked in one
   * place, and a button cannot become a way past it. What it means is decided by
   * `parseActionToken`, not by the platform.
   */
  action?: string;
}

/**
 * The provider contract. Text strings back and forth, plus the buttons that can go under one.
 * Who can speak, what it means, and what happens next is decided by the runner.
 */
export interface BridgeProvider {
  id: BridgeProviderId;
  start(onMessage: (m: IncomingMessage) => void | Promise<void>): Promise<void>;
  stop(): Promise<void>;
  /** `buttons` is a request, not a promise: a platform that cannot draw them still sends the text. */
  send(chatId: string, text: string, buttons?: BridgeButton[]): Promise<void>;
}

export type { BridgeButton };
