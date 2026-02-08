/**
 * Tests for Human Escalation System
 *
 * Tests for escalation modal and user interaction handling.
 */

import {
    HumanEscalationHandler,
    EscalationAction,
    EscalationResult,
    getHumanEscalationHandler,
    resetHumanEscalationHandlerForTests,
} from '../../../src/agents/verification/escalation';
import type { EscalationInfo } from '../../../src/agents/verification/retryLimit';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        showErrorMessage: jest.fn().mockResolvedValue(undefined),
        showInputBox: jest.fn().mockResolvedValue('test note'),
        showWarningMessage: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

// Mock retryLimit
jest.mock('../../../src/agents/verification/retryLimit', () => ({
    getRetryLimitManager: jest.fn(() => ({
        markEscalated: jest.fn(),
    })),
}));

// Mock boss
jest.mock('../../../src/agents/orchestrator/boss', () => ({
    getBossNotificationManager: jest.fn(() => ({
        notifyRetryLimitExceeded: jest.fn(),
    })),
}));

import { logInfo, logError } from '../../../src/logger';
import { getRetryLimitManager } from '../../../src/agents/verification/retryLimit';
import { getBossNotificationManager } from '../../../src/agents/orchestrator/boss';

describe('HumanEscalationHandler', () => {
    let handler: HumanEscalationHandler;

    const createMockEscalationInfo = (overrides: Partial<EscalationInfo> = {}): EscalationInfo => ({
        taskId: 'task-123',
        totalRetries: 3,
        recommendation: 'manual-fix',
        failureSummary: 'Test failure summary',
        evidence: ['evidence1', 'evidence2'],
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetHumanEscalationHandlerForTests();
        handler = new HumanEscalationHandler();
    });

    afterEach(() => {
        handler.clear();
    });

    // ============================================================================
    // Constructor Tests
    // ============================================================================
    describe('constructor', () => {
        it('Test 1: should create instance with empty state', () => {
            expect(handler.getAllResults()).toEqual([]);
            expect(handler.getPendingEscalations()).toEqual([]);
        });
    });

    // ============================================================================
    // escalate Tests
    // ============================================================================
    describe('escalate()', () => {
        it('Test 2: should trigger escalation', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
            
            await handler.escalate(info);
            
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Escalating task task-123')
            );
        });

        it('Test 3: should notify boss', async () => {
            const info = createMockEscalationInfo();
            const mockBoss = { notifyRetryLimitExceeded: jest.fn() };
            (getBossNotificationManager as jest.Mock).mockReturnValue(mockBoss);
            
            await handler.escalate(info);
            
            expect(mockBoss.notifyRetryLimitExceeded).toHaveBeenCalledWith('task-123', 3);
        });

        it('Test 4: should return dismissed when dialog closed', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
            
            const result = await handler.escalate(info);
            
            expect(result.action).toBe('dismissed');
            expect(result.handled).toBe(false);
        });

        it('Test 5: should handle manual-fix selection', async () => {
            const info = createMockEscalationInfo({ recommendation: 'manual-fix' });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('🔧 Manual Fix (Recommended)');
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('will fix manually');
            
            const result = await handler.escalate(info);
            
            expect(result.action).toBe('manual-fix');
            expect(result.note).toBe('will fix manually');
            expect(result.handled).toBe(true);
        });

        it('Test 6: should handle skip selection', async () => {
            const info = createMockEscalationInfo({ recommendation: 'skip' });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('⏭️ Skip Task (Recommended)');
            
            const result = await handler.escalate(info);
            
            expect(result.action).toBe('skip');
            expect(result.handled).toBe(true);
        });

        it('Test 7: should handle change-approach selection', async () => {
            const info = createMockEscalationInfo({ recommendation: 'change-approach' });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('🔄 Change Approach (Recommended)');
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('trying different approach');
            
            const result = await handler.escalate(info);
            
            expect(result.action).toBe('change-approach');
            expect(result.note).toBe('trying different approach');
        });

        it('Test 8: should handle retry-once selection', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Retry Once More');
            
            const result = await handler.escalate(info);
            
            expect(result.action).toBe('retry-once');
        });

        it('Test 9: should mark as escalated when not retry', async () => {
            const info = createMockEscalationInfo();
            const mockRetryManager = { markEscalated: jest.fn() };
            (getRetryLimitManager as jest.Mock).mockReturnValue(mockRetryManager);
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            await handler.escalate(info);
            
            expect(mockRetryManager.markEscalated).toHaveBeenCalledWith('task-123');
        });

        it('Test 10: should not mark as escalated when retry', async () => {
            const info = createMockEscalationInfo();
            const mockRetryManager = { markEscalated: jest.fn() };
            (getRetryLimitManager as jest.Mock).mockReturnValue(mockRetryManager);
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Retry Once More');
            
            await handler.escalate(info);
            
            expect(mockRetryManager.markEscalated).not.toHaveBeenCalled();
        });

        it('Test 11: should store result', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            await handler.escalate(info);
            
            const result = handler.getResult('task-123');
            expect(result).toBeDefined();
            expect(result?.action).toBe('skip');
        });
    });

    // ============================================================================
    // onEscalation Tests
    // ============================================================================
    describe('onEscalation()', () => {
        it('Test 12: should register callback', async () => {
            const callback = jest.fn();
            handler.onEscalation(callback);
            
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            await handler.escalate(info);
            
            expect(callback).toHaveBeenCalled();
        });

        it('Test 13: should return disposable', () => {
            const callback = jest.fn();
            const disposable = handler.onEscalation(callback);
            
            expect(disposable.dispose).toBeDefined();
        });

        it('Test 14: should not call callback after dispose', async () => {
            const callback = jest.fn();
            const disposable = handler.onEscalation(callback);
            disposable.dispose();
            
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            await handler.escalate(info);
            
            expect(callback).not.toHaveBeenCalled();
        });

        it('Test 15: should handle callback errors', async () => {
            const errorCallback = jest.fn(() => {
                throw new Error('Callback error');
            });
            handler.onEscalation(errorCallback);
            
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            // Should not throw
            await handler.escalate(info);
            
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Callback error')
            );
        });
    });

    // ============================================================================
    // getResult Tests
    // ============================================================================
    describe('getResult()', () => {
        it('Test 16: should return undefined for unknown task', () => {
            expect(handler.getResult('unknown')).toBeUndefined();
        });

        it('Test 17: should return result for known task', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            await handler.escalate(info);
            
            const result = handler.getResult('task-123');
            expect(result).toBeDefined();
        });
    });

    // ============================================================================
    // isEscalated Tests
    // ============================================================================
    describe('isEscalated()', () => {
        it('Test 18: should return false for non-escalated task', () => {
            expect(handler.isEscalated('task-123')).toBe(false);
        });

        it('Test 19: should return true for escalated task', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            await handler.escalate(info);
            
            expect(handler.isEscalated('task-123')).toBe(true);
        });
    });

    // ============================================================================
    // isPending Tests
    // ============================================================================
    describe('isPending()', () => {
        it('Test 20: should return false when no pending', () => {
            expect(handler.isPending('task-123')).toBe(false);
        });
    });

    // ============================================================================
    // getPendingEscalations Tests
    // ============================================================================
    describe('getPendingEscalations()', () => {
        it('Test 21: should return empty array initially', () => {
            expect(handler.getPendingEscalations()).toEqual([]);
        });
    });

    // ============================================================================
    // getAllResults Tests
    // ============================================================================
    describe('getAllResults()', () => {
        it('Test 22: should return all results', async () => {
            const info1 = createMockEscalationInfo({ taskId: 'task-1' });
            const info2 = createMockEscalationInfo({ taskId: 'task-2' });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            await handler.escalate(info1);
            await handler.escalate(info2);
            
            const results = handler.getAllResults();
            expect(results.length).toBe(2);
        });
    });

    // ============================================================================
    // showQuietNotification Tests
    // ============================================================================
    describe('showQuietNotification()', () => {
        it('Test 23: should show warning message', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Dismiss');
            
            await handler.showQuietNotification(info);
            
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });

        it('Test 24: should escalate when View Details clicked', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('View Details');
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            await handler.showQuietNotification(info);
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it('Test 25: should not escalate when dismissed', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Dismiss');
            
            await handler.showQuietNotification(info);
            
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });
    });

    // ============================================================================
    // clear Tests
    // ============================================================================
    describe('clear()', () => {
        it('Test 26: should clear all state', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            await handler.escalate(info);
            
            handler.clear();
            
            expect(handler.getAllResults()).toEqual([]);
            expect(handler.getPendingEscalations()).toEqual([]);
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 27: getHumanEscalationHandler should return singleton', () => {
            const instance1 = getHumanEscalationHandler();
            const instance2 = getHumanEscalationHandler();
            expect(instance1).toBe(instance2);
        });

        it('Test 28: resetHumanEscalationHandlerForTests should reset', () => {
            const instance1 = getHumanEscalationHandler();
            resetHumanEscalationHandlerForTests();
            const instance2 = getHumanEscalationHandler();
            expect(instance1).not.toBe(instance2);
        });
    });

    // ============================================================================
    // Recommendation Text Tests
    // ============================================================================
    describe('recommendation text (via escalate)', () => {
        it('Test 29: should show manual-fix recommendation', async () => {
            const info = createMockEscalationInfo({ recommendation: 'manual-fix' });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
            
            await handler.escalate(info);
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Manual intervention required'),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
        });

        it('Test 30: should show skip recommendation', async () => {
            const info = createMockEscalationInfo({ recommendation: 'skip' });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
            
            await handler.escalate(info);
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Consider skipping'),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
        });

        it('Test 31: should show change-approach recommendation', async () => {
            const info = createMockEscalationInfo({ recommendation: 'change-approach' });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
            
            await handler.escalate(info);
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Try a different approach'),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
        });

        it('Test 32: should show default recommendation for unknown type', async () => {
            const info = createMockEscalationInfo({ recommendation: 'unknown-type' as any });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
            
            await handler.escalate(info);
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Review and decide'),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 33: should handle empty evidence array', async () => {
            const info = createMockEscalationInfo({ evidence: [] });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            const result = await handler.escalate(info);
            expect(result).toBeDefined();
        });

        it('Test 34: should handle null note from input box', async () => {
            const info = createMockEscalationInfo();
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Manual Fix');
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);
            
            const result = await handler.escalate(info);
            expect(result.note).toBeUndefined();
        });

        it('Test 35: should handle special characters in task ID', async () => {
            const info = createMockEscalationInfo({ taskId: 'task/with/special#chars' });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Skip Task');
            
            const result = await handler.escalate(info);
            expect(result.taskId).toBe('task/with/special#chars');
        });
    });
});
