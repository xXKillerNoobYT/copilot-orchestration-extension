// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { Logger } from '../../utils/logger';
import { AnswerAgent } from '../../src/services/answerAgent';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

jest.mock('../../src/services/answerAgent', () => {
    return {
        ...jest.requireActual('../../src/services/answerAgent'),
        AnswerAgent: jest.fn().mockImplementation(() => ({
            someMethod: jest.fn(),
        })),
    };
});

/** @aiContributed-2026-02-03 */
describe('OrchestratorService - getAnswerAgent', () => {
    let orchestratorService: OrchestratorService;

    beforeEach(() => {
        orchestratorService = new OrchestratorService();
        orchestratorService.resetForTests();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should return a new AnswerAgent instance if answerAgent is null', () => {
        const answerAgent = orchestratorService.getAnswerAgent();
        expect(answerAgent).toBeDefined();
        expect(answerAgent).toBeInstanceOf(AnswerAgent);
        expect(Logger.debug).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should return the existing AnswerAgent instance if already initialized', () => {
        const firstInstance = orchestratorService.getAnswerAgent();
        const secondInstance = orchestratorService.getAnswerAgent();
        expect(secondInstance).toBe(firstInstance);
        expect(Logger.debug).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should not create a new AnswerAgent instance if one already exists', () => {
        orchestratorService.getAnswerAgent();
        orchestratorService.getAnswerAgent();
        expect(AnswerAgent).toHaveBeenCalledTimes(1);
    });

    /** @aiContributed-2026-02-03 */
    it('should initialize AnswerAgent only once even with multiple calls', () => {
        const instances = Array.from({ length: 5 }, () => orchestratorService.getAnswerAgent());
        expect(instances.every(instance => instance === instances[0])).toBe(true);
        expect(AnswerAgent).toHaveBeenCalledTimes(1);
    });
});