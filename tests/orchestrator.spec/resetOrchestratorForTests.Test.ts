// ./orchestrator.Test.ts
import { resetOrchestratorForTests, getOrchestratorInstance, initializeOrchestrator } from '../../src/services/orchestrator';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('resetOrchestratorForTests', () => {
    let context: vscode.ExtensionContext;

    beforeEach(async () => {
        context = {
            extensionPath: '/mock/path',
        } as unknown as vscode.ExtensionContext;

        await initializeOrchestrator(context);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should reset the orchestrator instance and clear the singleton', () => {
        const orchestrator = getOrchestratorInstance();
        expect(orchestrator).toBeDefined();

        resetOrchestratorForTests();

        expect(() => getOrchestratorInstance()).toThrowError(
            'Orchestrator not initialized'
        );
    });

    /** @aiContributed-2026-02-03 */
    it('should clear the task queue and picked tasks', () => {
        const orchestrator = getOrchestratorInstance();
        orchestrator['taskQueue'] = [{ id: '1', ticketId: '1', title: 'Task 1', status: 'pending', createdAt: '2023-01-01T00:00:00Z' }];
        orchestrator['pickedTasks'] = [{ id: '2', ticketId: '2', title: 'Task 2', status: 'picked', createdAt: '2023-01-01T00:00:00Z' }];

        resetOrchestratorForTests();

        expect(orchestrator['taskQueue']).toEqual([]);
        expect(orchestrator['pickedTasks']).toEqual([]);
    });

    /** @aiContributed-2026-02-03 */
    it('should log debug information during reset', () => {
        resetOrchestratorForTests();

        expect(Logger.debug).toHaveBeenCalledWith('Orchestrator reset for tests');
    });

    /** @aiContributed-2026-02-03 */
    it('should reset the context and answerAgent to null', () => {
        const orchestrator = getOrchestratorInstance();
        orchestrator['context'] = context;
        orchestrator['answerAgent'] = {};

        resetOrchestratorForTests();

        expect(orchestrator['context']).toBeNull();
        expect(orchestrator['answerAgent']).toBeNull();
    });
});