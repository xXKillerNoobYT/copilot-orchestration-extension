// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { logInfo, logError } from '../../src/logger';
import { llmStatusBar } from '../../src/ui/llmStatusBar';
import { AnswerAgent } from '../../src/services/answerAgent';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../src/ui/llmStatusBar', () => ({
    ...jest.requireActual('../../src/ui/llmStatusBar'),
    llmStatusBar: {
        start: jest.fn(),
        end: jest.fn(),
    },
}));

jest.mock('../../src/services/answerAgent', () => ({
    ...jest.requireActual('../../src/services/answerAgent'),
    AnswerAgent: jest.fn().mockImplementation(() => ({
        ask: jest.fn(),
    })),
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
    let orchestrator: OrchestratorService;
    let mockAnswerAgent: jest.Mocked<AnswerAgent>;

    beforeEach(() => {
        orchestrator = new OrchestratorService();
        mockAnswerAgent = new AnswerAgent() as jest.Mocked<AnswerAgent>;
        orchestrator['answerAgent'] = mockAnswerAgent;
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
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[Answer] Starting conversation'));
        expect(logInfo).toHaveBeenCalledWith('[Answer] Response generated');
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
        expect(logError).toHaveBeenCalledWith(expect.stringContaining(`[Answer] Failed to answer question: ${errorMessage}`));
        expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle null or undefined inputs gracefully', async () => {
        const result = await orchestrator.answerQuestion(null as unknown as string);

        expect(llmStatusBar.start).toHaveBeenCalled();
        expect(llmStatusBar.end).toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('[Answer] Failed to answer question'));
        expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
    });

    /** @aiContributed-2026-02-03 */
    it('should log and truncate long questions in the log', async () => {
        const longQuestion = 'a'.repeat(100);
        const expectedAnswer = 'Truncated response';

        mockAnswerAgent.ask.mockResolvedValue(expectedAnswer);

        const result = await orchestrator.answerQuestion(longQuestion);

        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining(longQuestion.substring(0, 50)));
        expect(result).toBe(expectedAnswer);
    });

    /** @aiContributed-2026-02-03 */
    it('should call llmStatusBar.end even if an error is thrown', async () => {
        const question = 'What is the capital of France?';
        mockAnswerAgent.ask.mockRejectedValue(new Error('Unexpected error'));

        await orchestrator.answerQuestion(question);

        expect(llmStatusBar.start).toHaveBeenCalled();
        expect(llmStatusBar.end).toHaveBeenCalled();
    });
});