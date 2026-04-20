/**
 * Composition Root — single place where all dependencies are wired together.
 *
 * service-worker.ts calls createMessageRegistry() to get a fully-wired
 * MessageHandlerRegistry. All handler modules register their handlers here.
 * Adding a new message type = add a handler function + register it below.
 */
import { MessageHandlerRegistry } from './handlers/registry';

export function createMessageRegistry(): MessageHandlerRegistry {
  const registry = new MessageHandlerRegistry();

  // Handler modules will be registered here in C3.4.
  // Each domain module exports a function:
  //   registerXxxHandlers(registry: MessageHandlerRegistry): void
  //
  // Example:
  //   registerSearchHandlers(registry);
  //   registerSettingsHandlers(registry);
  //   registerIndexHandlers(registry);
  //   registerOllamaHandlers(registry);
  //   registerDiagnosticsHandlers(registry);
  //   registerTabHandlers(registry);
  //   registerBrowserHandlers(registry);

  return registry;
}
