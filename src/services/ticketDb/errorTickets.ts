/**
 * Error Notification Tickets Module
 *
 * Auto-creates investigation tickets when critical database errors occur,
 * providing context and suggested resolution steps.
 *
 * **Simple explanation**: When something goes seriously wrong with the
 * database (disk full, permissions lost), this creates a ticket that
 * says "Hey, the database had a problem. Here's what happened and
 * what you should do about it." Like an automatic incident report.
 *
 * @module ticketDb/errorTickets
 * @since MT-008.8
 */

import { logInfo, logWarn } from '../../logger';
import { DbErrorCategory } from './fallback';

/**
 * Error ticket template
 */
export interface ErrorTicketData {
    /** Generated ticket ID */
    id: string;
    /** Ticket title */
    title: string;
    /** Detailed description of the error */
    description: string;
    /** Ticket status (always 'open') */
    status: 'open';
    /** Ticket type */
    type: 'ai_to_human';
    /** Priority (1 = highest for critical errors) */
    priority: number;
    /** Who created this (always 'system') */
    creator: string;
    /** Assigned to */
    assignee: string;
    /** When created */
    createdAt: string;
    /** When last updated */
    updatedAt: string;
    /** Error category for routing */
    category: DbErrorCategory;
}

/**
 * Error ticket counter for unique IDs
 */
let errorTicketCounter = 0;

/**
 * Create an error notification ticket for a database error.
 *
 * **Simple explanation**: Takes a database error and creates a nice
 * ticket about it with all the details: what went wrong, when it
 * happened, and what to do about it.
 *
 * @param error - The error message
 * @param category - Error category (busy, full, permission, corruption)
 * @param context - Additional context about when/where the error occurred
 * @returns Error ticket data ready for insertion
 */
export function createErrorTicket(
    error: string,
    category: DbErrorCategory,
    context?: string
): ErrorTicketData {
    errorTicketCounter++;
    const now = new Date().toISOString();

    const title = getErrorTitle(category);
    const description = buildErrorDescription(error, category, context);
    const priority = getErrorPriority(category);

    const ticket: ErrorTicketData = {
        id: `ERR-${String(errorTicketCounter).padStart(3, '0')}`,
        title,
        description,
        status: 'open',
        type: 'ai_to_human',
        priority,
        creator: 'system',
        assignee: 'Clarity Agent',
        createdAt: now,
        updatedAt: now,
        category,
    };

    logInfo(`Created error ticket ${ticket.id}: ${title}`);
    return ticket;
}

/**
 * Generate a title for an error ticket based on category.
 *
 * @param category - Error category
 * @returns Human-readable title
 */
export function getErrorTitle(category: DbErrorCategory): string {
    switch (category) {
        case 'busy':
            return '[DB] Persistent database lock detected';
        case 'full':
            return '[DB] Database disk full - switched to memory mode';
        case 'permission':
            return '[DB] Database permission denied - switched to memory mode';
        case 'corruption':
            return '[DB] Database corruption detected - switched to memory mode';
        case 'unknown':
            return '[DB] Unexpected database error occurred';
        default:
            return '[DB] Database error requires investigation';
    }
}

/**
 * Build a detailed error description with suggested actions.
 *
 * @param error - Raw error message
 * @param category - Error category
 * @param context - Additional context
 * @returns Formatted description with suggested actions
 */
export function buildErrorDescription(
    error: string,
    category: DbErrorCategory,
    context?: string
): string {
    const lines: string[] = [];

    lines.push(`**Error**: ${error}`);
    lines.push(`**Category**: ${category}`);
    lines.push(`**Occurred at**: ${new Date().toISOString()}`);
    if (context) {
        lines.push(`**Context**: ${context}`);
    }

    lines.push('');
    lines.push('**Suggested Actions**:');

    const actions = getSuggestedActions(category);
    actions.forEach((action, i) => {
        lines.push(`${i + 1}. ${action}`);
    });

    lines.push('');
    lines.push('**Current Status**: Running in fallback mode. Basic ticket operations are available.');
    lines.push('Recovery data is being saved periodically to prevent data loss.');

    return lines.join('\n');
}

/**
 * Get suggested resolution actions for an error category.
 *
 * @param category - Error category
 * @returns Array of suggested action strings
 */
export function getSuggestedActions(category: DbErrorCategory): string[] {
    switch (category) {
        case 'busy':
            return [
                'Check if another process is using the database file',
                'Wait a few minutes for the lock to release',
                'If persistent, restart the extension',
                'Check for runaway processes accessing the .coe directory',
            ];
        case 'full':
            return [
                'Free up disk space on the drive containing the database',
                'Delete old files or move data to another drive',
                'Check if the disk quota has been reached',
                'Once space is available, the system will attempt to restore automatically',
            ];
        case 'permission':
            return [
                'Check file permissions on the .coe directory',
                'Ensure the current user has write access',
                'Try running the editor with appropriate permissions',
                'The system tried alternate paths before falling back to memory mode',
            ];
        case 'corruption':
            return [
                'The database file may be corrupted and needs to be rebuilt',
                'Check if recovery.json exists with recent data',
                'Delete the corrupted database file and restart',
                'The system will create a fresh database and restore from recovery',
            ];
        case 'unknown':
        default:
            return [
                'Check the error details above for more information',
                'Try restarting the extension',
                'If the error persists, check the extension logs',
                'Report the issue if it continues',
            ];
    }
}

/**
 * Determine priority based on error category.
 *
 * @param category - Error category
 * @returns Priority (1-5, 1 = highest)
 */
export function getErrorPriority(category: DbErrorCategory): number {
    switch (category) {
        case 'corruption':
            return 1; // Critical - data integrity
        case 'full':
            return 1; // Critical - can't persist data
        case 'permission':
            return 2; // High - but might resolve on its own
        case 'busy':
            return 3; // Medium - transient issue
        case 'unknown':
        default:
            return 2; // High - unknown is concerning
    }
}

/**
 * Check if an error ticket should be created for this error.
 *
 * **Simple explanation**: Not every error needs a ticket. A busy
 * database that resolves after one retry doesn't need a ticket.
 * But a disk-full error that triggers fallback mode does.
 *
 * @param category - Error category
 * @param retryCount - How many retries were attempted
 * @returns true if a ticket should be created
 */
export function shouldCreateTicket(category: DbErrorCategory, retryCount: number = 0): boolean {
    switch (category) {
        case 'busy':
            // Only create ticket if retries exhausted (persistent lock)
            return retryCount >= 3;
        case 'full':
        case 'permission':
        case 'corruption':
            // Always create ticket for these
            return true;
        case 'unknown':
            // Create ticket for unknown errors
            return true;
        default:
            return false;
    }
}

/**
 * Reset the error ticket counter (for tests).
 */
export function resetErrorTicketCounterForTests(): void {
    errorTicketCounter = 0;
}
