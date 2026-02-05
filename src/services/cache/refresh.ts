/**
 * Cache Auto-Refresh Logic
 *
 * Automatically refreshes stale cache items when online connectivity is detected.
 *
 * **Simple explanation**: Like checking if your groceries are still fresh
 * when you get home from a trip, and going back to the store to replace
 * anything that's gone bad.
 *
 * @module cache/refresh
 * @since MT-004.6
 */

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';
import { loadCacheIndex, CacheIndexItem, updateLastAccessed } from './index';

/**
 * Default staleness threshold in milliseconds (24 hours).
 */
export const DEFAULT_STALENESS_THRESHOLD = 24 * 60 * 60 * 1000;

/**
 * Maximum concurrent refresh operations.
 */
export const MAX_CONCURRENT_REFRESHES = 3;

/**
 * Refresh strategy for a cache item.
 */
export type RefreshStrategy = 'immediate' | 'deferred' | 'skip';

/**
 * Callback function type for refreshing cache data.
 */
export type RefreshCallback = (
    item: CacheIndexItem
) => Promise<{ success: boolean; data?: unknown; error?: string }>;

/**
 * Result of refresh operation.
 */
export interface RefreshResult {
    success: boolean;
    itemsRefreshed: number;
    itemsSkipped: number;
    itemsFailed: number;
    errors: string[];
}

/**
 * Online state detector.
 */
export interface OnlineDetector {
    /** Check if currently online */
    isOnline: () => boolean;
    /** Register callback for online event */
    onOnline: (callback: () => void) => void;
}

/**
 * Simple online detector using vscode APIs.
 */
export class VSCodeOnlineDetector implements OnlineDetector {
    private onlineCallbacks: Array<() => void> = [];

    constructor() {
        // Note: VS Code doesn't have built-in online/offline detection
        // In production, this would integrate with external connectivity checks
    }

    isOnline(): boolean {
        // Simplified check - in production would ping a known endpoint
        return true;
    }

    onOnline(callback: () => void): void {
        this.onlineCallbacks.push(callback);
    }

    triggerOnlineCallbacks(): void {
        for (const callback of this.onlineCallbacks) {
            callback();
        }
    }
}

/**
 * Determine if a cache item is stale.
 *
 * **Simple explanation**: Checks if something has been sitting in the cache
 * for longer than it should be (like checking the expiration date on milk).
 *
 * @param item - Cache index item
 * @param stalenessMs - Staleness threshold in milliseconds
 * @returns true if item is stale
 */
export function isItemStale(
    item: CacheIndexItem,
    stalenessMs: number = DEFAULT_STALENESS_THRESHOLD
): boolean {
    const cachedAt = new Date(item.cachedAt).getTime();
    const now = Date.now();
    const age = now - cachedAt;
    return age > stalenessMs;
}

/**
 * Get all stale items from the cache.
 *
 * @param context - VS Code extension context
 * @param stalenessMs - Staleness threshold in milliseconds
 * @returns Array of stale cache items
 */
export function getStaleItems(
    context: vscode.ExtensionContext,
    stalenessMs: number = DEFAULT_STALENESS_THRESHOLD
): CacheIndexItem[] {
    try {
        const index = loadCacheIndex(context);
        return index.items.filter(item => isItemStale(item, stalenessMs));
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to get stale items: ${msg}`);
        return [];
    }
}

/**
 * Refresh stale cache items.
 *
 * **Simple explanation**: Goes through all stale items and tries to get
 * fresh versions. Respects rate limits by only refreshing a few at a time.
 *
 * @param context - VS Code extension context
 * @param refreshCallback - Function to refresh a single item
 * @param stalenessMs - Staleness threshold in milliseconds
 * @param maxConcurrent - Maximum concurrent refreshes
 * @returns Result object with refresh stats
 */
export async function refreshStaleItems(
    context: vscode.ExtensionContext,
    refreshCallback: RefreshCallback,
    stalenessMs: number = DEFAULT_STALENESS_THRESHOLD,
    maxConcurrent: number = MAX_CONCURRENT_REFRESHES
): Promise<RefreshResult> {
    const result: RefreshResult = {
        success: true,
        itemsRefreshed: 0,
        itemsSkipped: 0,
        itemsFailed: 0,
        errors: [],
    };

    try {
        const staleItems = getStaleItems(context, stalenessMs);

        if (staleItems.length === 0) {
            logInfo('No stale items to refresh');
            return result;
        }

        logInfo(`Found ${staleItems.length} stale item(s) to refresh`);

        // Batch refresh with concurrency limit
        for (let i = 0; i < staleItems.length; i += maxConcurrent) {
            const batch = staleItems.slice(i, i + maxConcurrent);
            
            const batchPromises = batch.map(async item => {
                try {
                    const refreshResult = await refreshCallback(item);
                    if (refreshResult.success) {
                        // Update last accessed time to mark as fresh
                        updateLastAccessed(context, item.hash);
                        result.itemsRefreshed++;
                        logInfo(`Refreshed ${item.hash}`);
                    } else {
                        result.itemsFailed++;
                        const error = refreshResult.error || 'Unknown error';
                        result.errors.push(`Failed to refresh ${item.hash}: ${error}`);
                    }
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : String(error);
                    result.itemsFailed++;
                    result.errors.push(`Error refreshing ${item.hash}: ${msg}`);
                    logWarn(`Failed to refresh ${item.hash}: ${msg}`);
                }
            });

            await Promise.all(batchPromises);

            // Small delay between batches to avoid overwhelming API
            if (i + maxConcurrent < staleItems.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (result.errors.length > 0) {
            result.success = false;
            logWarn(`Refresh completed with ${result.errors.length} error(s)`);
        } else {
            logInfo(
                `Refresh complete: ${result.itemsRefreshed} item(s) refreshed`
            );
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Auto-refresh failed: ${msg}`);
        result.success = false;
        result.errors.push(msg);
    }

    return result;
}

/**
 * Set up automatic refresh on online detection.
 *
 * **Simple explanation**: Watches for when you go back online, and
 * automatically refreshes stale items when that happens.
 *
 * @param context - VS Code extension context
 * @param onlineDetector - Online state detector
 * @param refreshCallback - Function to refresh items
 * @param stalenessMs - Staleness threshold
 */
export function setupAutoRefresh(
    context: vscode.ExtensionContext,
    onlineDetector: OnlineDetector,
    refreshCallback: RefreshCallback,
    stalenessMs: number = DEFAULT_STALENESS_THRESHOLD
): void {
    onlineDetector.onOnline(() => {
        logInfo('Online detected, starting auto-refresh');
        void refreshStaleItems(context, refreshCallback, stalenessMs);
    });

    logInfo('Auto-refresh setup complete');
}

/**
 * Calculate refresh priority for an item.
 *
 * **Simple explanation**: Decides which stale items are most important
 * to refresh first (recently used items get higher priority).
 *
 * @param item - Cache index item
 * @returns Priority score (higher = more important)
 */
export function calculateRefreshPriority(item: CacheIndexItem): number {
    // Priority based on:
    // 1. Access count (more accessed = higher priority)
    // 2. Recency of last access (more recent = higher priority)
    // 3. Size (smaller = higher priority, faster to refresh)

    const accessWeight = item.accessCount * 10;
    
    const lastAccessMs = item.lastAccessedAt
        ? new Date(item.lastAccessedAt).getTime()
        : new Date(item.cachedAt).getTime();
    const daysSinceAccess = (Date.now() - lastAccessMs) / (24 * 60 * 60 * 1000);
    const recencyWeight = Math.max(0, 100 - daysSinceAccess * 10);

    const sizeMB = item.sizeBytes / (1024 * 1024);
    const sizeWeight = Math.max(0, 50 - sizeMB * 5);

    return accessWeight + recencyWeight + sizeWeight;
}

/**
 * Sort items by refresh priority.
 *
 * @param items - Array of cache items
 * @returns Sorted array (highest priority first)
 */
export function sortByRefreshPriority(items: CacheIndexItem[]): CacheIndexItem[] {
    return [...items].sort((a, b) => {
        return calculateRefreshPriority(b) - calculateRefreshPriority(a);
    });
}
