/**
 * Cache Payload Storage
 *
 * Saves and loads full payloads to/from the offline cache.
 *
 * **Simple explanation**: Like a filing system where you can save documents
 * (payloads) with unique IDs and retrieve them later. Each file is named
 * with a hash of its content so we avoid duplicates.
 *
 * @module cache/storage
 * @since MT-004.2
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';
import { CACHE_DIRS } from './structure';

/**
 * Interface for a cached payload.
 */
export interface CachedPayload {
    /** Unique hash of the content */
    hash: string;
    /** The actual payload data */
    data: unknown;
    /** Source of the payload (e.g., 'llm', 'github', 'user') */
    source: string;
    /** Type/category of the payload */
    type: string;
    /** When it was cached */
    cachedAt: string;
    /** Optional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Result of saving a payload.
 */
export interface SavePayloadResult {
    success: boolean;
    hash: string;
    filePath: string;
    error?: string;
}

/**
 * Result of loading a payload.
 */
export interface LoadPayloadResult {
    success: boolean;
    payload: CachedPayload | null;
    error?: string;
}

/**
 * Generate a SHA-256 hash of content.
 *
 * **Simple explanation**: Creates a unique fingerprint for content.
 * Same content always produces same hash, different content never does.
 *
 * @param content - Content to hash (will be JSON-stringified if object)
 * @returns 64-character hex hash
 */
export function generateHash(content: unknown): string {
    const json = typeof content === 'string' ? content : JSON.stringify(content);
    return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Save a payload to the offline cache.
 *
 * **Simple explanation**: Like saving a file to your computer, but with a
 * special name based on what's inside. If the same content is saved twice,
 * it uses the same file.
 *
 * @param context - VS Code extension context
 * @param data - The payload data to save
 * @param source - Source of the payload (e.g., 'llm', 'github')
 * @param type - Type/category of the payload
 * @param metadata - Optional metadata to store with the payload
 * @returns Result object with hash and file path
 */
export async function savePayload(
    context: vscode.ExtensionContext,
    data: unknown,
    source: string,
    type: string,
    metadata?: Record<string, unknown>
): Promise<SavePayloadResult> {
    try {
        // Generate content hash
        const hash = generateHash(data);
        const filename = `${hash}.json`;
        const cachePath = path.join(
            context.extensionPath,
            CACHE_DIRS.OFFLINE_CACHE,
            filename
        );

        // Check if already cached
        if (fs.existsSync(cachePath)) {
            logInfo(`Payload ${hash} already cached, skipping`);
            return {
                success: true,
                hash,
                filePath: cachePath,
            };
        }

        // Create cached payload object
        const payload: CachedPayload = {
            hash,
            data,
            source,
            type,
            cachedAt: new Date().toISOString(),
            metadata,
        };

        // Write to file with pretty formatting
        fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf-8');

        logInfo(`Saved payload ${hash} from ${source} (type: ${type})`);

        return {
            success: true,
            hash,
            filePath: cachePath,
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to save payload: ${msg}`);
        return {
            success: false,
            hash: '',
            filePath: '',
            error: msg,
        };
    }
}

/**
 * Load a payload from the offline cache by hash.
 *
 * **Simple explanation**: Like finding a file on your computer by its name.
 * If the file doesn't exist, we tell you.
 *
 * @param context - VS Code extension context
 * @param hash - Hash of the payload to load
 * @returns Result object with payload data or error
 */
export async function loadPayload(
    context: vscode.ExtensionContext,
    hash: string
): Promise<LoadPayloadResult> {
    try {
        const filename = `${hash}.json`;
        const cachePath = path.join(
            context.extensionPath,
            CACHE_DIRS.OFFLINE_CACHE,
            filename
        );

        // Check if file exists
        if (!fs.existsSync(cachePath)) {
            return {
                success: false,
                payload: null,
                error: `Payload ${hash} not found in cache`,
            };
        }

        // Read and parse the file
        const content = fs.readFileSync(cachePath, 'utf-8');
        const payload = JSON.parse(content) as CachedPayload;

        logInfo(`Loaded payload ${hash} from cache`);

        return {
            success: true,
            payload,
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to load payload ${hash}: ${msg}`);
        return {
            success: false,
            payload: null,
            error: msg,
        };
    }
}

/**
 * Delete a payload from the offline cache.
 *
 * **Simple explanation**: Removes a file from storage when it's no longer needed.
 *
 * @param context - VS Code extension context
 * @param hash - Hash of the payload to delete
 * @returns true if deleted, false if not found or error
 */
export async function deletePayload(
    context: vscode.ExtensionContext,
    hash: string
): Promise<boolean> {
    try {
        const filename = `${hash}.json`;
        const cachePath = path.join(
            context.extensionPath,
            CACHE_DIRS.OFFLINE_CACHE,
            filename
        );

        if (!fs.existsSync(cachePath)) {
            logWarn(`Payload ${hash} not found, cannot delete`);
            return false;
        }

        fs.unlinkSync(cachePath);
        logInfo(`Deleted payload ${hash} from cache`);
        return true;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to delete payload ${hash}: ${msg}`);
        return false;
    }
}

/**
 * Check if a payload exists in the cache.
 *
 * @param context - VS Code extension context
 * @param hash - Hash of the payload to check
 * @returns true if the payload exists
 */
export function payloadExists(
    context: vscode.ExtensionContext,
    hash: string
): boolean {
    const filename = `${hash}.json`;
    const cachePath = path.join(
        context.extensionPath,
        CACHE_DIRS.OFFLINE_CACHE,
        filename
    );
    return fs.existsSync(cachePath);
}

/**
 * Get the size of a cached payload in bytes.
 *
 * @param context - VS Code extension context
 * @param hash - Hash of the payload
 * @returns Size in bytes, or -1 if not found
 */
export function getPayloadSize(
    context: vscode.ExtensionContext,
    hash: string
): number {
    try {
        const filename = `${hash}.json`;
        const cachePath = path.join(
            context.extensionPath,
            CACHE_DIRS.OFFLINE_CACHE,
            filename
        );

        if (!fs.existsSync(cachePath)) {
            return -1;
        }

        const stats = fs.statSync(cachePath);
        return stats.size;
    } catch {
        return -1;
    }
}

/**
 * List all cached payload hashes.
 *
 * **Simple explanation**: Get a list of all files in the cache, like
 * listing all documents in a filing cabinet.
 *
 * @param context - VS Code extension context
 * @returns Array of payload hashes
 */
export function listAllPayloads(context: vscode.ExtensionContext): string[] {
    try {
        const cachePath = path.join(
            context.extensionPath,
            CACHE_DIRS.OFFLINE_CACHE
        );

        if (!fs.existsSync(cachePath)) {
            return [];
        }

        const files = fs.readdirSync(cachePath);
        return files
            .filter(file => file.endsWith('.json') && file !== 'cache-index.json')
            .map(file => file.replace('.json', ''));
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to list payloads: ${msg}`);
        return [];
    }
}
