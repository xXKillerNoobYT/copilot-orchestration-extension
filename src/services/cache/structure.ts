/**
 * Cache Directory Structure
 *
 * Creates and manages the cache directory structure for offline storage.
 *
 * **Simple explanation**: Like setting up filing cabinets before you start
 * organizing papers. This ensures the folders exist before we try to save files.
 *
 * @module cache/structure
 * @since MT-004.1
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * Cache directory names (relative to extension path)
 */
export const CACHE_DIRS = {
    /** Main cache folder */
    ROOT: '.coe',
    /** Offline cache for LLM responses and payloads */
    OFFLINE_CACHE: '.coe/offline-cache',
    /** Processed items that have been handled */
    PROCESSED: '.coe/processed',
    /** Temporary files during processing */
    TEMP: '.coe/temp',
} as const;

/**
 * Cache file names
 */
export const CACHE_FILES = {
    /** Index of all cached items with metadata */
    INDEX: 'cache-index.json',
    /** Lock file to prevent concurrent access */
    LOCK: '.cache-lock',
} as const;

/**
 * Result of directory initialization
 */
export interface CacheStructureResult {
    success: boolean;
    paths: {
        root: string;
        offlineCache: string;
        processed: string;
        temp: string;
    };
    errors: string[];
}

/**
 * Initialize cache directory structure.
 *
 * Creates all required directories for offline caching:
 * - .coe/offline-cache/ - Stores cached payloads
 * - .coe/processed/ - Stores processed item records
 * - .coe/temp/ - Temporary files during processing
 *
 * **Simple explanation**: Sets up the filing cabinet with all the drawers
 * we'll need. If a drawer already exists, we skip it. If we can't create
 * one, we note the error but keep going.
 *
 * @param context - VS Code extension context for path resolution
 * @returns Result object with created paths and any errors
 */
export async function initializeCacheStructure(
    context: vscode.ExtensionContext
): Promise<CacheStructureResult> {
    const basePath = context.extensionPath;
    const errors: string[] = [];

    const paths = {
        root: path.join(basePath, CACHE_DIRS.ROOT),
        offlineCache: path.join(basePath, CACHE_DIRS.OFFLINE_CACHE),
        processed: path.join(basePath, CACHE_DIRS.PROCESSED),
        temp: path.join(basePath, CACHE_DIRS.TEMP),
    };

    // Create each directory
    for (const [name, dirPath] of Object.entries(paths)) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                logInfo(`Created cache directory: ${name}`);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            errors.push(`Failed to create ${name}: ${msg}`);
            logError(`Failed to create cache directory ${name}: ${msg}`);
        }
    }

    // Initialize cache index if it doesn't exist
    const indexPath = path.join(paths.offlineCache, CACHE_FILES.INDEX);
    try {
        if (!fs.existsSync(indexPath)) {
            const initialIndex = {
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalItems: 0,
                totalSizeBytes: 0,
                items: [],
            };
            fs.writeFileSync(indexPath, JSON.stringify(initialIndex, null, 2));
            logInfo('Created cache index file');
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to create cache index: ${msg}`);
        logWarn(`Failed to create cache index: ${msg}`);
    }

    const success = errors.length === 0;
    if (success) {
        logInfo('Cache structure initialized successfully');
    } else {
        logWarn(`Cache structure initialized with ${errors.length} error(s)`);
    }

    return { success, paths, errors };
}

/**
 * Check if cache directories exist and are accessible.
 *
 * @param context - VS Code extension context
 * @returns true if all directories exist and are writable
 */
export function isCacheStructureValid(
    context: vscode.ExtensionContext
): boolean {
    const basePath = context.extensionPath;

    const requiredPaths = [
        path.join(basePath, CACHE_DIRS.ROOT),
        path.join(basePath, CACHE_DIRS.OFFLINE_CACHE),
        path.join(basePath, CACHE_DIRS.PROCESSED),
    ];

    for (const dirPath of requiredPaths) {
        if (!fs.existsSync(dirPath)) {
            return false;
        }

        // Check if writable by attempting to access
        try {
            fs.accessSync(dirPath, fs.constants.W_OK);
        } catch {
            return false;
        }
    }

    return true;
}

/**
 * Get the full path to a cache file.
 *
 * @param context - VS Code extension context
 * @param subDir - Subdirectory (e.g., 'offline-cache', 'processed')
 * @param filename - Name of the file
 * @returns Full path to the file
 */
export function getCachePath(
    context: vscode.ExtensionContext,
    subDir: keyof typeof CACHE_DIRS,
    filename: string
): string {
    return path.join(context.extensionPath, CACHE_DIRS[subDir], filename);
}

/**
 * Clean up temporary files older than specified age.
 *
 * @param context - VS Code extension context
 * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 * @returns Number of files cleaned up
 */
export async function cleanupTempFiles(
    context: vscode.ExtensionContext,
    maxAgeMs: number = 24 * 60 * 60 * 1000
): Promise<number> {
    const tempPath = path.join(context.extensionPath, CACHE_DIRS.TEMP);
    let cleanedCount = 0;

    if (!fs.existsSync(tempPath)) {
        return 0;
    }

    try {
        const files = fs.readdirSync(tempPath);
        const now = Date.now();

        for (const file of files) {
            const filePath = path.join(tempPath, file);
            try {
                const stats = fs.statSync(filePath);
                const age = now - stats.mtimeMs;

                if (age > maxAgeMs) {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                }
            } catch {
                // Skip files we can't access
            }
        }

        if (cleanedCount > 0) {
            logInfo(`Cleaned up ${cleanedCount} temp file(s)`);
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Error during temp cleanup: ${msg}`);
    }

    return cleanedCount;
}
