/**
 * Cache Summary Index
 *
 * Maintains a searchable index of all cached items with metadata.
 *
 * **Simple explanation**: Like a card catalog in a library - instead of
 * searching through every book, you check the catalog first to find what
 * you need quickly.
 *
 * @module cache/index
 * @since MT-004.3
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';
import { CACHE_DIRS, CACHE_FILES } from './structure';
import { CachedPayload } from './storage';

/**
 * Metadata for a cached item in the index.
 */
export interface CacheIndexItem {
    /** Hash of the payload */
    hash: string;
    /** Source of the payload */
    source: string;
    /** Type/category */
    type: string;
    /** When it was cached */
    cachedAt: string;
    /** When last accessed */
    lastAccessedAt?: string;
    /** Size in bytes */
    sizeBytes: number;
    /** Access count */
    accessCount: number;
    /** Optional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Structure of the cache index file.
 */
export interface CacheIndex {
    /** Index format version */
    version: string;
    /** When the index was created */
    createdAt: string;
    /** When the index was last updated */
    updatedAt: string;
    /** Total number of items */
    totalItems: number;
    /** Total size in bytes */
    totalSizeBytes: number;
    /** Array of cached items */
    items: CacheIndexItem[];
}

/**
 * Search filters for querying the cache index.
 */
export interface CacheSearchFilters {
    /** Filter by source */
    source?: string;
    /** Filter by type */
    type?: string;
    /** Filter by date range (items cached after this date) */
    cachedAfter?: Date;
    /** Filter by date range (items cached before this date) */
    cachedBefore?: Date;
    /** Minimum size in bytes */
    minSize?: number;
    /** Maximum size in bytes */
    maxSize?: number;
}

/**
 * Get the path to the cache index file.
 *
 * @param context - VS Code extension context
 * @returns Full path to cache-index.json
 */
function getIndexPath(context: vscode.ExtensionContext): string {
    return path.join(
        context.extensionPath,
        CACHE_DIRS.OFFLINE_CACHE,
        CACHE_FILES.INDEX
    );
}

/**
 * Load the cache index from disk.
 *
 * **Simple explanation**: Opens the card catalog to see what's been filed.
 * If the catalog doesn't exist, creates a new empty one.
 *
 * @param context - VS Code extension context
 * @returns Cache index object
 */
export function loadCacheIndex(context: vscode.ExtensionContext): CacheIndex {
    const indexPath = getIndexPath(context);

    try {
        if (!fs.existsSync(indexPath)) {
            // Create new index if it doesn't exist
            const newIndex: CacheIndex = {
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalItems: 0,
                totalSizeBytes: 0,
                items: [],
            };
            saveCacheIndex(context, newIndex);
            return newIndex;
        }

        const content = fs.readFileSync(indexPath, 'utf-8');
        const index = JSON.parse(content) as CacheIndex;
        return index;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to load cache index: ${msg}`);
        // Return empty index on error
        return {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalItems: 0,
            totalSizeBytes: 0,
            items: [],
        };
    }
}

/**
 * Save the cache index to disk.
 *
 * @param context - VS Code extension context
 * @param index - Index to save
 * @returns true if successful
 */
export function saveCacheIndex(
    context: vscode.ExtensionContext,
    index: CacheIndex
): boolean {
    const indexPath = getIndexPath(context);

    try {
        // Update metadata
        index.updatedAt = new Date().toISOString();
        index.totalItems = index.items.length;
        index.totalSizeBytes = index.items.reduce(
            (sum, item) => sum + item.sizeBytes,
            0
        );

        // Write to file
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
        return true;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to save cache index: ${msg}`);
        return false;
    }
}

/**
 * Add an item to the cache index.
 *
 * **Simple explanation**: Adds a new card to the catalog when a document
 * is filed. If the card already exists, updates it instead.
 *
 * @param context - VS Code extension context
 * @param payload - Cached payload to index
 * @param sizeBytes - Size of the payload file in bytes
 * @returns true if successful
 */
export function addToIndex(
    context: vscode.ExtensionContext,
    payload: CachedPayload,
    sizeBytes: number
): boolean {
    try {
        const index = loadCacheIndex(context);

        // Check if already in index
        const existingIndex = index.items.findIndex(
            item => item.hash === payload.hash
        );

        if (existingIndex !== -1) {
            // Update existing item
            index.items[existingIndex].lastAccessedAt = new Date().toISOString();
            index.items[existingIndex].accessCount += 1;
            logInfo(`Updated cache index for ${payload.hash}`);
        } else {
            // Add new item
            const newItem: CacheIndexItem = {
                hash: payload.hash,
                source: payload.source,
                type: payload.type,
                cachedAt: payload.cachedAt,
                lastAccessedAt: payload.cachedAt,
                sizeBytes,
                accessCount: 1,
                metadata: payload.metadata,
            };
            index.items.push(newItem);
            logInfo(`Added ${payload.hash} to cache index`);
        }

        return saveCacheIndex(context, index);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to add to cache index: ${msg}`);
        return false;
    }
}

/**
 * Remove an item from the cache index.
 *
 * @param context - VS Code extension context
 * @param hash - Hash of the item to remove
 * @returns true if successful
 */
export function removeFromIndex(
    context: vscode.ExtensionContext,
    hash: string
): boolean {
    try {
        const index = loadCacheIndex(context);
        const initialCount = index.items.length;

        index.items = index.items.filter(item => item.hash !== hash);

        if (index.items.length < initialCount) {
            logInfo(`Removed ${hash} from cache index`);
            return saveCacheIndex(context, index);
        }

        return false; // Item not found
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to remove from cache index: ${msg}`);
        return false;
    }
}

/**
 * Search the cache index with filters.
 *
 * **Simple explanation**: Like searching the card catalog with specific criteria
 * (e.g., "show me all books from 2023 about science").
 *
 * @param context - VS Code extension context
 * @param filters - Search filters
 * @returns Array of matching cache items
 */
export function searchIndex(
    context: vscode.ExtensionContext,
    filters: CacheSearchFilters
): CacheIndexItem[] {
    try {
        const index = loadCacheIndex(context);
        let results = [...index.items];

        // Apply filters
        if (filters.source) {
            results = results.filter(item => item.source === filters.source);
        }

        if (filters.type) {
            results = results.filter(item => item.type === filters.type);
        }

        if (filters.cachedAfter) {
            results = results.filter(
                item => new Date(item.cachedAt) >= filters.cachedAfter!
            );
        }

        if (filters.cachedBefore) {
            results = results.filter(
                item => new Date(item.cachedAt) <= filters.cachedBefore!
            );
        }

        if (filters.minSize !== undefined) {
            results = results.filter(item => item.sizeBytes >= filters.minSize!);
        }

        if (filters.maxSize !== undefined) {
            results = results.filter(item => item.sizeBytes <= filters.maxSize!);
        }

        return results;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to search cache index: ${msg}`);
        return [];
    }
}

/**
 * Get an item from the index by hash.
 *
 * @param context - VS Code extension context
 * @param hash - Hash of the item to find
 * @returns Cache index item or null if not found
 */
export function getIndexItem(
    context: vscode.ExtensionContext,
    hash: string
): CacheIndexItem | null {
    try {
        const index = loadCacheIndex(context);
        return index.items.find(item => item.hash === hash) ?? null;
    } catch {
        return null;
    }
}

/**
 * Update the last accessed time for an item.
 *
 * @param context - VS Code extension context
 * @param hash - Hash of the item
 * @returns true if successful
 */
export function updateLastAccessed(
    context: vscode.ExtensionContext,
    hash: string
): boolean {
    try {
        const index = loadCacheIndex(context);
        const item = index.items.find(i => i.hash === hash);

        if (item) {
            item.lastAccessedAt = new Date().toISOString();
            item.accessCount += 1;
            return saveCacheIndex(context, index);
        }

        return false;
    } catch {
        return false;
    }
}

/**
 * Get cache statistics from the index.
 *
 * @param context - VS Code extension context
 * @returns Summary statistics
 */
export function getCacheStats(context: vscode.ExtensionContext): {
    totalItems: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    oldestItem: string | null;
    newestItem: string | null;
    bySource: Record<string, number>;
    byType: Record<string, number>;
} {
    try {
        const index = loadCacheIndex(context);

        const bySource: Record<string, number> = {};
        const byType: Record<string, number> = {};
        let oldest: CacheIndexItem | null = null;
        let newest: CacheIndexItem | null = null;

        for (const item of index.items) {
            bySource[item.source] = (bySource[item.source] || 0) + 1;
            byType[item.type] = (byType[item.type] || 0) + 1;

            const cachedAt = new Date(item.cachedAt);
            if (!oldest || cachedAt < new Date(oldest.cachedAt)) {
                oldest = item;
            }
            if (!newest || cachedAt > new Date(newest.cachedAt)) {
                newest = item;
            }
        }

        return {
            totalItems: index.totalItems,
            totalSizeBytes: index.totalSizeBytes,
            totalSizeMB: Math.round((index.totalSizeBytes / (1024 * 1024)) * 100) / 100,
            oldestItem: oldest?.cachedAt ?? null,
            newestItem: newest?.cachedAt ?? null,
            bySource,
            byType,
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to get cache stats: ${msg}`);
        return {
            totalItems: 0,
            totalSizeBytes: 0,
            totalSizeMB: 0,
            oldestItem: null,
            newestItem: null,
            bySource: {},
            byType: {},
        };
    }
}
