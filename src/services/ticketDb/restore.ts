/**
 * Database Restore Module
 *
 * Handles migration from in-memory mode back to SQLite when the
 * original problem is resolved (disk space freed, permissions restored).
 *
 * **Simple explanation**: After running on emergency power (memory mode),
 * this module checks if the main power is back (disk space available,
 * permissions fixed) and moves all the data back to the permanent
 * database. Like moving from a tent back into your house after repairs.
 *
 * @module ticketDb/restore
 * @since MT-008.9
 */

import { logInfo, logWarn, logError } from '../../logger';
import { ensureDbDirectory, isDbWritable } from './init';

/**
 * Restore check result
 */
export interface RestoreCheck {
    /** Whether restore is possible */
    canRestore: boolean;
    /** Path that would be used for restore */
    targetPath: string | null;
    /** Reason why restore can/can't happen */
    reason: string;
    /** Timestamp of the check */
    checkedAt: string;
}

/**
 * Restore operation result
 */
export interface RestoreResult {
    /** Whether the restore succeeded */
    success: boolean;
    /** Number of tickets migrated */
    ticketsMigrated: number;
    /** Target path used */
    targetPath: string | null;
    /** Any errors encountered */
    errors: string[];
    /** Duration of restore in ms */
    durationMs: number;
}

/**
 * Restore configuration
 */
export interface RestoreConfig {
    /** Primary path to attempt restore to */
    primaryPath: string;
    /** Alternate paths to try */
    alternatePaths: string[];
    /** Minimum time between restore checks (ms, default: 5 minutes) */
    checkIntervalMs: number;
    /** Maximum tickets to migrate in a single batch */
    batchSize: number;
}

/**
 * Default restore configuration
 */
export const DEFAULT_RESTORE_CONFIG: RestoreConfig = {
    primaryPath: '',
    alternatePaths: [],
    checkIntervalMs: 5 * 60 * 1000,
    batchSize: 100,
};

/**
 * Check if the database can be restored to a file-based SQLite database.
 *
 * **Simple explanation**: Checks if the problem that caused us to switch
 * to memory mode has been fixed. Tries the original path first, then
 * alternate paths.
 *
 * @param config - Restore configuration
 * @returns RestoreCheck indicating whether restore is possible
 */
export function checkRestoreEligibility(config: Partial<RestoreConfig> = {}): RestoreCheck {
    const cfg = { ...DEFAULT_RESTORE_CONFIG, ...config };
    const now = new Date().toISOString();

    // Try primary path
    if (cfg.primaryPath) {
        if (ensureDbDirectory(cfg.primaryPath) && isDbWritable(cfg.primaryPath)) {
            return {
                canRestore: true,
                targetPath: cfg.primaryPath,
                reason: 'Primary path is now writable',
                checkedAt: now,
            };
        }
    }

    // Try alternate paths
    for (const altPath of cfg.alternatePaths) {
        if (ensureDbDirectory(altPath) && isDbWritable(altPath)) {
            return {
                canRestore: true,
                targetPath: altPath,
                reason: `Alternate path available: ${altPath}`,
                checkedAt: now,
            };
        }
    }

    return {
        canRestore: false,
        targetPath: null,
        reason: 'No writable database path available',
        checkedAt: now,
    };
}

/**
 * Prepare tickets for migration from memory to SQLite.
 *
 * **Simple explanation**: Takes the tickets from memory and formats
 * them for insertion into a fresh SQLite database. Makes sure each
 * ticket has all required fields.
 *
 * @param tickets - In-memory tickets to prepare
 * @returns Array of prepared ticket records
 */
export function prepareTicketsForMigration(
    tickets: Record<string, unknown>[]
): Record<string, unknown>[] {
    return tickets.map(ticket => {
        const prepared = { ...ticket };

        // Ensure required fields have defaults
        if (!prepared.createdAt) {
            prepared.createdAt = new Date().toISOString();
        }
        if (!prepared.updatedAt) {
            prepared.updatedAt = new Date().toISOString();
        }
        if (!prepared.status) {
            prepared.status = 'open';
        }
        if (!prepared.version) {
            prepared.version = 1;
        }

        return prepared;
    });
}

/**
 * Execute a restore operation (simulated for testability).
 *
 * **Simple explanation**: The actual work of moving tickets from memory
 * to SQLite. Takes a list of tickets and a function that knows how to
 * insert them into the database.
 *
 * @param tickets - Tickets to migrate
 * @param inserter - Function that inserts a single ticket
 * @param batchSize - How many tickets to insert per batch
 * @returns RestoreResult with success/failure details
 */
export async function executeRestore(
    tickets: Record<string, unknown>[],
    inserter: (ticket: Record<string, unknown>) => Promise<void>,
    batchSize: number = 100
): Promise<RestoreResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let migrated = 0;

    const prepared = prepareTicketsForMigration(tickets);

    // Process in batches
    for (let i = 0; i < prepared.length; i += batchSize) {
        const batch = prepared.slice(i, i + batchSize);

        for (const ticket of batch) {
            try {
                await inserter(ticket);
                migrated++;
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                errors.push(`Failed to migrate ticket ${ticket.id || 'unknown'}: ${msg}`);
                logWarn(`Restore: failed to migrate ticket ${ticket.id || 'unknown'}: ${msg}`);
            }
        }
    }

    const duration = Date.now() - startTime;

    if (errors.length === 0) {
        logInfo(`Restore complete: ${migrated} ticket(s) migrated in ${duration}ms`);
    } else {
        logWarn(`Restore completed with ${errors.length} error(s): ${migrated}/${prepared.length} tickets migrated`);
    }

    return {
        success: errors.length === 0,
        ticketsMigrated: migrated,
        targetPath: null, // Set by caller
        errors,
        durationMs: duration,
    };
}

/**
 * Restore Monitor
 *
 * **Simple explanation**: A background checker that periodically looks
 * to see if we can switch back from memory mode to SQLite. Like a
 * maintenance worker checking if the building is ready for people
 * to move back in.
 */
export class RestoreMonitor {
    private config: RestoreConfig;
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    private lastCheck: RestoreCheck | null = null;
    private onRestoreReady: ((check: RestoreCheck) => void) | null = null;
    private active: boolean = false;

    constructor(config: Partial<RestoreConfig> = {}) {
        this.config = { ...DEFAULT_RESTORE_CONFIG, ...config };
    }

    /**
     * Start monitoring for restore eligibility.
     *
     * @param onReady - Callback when restore becomes possible
     */
    start(onReady: (check: RestoreCheck) => void): void {
        if (this.active) {
            logWarn('Restore monitor already active');
            return;
        }

        this.onRestoreReady = onReady;
        this.active = true;

        this.checkInterval = setInterval(
            () => this.performCheck(),
            this.config.checkIntervalMs
        );

        logInfo(`Restore monitor started (interval: ${this.config.checkIntervalMs}ms)`);
    }

    /**
     * Stop monitoring.
     */
    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.active = false;
        this.onRestoreReady = null;
        logInfo('Restore monitor stopped');
    }

    /**
     * Get the last check result.
     */
    getLastCheck(): RestoreCheck | null {
        return this.lastCheck;
    }

    /**
     * Check if the monitor is active.
     */
    isActive(): boolean {
        return this.active;
    }

    /**
     * Perform an immediate check.
     *
     * @returns RestoreCheck result
     */
    checkNow(): RestoreCheck {
        return this.performCheck();
    }

    // ─── Private Methods ─────────────────────────────────────────────────

    private performCheck(): RestoreCheck {
        const check = checkRestoreEligibility(this.config);
        this.lastCheck = check;

        if (check.canRestore && this.onRestoreReady) {
            logInfo(`Restore possible: ${check.reason}`);
            this.onRestoreReady(check);
        }

        return check;
    }
}
