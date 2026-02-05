// ./orchestratorStatusTreeProvider.Test.ts
import * as vscode from 'vscode';
import { OrchestratorStatusTreeDataProvider } from '../../src/ui/orchestratorStatusTreeProvider';
import { getOrchestratorInstance } from '../../src/services/orchestrator';
import { logError } from '../../src/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
    ThemeIcon: jest.fn(),
    TreeItemCollapsibleState: { None: 0 },
}));

jest.mock('../../src/services/orchestrator', () => ({
    ...jest.requireActual('../../src/services/orchestrator'),
    getOrchestratorInstance: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('OrchestratorStatusTreeDataProvider', () => {
    let provider: OrchestratorStatusTreeDataProvider;

    beforeEach(() => {
        provider = new OrchestratorStatusTreeDataProvider();
    });

    /** @aiContributed-2026-02-04 */
    describe('getChildren', () => {
        /** @aiContributed-2026-02-04 */
        it('should return an empty array if an element is provided', async () => {
            const result = await provider.getChildren(new vscode.TreeItem('Test'));
            expect(result).toEqual([]);
        });

        /** @aiContributed-2026-02-04 */
        it('should return tree items for queue, blocked, and last picked on success', async () => {
            const mockStatus = {
                queueCount: 5,
                blockedP1Count: 2,
                lastPickedTitle: 'Task 123',
            };
            const mockOrchestrator = {
                getQueueStatus: jest.fn().mockResolvedValue(mockStatus),
            };
            (getOrchestratorInstance as jest.Mock).mockReturnValue(mockOrchestrator);

            const result = await provider.getChildren();

            expect(result).toHaveLength(3);
            expect(result[0].label).toBe('Queue: 5 tasks');
            expect(result[1].label).toBe('Blocked / P1: 2');
            expect(result[2].label).toBe('Last picked: Task 123');
        });

        /** @aiContributed-2026-02-04 */
        it('should handle missing lastPickedTitle gracefully', async () => {
            const mockStatus = {
                queueCount: 3,
                blockedP1Count: 1,
                lastPickedTitle: null,
            };
            const mockOrchestrator = {
                getQueueStatus: jest.fn().mockResolvedValue(mockStatus),
            };
            (getOrchestratorInstance as jest.Mock).mockReturnValue(mockOrchestrator);

            const result = await provider.getChildren();

            expect(result).toHaveLength(3);
            expect(result[2].label).toBe('Last picked: Idle');
        });

        /** @aiContributed-2026-02-04 */
        it('should return an error item if getQueueStatus throws an error', async () => {
            const errorMessage = 'Failed to fetch status';
            const mockOrchestrator = {
                getQueueStatus: jest.fn().mockRejectedValue(new Error(errorMessage)),
            };
            (getOrchestratorInstance as jest.Mock).mockReturnValue(mockOrchestrator);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('Error loading orchestrator status');
            expect(result[0].tooltip).toBe(`Failed to load status: ${errorMessage}`);
            expect(logError).toHaveBeenCalledWith(`[OrchestratorStatusTree] Failed to load status: ${errorMessage}`);
        });
    });
});