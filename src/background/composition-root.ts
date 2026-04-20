/**
 * Composition Root — single place where all dependencies are wired together.
 *
 * service-worker.ts calls createRegistries() to get fully-wired
 * MessageHandlerRegistry instances. Adding a new message type =
 * add a handler function in the appropriate handler module + register it.
 */
import { MessageHandlerRegistry } from './handlers/registry';
import { registerSettingsHandlers } from './handlers/settings-handlers';
import { registerSearchHandlers } from './handlers/search-handlers';
import { registerOllamaHandlers } from './handlers/ollama-handlers';
import { registerDiagnosticsPreInitHandlers, registerDiagnosticsPostInitHandlers } from './handlers/diagnostics-handlers';
import { registerCommandHandlers } from './handlers/command-handlers';

export interface ServiceRegistries {
  preInit: MessageHandlerRegistry;
  postInit: MessageHandlerRegistry;
}

export function createRegistries(): ServiceRegistries {
  const preInit = new MessageHandlerRegistry();
  const postInit = new MessageHandlerRegistry();

  registerSettingsHandlers(preInit, postInit);
  registerDiagnosticsPreInitHandlers(preInit);

  registerSearchHandlers(postInit);
  registerOllamaHandlers(postInit);
  registerDiagnosticsPostInitHandlers(postInit);
  registerCommandHandlers(postInit);

  return { preInit, postInit };
}
