/**
 * Boss Notification System
 * 
 * **Simple explanation**: Notifies the human supervisor (Boss) about critical
 * events like errors, gate failures, and deadlocks. Like an assistant who
 * knows when to interrupt you with important news.
 * 
 * @module agents/orchestrator/boss
 */

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * Notification priority levels
 */
export type NotificationPriority = 'info' | 'warning' | 'error' | 'critical';

/**
 * Notification event
 */
export interface BossNotification {
    /** Unique notification ID */
    id: string;
    /** Notification title */
    title: string;
    /** Detailed message */
    message: string;
    /** Priority level */
    priority: NotificationPriority;
    /** Source agent or system */
    source: string;
    /** Timestamp */
    timestamp: number;
    /** Actions the user can take */
    actions?: string[];
    /** Related task ID (if any) */
    taskId?: string;
    /** Whether this has been acknowledged */
    acknowledged: boolean;
}

/**
 * Callback for notification events
 */
export type NotificationCallback = (notification: BossNotification) => void;

/**
 * Boss Notification Manager
 * 
 * **Simple explanation**: Aggregates notifications to avoid spam,
 * shows VS Code notifications for important events, and tracks
 * acknowledgment status.
 */
export class BossNotificationManager {
    private notifications: Map<string, BossNotification> = new Map();
    private callbacks: Set<NotificationCallback> = new Set();
    private aggregationBuffer: BossNotification[] = [];
    private aggregationTimer: NodeJS.Timeout | null = null;
    private aggregationDelayMs: number = 2000; // 2 seconds
    private maxNotificationsPerBatch: number = 5;
    private suppressedCount: number = 0;
    private disposed: boolean = false;

    /**
     * Send a notification to the Boss
     */
    public notify(params: Omit<BossNotification, 'id' | 'timestamp' | 'acknowledged'>): void {
        if (this.disposed) {
            return;
        }

        const notification: BossNotification = {
            ...params,
            id: this.generateId(),
            timestamp: Date.now(),
            acknowledged: false
        };

        this.notifications.set(notification.id, notification);
        logInfo(`[Boss] Notification: ${notification.title} (${notification.priority})`);

        // Add to aggregation buffer
        this.aggregationBuffer.push(notification);
        this.scheduleFlush();
    }

    /**
     * Generate a unique notification ID
     */
    private generateId(): string {
        return `boss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Schedule a flush of the aggregation buffer
     */
    private scheduleFlush(): void {
        if (this.aggregationTimer) {
            return; // Already scheduled
        }

        this.aggregationTimer = setTimeout(() => {
            this.flushNotifications();
            this.aggregationTimer = null;
        }, this.aggregationDelayMs);
    }

    /**
     * Flush aggregated notifications
     */
    private flushNotifications(): void {
        if (this.aggregationBuffer.length === 0) {
            return;
        }

        // Sort by priority (critical first)
        const priorityOrder: Record<NotificationPriority, number> = {
            critical: 0,
            error: 1,
            warning: 2,
            info: 3
        };

        this.aggregationBuffer.sort((a, b) =>
            priorityOrder[a.priority] - priorityOrder[b.priority]
        );

        // Show up to maxNotificationsPerBatch
        const toShow = this.aggregationBuffer.slice(0, this.maxNotificationsPerBatch);
        this.suppressedCount = Math.max(0, this.aggregationBuffer.length - this.maxNotificationsPerBatch);

        for (const notification of toShow) {
            this.showVSCodeNotification(notification);
            this.notifyCallbacks(notification);
        }

        // Show suppressed count if any
        if (this.suppressedCount > 0) {
            logWarn(`[Boss] ${this.suppressedCount} additional notifications suppressed`);
        }

        this.aggregationBuffer = [];
    }

    /**
     * Show a VS Code notification
     */
    private showVSCodeNotification(notification: BossNotification): void {
        const prefix = notification.taskId ? `[Task ${notification.taskId}] ` : '';
        const fullMessage = `${prefix}${notification.message}`;

        switch (notification.priority) {
            case 'critical':
            case 'error':
                if (notification.actions && notification.actions.length > 0) {
                    vscode.window.showErrorMessage(
                        `${notification.title}: ${fullMessage}`,
                        ...notification.actions
                    ).then(selected => {
                        if (selected) {
                            this.handleAction(notification.id, selected);
                        }
                    });
                } else {
                    vscode.window.showErrorMessage(`${notification.title}: ${fullMessage}`);
                }
                break;

            case 'warning':
                vscode.window.showWarningMessage(`${notification.title}: ${fullMessage}`);
                break;

            case 'info':
                vscode.window.showInformationMessage(`${notification.title}: ${fullMessage}`);
                break;
        }
    }

    /**
     * Handle user action on a notification
     */
    private handleAction(notificationId: string, action: string): void {
        const notification = this.notifications.get(notificationId);
        if (notification) {
            logInfo(`[Boss] User selected action '${action}' for notification ${notificationId}`);
            notification.acknowledged = true;
            // Emit event for handlers
            this.notifyCallbacks({ ...notification, message: `Action selected: ${action}` });
        }
    }

    /**
     * Notify all registered callbacks
     */
    private notifyCallbacks(notification: BossNotification): void {
        for (const callback of this.callbacks) {
            try {
                callback(notification);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                logError(`[Boss] Callback error: ${msg}`);
            }
        }
    }

    /**
     * Register a callback for notifications
     */
    public onNotification(callback: NotificationCallback): vscode.Disposable {
        this.callbacks.add(callback);
        return {
            dispose: () => {
                this.callbacks.delete(callback);
            }
        };
    }

    /**
     * Send a critical error notification
     */
    public notifyError(title: string, message: string, source: string, taskId?: string): void {
        this.notify({
            title,
            message,
            priority: 'error',
            source,
            taskId,
            actions: ['View Details', 'Dismiss']
        });
    }

    /**
     * Send a deadlock notification
     */
    public notifyDeadlock(blockedTasks: string[]): void {
        this.notify({
            title: 'Deadlock Detected',
            message: `${blockedTasks.length} tasks are blocked in a circular dependency: ${blockedTasks.slice(0, 3).join(', ')}${blockedTasks.length > 3 ? '...' : ''}`,
            priority: 'critical',
            source: 'orchestrator',
            actions: ['View Dependency Graph', 'Break Cycle', 'Dismiss']
        });
    }

    /**
     * Send a gate failure notification
     */
    public notifyGateFailure(gateName: string, reason: string): void {
        this.notify({
            title: `Gate Failure: ${gateName}`,
            message: reason,
            priority: 'error',
            source: 'verification',
            actions: ['View Checklist', 'Override', 'Dismiss']
        });
    }

    /**
     * Send a retry limit exceeded notification
     */
    public notifyRetryLimitExceeded(taskId: string, retryCount: number): void {
        this.notify({
            title: 'Retry Limit Exceeded',
            message: `Task ${taskId} has failed ${retryCount} times and requires human intervention`,
            priority: 'critical',
            source: 'orchestrator',
            taskId,
            actions: ['Manual Fix', 'Skip Task', 'Change Approach']
        });
    }

    /**
     * Mark a notification as acknowledged
     */
    public acknowledge(notificationId: string): void {
        const notification = this.notifications.get(notificationId);
        if (notification) {
            notification.acknowledged = true;
            logInfo(`[Boss] Notification ${notificationId} acknowledged`);
        }
    }

    /**
     * Get all unacknowledged notifications
     */
    public getUnacknowledged(): BossNotification[] {
        return Array.from(this.notifications.values())
            .filter(n => !n.acknowledged)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get notification by ID
     */
    public getNotification(id: string): BossNotification | undefined {
        return this.notifications.get(id);
    }

    /**
     * Clear all notifications
     */
    public clearAll(): void {
        this.notifications.clear();
        this.aggregationBuffer = [];
        this.suppressedCount = 0;
        logInfo('[Boss] All notifications cleared');
    }

    /**
     * Dispose the manager
     */
    public dispose(): void {
        this.disposed = true;
        if (this.aggregationTimer) {
            clearTimeout(this.aggregationTimer);
            this.aggregationTimer = null;
        }
        this.clearAll();
        this.callbacks.clear();
        logInfo('[Boss] NotificationManager disposed');
    }
}

// Singleton instance
let bossInstance: BossNotificationManager | null = null;

/**
 * Get the singleton BossNotificationManager instance
 */
export function getBossNotificationManager(): BossNotificationManager {
    if (!bossInstance) {
        bossInstance = new BossNotificationManager();
    }
    return bossInstance;
}

/**
 * Reset the boss instance (for testing)
 */
export function resetBossNotificationManagerForTests(): void {
    if (bossInstance) {
        bossInstance.dispose();
    }
    bossInstance = null;
}
