import { Logger } from '../../core/logger';

const log = Logger.forComponent('HandlerRegistry');

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SendResponse = (response: any) => void;
export type MessageSender = chrome.runtime.MessageSender;

export type MessageHandler = (
  msg: any,
  sender: MessageSender,
  sendResponse: SendResponse,
) => Promise<void>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Open/Closed registry: register handlers for message types without modifying
 * the dispatch loop. Handlers are looked up by msg.type at O(1).
 */
export class MessageHandlerRegistry {
  private handlers = new Map<string, MessageHandler>();

  register(type: string, handler: MessageHandler): void {
    if (this.handlers.has(type)) {
      log.warn('register', `Overwriting handler for message type: ${type}`);
    }
    this.handlers.set(type, handler);
  }

  registerAll(entries: Record<string, MessageHandler>): void {
    for (const [type, handler] of Object.entries(entries)) {
      this.register(type, handler);
    }
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  async dispatch(
    msg: { type: string; [key: string]: unknown },
    sender: MessageSender,
    sendResponse: SendResponse,
  ): Promise<boolean> {
    const handler = this.handlers.get(msg.type);
    if (!handler) {return false;}

    await handler(msg, sender, sendResponse);
    return true;
  }

  get registeredTypes(): string[] {
    return [...this.handlers.keys()];
  }

  get size(): number {
    return this.handlers.size;
  }
}
