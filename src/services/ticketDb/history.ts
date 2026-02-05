/**
 * Ticket History Module
 *
 * Tracks and retrieves all changes made to tickets over time.
 * Provides a complete audit trail of who changed what and when.
 *
 * **Simple explanation**: Like a detailed logbook for each ticket.
 * Every time someone changes the status, adds a reply, or updates
 * a field, it gets recorded here with who did it and when.
 *
 * @module ticketDb/history
 * @since MT-006.10
 */

import { logInfo, logWarn } from '../../logger';

/**
 * A single change record in ticket history
 */
export interface ChangeRecord {
    /** What type of change was made */
    action: 'created' | 'updated' | 'resolved' | 'reopened' | 'status_change' | 'reply_added' | 'assigned' | 'priority_changed';
    /** Which field was changed (for field-level changes) */
    field?: string;
    /** Previous value */
    oldValue?: unknown;
    /** New value */
    newValue?: unknown;
    /** Who made the change */
    changedBy: string;
    /** When the change was made */
    changedAt: string;
    /** Optional note about the change */
    note?: string;
}

/**
 * Complete ticket history
 */
export interface TicketHistory {
    /** All change records in chronological order */
    changes: ChangeRecord[];
    /** Number of times the ticket was reopened */
    reopenCount: number;
    /** Total number of changes */
    totalChanges: number;
    /** When the first change was recorded */
    firstChange?: string;
    /** When the last change was recorded */
    lastChange?: string;
}

/**
 * Create a change record for a ticket update.
 *
 * **Simple explanation**: Records what field changed, from what value
 * to what value, and who made the change.
 *
 * @param field - The field that was changed
 * @param oldValue - Previous value
 * @param newValue - New value
 * @param changedBy - Who made the change
 * @returns A change record
 */
export function createChangeRecord(
    field: string,
    oldValue: unknown,
    newValue: unknown,
    changedBy: string,
    note?: string
): ChangeRecord {
    const action = inferAction(field);
    return {
        action,
        field,
        oldValue,
        newValue,
        changedBy,
        changedAt: new Date().toISOString(),
        ...(note && { note }),
    };
}

/**
 * Create a "created" record for a new ticket.
 *
 * @param createdBy - Who created the ticket
 * @returns A change record for creation
 */
export function createCreatedRecord(createdBy: string): ChangeRecord {
    return {
        action: 'created',
        changedBy: createdBy,
        changedAt: new Date().toISOString(),
        note: 'Ticket created',
    };
}

/**
 * Detect which fields changed between two ticket states.
 *
 * **Simple explanation**: Compares the old version of a ticket with
 * the new version and finds all the differences.
 *
 * @param oldTicket - Previous ticket state
 * @param newTicket - Updated ticket state
 * @param changedBy - Who made the changes
 * @param ignoredFields - Fields to ignore (e.g., updatedAt)
 * @returns Array of change records for all differences
 */
export function detectChanges(
    oldTicket: Record<string, unknown>,
    newTicket: Record<string, unknown>,
    changedBy: string,
    ignoredFields: string[] = ['updatedAt', 'version']
): ChangeRecord[] {
    const changes: ChangeRecord[] = [];

    for (const key of Object.keys(newTicket)) {
        if (ignoredFields.includes(key)) continue;

        const oldVal = oldTicket[key];
        const newVal = newTicket[key];

        // Deep comparison for objects/arrays
        if (!isEqual(oldVal, newVal)) {
            changes.push(createChangeRecord(key, oldVal, newVal, changedBy));
        }
    }

    return changes;
}

/**
 * Parse the history JSON string from the database.
 *
 * @param historyJson - Raw JSON string
 * @returns Parsed ticket history
 */
export function parseTicketHistory(historyJson: string | null | undefined): TicketHistory {
    const emptyHistory: TicketHistory = {
        changes: [],
        reopenCount: 0,
        totalChanges: 0,
    };

    if (!historyJson || historyJson === '{}') {
        return emptyHistory;
    }

    try {
        const parsed = JSON.parse(historyJson);
        const changes: ChangeRecord[] = Array.isArray(parsed.changes) ? parsed.changes : [];
        const reopenCount = changes.filter(c => c.action === 'reopened').length;

        return {
            changes,
            reopenCount,
            totalChanges: changes.length,
            firstChange: changes.length > 0 ? changes[0].changedAt : undefined,
            lastChange: changes.length > 0 ? changes[changes.length - 1].changedAt : undefined,
        };
    } catch {
        logWarn('Failed to parse ticket history JSON');
        return emptyHistory;
    }
}

/**
 * Serialize ticket history to JSON for storage.
 *
 * @param history - Ticket history object
 * @returns JSON string
 */
export function serializeTicketHistory(history: TicketHistory): string {
    return JSON.stringify({
        changes: history.changes,
    });
}

/**
 * Add a change record to existing history.
 *
 * @param historyJson - Current history JSON string
 * @param record - New record to add
 * @returns Updated history JSON string
 */
export function appendToHistory(
    historyJson: string | null | undefined,
    record: ChangeRecord
): string {
    const history = parseTicketHistory(historyJson);
    history.changes.push(record);
    return serializeTicketHistory(history);
}

/**
 * Get a filtered view of history.
 *
 * @param history - Full ticket history
 * @param filter - Filter criteria
 * @returns Filtered change records
 */
export function filterHistory(
    history: TicketHistory,
    filter: {
        action?: string;
        field?: string;
        changedBy?: string;
        since?: string;
    }
): ChangeRecord[] {
    let records = [...history.changes];

    if (filter.action) {
        records = records.filter(r => r.action === filter.action);
    }
    if (filter.field) {
        records = records.filter(r => r.field === filter.field);
    }
    if (filter.changedBy) {
        records = records.filter(r => r.changedBy === filter.changedBy);
    }
    if (filter.since) {
        records = records.filter(r => r.changedAt >= filter.since!);
    }

    return records;
}

/**
 * Format a history summary as a human-readable string.
 *
 * @param history - Ticket history
 * @returns Formatted summary string
 */
export function formatHistorySummary(history: TicketHistory): string {
    if (history.totalChanges === 0) {
        return 'No changes recorded';
    }

    const lines: string[] = [];
    lines.push(`${history.totalChanges} change(s) recorded`);

    if (history.reopenCount > 0) {
        lines.push(`Reopened ${history.reopenCount} time(s)`);
    }

    if (history.firstChange) {
        lines.push(`First change: ${history.firstChange}`);
    }
    if (history.lastChange) {
        lines.push(`Last change: ${history.lastChange}`);
    }

    return lines.join(', ');
}

// ─── Internal Helpers ────────────────────────────────────────────────────

/**
 * Infer the action type from the field name.
 */
function inferAction(field: string): ChangeRecord['action'] {
    switch (field) {
        case 'status': return 'status_change';
        case 'assignee': return 'assigned';
        case 'priority': return 'priority_changed';
        default: return 'updated';
    }
}

/**
 * Simple deep equality check for comparing values.
 */
function isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;

    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    return false;
}
