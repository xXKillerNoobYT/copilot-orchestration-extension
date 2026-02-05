/**
 * Database Initialization Module
 *
 * Handles first-time database creation, schema initialization via migrations,
 * and recovery from previous sessions.
 *
 * **Simple explanation**: Like setting up a new office - creates the filing
 * cabinets (database), organizes the drawers (tables), and checks if there's
 * any previous work to restore (recovery files).
 *
 * @module ticketDb/init
 * @since MT-005.7
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * Database initialization options
 */
export interface DbInitOptions {
    /** Path to the database file */
    dbPath: string;
    /** Whether to run in-memory only (no file) */
    inMemoryOnly?: boolean;
    /** Path to recovery.json for loading previous session data */
    recoveryPath?: string;
    /** Whether to auto-apply pending migrations */
    autoMigrate?: boolean;
}

/**
 * Result of database initialization
 */
export interface DbInitResult {
    /** Whether initialization succeeded */
    success: boolean;
    /** The mode the database is running in */
    mode: 'sqlite' | 'memory';
    /** Path to the database file (null for in-memory) */
    dbPath: string | null;
    /** Whether recovery data was loaded */
    recoveryLoaded: boolean;
    /** Number of migrations applied during init */
    migrationsApplied: number;
    /** Any errors or warnings during init */
    messages: string[];
}

/**
 * Ensure the database directory exists.
 *
 * **Simple explanation**: Makes sure the folder where the database file
 * will live actually exists. If not, creates it.
 *
 * @param dbPath - Full path to the database file
 * @returns true if directory exists or was created
 */
export function ensureDbDirectory(dbPath: string): boolean {
    const dir = path.dirname(dbPath);
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logInfo(`Created database directory: ${dir}`);
        }
        return true;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to create database directory: ${msg}`);
        return false;
    }
}

/**
 * Check if the database file exists.
 *
 * @param dbPath - Full path to the database file
 * @returns true if the database file exists
 */
export function dbFileExists(dbPath: string): boolean {
    return fs.existsSync(dbPath);
}

/**
 * Check if the database file is writable.
 *
 * @param dbPath - Full path to the database file
 * @returns true if the database file can be written to
 */
export function isDbWritable(dbPath: string): boolean {
    try {
        // Check if file exists and is writable
        if (fs.existsSync(dbPath)) {
            fs.accessSync(dbPath, fs.constants.W_OK);
            return true;
        }

        // File doesn't exist, check if directory is writable
        const dir = path.dirname(dbPath);
        if (fs.existsSync(dir)) {
            fs.accessSync(dir, fs.constants.W_OK);
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

/**
 * Load recovery data from a recovery.json file.
 *
 * **Simple explanation**: If the database crashed last time, there might
 * be a backup file with saved tickets. This loads that backup so we
 * don't lose any work.
 *
 * @param recoveryPath - Path to the recovery.json file
 * @returns Parsed ticket data, or null if no recovery available
 */
export function loadRecoveryData(
    recoveryPath: string
): { tickets: Record<string, unknown>[]; timestamp: string } | null {
    try {
        if (!fs.existsSync(recoveryPath)) {
            return null;
        }

        const raw = fs.readFileSync(recoveryPath, 'utf-8');
        const data = JSON.parse(raw);

        // Validate recovery file structure
        if (!data || !Array.isArray(data.tickets)) {
            logWarn('Recovery file exists but has invalid format');
            return null;
        }

        logInfo(`Recovery file found with ${data.tickets.length} ticket(s)`);
        return {
            tickets: data.tickets,
            timestamp: data.timestamp || 'unknown',
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to load recovery data: ${msg}`);
        return null;
    }
}

/**
 * Save recovery data to a JSON file.
 *
 * **Simple explanation**: Creates a backup of all tickets in a JSON file,
 * so if the database crashes, we can restore from this backup.
 *
 * @param recoveryPath - Path to save recovery.json
 * @param tickets - Array of ticket data to save
 * @returns true if save succeeded
 */
export function saveRecoveryData(
    recoveryPath: string,
    tickets: Record<string, unknown>[]
): boolean {
    try {
        const dir = path.dirname(recoveryPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write to temp file first, then rename (atomic write)
        const tempPath = recoveryPath + '.tmp';
        const data = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            ticketCount: tickets.length,
            tickets,
        };

        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));

        // Backup existing recovery file
        if (fs.existsSync(recoveryPath)) {
            const backupPath = recoveryPath + '.bak';
            try {
                fs.renameSync(recoveryPath, backupPath);
            } catch {
                // Backup failure is non-critical
            }
        }

        fs.renameSync(tempPath, recoveryPath);
        logInfo(`Recovery data saved: ${tickets.length} ticket(s)`);
        return true;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to save recovery data: ${msg}`);
        return false;
    }
}

/**
 * Determine the best database mode based on environment.
 *
 * **Simple explanation**: Checks if we can use a real database file, or
 * if we need to fall back to storing everything in memory. Tries multiple
 * locations before giving up.
 *
 * @param primaryPath - Preferred database path
 * @param alternatePaths - Fallback paths to try
 * @returns The mode to use and the resolved path
 */
export function determineDatabaseMode(
    primaryPath: string,
    alternatePaths: string[] = []
): { mode: 'sqlite' | 'memory'; path: string | null; reason: string } {
    // Try primary path
    if (ensureDbDirectory(primaryPath) && isDbWritable(primaryPath)) {
        return {
            mode: 'sqlite',
            path: primaryPath,
            reason: 'Primary path available',
        };
    }

    // Try alternate paths
    for (const altPath of alternatePaths) {
        if (ensureDbDirectory(altPath) && isDbWritable(altPath)) {
            logWarn(`Primary DB path unavailable, using alternate: ${altPath}`);
            return {
                mode: 'sqlite',
                path: altPath,
                reason: `Alternate path: ${altPath}`,
            };
        }
    }

    // Fall back to in-memory
    logWarn('No writable database path found, falling back to in-memory mode');
    return {
        mode: 'memory',
        path: null,
        reason: 'No writable path available',
    };
}

/**
 * Get the default database path for a given extension root.
 *
 * @param extensionPath - The extension's root directory
 * @returns Full path to the default database location
 */
export function getDefaultDbPath(extensionPath: string): string {
    return path.join(extensionPath, '.coe', 'tickets.db');
}

/**
 * Get alternate database paths for fallback.
 *
 * @param extensionPath - The extension's root directory
 * @returns Array of alternate paths to try
 */
export function getAlternatePaths(extensionPath: string): string[] {
    const paths: string[] = [];

    // Try user home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
        paths.push(path.join(homeDir, '.coe', 'tickets.db'));
    }

    // Try temp directory
    const tmpDir = process.env.TMPDIR || process.env.TEMP || '/tmp';
    paths.push(path.join(tmpDir, 'coe-tickets.db'));

    return paths;
}

/**
 * Clean up old recovery files.
 *
 * @param recoveryPath - Path to recovery.json
 * @param maxAge - Maximum age in milliseconds (default: 7 days)
 * @returns Number of files cleaned up
 */
export function cleanupRecoveryFiles(
    recoveryPath: string,
    maxAge: number = 7 * 24 * 60 * 60 * 1000
): number {
    let cleaned = 0;

    const backupPath = recoveryPath + '.bak';
    try {
        if (fs.existsSync(backupPath)) {
            const stats = fs.statSync(backupPath);
            if (Date.now() - stats.mtimeMs > maxAge) {
                fs.unlinkSync(backupPath);
                cleaned++;
                logInfo('Cleaned up old recovery backup file');
            }
        }
    } catch {
        // Non-critical
    }

    return cleaned;
}
