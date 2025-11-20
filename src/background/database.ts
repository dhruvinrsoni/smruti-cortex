// database.ts — Hybrid storage layer with auto-detection for IndexedDB

import { browserAPI } from "../core/helpers";
import { IndexedItem } from "./schema";
import { DB_NAME } from "../core/constants";
import { Logger } from "../core/logger";

const DB_VERSION = 1;
const STORE_NAME = "pages";

let dbInstance: IDBDatabase | null = null;

// ------------------------------
// IndexedDB Init
// ------------------------------
export function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        Logger.debug("Opening database...");
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            Logger.error("Open error:", request.error);
            reject(request.error);
        };
        request.onsuccess = () => {
            dbInstance = request.result;
            Logger.debug("Database opened successfully");
            resolve(dbInstance);
        };

        request.onupgradeneeded = () => {
            Logger.trace("Database upgrade needed, creating object store");
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "url" });
                store.createIndex("title", "title", { unique: false });
                store.createIndex("hostname", "hostname", { unique: false });
                store.createIndex("lastVisit", "lastVisit", { unique: false });
                store.createIndex("visitCount", "visitCount", { unique: false });
                Logger.trace("Object store and indexes created");
            }
        };
    });
}

// ------------------------------
// Add or Update Page Entry
// ------------------------------
export async function saveIndexedItem(item: IndexedItem): Promise<void> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, "readwrite");
        const store = txn.objectStore(STORE_NAME);
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ------------------------------
// Query Pages
// ------------------------------
export async function getAllIndexedItems(): Promise<IndexedItem[]> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, "readonly");
        const store = txn.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result as IndexedItem[]);
        req.onerror = () => reject(req.error);
    });
}

// database.ts — Hybrid storage layer with auto-detection for IndexedDB
// [existing imports and code above remain the same]

/* === ADD THESE FUNCTIONS INTO database.ts (below saveIndexedItem/getAllIndexedItems) === */

// Get single item by URL (key)
export async function getIndexedItem(url: string): Promise<IndexedItem | null> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, "readonly");
        const store = txn.objectStore(STORE_NAME);
        const req = store.get(url);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
}

// Delete item by URL
export async function deleteIndexedItem(url: string): Promise<void> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, "readwrite");
        const store = txn.objectStore(STORE_NAME);
        const req = store.delete(url);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// -------------------------------------------------------------------
// chrome.storage.local for settings (universal across all browsers)
// -------------------------------------------------------------------
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
    return new Promise((resolve) => {
        browserAPI.storage.local.get([key], (result) => {
            resolve(result[key] ?? defaultValue);
        });
    });
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve) => {
        browserAPI.storage.local.set({ [key]: value }, () => resolve());
    });
}