// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
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
describe('OrchestratorService - getAnswerAgent', () => {
    let orchestratorService: OrchestratorService;

    beforeEach(() => {
        orchestratorService = new OrchestratorService();
        orchestratorService.resetForTests();
    });

    /** @aiContributed-2026-02-03 */
    it('should return a new AnswerAgent instance if answerAgent is null', () => {
        const answerAgent = orchestratorService.getAnswerAgent();
        expect(answerAgent).toBeDefined();
        expect(Logger.debug).toHaveBeenCalledWith('AnswerAgent created');
    });

    /** @aiContributed-2026-02-03 */
    it('should return the existing AnswerAgent instance if already initialized', () => {
        const firstInstance = orchestratorService.getAnswerAgent();
        const secondInstance = orchestratorService.getAnswerAgent();
        expect(secondInstance).toBe(firstInstance);
        expect(Logger.debug).toHaveBeenCalledTimes(1);
    });
});