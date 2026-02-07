/**
 * Ticket Cleanup Service
 * 
 * Manages ticket lifecycle and cleanup:
 * - Removes resolved/completed tickets from active view
 * - Cleans up duplicate tickets
 * - Archives tickets after X days idle
 * - Keeps queue focused on active problems
 */

import { logInfo, logWarn, logError } from '../logger';
import { listTickets, updateTicket, Ticket } from './ticketDb';

/**
 * Ticket status categories for cleanup
 */
export const TICKET_STATUS_CATEGORIES = {
    // Active/Open - show in queue
    ACTIVE: ['open', 'in-progress', 'pending', 'in_review'],
    // Resolved - hide from active queue, optionally archive
    RESOLVED: ['done', 'resolved', 'rejected'],
    // Removed - completely hidden
    REMOVED: ['removed'],
    // Blocked - show but de-prioritized
    BLOCKED: ['blocked', 'escalated']
};

/**
 * Get display-safe tickets (filter out removed/resolved)
 * 
 * **Simple explanation**: When showing tickets in UI, this filters out
 * the ones that are done with, so the queue shows only active problems.
 * 
 * @param onlyActive If true, show only ACTIVE tickets. If false, include BLOCKED.
 * @returns Array of tickets to display
 */
export async function getDisplayTickets(onlyActive: boolean = false): Promise<Ticket[]> {
    try {
        const allTickets = await listTickets();
        
        return allTickets.filter(ticket => {
            // Always hide removed tickets
            if (TICKET_STATUS_CATEGORIES.REMOVED.includes(ticket.status)) {
                return false;
            }
            
            // Always hide resolved tickets (they're done)
            if (TICKET_STATUS_CATEGORIES.RESOLVED.includes(ticket.status)) {
                return false;
            }
            
            // If onlyActive=true, also hide blocked
            if (onlyActive && TICKET_STATUS_CATEGORIES.BLOCKED.includes(ticket.status)) {
                return false;
            }
            
            // Everything else is displayable
            return true;
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`[TicketCleanup] Failed to get display tickets: ${message}`);
        return [];
    }
}

/**
 * Get archived tickets (resolved/removed) for optional archive view
 * 
 * @returns Tickets that are done with
 */
export async function getArchivedTickets(): Promise<Ticket[]> {
    try {
        const allTickets = await listTickets();
        
        return allTickets.filter(ticket => {
            return (
                TICKET_STATUS_CATEGORIES.RESOLVED.includes(ticket.status) ||
                TICKET_STATUS_CATEGORIES.REMOVED.includes(ticket.status)
            );
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`[TicketCleanup] Failed to get archived tickets: ${message}`);
        return [];
    }
}

/**
 * Get active queue tickets (excluding blocked)
 * 
 * Used by orchestrator to determine queue size
 */
export async function getActiveQueueTickets(): Promise<Ticket[]> {
    return getDisplayTickets(true);
}

/**
 * Cleanup old/idle tickets
 * 
 * This runs periodically to:
 * 1. Mark very old resolved tickets as archived
 * 2. Remove duplicates that are older than master
 * 
 * @param maxResolvedAgeDays Don't keep resolved tickets older than this (default: 7)
 */
export async function cleanupOldTickets(maxResolvedAgeDays: number = 7): Promise<{
    archivedCount: number;
    removedCount: number;
    errors: string[];
}> {
    const results = { archivedCount: 0, removedCount: 0, errors: [] as string[] };

    try {
        const allTickets = await listTickets();
        const now = new Date();
        const maxAgeMs = maxResolvedAgeDays * 24 * 60 * 60 * 1000;

        for (const ticket of allTickets) {
            try {
                // Skip tickets that are already removed
                if (ticket.status === 'removed') {
                    continue;
                }

                // For resolved tickets older than maxResolvedAgeDays, mark as removed
                if (TICKET_STATUS_CATEGORIES.RESOLVED.includes(ticket.status)) {
                    const updatedAt = new Date(ticket.updatedAt);
                    const ageMs = now.getTime() - updatedAt.getTime();

                    if (ageMs > maxAgeMs) {
                        await updateTicket(ticket.id, { status: 'removed' });
                        results.removedCount++;
                        logInfo(
                            `[TicketCleanup] Removed old resolved ticket ${ticket.id} ` +
                            `(${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days old)`
                        );
                    }
                }

                // For duplicate tickets, if master is resolved, remove the duplicate too
                if (ticket.linkedTo) {
                    const masterTicket = allTickets.find(t => t.id === ticket.linkedTo);
                    if (masterTicket && TICKET_STATUS_CATEGORIES.RESOLVED.includes(masterTicket.status)) {
                        await updateTicket(ticket.id, { status: 'removed' });
                        results.removedCount++;
                        logInfo(
                            `[TicketCleanup] Removed duplicate ${ticket.id} (master ${ticket.linkedTo} is resolved)`
                        );
                    }
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                const errorMsg = `Failed to cleanup ${ticket.id}: ${message}`;
                logError(`[TicketCleanup] ${errorMsg}`);
                results.errors.push(errorMsg);
            }
        }

        if (results.removedCount > 0) {
            logInfo(`[TicketCleanup] Cleanup complete: ${results.removedCount} tickets removed`);
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const errorMsg = `Cleanup failed: ${message}`;
        logError(`[TicketCleanup] ${errorMsg}`);
        results.errors.push(errorMsg);
    }

    return results;
}

/**
 * Get cleanup statistics
 * 
 * Returns count of tickets in each category
 */
export async function getCleanupStats(): Promise<{
    activeCount: number;
    blockedCount: number;
    resolvedCount: number;
    removedCount: number;
    duplicateCount: number;
}> {
    try {
        const allTickets = await listTickets();
        
        return {
            activeCount: allTickets.filter(t => TICKET_STATUS_CATEGORIES.ACTIVE.includes(t.status)).length,
            blockedCount: allTickets.filter(t => TICKET_STATUS_CATEGORIES.BLOCKED.includes(t.status)).length,
            resolvedCount: allTickets.filter(t => TICKET_STATUS_CATEGORIES.RESOLVED.includes(t.status)).length,
            removedCount: allTickets.filter(t => TICKET_STATUS_CATEGORIES.REMOVED.includes(t.status)).length,
            duplicateCount: allTickets.filter(t => t.linkedTo !== undefined && t.linkedTo !== null).length
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`[TicketCleanup] Failed to get stats: ${message}`);
        return { activeCount: 0, blockedCount: 0, resolvedCount: 0, removedCount: 0, duplicateCount: 0 };
    }
}

/**
 * Initialize periodic cleanup (runs every hour)
 */
let cleanupTimer: NodeJS.Timeout | null = null;

export function initializePeriodicCleanup(intervalHours: number = 1, maxResolvedAgeDays: number = 7): void {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;

    // Run cleanup immediately on init
    void cleanupOldTickets(maxResolvedAgeDays);

    // Then schedule periodic runs
    cleanupTimer = setInterval(() => {
        void cleanupOldTickets(maxResolvedAgeDays);
    }, intervalMs);

    logInfo(`[TicketCleanup] Periodic cleanup initialized (every ${intervalHours}h, max age ${maxResolvedAgeDays}d)`);
}

export function stopPeriodicCleanup(): void {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
        logInfo('[TicketCleanup] Periodic cleanup stopped');
    }
}

/**
 * Format cleanup stats for UI display
 */
export function formatCleanupStats(stats: {
    activeCount: number;
    blockedCount: number;
    resolvedCount: number;
    removedCount: number;
    duplicateCount: number;
}): string {
    return (
        `📊 Queue Status: ` +
        `${stats.activeCount} active | ` +
        `${stats.blockedCount} blocked | ` +
        `${stats.resolvedCount} resolved | ` +
        `${stats.duplicateCount} duplicates`
    );
}
