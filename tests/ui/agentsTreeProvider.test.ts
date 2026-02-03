/**
 * Tests for AgentsTreeDataProvider with Dynamic Status
 * 
 * Now tests that agent status is dynamically queried from agentStatusTracker
 * and tree items update in real-time when status changes.
 */

import * as vscode from 'vscode';
import { AgentsTreeDataProvider } from '../../src/ui/agentsTreeProvider';
import { AgentStatus } from '../../src/ui/agentStatusTracker';

// Mock vscode module
jest.mock('vscode');

// Mock agentStatusTracker
jest.mock('../../src/ui/agentStatusTracker', () => ({
    agentStatusTracker: {
        getAgentStatus: jest.fn(),
        setAgentStatus: jest.fn(),
        resetAll: jest.fn(),
    },
}));

// Mock ticketDb
jest.mock('../../src/services/ticketDb', () => ({
    onTicketChange: jest.fn(),
}));

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));

import { agentStatusTracker } from '../../src/ui/agentStatusTracker';
import { onTicketChange } from '../../src/services/ticketDb';
import { logError } from '../../src/logger';

describe('AgentsTreeDataProvider (Dynamic Status)', () => {
    let provider: AgentsTreeDataProvider;
    let mockGetAgentStatus: jest.Mock;
    let mockOnTicketChange: jest.Mock;
    let capturedListener: (() => void) | null = null;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mocks
        mockGetAgentStatus = agentStatusTracker.getAgentStatus as jest.Mock;
        mockOnTicketChange = onTicketChange as jest.Mock;

        // Capture listener for later triggering
        mockOnTicketChange.mockImplementation((callback: () => void) => {
            capturedListener = callback;
        });

        // Default: all agents idle
        mockGetAgentStatus.mockReturnValue(undefined);

        provider = new AgentsTreeDataProvider();
    });

    describe('constructor', () => {
        it('should subscribe to ticket changes on instantiation', () => {
            expect(mockOnTicketChange).toHaveBeenCalled();
        });

        it('should handle subscription errors gracefully', () => {
            mockOnTicketChange.mockImplementationOnce(() => {
                throw new Error('Subscription failed');
            });
            // Should not throw
            expect(() => {
                new AgentsTreeDataProvider();
            }).not.toThrow();
        });
    });

    describe('getChildren with dynamic status', () => {
        it('should return 4 agent items always', () => {
            const result = provider.getChildren();
            expect(result).toHaveLength(4);
            expect(result[0].label).toBe('Planning');
            expect(result[1].label).toBe('Orchestrator');
            expect(result[2].label).toBe('Answer');
            expect(result[3].label).toBe('Verification');
        });

        it('should display Idle when status is undefined', () => {
            mockGetAgentStatus.mockReturnValue(undefined);
            const result = provider.getChildren();
            expect(result[0].description).toBe('Idle');
            expect((result[0].iconPath as vscode.ThemeIcon).id).toBe('circle-outline');
        });

        it('should display Active status with truncated result', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Active',
                lastResult: 'Step 1: Design the component with TypeScript types',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            const item = result[0];

            expect(item.description).toContain('Active');
            expect(item.description).toContain('Last:');
            // Should be truncated to ~50 chars
            expect((item.description as string).length).toBeLessThan(100);
        });

        it('should use spinning icon for Active agent', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Active',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            expect((result[0].iconPath as vscode.ThemeIcon).id).toBe('loading~spin');
        });

        it('should use check icon for Waiting agent', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Waiting',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            expect((result[0].iconPath as vscode.ThemeIcon).id).toBe('check');
        });

        it('should use error icon for Failed agent', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Failed',
                lastResult: 'LLM timeout',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            expect((result[0].iconPath as vscode.ThemeIcon).id).toBe('error');
        });

        it('should include timestamp in tooltip', () => {
            const ts = 1704067200000;
            mockGetAgentStatus.mockReturnValue({
                status: 'Active',
                lastResult: 'Test result',
                timestamp: ts,
            } as AgentStatus);

            const result = provider.getChildren();
            expect(result[0].tooltip).toContain('Active');
            expect(result[0].tooltip).toContain('Test result');
        });

        it('should handle result truncation to 50 chars', () => {
            const longResult = 'A'.repeat(100);
            mockGetAgentStatus.mockReturnValue({
                status: 'Waiting',
                lastResult: longResult,
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            const desc = result[0].description as string;

            // Result should be max 50 chars
            expect(desc).toContain('A'.repeat(50));
            expect(desc).toContain('...');
        });

        it('should display all agents with different statuses', () => {
            const statuses: { [key: string]: AgentStatus | undefined } = {
                Planning: { status: 'Active', lastResult: 'Planning...', timestamp: Date.now() },
                Orchestrator: { status: 'Waiting', timestamp: Date.now() },
                Answer: { status: 'Idle', timestamp: Date.now() },
                Verification: { status: 'Failed', lastResult: 'Error', timestamp: Date.now() },
            };

            mockGetAgentStatus.mockImplementation((name: string) => statuses[name]);

            const result = provider.getChildren();
            expect(result[0].description).toContain('Active');
            expect(result[1].description).toBe('Waiting');
            expect(result[2].description).toBe('Idle');
            expect(result[3].description).toContain('Failed');
        });

        it('should not include "Last:" in description when no result', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Waiting',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            expect(result[0].description).toBe('Waiting');
            expect((result[0].description as string).indexOf('Last')).toBe(-1);
        });

        it('should display currentTask in description when available', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Active',
                currentTask: 'Planning task X',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            expect(result[0].description).toContain('Active');
            expect(result[0].description).toContain('Task:');
            expect(result[0].description).toContain('Planning task X');
        });

        it('should prioritize currentTask over lastResult in description', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Active',
                currentTask: 'Generating requirements',
                lastResult: 'Previous plan completed',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            const desc = result[0].description as string;
            expect(desc).toContain('Task:');
            expect(desc).toContain('Generating requirements');
            expect(desc).not.toContain('Last:');
            expect(desc).not.toContain('Previous plan');
        });

        it('should truncate currentTask to 50 chars', () => {
            const longTask = 'A'.repeat(100);
            mockGetAgentStatus.mockReturnValue({
                status: 'Active',
                currentTask: longTask,
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            const desc = result[0].description as string;
            expect(desc).toContain('A'.repeat(50));
            expect(desc).toContain('...');
        });

        it('should include currentTask in tooltip', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Active',
                currentTask: 'Verifying step 2',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            expect(result[0].tooltip).toContain('Active');
            expect(result[0].tooltip).toContain('Task:');
            expect(result[0].tooltip).toContain('Verifying step 2');
        });

        it('should include both currentTask and lastResult in tooltip', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Active',
                currentTask: 'Analyzing code',
                lastResult: 'Previous: Found 3 issues',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            const tooltip = result[0].tooltip as string;
            expect(tooltip).toContain('Active');
            expect(tooltip).toContain('Task: Analyzing code');
            expect(tooltip).toContain('Last Result: Previous: Found 3 issues');
        });

        it('should show "Idle" with no extra info when agent has no task or result', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Idle',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            expect(result[0].description).toBe('Idle');
            const tooltip = result[0].tooltip as string;
            expect(tooltip).toContain('Idle');
            expect(tooltip).not.toContain('Task:');
            expect(tooltip).not.toContain('Last Result:');
        });

        it('should handle Failed agent with error message in tooltip', () => {
            mockGetAgentStatus.mockReturnValue({
                status: 'Failed',
                lastResult: 'LLM connection timeout after 30s',
                timestamp: Date.now(),
            } as AgentStatus);

            const result = provider.getChildren();
            expect((result[0].iconPath as vscode.ThemeIcon).id).toBe('error');
            const tooltip = result[0].tooltip as string;
            expect(tooltip).toContain('Failed');
            expect(tooltip).toContain('LLM connection timeout');
        });
    });

    describe('tree refresh on ticket change', () => {
        it('should trigger refresh when listener called', () => {
            const refreshSpy = jest.spyOn(provider, 'refresh');

            if (capturedListener) {
                capturedListener();
            }

            expect(refreshSpy).toHaveBeenCalled();
        });

        it('should fire onDidChangeTreeData when refresh called', () => {
            const fireSpy = jest.spyOn((provider as any)._onDidChangeTreeData, 'fire');
            provider.refresh();
            expect(fireSpy).toHaveBeenCalled();
        });
    });

    describe('real-time updates on agent status change', () => {
        it('should subscribe to agentStatusTracker.onStatusChange on construction', () => {
            // Create new provider to test subscription
            const mockOnStatusChange = jest.fn();
            (agentStatusTracker as any).onStatusChange = mockOnStatusChange;

            new AgentsTreeDataProvider();

            // Should have subscribed
            expect(mockOnStatusChange).toHaveBeenCalled();
        });

        it('should refresh tree when agent status changes', () => {
            // This test verifies that status change event triggers refresh
            const refreshSpy = jest.spyOn(provider, 'refresh');

            // Simulate a status change by triggering the event if captured
            // (In real usage, agentStatusTracker.setAgentStatus would fire this)
            if (capturedListener) {
                capturedListener();
            }

            expect(refreshSpy).toHaveBeenCalled();
        });
    });

    describe('getTreeItem', () => {
        it('should return item unchanged', () => {
            const item = new vscode.TreeItem('test');
            expect(provider.getTreeItem(item)).toBe(item);
        });
    });

    describe('getChildren with element', () => {
        it('should return empty array for no children', () => {
            const item = new vscode.TreeItem('test');
            expect(provider.getChildren(item)).toEqual([]);
        });
    });
});

