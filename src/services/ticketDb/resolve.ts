/**
 * Ticket Resolution & Reopening Module
 *
 * Handles resolving and reopening tickets with proper state transitions,
 * history tracking, and validation.
 *
 * **Simple explanation**: When a ticket is finished, you "resolve" it with
 * a note explaining what was done. If it needs more work later, you can
 * "reopen" it with a reason why.
 *
 * @module ticketDb/resolve
 * @since MT-006.8
 */

import { logInfo, logWarn } from '../../logger';

/**
 * Resolution data for closing a ticket
 */
export interface ResolutionData {
    /** The resolution text explaining what was done */
    resolution: string;
    /** Who resolved the ticket */
    resolvedBy: string;
    /** Timestamp (auto-generated if not provided) */
    resolvedAt?: string;
}

/**
 * Reopen data for reopening a resolved ticket
 */
export interface ReopenData {
    /** Reason for reopening */
    reason: string;
    /** Who reopened the ticket */
    reopenedBy: string;
    /** Timestamp (auto-generated if not provided) */
    reopenedAt?: string;
}

/**
 * History entry for tracking ticket changes
 */
export interface HistoryEntry {
    /** What action was taken */
    action: 'created' | 'resolved' | 'reopened' | 'status_change' | 'updated';
    /** Previous state */
    from: string;
    /** New state */
    to: string;
    /** Who made the change */
    by: string;
    /** When it happened */
    at: string;
    /** Optional note/reason */
    note?: string;
}

/**
 * Result of a resolve/reopen operation
 */
export interface OperationResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** The new status after the operation */
    newStatus?: string;
    /** Error message if failed */
    error?: string;
    /** History entry created */
    historyEntry?: HistoryEntry;
}

/**
 * Valid statuses that can be resolved from
 */
export const RESOLVABLE_STATUSES = ['open', 'in-progress', 'blocked', 'pending', 'in_review', 'escalated'];

/**
 * Valid statuses that can be reopened from
 */
export const REOPENABLE_STATUSES = ['resolved', 'rejected', 'done'];

/**
 * Create a resolution for a ticket.
 *
 * **Simple explanation**: Marks a ticket as "done" and records what
 * was accomplished. Like writing a completion note.
 *
 * @param currentStatus - The ticket's current status
 * @param data - Resolution details
 * @returns Operation result with new status and history entry
 */
export function createResolution(
    currentStatus: string,
    data: ResolutionData
): OperationResult {
    // Validate current status allows resolution
    if (!RESOLVABLE_STATUSES.includes(currentStatus)) {
        logWarn(`Cannot resolve ticket from status '${currentStatus}'`);
        return {
            success: false,
            error: `Cannot resolve ticket from status '${currentStatus}'. ` +
                   `Must be one of: ${RESOLVABLE_STATUSES.join(', ')}`,
        };
    }

    // Validate resolution text
    if (!data.resolution || data.resolution.trim().length === 0) {
        return {
            success: false,
            error: 'Resolution text is required',
        };
    }

    if (data.resolution.length > 2000) {
        return {
            success: false,
            error: 'Resolution text exceeds maximum length of 2000 characters',
        };
    }

    const now = data.resolvedAt || new Date().toISOString();

    const historyEntry: HistoryEntry = {
        action: 'resolved',
        from: currentStatus,
        to: 'resolved',
        by: data.resolvedBy,
        at: now,
        note: data.resolution,
    };

    logInfo(`Ticket resolved by ${data.resolvedBy}: ${data.resolution.substring(0, 50)}...`);

    return {
        success: true,
        newStatus: 'resolved',
        historyEntry,
    };
}

/**
 * Create a reopen operation for a ticket.
 *
 * **Simple explanation**: Takes a closed ticket and opens it back up
 * for more work. Records why it was reopened.
 *
 * @param currentStatus - The ticket's current status
 * @param data - Reopen details
 * @param reopenCount - How many times this ticket has been reopened before
 * @returns Operation result with new status and history entry
 */
export function createReopen(
    currentStatus: string,
    data: ReopenData,
    reopenCount: number = 0
): OperationResult {
    // Validate current status allows reopening
    if (!REOPENABLE_STATUSES.includes(currentStatus)) {
        logWarn(`Cannot reopen ticket from status '${currentStatus}'`);
        return {
            success: false,
            error: `Cannot reopen ticket from status '${currentStatus}'. ` +
                   `Must be one of: ${REOPENABLE_STATUSES.join(', ')}`,
        };
    }

    // Validate reason
    if (!data.reason || data.reason.trim().length === 0) {
        return {
            success: false,
            error: 'Reason for reopening is required',
        };
    }

    const now = data.reopenedAt || new Date().toISOString();

    const historyEntry: HistoryEntry = {
        action: 'reopened',
        from: currentStatus,
        to: 'open',
        by: data.reopenedBy,
        at: now,
        note: `Reopen #${reopenCount + 1}: ${data.reason}`,
    };

    logInfo(`Ticket reopened by ${data.reopenedBy} (reopen #${reopenCount + 1}): ${data.reason.substring(0, 50)}`);

    return {
        success: true,
        newStatus: 'open',
        historyEntry,
    };
}

/**
 * Parse the history JSON from a ticket record.
 *
 * **Simple explanation**: Takes the history text stored in the database
 * and turns it back into a list of history entries.
 *
 * @param historyJson - JSON string from the database
 * @returns Parsed history object
 */
export function parseHistory(
    historyJson: string | null | undefined
): { changes: HistoryEntry[]; reopenCount: number } {
    if (!historyJson || historyJson === '{}') {
        return { changes: [], reopenCount: 0 };
    }

    try {
        const parsed = JSON.parse(historyJson);
        const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
        const reopenCount = changes.filter((c: HistoryEntry) => c.action === 'reopened').length;
        return { changes, reopenCount };
    } catch {
        logWarn('Failed to parse ticket history JSON');
        return { changes: [], reopenCount: 0 };
    }
}

/**
 * Serialize history back to JSON for storage.
 *
 * @param changes - Array of history entries
 * @returns JSON string for database storage
 */
export function serializeHistory(changes: HistoryEntry[]): string {
    return JSON.stringify({ changes });
}

/**
 * Add a history entry to existing history.
 *
 * @param existingHistoryJson - Current history JSON string
 * @param entry - New entry to add
 * @returns Updated history JSON string
 */
export function appendHistory(
    existingHistoryJson: string | null | undefined,
    entry: HistoryEntry
): string {
    const { changes } = parseHistory(existingHistoryJson);
    changes.push(entry);
    return serializeHistory(changes);
}
