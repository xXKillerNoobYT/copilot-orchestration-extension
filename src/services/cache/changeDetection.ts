/**
 * Cache Change Detection
 *
 * Detects when source files change and invalidates related cache entries.
 *
 * **Simple explanation**: Like knowing when a recipe book gets updated,
 * so you can throw away your old notes and use the new version next time.
 * Uses file hashes to detect changes.
 *
 * @module cache/changeDetection
 * @since MT-004.7
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';
import { loadCacheIndex, removeFromIndex } from './index';
import { deletePayload } from './storage';

/**
 * File hash record for change tracking.
 */
export interface FileHashRecord {
    /** File path (relative to workspace) */
    filePath: string;
    /** SHA-256 hash of file content */
    hash: string;
    /** When hash was computed */
    computedAt: string;
    /** Related cache hashes that depend on this file */
    relatedCacheHashes: string[];
}

/**
 * Hash registry structure.
 */
export interface HashRegistry {
    version: string;
    updatedAt: string;
    files: FileHashRecord[];
}

/**
 * Result of change detection scan.
 */
export interface ChangeDetectionResult {
    success: boolean;
    filesScanned: number;
    filesChanged: number;
    cacheEntriesInvalidated: number;
    errors: string[];
}

/**
 * Compute SHA-256 hash of a file.
 *
 * **Simple explanation**: Creates a unique fingerprint for a file.
 * If even one character changes, the fingerprint changes completely.
 *
 * @param filePath - Path to the file
 * @returns SHA-256 hash as hex string, or null if error
 */
export function computeFileHash(filePath: string): string | null {
    try {
        const content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to compute hash for ${filePath}: ${msg}`);
        return null;
    }
}

/**
 * Get path to hash registry file.
 *
 * @param context - VS Code extension context
 * @returns Path to hash-registry.json
 */
function getRegistryPath(context: vscode.ExtensionContext): string {
    return vscode.Uri.joinPath(
        context.extensionUri,
        '.coe',
        'hash-registry.json'
    ).fsPath;
}

/**
 * Load the file hash registry.
 *
 * @param context - VS Code extension context
 * @returns Hash registry object
 */
export function loadHashRegistry(
    context: vscode.ExtensionContext
): HashRegistry {
    const registryPath = getRegistryPath(context);

    try {
        if (!fs.existsSync(registryPath)) {
            const newRegistry: HashRegistry = {
                version: '1.0.0',
                updatedAt: new Date().toISOString(),
                files: [],
            };
            saveHashRegistry(context, newRegistry);
            return newRegistry;
        }

        const content = fs.readFileSync(registryPath, 'utf-8');
        return JSON.parse(content) as HashRegistry;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to load hash registry: ${msg}`);
        return {
            version: '1.0.0',
            updatedAt: new Date().toISOString(),
            files: [],
        };
    }
}

/**
 * Save the file hash registry.
 *
 * @param context - VS Code extension context
 * @param registry - Registry to save
 * @returns true if successful
 */
export function saveHashRegistry(
    context: vscode.ExtensionContext,
    registry: HashRegistry
): boolean {
    const registryPath = getRegistryPath(context);

    try {
        registry.updatedAt = new Date().toISOString();
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
        return true;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to save hash registry: ${msg}`);
        return false;
    }
}

/**
 * Register a file with its hash and related cache entries.
 *
 * **Simple explanation**: Records a file's fingerprint and which cache
 * entries depend on it, so we know what to invalidate if it changes.
 *
 * @param context - VS Code extension context
 * @param filePath - Path to the file
 * @param cacheHashes - Array of cache hashes that depend on this file
 * @returns true if successful
 */
export function registerFileHash(
    context: vscode.ExtensionContext,
    filePath: string,
    cacheHashes: string[]
): boolean {
    try {
        const hash = computeFileHash(filePath);
        if (!hash) {
            return false;
        }

        const registry = loadHashRegistry(context);

        // Find existing record or create new one
        const existingIndex = registry.files.findIndex(
            f => f.filePath === filePath
        );

        const record: FileHashRecord = {
            filePath,
            hash,
            computedAt: new Date().toISOString(),
            relatedCacheHashes: [...new Set(cacheHashes)], // Remove duplicates
        };

        if (existingIndex !== -1) {
            registry.files[existingIndex] = record;
        } else {
            registry.files.push(record);
        }

        return saveHashRegistry(context, registry);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to register file hash: ${msg}`);
        return false;
    }
}

/**
 * Detect changes in tracked files and invalidate related cache entries.
 *
 * **Simple explanation**: Checks all tracked files to see if they've changed
 * since last time. If a file changed, deletes all cache entries that depend
 * on it (they're now outdated).
 *
 * @param context - VS Code extension context
 * @returns Result object with change detection stats
 */
export async function detectAndInvalidateChanges(
    context: vscode.ExtensionContext
): Promise<ChangeDetectionResult> {
    const result: ChangeDetectionResult = {
        success: true,
        filesScanned: 0,
        filesChanged: 0,
        cacheEntriesInvalidated: 0,
        errors: [],
    };

    try {
        const registry = loadHashRegistry(context);
        logInfo(`Scanning ${registry.files.length} tracked file(s) for changes`);

        for (const record of registry.files) {
            result.filesScanned++;

            // Check if file still exists
            if (!fs.existsSync(record.filePath)) {
                logWarn(`Tracked file missing: ${record.filePath}`);
                // Invalidate cache entries for missing file
                for (const cacheHash of record.relatedCacheHashes) {
                    await deletePayload(context, cacheHash);
                    removeFromIndex(context, cacheHash);
                    result.cacheEntriesInvalidated++;
                }
                result.filesChanged++;
                continue;
            }

            // Compute current hash
            const currentHash = computeFileHash(record.filePath);
            if (!currentHash) {
                result.errors.push(`Failed to compute hash for ${record.filePath}`);
                continue;
            }

            // Compare with stored hash
            if (currentHash !== record.hash) {
                logInfo(`File changed: ${record.filePath}`);
                result.filesChanged++;

                // Invalidate related cache entries
                for (const cacheHash of record.relatedCacheHashes) {
                    try {
                        await deletePayload(context, cacheHash);
                        removeFromIndex(context, cacheHash);
                        result.cacheEntriesInvalidated++;
                    } catch (error: unknown) {
                        const msg = error instanceof Error ? error.message : String(error);
                        result.errors.push(
                            `Failed to invalidate cache ${cacheHash}: ${msg}`
                        );
                    }
                }

                // Update hash in registry
                record.hash = currentHash;
                record.computedAt = new Date().toISOString();
            }
        }

        // Save updated registry
        if (result.filesChanged > 0) {
            saveHashRegistry(context, registry);
        }

        if (result.errors.length > 0) {
            result.success = false;
            logWarn(
                `Change detection completed with ${result.errors.length} error(s)`
            );
        } else {
            logInfo(
                `Change detection complete: ${result.filesChanged} file(s) changed, ${result.cacheEntriesInvalidated} cache entries invalidated`
            );
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Change detection failed: ${msg}`);
        result.success = false;
        result.errors.push(msg);
    }

    return result;
}

/**
 * Schedule automatic change detection.
 *
 * **Simple explanation**: Sets up a regular check (every 5 minutes) to see
 * if any tracked files have changed, and invalidates stale cache accordingly.
 *
 * @param context - VS Code extension context
 * @param intervalMs - How often to check (default: 5 minutes)
 * @returns Interval timer ID
 */
export function scheduleChangeDetection(
    context: vscode.ExtensionContext,
    intervalMs: number = 5 * 60 * 1000 // 5 minutes
): NodeJS.Timeout {
    logInfo(
        `Scheduling change detection every ${Math.floor(
            intervalMs / (60 * 1000)
        )} minute(s)`
    );

    // Run immediately
    void detectAndInvalidateChanges(context);

    // Then run on interval
    const timer = setInterval(() => {
        void detectAndInvalidateChanges(context);
    }, intervalMs);

    return timer;
}

/**
 * Get information about tracked files.
 *
 * @param context - VS Code extension context
 * @returns Array of tracked file records
 */
export function getTrackedFiles(
    context: vscode.ExtensionContext
): FileHashRecord[] {
    try {
        const registry = loadHashRegistry(context);
        return [...registry.files];
    } catch {
        return [];
    }
}

/**
 * Remove a file from change tracking.
 *
 * @param context - VS Code extension context
 * @param filePath - Path to the file
 * @returns true if successful
 */
export function untrackFile(
    context: vscode.ExtensionContext,
    filePath: string
): boolean {
    try {
        const registry = loadHashRegistry(context);
        const initialCount = registry.files.length;

        registry.files = registry.files.filter(f => f.filePath !== filePath);

        if (registry.files.length < initialCount) {
            return saveHashRegistry(context, registry);
        }

        return false; // File not tracked
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to untrack file: ${msg}`);
        return false;
    }
}
