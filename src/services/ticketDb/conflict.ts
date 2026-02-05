/**
 * Conflict Detection Module
 *
 * Implements optimistic locking and conflict detection for concurrent
 * ticket updates. Provides merge options when conflicts occur.
 *
 * **Simple explanation**: When two agents try to update the same ticket
 * at the same time, this module detects the conflict and helps figure
 * out what to do about it - like a traffic cop at an intersection.
 *
 * @module ticketDb/conflict
 * @since MT-007.1 & MT-007.3
 */

import { logInfo, logWarn } from '../../logger';

/**
 * Conflict information when an update fails
 */
export interface ConflictInfo {
    /** The ticket ID that has a conflict */
    ticketId: string;
    /** The version we tried to update from */
    expectedVersion: number;
    /** The actual current version in the database */
    actualVersion: number;
    /** Fields that have changed since we last read */
    conflictingFields: string[];
    /** Suggestions for resolving the conflict */
    resolutionOptions: ConflictResolution[];
}

/**
 * A possible way to resolve a conflict
 */
export interface ConflictResolution {
    /** Short name for the resolution strategy */
    strategy: 'force' | 'merge' | 'retry' | 'abort';
    /** Description of what this strategy does */
    description: string;
}

/**
 * Result of a version check
 */
export interface VersionCheckResult {
    /** Whether the version matches (no conflict) */
    valid: boolean;
    /** The current version in the database */
    currentVersion: number;
    /** Conflict details (if invalid) */
    conflict?: ConflictInfo;
}

/**
 * Check if a ticket version matches the expected version for an update.
 *
 * **Simple explanation**: Before updating a ticket, check that nobody else
 * has changed it since we last looked. Like checking if the version number
 * on a Wikipedia page still matches before saving your edits.
 *
 * @param ticketId - The ticket being updated
 * @param expectedVersion - The version we expect (from when we last read it)
 * @param actualVersion - The current version in the database
 * @param changedFields - Optional list of fields that were modified concurrently
 * @returns Version check result
 *
 * @example
 * const check = checkVersion('TK-0001', 3, 3);
 * // check.valid === true (versions match)
 *
 * const conflict = checkVersion('TK-0001', 3, 5);
 * // conflict.valid === false (someone else updated)
 */
export function checkVersion(
    ticketId: string,
    expectedVersion: number,
    actualVersion: number,
    changedFields: string[] = []
): VersionCheckResult {
    if (expectedVersion === actualVersion) {
        return {
            valid: true,
            currentVersion: actualVersion,
        };
    }

    logWarn(
        `Version conflict for ${ticketId}: expected v${expectedVersion}, got v${actualVersion}`
    );

    const conflict: ConflictInfo = {
        ticketId,
        expectedVersion,
        actualVersion,
        conflictingFields: changedFields,
        resolutionOptions: getResolutionOptions(changedFields),
    };

    return {
        valid: false,
        currentVersion: actualVersion,
        conflict,
    };
}

/**
 * Increment the version number for an update.
 *
 * **Simple explanation**: Every time a ticket is updated, its version
 * number goes up by one. This is how we detect conflicts.
 *
 * @param currentVersion - The current version
 * @returns The next version number
 */
export function incrementVersion(currentVersion: number): number {
    return currentVersion + 1;
}

/**
 * Build a SQL WHERE clause for optimistic locking.
 *
 * **Simple explanation**: Adds "AND version = ?" to the SQL update so
 * the update only succeeds if the version hasn't changed. If someone
 * else changed it first, the update affects 0 rows.
 *
 * @param expectedVersion - The version we expect
 * @returns SQL clause and parameter
 */
export function buildVersionCheckSQL(expectedVersion: number): {
    clause: string;
    param: number;
} {
    return {
        clause: 'AND version = ?',
        param: expectedVersion,
    };
}

/**
 * Detect field-level conflicts between two ticket versions.
 *
 * **Simple explanation**: Compares the original ticket we read with
 * what's currently in the database, and our changes. Finds which
 * fields have been changed by both sides (true conflicts).
 *
 * @param original - The ticket state when we first read it
 * @param current - The ticket state currently in the database
 * @param ourChanges - The changes we're trying to apply
 * @returns List of field names that conflict
 */
export function detectFieldConflicts(
    original: Record<string, unknown>,
    current: Record<string, unknown>,
    ourChanges: Record<string, unknown>
): string[] {
    const conflicts: string[] = [];
    const immutableFields = ['id', 'createdAt'];

    for (const field of Object.keys(ourChanges)) {
        if (immutableFields.includes(field)) continue;

        // Check if the field was changed in the database since we read it
        const originalValue = original[field];
        const currentValue = current[field];
        const ourValue = ourChanges[field];

        // If the current DB value differs from what we originally read,
        // AND our change also differs from the original, it's a conflict
        if (!valuesEqual(originalValue, currentValue) && !valuesEqual(originalValue, ourValue)) {
            // But if we're setting the same value as the current DB, no conflict
            if (!valuesEqual(ourValue, currentValue)) {
                conflicts.push(field);
            }
        }
    }

    return conflicts;
}

/**
 * Attempt a three-way merge of conflicting ticket updates.
 *
 * **Simple explanation**: When two updates conflict, tries to combine
 * them automatically. If both changed different fields, we can keep
 * both changes. If both changed the same field, we can't auto-merge.
 *
 * @param original - The original state both updates started from
 * @param current - The current state (includes other person's changes)
 * @param ourChanges - Our changes
 * @returns Merged result or null if auto-merge isn't possible
 */
export function attemptMerge(
    original: Record<string, unknown>,
    current: Record<string, unknown>,
    ourChanges: Record<string, unknown>
): { merged: Record<string, unknown>; autoMerged: boolean; manualFields: string[] } {
    const conflicts = detectFieldConflicts(original, current, ourChanges);

    // Start with current database state
    const merged = { ...current };
    const manualFields: string[] = [];

    for (const [field, value] of Object.entries(ourChanges)) {
        if (conflicts.includes(field)) {
            // This field was changed by both sides - needs manual resolution
            manualFields.push(field);
        } else {
            // Our change doesn't conflict - apply it
            merged[field] = value;
        }
    }

    return {
        merged,
        autoMerged: manualFields.length === 0,
        manualFields,
    };
}

// ─── Internal Helpers ────────────────────────────────────────────────────

/**
 * Get resolution options based on the type of conflict.
 */
function getResolutionOptions(conflictingFields: string[]): ConflictResolution[] {
    const options: ConflictResolution[] = [
        {
            strategy: 'retry',
            description: 'Refresh the ticket and re-apply changes',
        },
        {
            strategy: 'abort',
            description: 'Cancel the update and keep the current version',
        },
    ];

    if (conflictingFields.length === 0) {
        // No specific field conflicts - merge might work
        options.unshift({
            strategy: 'merge',
            description: 'Attempt to merge both sets of changes automatically',
        });
    }

    options.push({
        strategy: 'force',
        description: 'Overwrite with our changes (last-write-wins)',
    });

    return options;
}

/**
 * Compare two values for equality (handles objects/arrays via JSON).
 */
function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null && b === undefined) return true;
    if (a === undefined && b === null) return true;

    if (typeof a === 'object' && typeof b === 'object') {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    return false;
}
