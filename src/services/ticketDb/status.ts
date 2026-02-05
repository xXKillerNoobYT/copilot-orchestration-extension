/**
 * Database Status Module
 *
 * Tracks and exposes the current state of the ticket database,
 * including mode (sqlite/memory/recovery), health, and feature availability.
 *
 * **Simple explanation**: Like a dashboard light in a car that tells you
 * if something is wrong. This module tells the rest of the extension
 * whether the database is working normally, running in emergency mode,
 * or recovering from a problem.
 *
 * @module ticketDb/status
 * @since MT-008.6
 */

import { logInfo, logWarn } from '../../logger';

/**
 * Database operating modes
 */
export type DbMode = 'sqlite' | 'memory' | 'recovery';

/**
 * Database health levels
 */
export type DbHealth = 'healthy' | 'degraded' | 'critical';

/**
 * Complete database status snapshot
 */
export interface DbStatus {
    /** Current operating mode */
    mode: DbMode;
    /** Health level */
    health: DbHealth;
    /** Path to the database file (null for in-memory) */
    dbPath: string | null;
    /** Whether the database is in fallback mode */
    isFallback: boolean;
    /** When the current mode was entered */
    modeChangedAt: string;
    /** Reason for current mode (e.g., "SQLITE_FULL", "Primary path available") */
    reason: string;
    /** Number of mode transitions since startup */
    transitionCount: number;
    /** Features currently available based on mode */
    availableFeatures: FeatureAvailability;
    /** Last error that caused a mode change (if any) */
    lastError?: string;
}

/**
 * Feature availability in current mode
 *
 * **Simple explanation**: Not all features work in every mode.
 * Full-text search needs SQLite, so it's disabled in memory mode.
 * This tells the UI which features to show/hide.
 */
export interface FeatureAvailability {
    /** Basic CRUD (always available) */
    crud: boolean;
    /** Full-text search (requires SQLite) */
    search: boolean;
    /** Data persistence across restarts */
    persistence: boolean;
    /** Recovery.json backups */
    recovery: boolean;
    /** Connection pooling */
    pooling: boolean;
    /** History tracking */
    history: boolean;
}

/**
 * Feature availability per mode
 */
const MODE_FEATURES: Record<DbMode, FeatureAvailability> = {
    sqlite: {
        crud: true,
        search: true,
        persistence: true,
        recovery: true,
        pooling: true,
        history: true,
    },
    memory: {
        crud: true,
        search: false,
        persistence: false,
        recovery: true,
        pooling: false,
        history: true,
    },
    recovery: {
        crud: true,
        search: false,
        persistence: false,
        recovery: true,
        pooling: false,
        history: true,
    },
};

/**
 * Listener type for status change events
 */
export type StatusChangeListener = (status: DbStatus) => void;

/**
 * Database Status Manager
 *
 * **Simple explanation**: Keeps track of how the database is doing
 * and lets other parts of the system know when something changes.
 * Like a health monitor that broadcasts alerts.
 */
export class DbStatusManager {
    private currentStatus: DbStatus;
    private listeners: StatusChangeListener[] = [];

    constructor(initialMode: DbMode = 'sqlite', dbPath: string | null = null, reason: string = 'Initial startup') {
        this.currentStatus = {
            mode: initialMode,
            health: initialMode === 'sqlite' ? 'healthy' : 'degraded',
            dbPath,
            isFallback: initialMode !== 'sqlite',
            modeChangedAt: new Date().toISOString(),
            reason,
            transitionCount: 0,
            availableFeatures: { ...MODE_FEATURES[initialMode] },
        };
    }

    /**
     * Get the current database status.
     *
     * @returns A snapshot of current status (copy, not reference)
     */
    getStatus(): DbStatus {
        return {
            ...this.currentStatus,
            availableFeatures: { ...this.currentStatus.availableFeatures },
        };
    }

    /**
     * Get just the current mode.
     */
    getMode(): DbMode {
        return this.currentStatus.mode;
    }

    /**
     * Check if a specific feature is available.
     *
     * @param feature - The feature to check
     * @returns true if the feature is available in current mode
     */
    isFeatureAvailable(feature: keyof FeatureAvailability): boolean {
        return this.currentStatus.availableFeatures[feature];
    }

    /**
     * Transition to a new database mode.
     *
     * **Simple explanation**: Switches the database to a different mode
     * (e.g., from SQLite to in-memory) and tells everyone about it.
     *
     * @param newMode - The mode to switch to
     * @param reason - Why we're switching
     * @param dbPath - New database path (null for memory modes)
     * @param error - The error that triggered the switch (if any)
     */
    transitionTo(
        newMode: DbMode,
        reason: string,
        dbPath: string | null = null,
        error?: string
    ): void {
        const oldMode = this.currentStatus.mode;
        if (oldMode === newMode && this.currentStatus.dbPath === dbPath) {
            return; // No change
        }

        this.currentStatus = {
            mode: newMode,
            health: this.determineHealth(newMode),
            dbPath,
            isFallback: newMode !== 'sqlite',
            modeChangedAt: new Date().toISOString(),
            reason,
            transitionCount: this.currentStatus.transitionCount + 1,
            availableFeatures: { ...MODE_FEATURES[newMode] },
            lastError: error,
        };

        logInfo(`Database mode: ${oldMode} → ${newMode} (${reason})`);
        if (newMode !== 'sqlite') {
            logWarn(`Database running in ${newMode} mode: ${reason}`);
        }

        // Notify all listeners
        this.notifyListeners();
    }

    /**
     * Register a listener for status changes.
     *
     * @param listener - Callback when status changes
     * @returns Unsubscribe function
     */
    onStatusChange(listener: StatusChangeListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * Get the number of registered listeners.
     */
    getListenerCount(): number {
        return this.listeners.length;
    }

    /**
     * Check if the database is in fallback mode.
     */
    isFallback(): boolean {
        return this.currentStatus.isFallback;
    }

    /**
     * Check if the database is healthy.
     */
    isHealthy(): boolean {
        return this.currentStatus.health === 'healthy';
    }

    // ─── Private Methods ─────────────────────────────────────────────────

    private determineHealth(mode: DbMode): DbHealth {
        switch (mode) {
            case 'sqlite':
                return 'healthy';
            case 'memory':
                return 'degraded';
            case 'recovery':
                return 'critical';
            default:
                return 'critical';
        }
    }

    private notifyListeners(): void {
        const snapshot = this.getStatus();
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                logWarn(`Status listener error: ${msg}`);
            }
        }
    }
}

// ─── Singleton ────────────────────────────────────────────────────────────

let statusManagerInstance: DbStatusManager | null = null;

/**
 * Get the singleton DbStatusManager.
 *
 * @returns The status manager instance
 */
export function getDbStatusManager(): DbStatusManager {
    if (!statusManagerInstance) {
        statusManagerInstance = new DbStatusManager();
    }
    return statusManagerInstance;
}

/**
 * Initialize the DbStatusManager with a specific mode.
 *
 * @param mode - Initial mode
 * @param dbPath - Database path
 * @param reason - Reason for this mode
 */
export function initializeDbStatus(mode: DbMode, dbPath: string | null, reason: string): DbStatusManager {
    statusManagerInstance = new DbStatusManager(mode, dbPath, reason);
    return statusManagerInstance;
}

/**
 * Reset the status manager (for tests).
 */
export function resetDbStatusForTests(): void {
    statusManagerInstance = null;
}
