/**
 * Cache Size Threshold Pruning
 *
 * Removes least recently used (LRU) cache items when total size exceeds threshold.
 *
 * **Simple explanation**: Like cleaning out your closet when it gets too full -
 * you get rid of the clothes you haven't worn in the longest time first.
 *
 * @module cache/pruning
 * @since MT-004.5
 */

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';
import { loadCacheIndex, CacheIndexItem } from './index';
import { deletePayload } from './storage';
import { removeFromIndex } from './index';

/**
 * Default size threshold in bytes (100MB).
 */
export const DEFAULT_SIZE_THRESHOLD = 100 * 1024 * 1024;

/**
 * Minimum items to keep (even if threshold exceeded).
 */
export const MIN_ITEMS_TO_KEEP = 10;

/**
 * Result of pruning operation.
 */
export interface PruningResult {
    success: boolean;
    itemsDeleted: number;
    bytesFreed: number;
    currentSize: number;
    threshold: number;
    errors: string[];
}

/**
 * Prune cache using Least Recently Used (LRU) strategy.
 *
 * **Simple explanation**: If the cache is too full, this removes the oldest
 * unused items until we're back under the size limit. Items you haven't
 * touched in a while go first.
 *
 * @param context - VS Code extension context
 * @param thresholdBytes - Maximum cache size in bytes (default: 100MB)
 * @returns Result object with pruning stats
 */
export async function pruneCacheLRU(
    context: vscode.ExtensionContext,
    thresholdBytes: number = DEFAULT_SIZE_THRESHOLD
): Promise<PruningResult> {
    const result: PruningResult = {
        success: true,
        itemsDeleted: 0,
        bytesFreed: 0,
        currentSize: 0,
        threshold: thresholdBytes,
        errors: [],
    };

    try {
        const index = loadCacheIndex(context);
        result.currentSize = index.totalSizeBytes;

        // Check if pruning is needed
        if (index.totalSizeBytes <= thresholdBytes) {
            logInfo(
                `Cache size (${formatBytes(
                    index.totalSizeBytes
                )}) is below threshold (${formatBytes(thresholdBytes)}), no pruning needed`
            );
            return result;
        }

        logInfo(
            `Cache size (${formatBytes(
                index.totalSizeBytes
            )}) exceeds threshold (${formatBytes(thresholdBytes)}), starting LRU pruning`
        );

        // Sort items by last accessed time (oldest first)
        const sortedItems = [...index.items].sort((a, b) => {
            const aTime = new Date(a.lastAccessedAt || a.cachedAt).getTime();
            const bTime = new Date(b.lastAccessedAt || b.cachedAt).getTime();
            return aTime - bTime;
        });

        // Calculate how much to delete
        let currentSize = index.totalSizeBytes;
        const itemsToDelete: CacheIndexItem[] = [];

        for (const item of sortedItems) {
            // Always keep minimum number of items
            if (index.items.length - itemsToDelete.length <= MIN_ITEMS_TO_KEEP) {
                logWarn(
                    `Reached minimum item count (${MIN_ITEMS_TO_KEEP}), stopping pruning`
                );
                break;
            }

            itemsToDelete.push(item);
            currentSize -= item.sizeBytes;

            // Stop if we're below threshold
            if (currentSize <= thresholdBytes) {
                break;
            }
        }

        if (itemsToDelete.length === 0) {
            logInfo('No items to delete (minimum count reached)');
            return result;
        }

        logInfo(`Will delete ${itemsToDelete.length} least recently used item(s)`);

        // Delete items
        for (const item of itemsToDelete) {
            try {
                const deleted = await deletePayload(context, item.hash);
                if (deleted) {
                    removeFromIndex(context, item.hash);
                    result.itemsDeleted++;
                    result.bytesFreed += item.sizeBytes;
                } else {
                    result.errors.push(`Failed to delete ${item.hash}`);
                }
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                result.errors.push(`Error deleting ${item.hash}: ${msg}`);
                logWarn(`Failed to delete ${item.hash}: ${msg}`);
            }
        }

        result.currentSize = currentSize;

        if (result.errors.length > 0) {
            result.success = false;
            logWarn(`LRU pruning completed with ${result.errors.length} error(s)`);
        } else {
            logInfo(
                `LRU pruning complete: deleted ${result.itemsDeleted} item(s), freed ${formatBytes(result.bytesFreed)}`
            );
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`LRU pruning failed: ${msg}`);
        result.success = false;
        result.errors.push(msg);
    }

    return result;
}

/**
 * Get items that would be pruned (dry run).
 *
 * **Simple explanation**: Shows you what would be deleted without actually
 * deleting anything. Good for previewing the cleanup.
 *
 * @param context - VS Code extension context
 * @param thresholdBytes - Size threshold in bytes
 * @returns Array of hashes that would be deleted
 */
export function getPruneableItems(
    context: vscode.ExtensionContext,
    thresholdBytes: number = DEFAULT_SIZE_THRESHOLD
): string[] {
    try {
        const index = loadCacheIndex(context);

        if (index.totalSizeBytes <= thresholdBytes) {
            return [];
        }

        // Sort by LRU
        const sortedItems = [...index.items].sort((a, b) => {
            const aTime = new Date(a.lastAccessedAt || a.cachedAt).getTime();
            const bTime = new Date(b.lastAccessedAt || b.cachedAt).getTime();
            return aTime - bTime;
        });

        let currentSize = index.totalSizeBytes;
        const itemsToDelete: string[] = [];

        for (const item of sortedItems) {
            if (index.items.length - itemsToDelete.length <= MIN_ITEMS_TO_KEEP) {
                break;
            }

            itemsToDelete.push(item.hash);
            currentSize -= item.sizeBytes;

            if (currentSize <= thresholdBytes) {
                break;
            }
        }

        return itemsToDelete;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to get pruneable items: ${msg}`);
        return [];
    }
}

/**
 * Get current cache size and statistics.
 *
 * @param context - VS Code extension context
 * @returns Cache size info
 */
export function getCacheSizeInfo(context: vscode.ExtensionContext): {
    totalBytes: number;
    totalMB: number;
    itemCount: number;
    largestItem: { hash: string; bytes: number } | null;
    averageItemSize: number;
} {
    try {
        const index = loadCacheIndex(context);

        let largestItem: { hash: string; bytes: number } | null = null;

        for (const item of index.items) {
            if (!largestItem || item.sizeBytes > largestItem.bytes) {
                largestItem = { hash: item.hash, bytes: item.sizeBytes };
            }
        }

        return {
            totalBytes: index.totalSizeBytes,
            totalMB:
                Math.round((index.totalSizeBytes / (1024 * 1024)) * 100) / 100,
            itemCount: index.totalItems,
            largestItem,
            averageItemSize:
                index.totalItems > 0
                    ? Math.round(index.totalSizeBytes / index.totalItems)
                    : 0,
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to get cache size info: ${msg}`);
        return {
            totalBytes: 0,
            totalMB: 0,
            itemCount: 0,
            largestItem: null,
            averageItemSize: 0,
        };
    }
}

/**
 * Format bytes to human-readable string.
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB", "500 KB")
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

/**
 * Schedule automatic size-based pruning.
 *
 * **Simple explanation**: Sets up a regular check (every hour) to see if
 * the cache is too full, and cleans it up if needed.
 *
 * @param context - VS Code extension context
 * @param thresholdBytes - Size threshold in bytes
 * @param intervalMs - How often to check (default: hourly)
 * @returns Interval timer ID
 */
export function scheduleSizePruning(
    context: vscode.ExtensionContext,
    thresholdBytes: number = DEFAULT_SIZE_THRESHOLD,
    intervalMs: number = 60 * 60 * 1000 // Hourly
): NodeJS.Timeout {
    logInfo(
        `Scheduling size pruning checks every ${Math.floor(
            intervalMs / (60 * 1000)
        )} minute(s)`
    );

    // Run immediately
    void pruneCacheLRU(context, thresholdBytes);

    // Then run on interval
    const timer = setInterval(() => {
        void pruneCacheLRU(context, thresholdBytes);
    }, intervalMs);

    return timer;
}
