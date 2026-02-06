/**
 * @file notificationService.ts
 * @module ui/notificationService
 * @description VS Code notification service for high-priority tickets (MT-021/Stage 6)
 * 
 * Shows VS Code notifications for P1 (high priority) tickets within 5 seconds
 * of creation. Supports batching to avoid notification spam.
 * 
 * **Simple explanation**: Like a notification bell that rings when important
 * tickets arrive. P1 tickets get immediate attention, lower priorities are silent.
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Ticket priority levels (P0 = highest)
 */
export type TicketPriority = 0 | 1 | 2 | 3;

/**
 * Simplified ticket for notifications
 */
export interface NotifiableTicket {
    id: string;
    title: string;
    priority: TicketPriority;
    status: string;
    createdAt: Date;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
    /** Minimum priority to show notifications (default: 1 = P1) */
    minPriority: TicketPriority;
    /** Delay before showing notification in ms (default: 500) */
    notificationDelay: number;
    /** Batch window in ms - group notifications arriving close together (default: 2000) */
    batchWindow: number;
    /** Max notifications per batch (default: 5) */
    maxBatchSize: number;
    /** Whether notifications are enabled (default: true) */
    enabled: boolean;
}

/**
 * Notification action result
 */
export type NotificationAction = 'open' | 'dismiss' | 'snooze' | 'timeout';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: NotificationConfig = {
    minPriority: 1,         // Show P0 and P1
    notificationDelay: 500, // 500ms delay
    batchWindow: 2000,      // 2 second batch window
    maxBatchSize: 5,        // Max 5 notifications at once
    enabled: true
};

// ============================================================================
// NotificationService Class
// ============================================================================

/**
 * Manages VS Code notifications for high-priority tickets.
 * 
 * **Simple explanation**: Watches for new important tickets and shows
 * popup notifications. Groups rapid-fire tickets into batches to avoid spam.
 * 
 * @emits 'notification-shown' - When a notification is displayed
 * @emits 'notification-action' - When user interacts with notification
 * @emits 'batch-shown' - When a batch notification is displayed
 */
export class NotificationService extends EventEmitter {
    private config: NotificationConfig;
    private pendingBatch: NotifiableTicket[] = [];
    private batchTimer: NodeJS.Timeout | null = null;
    private snoozedTickets: Set<string> = new Set();
    private shownTickets: Set<string> = new Set();

    constructor(config: Partial<NotificationConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Notify about a new ticket if it meets priority threshold
     * 
     * @param ticket - Ticket to potentially notify about
     * @returns Whether notification will be shown
     */
    notifyTicket(ticket: NotifiableTicket): boolean {
        if (!this.config.enabled) {
            return false;
        }

        // Check priority threshold (lower number = higher priority)
        if (ticket.priority > this.config.minPriority) {
            return false;
        }

        // Don't re-notify for same ticket
        if (this.shownTickets.has(ticket.id)) {
            return false;
        }

        // Don't notify snoozed tickets
        if (this.snoozedTickets.has(ticket.id)) {
            return false;
        }

        // Add to batch
        this.pendingBatch.push(ticket);
        this.shownTickets.add(ticket.id);

        // Start batch timer if not running
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(
                () => this.showBatch(),
                this.config.notificationDelay
            );
        }

        // If batch is full, show immediately
        if (this.pendingBatch.length >= this.config.maxBatchSize) {
            this.showBatch();
        }

        return true;
    }

    /**
     * Show batched notifications
     */
    private async showBatch(): Promise<void> {
        // Clear timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        const batch = [...this.pendingBatch];
        this.pendingBatch = [];

        if (batch.length === 0) {
            return;
        }

        if (batch.length === 1) {
            // Single ticket notification
            await this.showSingleNotification(batch[0]);
        } else {
            // Batch notification
            await this.showBatchNotification(batch);
        }
    }

    /**
     * Show notification for a single ticket
     */
    private async showSingleNotification(ticket: NotifiableTicket): Promise<void> {
        const priorityLabel = this.getPriorityLabel(ticket.priority);
        const message = `${priorityLabel} Ticket: ${ticket.title}`;

        logInfo(`[Notification] Showing: ${message}`);

        const action = await vscode.window.showInformationMessage(
            message,
            { modal: false },
            'Open',
            'Snooze',
            'Dismiss'
        );

        const result = this.mapAction(action);
        this.handleAction(result, ticket);

        this.emit('notification-shown', { ticket, action: result });
    }

    /**
     * Show notification for multiple tickets
     */
    private async showBatchNotification(tickets: NotifiableTicket[]): Promise<void> {
        const p0Count = tickets.filter(t => t.priority === 0).length;
        const p1Count = tickets.filter(t => t.priority === 1).length;

        let message = `${tickets.length} high-priority tickets`;
        if (p0Count > 0) {
            message += ` (${p0Count} Critical)`;
        }

        logInfo(`[Notification] Showing batch: ${message}`);

        const action = await vscode.window.showInformationMessage(
            message,
            { modal: false },
            'View All',
            'Dismiss'
        );

        const result = action === 'View All' ? 'open' : this.mapAction(action);
        
        if (result === 'open') {
            // Open tickets view
            await vscode.commands.executeCommand('coe-tickets.focus');
        }

        this.emit('batch-shown', { tickets, action: result });
    }

    /**
     * Map VS Code action to our action type
     */
    private mapAction(action: string | undefined): NotificationAction {
        switch (action) {
            case 'Open':
            case 'View All':
                return 'open';
            case 'Snooze':
                return 'snooze';
            case 'Dismiss':
                return 'dismiss';
            default:
                return 'timeout';
        }
    }

    /**
     * Handle notification action
     */
    private handleAction(action: NotificationAction, ticket: NotifiableTicket): void {
        switch (action) {
            case 'open':
                // Open the specific ticket
                vscode.commands.executeCommand('coe.openTicket', ticket.id);
                break;
            case 'snooze':
                // Snooze for 30 minutes
                this.snoozeTicket(ticket.id, 30 * 60 * 1000);
                break;
            case 'dismiss':
            case 'timeout':
                // No action needed
                break;
        }

        this.emit('notification-action', { ticket, action });
    }

    /**
     * Get human-readable priority label
     */
    private getPriorityLabel(priority: TicketPriority): string {
        switch (priority) {
            case 0: return '🔴 Critical';
            case 1: return '🟠 High';
            case 2: return '🟡 Normal';
            case 3: return '🟢 Low';
        }
    }

    /**
     * Snooze a ticket for specified duration
     * 
     * @param ticketId - Ticket to snooze
     * @param duration - Duration in ms
     */
    snoozeTicket(ticketId: string, duration: number): void {
        this.snoozedTickets.add(ticketId);
        logInfo(`[Notification] Snoozed ticket ${ticketId} for ${duration / 1000}s`);

        setTimeout(() => {
            this.snoozedTickets.delete(ticketId);
            this.shownTickets.delete(ticketId); // Allow re-notification
        }, duration);
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<NotificationConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Enable or disable notifications
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        logInfo(`[Notification] Notifications ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Check if notifications are enabled
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * Clear all state (for testing)
     */
    reset(): void {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        this.pendingBatch = [];
        this.snoozedTickets.clear();
        this.shownTickets.clear();
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.reset();
        this.removeAllListeners();
    }
}

// ============================================================================
// Singleton Management
// ============================================================================

let instance: NotificationService | null = null;

/**
 * Initialize the notification service singleton
 */
export function initializeNotificationService(
    config?: Partial<NotificationConfig>
): NotificationService {
    if (instance) {
        throw new Error('NotificationService already initialized');
    }
    instance = new NotificationService(config);
    return instance;
}

/**
 * Get the notification service instance
 */
export function getNotificationService(): NotificationService {
    if (!instance) {
        throw new Error('NotificationService not initialized');
    }
    return instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetNotificationServiceForTests(): void {
    if (instance) {
        instance.dispose();
        instance = null;
    }
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Subscribe notification service to ticket database events
 * 
 * @param ticketDb - Ticket database with EventEmitter
 */
export function subscribeToTicketEvents(ticketDb: EventEmitter): void {
    const service = getNotificationService();

    ticketDb.on('ticket-created', (ticket: NotifiableTicket) => {
        service.notifyTicket(ticket);
    });

    ticketDb.on('ticket-updated', (ticket: NotifiableTicket) => {
        // Only notify on priority escalation
        if (ticket.priority <= 1) {
            service.notifyTicket(ticket);
        }
    });

    logInfo('[Notification] Subscribed to ticket events');
}
