/**
 * Recovery Persistence Module
 *
 * Manages periodic saving of in-memory ticket data to recovery.json
 * and automatic loading on startup.
 *
 * **Simple explanation**: When the database can't use a file (disk full,
 * no permission), we save a copy of all tickets to a JSON file every
 * few minutes. If the extension restarts, we load that backup file
 * so tickets aren't completely lost.
 *
 * @module ticketDb/recovery
 * @since MT-008.4
 */

import { logInfo, logWarn, logError } from '../../logger';
import { loadRecoveryData, saveRecoveryData, cleanupRecoveryFiles } from './init';

/**
 * Recovery configuration
 */
export interface RecoveryConfig {
    /** Path to recovery.json file */
    recoveryPath: string;
    /** How often to save recovery data (ms, default: 60000 = 1 minute) */
    saveIntervalMs: number;
    /** Maximum age of recovery files (ms, default: 7 days) */
    maxRecoveryAge: number;
    /** Whether auto-save is enabled */
    autoSaveEnabled: boolean;
}

/**
 * Default recovery configuration
 */
export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
    recoveryPath: '.coe/recovery.json',
    saveIntervalMs: 60000,
    maxRecoveryAge: 7 * 24 * 60 * 60 * 1000,
    autoSaveEnabled: true,
};

/**
 * Recovery data loaded from file
 */
export interface RecoverySnapshot {
    /** Loaded ticket data */
    tickets: Record<string, unknown>[];
    /** When the recovery was saved */
    timestamp: string;
    /** Whether the data was validated successfully */
    validated: boolean;
    /** Number of tickets loaded */
    ticketCount: number;
}

/**
 * Recovery Manager
 *
 * **Simple explanation**: A background worker that periodically saves
 * all your tickets to a backup file. Like auto-save in a word processor.
 * If something goes wrong with the main database, this backup is your
 * safety net.
 */
export class RecoveryManager {
    private config: RecoveryConfig;
    private saveInterval: ReturnType<typeof setInterval> | null = null;
    private ticketProvider: (() => Record<string, unknown>[]) | null = null;
    private lastSaveTime: number = 0;
    private saveCount: number = 0;
    private active: boolean = false;

    constructor(config?: Partial<RecoveryConfig>) {
        this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
    }

    /**
     * Start periodic recovery saves.
     *
     * **Simple explanation**: Starts the auto-save timer. Every minute
     * (by default), it grabs all tickets and saves them to recovery.json.
     *
     * @param ticketProvider - Function that returns current tickets
     */
    start(ticketProvider: () => Record<string, unknown>[]): void {
        if (this.active) {
            logWarn('Recovery manager already active');
            return;
        }

        this.ticketProvider = ticketProvider;
        this.active = true;

        if (this.config.autoSaveEnabled) {
            this.saveInterval = setInterval(
                () => this.performSave(),
                this.config.saveIntervalMs
            );
            logInfo(`Recovery auto-save started (interval: ${this.config.saveIntervalMs}ms)`);
        }
    }

    /**
     * Stop periodic recovery saves.
     *
     * **Simple explanation**: Stops the auto-save timer. Does one final
     * save before stopping, so no data is lost.
     */
    async stop(): Promise<void> {
        if (this.saveInterval) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }

        // Final save before stopping
        if (this.active && this.ticketProvider) {
            await this.performSave();
        }

        this.active = false;
        this.ticketProvider = null;
        logInfo('Recovery manager stopped');
    }

    /**
     * Trigger an immediate save (outside the normal interval).
     *
     * @returns true if save succeeded
     */
    async saveNow(): Promise<boolean> {
        return this.performSave();
    }

    /**
     * Load recovery data from file.
     *
     * **Simple explanation**: Reads the backup file and returns the
     * saved tickets. Used on startup to restore data after a crash.
     *
     * @returns Recovery snapshot, or null if no recovery data available
     */
    loadRecovery(): RecoverySnapshot | null {
        const data = loadRecoveryData(this.config.recoveryPath);
        if (!data) {
            return null;
        }

        return {
            tickets: data.tickets,
            timestamp: data.timestamp,
            validated: true,
            ticketCount: data.tickets.length,
        };
    }

    /**
     * Clean up old recovery files.
     *
     * @returns Number of files cleaned up
     */
    cleanup(): number {
        return cleanupRecoveryFiles(this.config.recoveryPath, this.config.maxRecoveryAge);
    }

    /**
     * Check if the recovery manager is active.
     */
    isActive(): boolean {
        return this.active;
    }

    /**
     * Get statistics about recovery saves.
     */
    getStats(): { saveCount: number; lastSaveTime: number; active: boolean; intervalMs: number } {
        return {
            saveCount: this.saveCount,
            lastSaveTime: this.lastSaveTime,
            active: this.active,
            intervalMs: this.config.saveIntervalMs,
        };
    }

    /**
     * Get the recovery path.
     */
    getRecoveryPath(): string {
        return this.config.recoveryPath;
    }

    // ─── Private Methods ─────────────────────────────────────────────────

    private async performSave(): Promise<boolean> {
        if (!this.ticketProvider) {
            logWarn('No ticket provider set for recovery save');
            return false;
        }

        try {
            const tickets = this.ticketProvider();
            const success = saveRecoveryData(this.config.recoveryPath, tickets);

            if (success) {
                this.saveCount++;
                this.lastSaveTime = Date.now();
                logInfo(`Recovery save #${this.saveCount}: ${tickets.length} ticket(s) saved`);
            }

            return success;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`Recovery save failed: ${msg}`);
            return false;
        }
    }
}

/**
 * Load and validate recovery data, returning tickets ready for insertion.
 *
 * **Simple explanation**: A convenience function that loads the backup
 * file, checks it's valid, and returns the tickets. One-liner for
 * startup recovery.
 *
 * @param recoveryPath - Path to recovery.json
 * @returns Array of ticket data, or empty array if no recovery available
 */
export function loadRecoveryTickets(recoveryPath: string): Record<string, unknown>[] {
    const data = loadRecoveryData(recoveryPath);
    if (!data || !data.tickets || data.tickets.length === 0) {
        return [];
    }

    logInfo(`Loaded ${data.tickets.length} ticket(s) from recovery (saved: ${data.timestamp})`);
    return data.tickets;
}

/**
 * Check if recovery data exists and is recent enough to use.
 *
 * @param recoveryPath - Path to recovery.json
 * @param maxAgeMs - Maximum age of recovery data (default: 7 days)
 * @returns true if usable recovery data exists
 */
export function hasUsableRecovery(recoveryPath: string, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): boolean {
    const data = loadRecoveryData(recoveryPath);
    if (!data || !data.timestamp) {
        return false;
    }

    const age = Date.now() - new Date(data.timestamp).getTime();
    return age < maxAgeMs && data.tickets.length > 0;
}

// ─── Singleton ────────────────────────────────────────────────────────────

let recoveryManagerInstance: RecoveryManager | null = null;

/**
 * Get the singleton RecoveryManager.
 */
export function getRecoveryManager(config?: Partial<RecoveryConfig>): RecoveryManager {
    if (!recoveryManagerInstance) {
        recoveryManagerInstance = new RecoveryManager(config);
    }
    return recoveryManagerInstance;
}

/**
 * Reset the recovery manager (for tests).
 */
export function resetRecoveryManagerForTests(): void {
    if (recoveryManagerInstance) {
        // Don't await stop in sync reset
        recoveryManagerInstance.stop().catch(() => {});
    }
    recoveryManagerInstance = null;
}
