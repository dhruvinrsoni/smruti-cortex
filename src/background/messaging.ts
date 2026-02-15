// messaging.ts — message router between popup and service worker

import { browserAPI } from '../core/helpers';
import { runSearch } from './search/search-engine';
import { ingestHistory } from './indexing';
import { mergeMetadata } from './indexing';
import { Logger } from '../core/logger';

export function setupMessaging() {
    Logger.debug('Messaging script loaded, setting up listener');

    // Handle port disconnections gracefully
    browserAPI.runtime.onConnect.addListener((port) => {
        port.onDisconnect.addListener(() => {
            // Suppress the lastError by checking it
            if (browserAPI.runtime.lastError) {
                // Port disconnected - this is expected when page unloads
                Logger.trace('Port disconnected (expected):', browserAPI.runtime.lastError.message);
            }
        });
    });

    browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        Logger.debug('Message listener triggered with message:', msg);
        Logger.trace('Sender:', sender);
        (async () => {
            Logger.trace('Processing message asynchronously');
            try {
                Logger.debug('Message type:', msg.type);
                switch (msg.type) {
                    case 'SEARCH_QUERY': {
                        Logger.debug('Handling SEARCH_QUERY for:', msg.query);
                        const results = await runSearch(msg.query);
                        Logger.debug('Search completed, results count:', results.length);
                        // Check if port is still open before responding
                        try {
                            sendResponse({ results });
                        } catch (err) {
                            Logger.trace('Failed to send response (port may be closed)');
                        }
                        break;
                    }

                    case 'GET_RECENT_HISTORY': {
                        Logger.debug('Handling GET_RECENT_HISTORY, limit:', msg.limit || 50);
                        const { getRecentIndexedItems } = await import('./database');
                        const recentItems = await getRecentIndexedItems(msg.limit || 50);
                        Logger.debug('GET_RECENT_HISTORY completed, items count:', recentItems.length);
                        try {
                            sendResponse({ results: recentItems });
                        } catch (err) {
                            Logger.trace('Failed to send response (port may be closed)');
                        }
                        break;
                    }

                    case 'REBUILD_INDEX':
                        Logger.info('Handling REBUILD_INDEX - starting history ingestion');
                        await ingestHistory();
                        Logger.info('REBUILD_INDEX completed');
                        sendResponse({ status: 'OK' });
                        break;

                    // inside messaging onMessage handler
                    case 'METADATA_CAPTURE': {
                        Logger.debug('Handling METADATA_CAPTURE for:', msg.payload.url);
                        const { payload } = msg;
                        // call mergeMetadata (implementation in indexing.ts)
                        await mergeMetadata(payload.url, {
                            description: payload.metaDescription,
                            keywords: payload.metaKeywords
                        });
                        Logger.debug('METADATA_CAPTURE processed for:', payload.url);
                        sendResponse({ status: 'ok' });
                        break;
                    }

                    default:
                        Logger.warn('Unknown message type received:', msg.type);
                        sendResponse({ error: 'Unknown message type' });
                }
                Logger.trace('Message processing completed');
            } catch (error) {
                Logger.error('Error processing message:', error);
                sendResponse({ error: error.message });
            }
        })();
        Logger.trace('Returning true for async response');
        return true; // async response
    });
}