// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { Logger } from '../../utils/logger';
import { llmStatusBar } from '../../src/ui/llmStatusBar';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

jest.mock('../../src/ui/llmStatusBar', () => ({
    ...jest.requireActual('../../src/ui/llmStatusBar'),
    llmStatusBar: {
        start: jest.fn(),
        end: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
    let orchestrator: OrchestratorService;
    let mockAnswerAgent: { ask: jest.Mock };

    beforeEach(() => {
        orchestrator = new OrchestratorService();
        mockAnswerAgent = { ask: jest.fn() };
        orchestrator['answerAgent'] = mockAnswerAgent as unknown as typeof orchestrator['answerAgent'];
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should return the answer from AnswerAgent on the happy path', async () => {
        const question = 'What is the capital of France?';
        const chatId = '123';
        const isContinue = false;
        const expectedAnswer = 'Paris';

        mockAnswerAgent.ask.mockResolvedValue(expectedAnswer);

        const result = await orchestrator.answerQuestion(question, chatId, isContinue);

        expect(llmStatusBar.start).toHaveBeenCalled();
        expect(llmStatusBar.end).toHaveBeenCalled();
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('[Answer] Starting conversation'));
        expect(Logger.info).toHaveBeenCalledWith('[Answer] Response generated');
        expect(result).toBe(expectedAnswer);
    });

    /** @aiContributed-2026-02-03 */
    it('should initialize AnswerAgent if not already initialized', async () => {
        orchestrator['answerAgent'] = null;
        const question = 'What is the capital of France?';
        const expectedAnswer = 'Paris';

        mockAnswerAgent.ask.mockResolvedValue(expectedAnswer);

        const result = await orchestrator.answerQuestion(question);

        expect(orchestrator['answerAgent']).not.toBeNull();
        expect(result).toBe(expectedAnswer);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle errors and return a fallback message', async () => {
        const question = 'What is the capital of France?';
        const errorMessage = 'Service unavailable';

        mockAnswerAgent.ask.mockRejectedValue(new Error(errorMessage));

        const result = await orchestrator.answerQuestion(question);

        expect(llmStatusBar.start).toHaveBeenCalled();
        expect(llmStatusBar.end).toHaveBeenCalled();
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining(`[Answer] Failed to answer question: ${errorMessage}`));
        expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle null or undefined inputs gracefully', async () => {
        const result = await orchestrator.answerQuestion(null as unknown as string);

        expect(llmStatusBar.start).toHaveBeenCalled();
        expect(llmStatusBar.end).toHaveBeenCalled();
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('[Answer] Failed to answer question'));
        expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
    });
});