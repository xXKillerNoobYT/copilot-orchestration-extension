/**
 * Tests for OrchestratorStatusTreeDataProvider
 *
 * Focus: three status items, idle fallback, and auto-refresh wiring.
 */

import * as vscode from 'vscode';
import { OrchestratorStatusTreeDataProvider } from '../../src/ui/orchestratorStatusTreeProvider';
import * as logger from '../../src/logger';

jest.mock('vscode');

const mockGetQueueStatus = jest.fn();
const mockOnQueueChange = jest.fn();
const mockGetOrchestratorInstance = jest.fn();

jest.mock('../../src/services/orchestrator', () => ({
    getOrchestratorInstance: (...args: unknown[]) => mockGetOrchestratorInstance(...args),
}));

const mockOnTicketChange = jest.fn();

jest.mock('../../src/services/ticketDb', () => ({
    onTicketChange: (...args: unknown[]) => mockOnTicketChange(...args),
}));

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

describe('OrchestratorStatusTreeDataProvider', () => {
    let provider: OrchestratorStatusTreeDataProvider;
    let capturedQueueListener: (() => void) | null = null;
    let capturedTicketListener: (() => void) | null = null;
    const logErrorMock = logger.logError as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        capturedQueueListener = null;
        capturedTicketListener = null;
        
        mockOnQueueChange.mockImplementation((listener: () => void) => {
            capturedQueueListener = listener;
            return { dispose: jest.fn() } as vscode.Disposable;
        });
        mockOnTicketChange.mockImplementation((listener: () => void) => {
            capturedTicketListener = listener;
            return { dispose: jest.fn() } as vscode.Disposable;
        });
        mockGetQueueStatus.mockResolvedValue({
            queueCount: 2,
            blockedP1Count: 1,
            lastPickedTitle: 'Test Task'
        });
        mockGetOrchestratorInstance.mockReturnValue({
            getQueueStatus: mockGetQueueStatus,
            onQueueChange: mockOnQueueChange,
        });

        provider = new OrchestratorStatusTreeDataProvider();
    });

    it('Test 1: should return three status items with correct labels', async () => {
        const items = await provider.getChildren();
        expect(items).toHaveLength(3);
        expect(items[0].label).toBe('Queue: 2 tasks');
        expect(items[1].label).toBe('Blocked / P1: 1');
        expect(items[2].label).toBe('Last picked: Test Task');
    });

    it('Test 2: should show Idle when no last picked task', async () => {
        mockGetQueueStatus.mockResolvedValueOnce({
            queueCount: 0,
            blockedP1Count: 0,
            lastPickedTitle: null
        });

        const items = await provider.getChildren();
        expect(items[2].label).toBe('Last picked: Idle');
    });

    it('Test 3: should refresh when queue change event fires', () => {
        const refreshSpy = jest.fn();
        provider.onDidChangeTreeData(() => refreshSpy());

        capturedQueueListener?.();

        expect(refreshSpy).toHaveBeenCalled();
    });

    it('Test 4: should assign click command for details', async () => {
        const items = await provider.getChildren();
        items.forEach(item => {
            expect(item.command?.command).toBe('coe.showOrchestratorStatusDetails');
        });
    });

    it('Test 5: getTreeItem should return the element as-is', () => {
        const item = new vscode.TreeItem('Test', vscode.TreeItemCollapsibleState.None);
        const result = provider.getTreeItem(item);
        expect(result).toBe(item);
    });

    it('Test 6: getChildren with element should return empty array', async () => {
        const item = new vscode.TreeItem('Test', vscode.TreeItemCollapsibleState.None);
        const result = await provider.getChildren(item);
        expect(result).toEqual([]);
    });

    it('Test 7: should return error item when getQueueStatus fails', async () => {
        mockGetQueueStatus.mockRejectedValueOnce(new Error('Orchestrator error'));

        const items = await provider.getChildren();
        
        expect(items).toHaveLength(1);
        expect(items[0].label).toBe('Error loading orchestrator status');
        expect(items[0].iconPath).toBeDefined();
        expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('Failed to load status'));
    });

    it('Test 8: should handle non-Error exception in getChildren', async () => {
        mockGetQueueStatus.mockRejectedValueOnce('String error');

        const items = await provider.getChildren();
        
        expect(items).toHaveLength(1);
        expect(items[0].label).toBe('Error loading orchestrator status');
        expect(items[0].tooltip).toContain('String error');
    });

    it('Test 9: refresh triggers onDidChangeTreeData event', () => {
        const eventSpy = jest.fn();
        provider.onDidChangeTreeData(eventSpy);
        
        provider.refresh();
        
        expect(eventSpy).toHaveBeenCalled();
    });

    it('Test 10: should refresh when ticket change fires', () => {
        const refreshSpy = jest.fn();
        provider.onDidChangeTreeData(refreshSpy);

        capturedTicketListener?.();

        expect(refreshSpy).toHaveBeenCalled();
    });
});

describe('OrchestratorStatusTreeDataProvider - Error handling in constructor', () => {
    const logErrorMock = logger.logError as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Test 11: should log error when orchestrator subscription fails', () => {
        mockGetOrchestratorInstance.mockImplementation(() => {
            throw new Error('Orchestrator not initialized');
        });
        mockOnTicketChange.mockImplementation(() => {});

        // This should not throw
        const provider = new OrchestratorStatusTreeDataProvider();
        
        expect(logErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to subscribe to queue changes')
        );
        expect(provider).toBeDefined();
    });

    it('Test 12: should log error when ticket subscription fails', () => {
        mockGetOrchestratorInstance.mockReturnValue({
            getQueueStatus: jest.fn(),
            onQueueChange: jest.fn(),
        });
        mockOnTicketChange.mockImplementation(() => {
            throw new Error('TicketDB not initialized');
        });

        // This should not throw
        const provider = new OrchestratorStatusTreeDataProvider();
        
        expect(logErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to subscribe to ticket changes')
        );
        expect(provider).toBeDefined();
    });

    it('Test 13: should handle non-Error exception in orchestrator subscription', () => {
        mockGetOrchestratorInstance.mockImplementation(() => {
            throw 'String error'; // Non-Error exception
        });
        mockOnTicketChange.mockImplementation(() => {});

        const provider = new OrchestratorStatusTreeDataProvider();
        
        expect(logErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('String error')
        );
        expect(provider).toBeDefined();
    });

    it('Test 14: should handle non-Error exception in ticket subscription', () => {
        mockGetOrchestratorInstance.mockReturnValue({
            getQueueStatus: jest.fn(),
            onQueueChange: jest.fn(),
        });
        mockOnTicketChange.mockImplementation(() => {
            throw 'String error'; // Non-Error exception
        });

        const provider = new OrchestratorStatusTreeDataProvider();
        
        expect(logErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('String error')
        );
        expect(provider).toBeDefined();
    });
});
