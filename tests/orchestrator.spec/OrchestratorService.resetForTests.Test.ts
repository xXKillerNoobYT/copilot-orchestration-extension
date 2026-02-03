// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { Logger } from '../../utils/logger';

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
    let orchestrator: OrchestratorService;

    beforeEach(() => {
        orchestrator = new OrchestratorService();
        Logger.debug = jest.fn();
    });

    /** @aiContributed-2026-02-03 */
    describe('resetForTests', () => {
        /** @aiContributed-2026-02-03 */
        it('should reset all properties to their initial state', () => {
            // Arrange
            orchestrator['taskQueue'] = [{ id: 1, name: 'Task1' }];
            orchestrator['pickedTasks'] = [{ id: 2, name: 'Task2' }];
            orchestrator['context'] = { subscriptions: [] } as Record<string, unknown>;
            orchestrator['answerAgent'] = { name: 'Agent1' } as Record<string, unknown>;

            // Act
            orchestrator.resetForTests();

            // Assert
            expect(orchestrator['taskQueue']).toEqual([]);
            expect(orchestrator['pickedTasks']).toEqual([]);
            expect(orchestrator['context']).toBeNull();
            expect(orchestrator['answerAgent']).toBeNull();
            expect(Logger.debug).toHaveBeenCalledWith('resetForTests called');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle being called multiple times without errors', () => {
            // Act & Assert
            expect(() => {
                orchestrator.resetForTests();
                orchestrator.resetForTests();
            }).not.toThrow();
        });
    });
});