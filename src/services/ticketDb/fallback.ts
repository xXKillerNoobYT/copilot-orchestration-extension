/**
 * Database Fallback Module
 *
 * Handles error detection and automatic fallback from SQLite to in-memory mode.
 * Manages SQLITE_BUSY retry, SQLITE_FULL detection, EACCES permission errors,
 * and graceful degradation.
 *
 * **Simple explanation**: Like a pilot switching from autopilot to manual
 * when something goes wrong. If the database file can't be used (disk full,
 * no permissions), we switch to storing everything in memory and keep
 * working. Not ideal, but much better than crashing.
 *
 * @module ticketDb/fallback
 * @since MT-008.1
 */

import { logInfo, logWarn, logError } from '../../logger';
import { isSqliteBusy, isSqliteFull, withRetry, RetryConfig, RetryResult } from './retry';
import { DbMode, getDbStatusManager } from './status';

/**
 * Error categories that the fallback system handles
 */
export type DbErrorCategory = 'busy' | 'full' | 'permission' | 'corruption' | 'unknown';

/**
 * Result of error classification
 */
export interface ErrorClassification {
    /** The error category */
    category: DbErrorCategory;
    /** Whether the error is retryable */
    retryable: boolean;
    /** Whether fallback to memory should be triggered */
    triggersFallback: boolean;
    /** Human-readable description */
    description: string;
    /** Suggested action */
    suggestedAction: string;
}

/**
 * Fallback trigger record
 */
export interface FallbackTrigger {
    /** When the fallback was triggered */
    triggeredAt: string;
    /** What error caused it */
    error: string;
    /** Error category */
    category: DbErrorCategory;
    /** Number of tickets in memory at time of fallback */
    ticketCount: number;
    /** Previous mode */
    previousMode: DbMode;
}

/**
 * Degradation rule - which features are affected in which modes
 */
export interface DegradationRule {
    /** Feature name */
    feature: string;
    /** Required mode for this feature */
    requiredMode: DbMode;
    /** Whether the feature is disabled or returns limited results */
    degradationType: 'disabled' | 'limited';
    /** Message to show when feature is unavailable */
    message: string;
}

/**
 * Default degradation rules
 *
 * **Simple explanation**: These rules say which features stop working
 * when we switch to emergency mode. Basic stuff (create/read tickets)
 * always works. Advanced stuff (search, pooling) might not.
 */
export const DEGRADATION_RULES: DegradationRule[] = [
    {
        feature: 'fullTextSearch',
        requiredMode: 'sqlite',
        degradationType: 'disabled',
        message: 'Full-text search is not available in memory mode. Use basic filtering instead.',
    },
    {
        feature: 'connectionPooling',
        requiredMode: 'sqlite',
        degradationType: 'disabled',
        message: 'Connection pooling is disabled in memory mode (single connection used).',
    },
    {
        feature: 'dataPersistence',
        requiredMode: 'sqlite',
        degradationType: 'limited',
        message: 'Data is stored in memory only. Recovery.json saves provide backup, but data may be lost on restart.',
    },
    {
        feature: 'indexedQueries',
        requiredMode: 'sqlite',
        degradationType: 'limited',
        message: 'Query performance may be reduced in memory mode (no SQLite indexes).',
    },
];

/**
 * Classify a database error to determine the appropriate response.
 *
 * **Simple explanation**: Looks at an error and figures out what kind
 * of problem it is - busy (try again), full (switch to memory),
 * permission denied (try different location), or something else.
 *
 * @param error - The error to classify
 * @returns Classification with recommended action
 */
export function classifyError(error: unknown): ErrorClassification {
    const msg = error instanceof Error ? error.message : String(error);
    const lowerMsg = msg.toLowerCase();

    // SQLITE_BUSY - database is locked by another process
    if (isSqliteBusy(error)) {
        return {
            category: 'busy',
            retryable: true,
            triggersFallback: false,
            description: 'Database is busy (locked by another operation)',
            suggestedAction: 'Retry with exponential backoff',
        };
    }

    // SQLITE_FULL - disk is full
    if (isSqliteFull(error)) {
        return {
            category: 'full',
            retryable: false,
            triggersFallback: true,
            description: 'Database disk is full',
            suggestedAction: 'Switch to in-memory mode and save recovery data',
        };
    }

    // EACCES - permission denied
    if (lowerMsg.includes('eacces') || lowerMsg.includes('permission denied') || lowerMsg.includes('access denied')) {
        return {
            category: 'permission',
            retryable: false,
            triggersFallback: true,
            description: 'Permission denied to access database file',
            suggestedAction: 'Try alternate path, then fall back to in-memory mode',
        };
    }

    // Database corruption
    if (lowerMsg.includes('corrupt') || lowerMsg.includes('malformed') || lowerMsg.includes('not a database')) {
        return {
            category: 'corruption',
            retryable: false,
            triggersFallback: true,
            description: 'Database file is corrupted',
            suggestedAction: 'Switch to in-memory mode and attempt recovery from backup',
        };
    }

    // Unknown error
    return {
        category: 'unknown',
        retryable: false,
        triggersFallback: false,
        description: `Unknown database error: ${msg}`,
        suggestedAction: 'Log error and continue with current mode',
    };
}

/**
 * Execute a database operation with automatic error handling and fallback.
 *
 * **Simple explanation**: Wraps any database call so that if the database
 * is busy, we retry. If the disk is full or permissions fail, we switch
 * to in-memory mode. Your code doesn't need to handle these cases itself.
 *
 * @param operation - The database operation to execute
 * @param fallbackOperation - Alternative operation for memory mode (optional)
 * @param retryConfig - Optional retry configuration
 * @returns The operation result, or fallback result if primary failed
 */
export async function withFallback<T>(
    operation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>,
    retryConfig?: Partial<RetryConfig>
): Promise<FallbackResult<T>> {
    // First try with retry for busy errors
    const retryResult: RetryResult<T> = await withRetry(operation, retryConfig);

    if (retryResult.success) {
        return {
            value: retryResult.value as T,
            usedFallback: false,
            attempts: retryResult.attempts,
            errors: retryResult.errors,
        };
    }

    // Classify the error
    const lastError = retryResult.lastError || 'Unknown error';
    const classification = classifyError(new Error(lastError));

    // If it triggers fallback and we have a fallback operation
    if (classification.triggersFallback && fallbackOperation) {
        logWarn(`Fallback triggered (${classification.category}): ${classification.description}`);

        try {
            const fallbackValue = await fallbackOperation();
            return {
                value: fallbackValue,
                usedFallback: true,
                attempts: retryResult.attempts,
                errors: retryResult.errors,
                fallbackReason: classification.description,
            };
        } catch (fbError: unknown) {
            const fbMsg = fbError instanceof Error ? fbError.message : String(fbError);
            logError(`Fallback operation also failed: ${fbMsg}`);
            return {
                value: undefined as unknown as T,
                usedFallback: true,
                attempts: retryResult.attempts + 1,
                errors: [...retryResult.errors, fbMsg],
                fallbackReason: classification.description,
                failed: true,
            };
        }
    }

    // No fallback available or not a fallback-triggering error
    return {
        value: undefined as unknown as T,
        usedFallback: false,
        attempts: retryResult.attempts,
        errors: retryResult.errors,
        failed: true,
    };
}

/**
 * Result of a fallback-protected operation
 */
export interface FallbackResult<T> {
    /** The operation result */
    value: T;
    /** Whether fallback was used */
    usedFallback: boolean;
    /** Number of attempts */
    attempts: number;
    /** All errors encountered */
    errors: string[];
    /** Why fallback was triggered (if it was) */
    fallbackReason?: string;
    /** Whether the operation completely failed */
    failed?: boolean;
}

/**
 * Check which features are degraded in the current mode.
 *
 * **Simple explanation**: Returns a list of features that don't work
 * (or work poorly) in the current database mode. Useful for showing
 * warnings in the UI.
 *
 * @param currentMode - The current database mode
 * @returns Array of degraded features with their messages
 */
export function getDegradedFeatures(currentMode: DbMode): DegradationRule[] {
    if (currentMode === 'sqlite') {
        return []; // All features available
    }
    return DEGRADATION_RULES.filter(rule => rule.requiredMode === 'sqlite');
}

/**
 * Check if a specific feature is available in the given mode.
 *
 * @param feature - Feature name to check
 * @param currentMode - Current database mode
 * @returns true if the feature is fully available
 */
export function isFeatureDegraded(feature: string, currentMode: DbMode): boolean {
    if (currentMode === 'sqlite') return false;
    return DEGRADATION_RULES.some(rule => rule.feature === feature);
}

/**
 * Get a user-friendly status message for the current mode.
 *
 * @param currentMode - Current database mode
 * @returns Human-readable status message
 */
export function getStatusMessage(currentMode: DbMode): string {
    switch (currentMode) {
        case 'sqlite':
            return 'Database is operating normally.';
        case 'memory':
            return '⚠️ Running in memory mode. Data will not persist across restarts. Recovery backups are enabled.';
        case 'recovery':
            return '🔄 Running in recovery mode. Restoring data from backup.';
        default:
            return 'Unknown database mode.';
    }
}

/**
 * Create a FallbackTrigger record for logging.
 *
 * @param error - The error that triggered fallback
 * @param ticketCount - Number of tickets in memory
 * @param previousMode - Mode before fallback
 * @returns FallbackTrigger record
 */
export function createFallbackTrigger(
    error: string,
    ticketCount: number,
    previousMode: DbMode
): FallbackTrigger {
    const classification = classifyError(new Error(error));
    return {
        triggeredAt: new Date().toISOString(),
        error,
        category: classification.category,
        ticketCount,
        previousMode,
    };
}

/**
 * Determine if the system should attempt to restore from fallback.
 *
 * **Simple explanation**: After running in memory mode for a while,
 * checks if the original problem might be fixed (disk freed up,
 * permissions restored) and recommends whether to try switching back.
 *
 * @param trigger - The original fallback trigger
 * @param maxAgeMs - How long to wait before attempting restore (default: 5 minutes)
 * @returns Whether a restore attempt is recommended
 */
export function shouldAttemptRestore(trigger: FallbackTrigger, maxAgeMs: number = 5 * 60 * 1000): boolean {
    const age = Date.now() - new Date(trigger.triggeredAt).getTime();

    // Don't attempt restore too soon
    if (age < maxAgeMs) {
        return false;
    }

    // Corruption can't auto-fix
    if (trigger.category === 'corruption') {
        return false;
    }

    // Full and permission errors might resolve
    return trigger.category === 'full' || trigger.category === 'permission';
}
