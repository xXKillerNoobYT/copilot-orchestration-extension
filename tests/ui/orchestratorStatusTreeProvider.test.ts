/**
 * Tests for OrchestratorStatusTreeDataProvider
 *
 * Focus: three status items, idle fallback, and auto-refresh wiring.
 */

import * as vscode from 'vscode';
import { OrchestratorStatusTreeDataProvider } from '../../src/ui/orchestratorStatusTreeProvider';

jest.mock('vscode');

const mockGetQueueStatus = jest.fn();
const mockOnQueueChange = jest.fn();

jest.mock('../../src/services/orchestrator', () => ({
    getOrchestratorInstance: jest.fn(() => ({
        getQueueStatus: mockGetQueueStatus,
        onQueueChange: mockOnQueueChange,
    }))
}));

jest.mock('../../src/services/ticketDb', () => ({
    onTicketChange: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

describe('OrchestratorStatusTreeDataProvider', () => {
    let provider: OrchestratorStatusTreeDataProvider;
    let capturedQueueListener: (() => void) | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnQueueChange.mockImplementation((listener: () => void) => {
            capturedQueueListener = listener;
            return { dispose: jest.fn() } as vscode.Disposable;
        });
        mockGetQueueStatus.mockResolvedValue({
            queueCount: 2,
            blockedP1Count: 1,
            lastPickedTitle: 'Test Task'
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
});
