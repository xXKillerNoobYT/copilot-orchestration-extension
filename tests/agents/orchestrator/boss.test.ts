/**
 * Tests for BossNotificationManager
 *
 * @module tests/agents/orchestrator/boss.test
 */

import {
    BossNotificationManager,
    getBossNotificationManager,
    resetBossNotificationManagerForTests,
    BossNotification,
    NotificationPriority
} from '../../../src/agents/orchestrator/boss';

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        showErrorMessage: jest.fn().mockResolvedValue(undefined),
        showWarningMessage: jest.fn().mockResolvedValue(undefined),
        showInformationMessage: jest.fn().mockResolvedValue(undefined)
    }
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn()
}));

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../../src/logger';

describe('BossNotificationManager', () => {
    let manager: BossNotificationManager;

    beforeEach(() => {
        jest.useFakeTimers();
        resetBossNotificationManagerForTests();
        manager = new BossNotificationManager();
        jest.clearAllMocks();
    });

    afterEach(() => {
        manager.dispose();
        jest.useRealTimers();
    });

    // ===========================================
    // Constructor and Basic Properties
    // ===========================================

    describe('constructor', () => {
        it('Test 1: should create instance with empty notifications', () => {
            expect(manager.getUnacknowledged()).toEqual([]);
        });
    });

    // ===========================================
    // notify() method
    // ===========================================

    describe('notify()', () => {
        it('Test 2: should create notification with unique ID and timestamp', () => {
            manager.notify({
                title: 'Test Title',
                message: 'Test message',
                priority: 'info',
                source: 'test'
            });

            // Flush the aggregation buffer
            jest.advanceTimersByTime(2500);

            const notifications = manager.getUnacknowledged();
            expect(notifications).toHaveLength(1);
            expect(notifications[0].id).toMatch(/^boss_\d+_.+$/);
            expect(notifications[0].timestamp).toBeGreaterThan(0);
            expect(notifications[0].acknowledged).toBe(false);
        });

        it('Test 3: should not notify after disposal', () => {
            manager.dispose();
            manager.notify({
                title: 'Test',
                message: 'Message',
                priority: 'info',
                source: 'test'
            });

            expect(manager.getUnacknowledged()).toEqual([]);
        });

        it('Test 4: should aggregate notifications within delay window', () => {
            manager.notify({ title: 'First', message: 'M1', priority: 'info', source: 'test' });
            manager.notify({ title: 'Second', message: 'M2', priority: 'info', source: 'test' });
            manager.notify({ title: 'Third', message: 'M3', priority: 'info', source: 'test' });

            // Not flushed yet
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();

            // Flush
            jest.advanceTimersByTime(2500);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(3);
        });

        it('Test 5: should sort notifications by priority when flushing', () => {
            manager.notify({ title: 'Info', message: 'Low', priority: 'info', source: 'test' });
            manager.notify({ title: 'Critical', message: 'High', priority: 'critical', source: 'test' });
            manager.notify({ title: 'Warning', message: 'Medium', priority: 'warning', source: 'test' });

            jest.advanceTimersByTime(2500);

            // Critical/error shown via showErrorMessage first
            expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
            expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        });

        it('Test 6: should suppress notifications beyond max batch size', () => {
            // Add 7 notifications
            for (let i = 0; i < 7; i++) {
                manager.notify({ title: `N${i}`, message: `M${i}`, priority: 'info', source: 'test' });
            }

            jest.advanceTimersByTime(2500);

            // Only 5 shown (maxNotificationsPerBatch)
            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(5);
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('2 additional notifications suppressed'));
        });
    });

    // ===========================================
    // VS Code notification display
    // ===========================================

    describe('VS Code notifications', () => {
        it('Test 7: should show error message for critical priority', () => {
            manager.notify({
                title: 'Critical Alert',
                message: 'System failure',
                priority: 'critical',
                source: 'system'
            });

            jest.advanceTimersByTime(2500);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it('Test 8: should show error message for error priority', () => {
            manager.notify({
                title: 'Error Alert',
                message: 'Task failed',
                priority: 'error',
                source: 'task'
            });

            jest.advanceTimersByTime(2500);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it('Test 9: should show warning message for warning priority', () => {
            manager.notify({
                title: 'Warning Alert',
                message: 'Performance issue',
                priority: 'warning',
                source: 'monitor'
            });

            jest.advanceTimersByTime(2500);
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });

        it('Test 10: should show info message for info priority', () => {
            manager.notify({
                title: 'Info Alert',
                message: 'Task completed',
                priority: 'info',
                source: 'task'
            });

            jest.advanceTimersByTime(2500);
            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });

        it('Test 11: should include taskId prefix when provided', () => {
            manager.notify({
                title: 'Task Alert',
                message: 'Working',
                priority: 'info',
                source: 'task',
                taskId: 'task-123'
            });

            jest.advanceTimersByTime(2500);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('[Task task-123]')
            );
        });

        it('Test 12: should include actions for error notifications', () => {
            manager.notify({
                title: 'Error',
                message: 'Failed',
                priority: 'error',
                source: 'test',
                actions: ['Retry', 'Cancel']
            });

            jest.advanceTimersByTime(2500);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.any(String),
                'Retry',
                'Cancel'
            );
        });
    });

    // ===========================================
    // Callback registration
    // ===========================================

    describe('onNotification()', () => {
        it('Test 13: should register and call callbacks', () => {
            const callback = jest.fn();
            manager.onNotification(callback);

            manager.notify({ title: 'Test', message: 'M', priority: 'info', source: 'test' });
            jest.advanceTimersByTime(2500);

            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Test',
                message: 'M'
            }));
        });

        it('Test 14: should dispose callback registration', () => {
            const callback = jest.fn();
            const disposable = manager.onNotification(callback);

            disposable.dispose();

            manager.notify({ title: 'Test', message: 'M', priority: 'info', source: 'test' });
            jest.advanceTimersByTime(2500);

            expect(callback).not.toHaveBeenCalled();
        });

        it('Test 15: should handle callback errors gracefully', () => {
            const errorCallback = jest.fn().mockImplementation(() => {
                throw new Error('Callback failed');
            });
            manager.onNotification(errorCallback);

            manager.notify({ title: 'Test', message: 'M', priority: 'info', source: 'test' });
            jest.advanceTimersByTime(2500);

            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Callback error'));
        });
    });

    // ===========================================
    // Convenience notification methods
    // ===========================================

    describe('notifyError()', () => {
        it('Test 16: should create error notification with actions', () => {
            manager.notifyError('Error Title', 'Error message', 'test-source', 'task-1');
            jest.advanceTimersByTime(2500);

            const notifications = manager.getUnacknowledged();
            expect(notifications[0]).toMatchObject({
                title: 'Error Title',
                message: 'Error message',
                priority: 'error',
                source: 'test-source',
                taskId: 'task-1'
            });
            expect(notifications[0].actions).toContain('View Details');
            expect(notifications[0].actions).toContain('Dismiss');
        });
    });

    describe('notifyDeadlock()', () => {
        it('Test 17: should create critical deadlock notification', () => {
            manager.notifyDeadlock(['task-1', 'task-2', 'task-3']);
            jest.advanceTimersByTime(2500);

            const notifications = manager.getUnacknowledged();
            expect(notifications[0]).toMatchObject({
                title: 'Deadlock Detected',
                priority: 'critical',
                source: 'orchestrator'
            });
            expect(notifications[0].message).toContain('3 tasks are blocked');
            expect(notifications[0].actions).toContain('View Dependency Graph');
        });

        it('Test 18: should truncate long task lists in deadlock message', () => {
            manager.notifyDeadlock(['t1', 't2', 't3', 't4', 't5']);
            jest.advanceTimersByTime(2500);

            const notifications = manager.getUnacknowledged();
            expect(notifications[0].message).toContain('...');
        });
    });

    describe('notifyGateFailure()', () => {
        it('Test 19: should create gate failure notification', () => {
            manager.notifyGateFailure('TestGate', 'Check failed');
            jest.advanceTimersByTime(2500);

            const notifications = manager.getUnacknowledged();
            expect(notifications[0]).toMatchObject({
                title: 'Gate Failure: TestGate',
                message: 'Check failed',
                priority: 'error',
                source: 'verification'
            });
        });
    });

    describe('notifyRetryLimitExceeded()', () => {
        it('Test 20: should create retry limit exceeded notification', () => {
            manager.notifyRetryLimitExceeded('task-123', 3);
            jest.advanceTimersByTime(2500);

            const notifications = manager.getUnacknowledged();
            expect(notifications[0]).toMatchObject({
                title: 'Retry Limit Exceeded',
                priority: 'critical',
                taskId: 'task-123'
            });
            expect(notifications[0].message).toContain('3 times');
            expect(notifications[0].actions).toContain('Manual Fix');
        });
    });

    // ===========================================
    // Acknowledgment
    // ===========================================

    describe('acknowledge()', () => {
        it('Test 21: should mark notification as acknowledged', () => {
            manager.notify({ title: 'Test', message: 'M', priority: 'info', source: 'test' });
            jest.advanceTimersByTime(2500);

            const notifications = manager.getUnacknowledged();
            const id = notifications[0].id;

            manager.acknowledge(id);

            expect(manager.getUnacknowledged()).toHaveLength(0);
            expect(manager.getNotification(id)?.acknowledged).toBe(true);
        });

        it('Test 22: should handle acknowledging non-existent notification', () => {
            manager.acknowledge('non-existent-id');
            expect(logInfo).not.toHaveBeenCalledWith(expect.stringContaining('acknowledged'));
        });
    });

    // ===========================================
    // Retrieval methods
    // ===========================================

    describe('getUnacknowledged()', () => {
        it('Test 23: should return only unacknowledged notifications', () => {
            manager.notify({ title: 'T1', message: 'M1', priority: 'info', source: 'test' });
            manager.notify({ title: 'T2', message: 'M2', priority: 'info', source: 'test' });
            jest.advanceTimersByTime(2500);

            const all = manager.getUnacknowledged();
            manager.acknowledge(all[0].id);

            expect(manager.getUnacknowledged()).toHaveLength(1);
            expect(manager.getUnacknowledged()[0].title).toBe('T2');
        });

        it('Test 24: should sort by timestamp descending', () => {
            manager.notify({ title: 'First', message: 'M', priority: 'info', source: 'test' });
            jest.advanceTimersByTime(100);
            manager.notify({ title: 'Second', message: 'M', priority: 'info', source: 'test' });
            jest.advanceTimersByTime(2500);

            const notifications = manager.getUnacknowledged();
            expect(notifications[0].title).toBe('Second'); // Most recent first
        });
    });

    describe('getNotification()', () => {
        it('Test 25: should return notification by ID', () => {
            manager.notify({ title: 'Test', message: 'M', priority: 'info', source: 'test' });
            jest.advanceTimersByTime(2500);

            const notifications = manager.getUnacknowledged();
            const notification = manager.getNotification(notifications[0].id);

            expect(notification).toBeDefined();
            expect(notification?.title).toBe('Test');
        });

        it('Test 26: should return undefined for non-existent ID', () => {
            expect(manager.getNotification('non-existent')).toBeUndefined();
        });
    });

    // ===========================================
    // clearAll() and dispose()
    // ===========================================

    describe('clearAll()', () => {
        it('Test 27: should clear all notifications', () => {
            manager.notify({ title: 'T1', message: 'M', priority: 'info', source: 'test' });
            manager.notify({ title: 'T2', message: 'M', priority: 'warning', source: 'test' });
            jest.advanceTimersByTime(2500);

            manager.clearAll();

            expect(manager.getUnacknowledged()).toHaveLength(0);
        });
    });

    describe('dispose()', () => {
        it('Test 28: should dispose and clear resources', () => {
            manager.notify({ title: 'Test', message: 'M', priority: 'info', source: 'test' });
            manager.dispose();

            expect(manager.getUnacknowledged()).toHaveLength(0);
            expect(logInfo).toHaveBeenCalledWith('[Boss] NotificationManager disposed');
        });

        it('Test 29: should cancel pending aggregation timer', () => {
            manager.notify({ title: 'Test', message: 'M', priority: 'info', source: 'test' });
            // Timer is scheduled but not fired yet

            manager.dispose();

            // Advance time - timer should be cancelled
            jest.advanceTimersByTime(5000);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });
    });

    // ===========================================
    // Singleton functions
    // ===========================================

    describe('Singleton', () => {
        it('Test 30: getBossNotificationManager() should return singleton instance', () => {
            const instance1 = getBossNotificationManager();
            const instance2 = getBossNotificationManager();
            expect(instance1).toBe(instance2);
        });

        it('Test 31: resetBossNotificationManagerForTests() should reset singleton', () => {
            const instance1 = getBossNotificationManager();
            resetBossNotificationManagerForTests();
            const instance2 = getBossNotificationManager();
            expect(instance1).not.toBe(instance2);
        });

        it('Test 32: reset should dispose existing instance', () => {
            const instance = getBossNotificationManager();
            instance.notify({ title: 'Test', message: 'M', priority: 'info', source: 'test' });

            resetBossNotificationManagerForTests();

            // Instance should be disposed
            expect(logInfo).toHaveBeenCalledWith('[Boss] NotificationManager disposed');
        });
    });

    // ===========================================
    // Edge Cases
    // ===========================================

    describe('Edge Cases', () => {
        it('Test 33: should handle empty message', () => {
            manager.notify({ title: 'Title', message: '', priority: 'info', source: 'test' });
            jest.advanceTimersByTime(2500);

            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });

        it('Test 34: should handle special characters in message', () => {
            manager.notify({
                title: 'Title <script>',
                message: 'Message with "quotes" and \'apostrophes\'',
                priority: 'info',
                source: 'test'
            });
            jest.advanceTimersByTime(2500);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('quotes')
            );
        });

        it('Test 35: should handle very long messages', () => {
            const longMessage = 'x'.repeat(1000);
            manager.notify({ title: 'Title', message: longMessage, priority: 'info', source: 'test' });
            jest.advanceTimersByTime(2500);

            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });
    });
});
