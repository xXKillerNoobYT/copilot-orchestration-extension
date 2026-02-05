/**
 * Cache Retention Policy
 *
 * Automatically deletes cache items older than the retention period.
 *
 * **Simple explanation**: Like a rule that says "throw away documents older than
 * 7 days" to keep the filing cabinet from getting too full of outdated stuff.
 *
 * @module cache/retention
 * @since MT-004.4
 */

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';
import { loadCacheIndex, saveCacheIndex, removeFromIndex } from './index';
import { deletePayload } from './storage';

/**
 * Default retention period in milliseconds (7 days).
 */
export const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Result of retention cleanup.
 */
export interface RetentionResult {
    success: boolean;
    itemsDeleted: number;
    bytesFreed: number;
    errors: string[];
}

/**
 * Apply the retention policy to the cache.
 *
 * **Simple explanation**: Goes through the filing cabinet and throws away
 * anything older than the retention period (default: 7 days). Like spring
 * cleaning for your cache.
 *
 * @param context - VS Code extension context
 * @param retentionMs - Retention period in milliseconds (default: 7 days)
 * @returns Result object with deletion stats
 */
export async function applyRetentionPolicy(
    context: vscode.ExtensionContext,
    retentionMs: number = DEFAULT_RETENTION_MS
): Promise<RetentionResult> {
    const result: RetentionResult = {
        success: true,
        itemsDeleted: 0,
        bytesFreed: 0,
        errors: [],
    };

    try {
        const index = loadCacheIndex(context);
        const now = Date.now();
        const cutoffTime = now - retentionMs;

        logInfo(
            `Starting retention policy cleanup (retention period: ${Math.floor(
                retentionMs / (24 * 60 * 60 * 1000)
            )} days)`
        );

        // Find items older than cutoff
        const itemsToDelete = index.items.filter(item => {
            const cachedAt = new Date(item.cachedAt).getTime();
            return cachedAt < cutoffTime;
        });

        if (itemsToDelete.length === 0) {
            logInfo('No items exceeded retention period');
            return result;
        }

        logInfo(
            `Found ${itemsToDelete.length} item(s) exceeding retention period`
        );

        // Delete each item
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

        if (result.errors.length > 0) {
            result.success = false;
            logWarn(
                `Retention cleanup completed with ${result.errors.length} error(s)`
            );
        } else {
            logInfo(
                `Retention cleanup complete: deleted ${result.itemsDeleted} item(s), freed ${Math.round(result.bytesFreed / 1024)}KB`
            );
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Retention policy failed: ${msg}`);
        result.success = false;
        result.errors.push(msg);
    }

    return result;
}

/**
 * Get items that will be deleted by the retention policy.
 *
 * **Simple explanation**: Preview what would be thrown away without actually
 * deleting anything. Good for dry runs.
 *
 * @param context - VS Code extension context
 * @param retentionMs - Retention period in milliseconds
 * @returns Array of hashes that would be deleted
 */
export function getExpiredItems(
    context: vscode.ExtensionContext,
    retentionMs: number = DEFAULT_RETENTION_MS
): string[] {
    try {
        const index = loadCacheIndex(context);
        const now = Date.now();
        const cutoffTime = now - retentionMs;

        return index.items
            .filter(item => {
                const cachedAt = new Date(item.cachedAt).getTime();
                return cachedAt < cutoffTime;
            })
            .map(item => item.hash);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to get expired items: ${msg}`);
        return [];
    }
}

/**
 * Schedule automatic retention policy runs.
 *
 * **Simple explanation**: Sets up a daily timer to automatically clean
 * up old cache items, like having a cleaning service come regularly.
 *
 * @param context - VS Code extension context
 * @param retentionMs - Retention period in milliseconds
 * @param intervalMs - How often to run cleanup (default: daily)
 * @returns Interval timer ID (can be used to cancel with clearInterval)
 */
export function scheduleRetentionCleanup(
    context: vscode.ExtensionContext,
    retentionMs: number = DEFAULT_RETENTION_MS,
    intervalMs: number = 24 * 60 * 60 * 1000 // Daily
): NodeJS.Timeout {
    logInfo(
        `Scheduling retention cleanup every ${Math.floor(
            intervalMs / (60 * 60 * 1000)
        )} hour(s)`
    );

    // Run immediately on schedule
    void applyRetentionPolicy(context, retentionMs);

    // Then run on interval
    const timer = setInterval(() => {
        void applyRetentionPolicy(context, retentionMs);
    }, intervalMs);

    return timer;
}

/**
 * Calculate age of a cache item in milliseconds.
 *
 * @param cachedAt - ISO timestamp of when item was cached
 * @returns Age in milliseconds
 */
export function calculateItemAge(cachedAt: string): number {
    const cachedDate = new Date(cachedAt);
    const now = new Date();
    return now.getTime() - cachedDate.getTime();
}

/**
 * Format age in human-readable form.
 *
 * @param ageMs - Age in milliseconds
 * @returns Formatted string (e.g., "3 days", "2 hours")
 */
export function formatAge(ageMs: number): string {
    const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    if (days > 0) {
        return `${days} day${days === 1 ? '' : 's'}`;
    }

    const hours = Math.floor(ageMs / (60 * 60 * 1000));
    if (hours > 0) {
        return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    const minutes = Math.floor(ageMs / (60 * 1000));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
