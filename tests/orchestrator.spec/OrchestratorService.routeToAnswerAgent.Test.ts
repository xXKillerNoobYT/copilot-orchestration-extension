// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { completeLLM } from '../../src/services/llmService';
import { createTicket } from '../../src/services/ticketDb';
import { logWarn, logInfo, logError } from '../../src/logger';

jest.mock('../../src/services/llmService', () => ({
    ...jest.requireActual('../../src/services/llmService'),
    completeLLM: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    createTicket: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService - routeToAnswerAgent', () => {
    let orchestratorService: OrchestratorService;

    beforeEach(() => {
        orchestratorService = new OrchestratorService();
    });

    /** @aiContributed-2026-02-03 */
    it('should return a warning message for an empty question', async () => {
        const result = await orchestratorService.routeToAnswerAgent('');
        expect(logWarn).toHaveBeenCalledWith('[Answer] Empty question provided');
        expect(result).toBe('Please ask a question.');
    });

    /** @aiContributed-2026-02-03 */
    it('should return a warning message for a question with only whitespace', async () => {
        const result = await orchestratorService.routeToAnswerAgent('   ');
        expect(logWarn).toHaveBeenCalledWith('[Answer] Empty question provided');
        expect(result).toBe('Please ask a question.');
    });

    /** @aiContributed-2026-02-03 */
    it('should return a fallback message if completeLLM throws an error', async () => {
        (completeLLM as jest.Mock).mockRejectedValue(new Error('LLM error'));
        const result = await orchestratorService.routeToAnswerAgent('What is AI?');
        expect(logError).toHaveBeenCalledWith('[Answer] Answer agent failed: LLM error');
        expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
    });

    /** @aiContributed-2026-02-03 */
    it('should return a fallback message if completeLLM returns an empty response', async () => {
        (completeLLM as jest.Mock).mockResolvedValue({ content: '' });
        const result = await orchestratorService.routeToAnswerAgent('What is AI?');
        expect(logWarn).toHaveBeenCalledWith('[Answer] Answer agent returned an empty response.');
        expect(result).toBe('Could not generate an answer.');
    });

    /** @aiContributed-2026-02-03 */
    it('should log and return the full answer for a valid question', async () => {
        const mockAnswer = 'Artificial Intelligence is the simulation of human intelligence in machines.';
        (completeLLM as jest.Mock).mockResolvedValue({ content: mockAnswer });
        const result = await orchestratorService.routeToAnswerAgent('What is AI?');
        expect(logInfo).toHaveBeenCalledWith('[INFO] Answer: Artificial Intelligence is the simulation of human intelligence in machines.');
        expect(result).toBe(mockAnswer);
    });

    /** @aiContributed-2026-02-03 */
    it('should truncate and log the answer if it exceeds 500 characters', async () => {
        const longAnswer = 'A'.repeat(600);
        (completeLLM as jest.Mock).mockResolvedValue({ content: longAnswer });
        const result = await orchestratorService.routeToAnswerAgent('What is AI?');
        expect(logInfo).toHaveBeenCalledWith(`[INFO] Answer: ${'A'.repeat(500)}...`);
        expect(result).toBe(longAnswer);
    });

    /** @aiContributed-2026-02-03 */
    it('should create a ticket if the answer contains action keywords', async () => {
        const mockAnswer = 'Please create a ticket to fix this issue.';
        (completeLLM as jest.Mock).mockResolvedValue({ content: mockAnswer });
        const result = await orchestratorService.routeToAnswerAgent('What is AI?');
        expect(createTicket).toHaveBeenCalledWith({
            title: 'ANSWER NEEDS ACTION: What is AI?',
            status: 'blocked',
            description: mockAnswer,
        });
        expect(logInfo).toHaveBeenCalledWith('[Answer] Created ticket for action: ANSWER NEEDS ACTION: What is AI?');
        expect(result).toBe(mockAnswer);
    });

    /** @aiContributed-2026-02-03 */
    it('should not create a ticket if the answer does not contain action keywords', async () => {
        const mockAnswer = 'Artificial Intelligence is the simulation of human intelligence in machines.';
        (completeLLM as jest.Mock).mockResolvedValue({ content: mockAnswer });
        const result = await orchestratorService.routeToAnswerAgent('What is AI?');
        expect(createTicket).not.toHaveBeenCalled();
        expect(result).toBe(mockAnswer);
    });

    /** @aiContributed-2026-02-03 */
    it('should create a ticket with truncated question if the question exceeds 50 characters', async () => {
        const longQuestion = 'A'.repeat(100);
        const mockAnswer = 'Please create a ticket to fix this issue.';
        (completeLLM as jest.Mock).mockResolvedValue({ content: mockAnswer });
        const result = await orchestratorService.routeToAnswerAgent(longQuestion);
        expect(createTicket).toHaveBeenCalledWith({
            title: `ANSWER NEEDS ACTION: ${'A'.repeat(50)}...`,
            status: 'blocked',
            description: mockAnswer,
        });
        expect(logInfo).toHaveBeenCalledWith(`[Answer] Created ticket for action: ANSWER NEEDS ACTION: ${'A'.repeat(50)}...`);
        expect(result).toBe(mockAnswer);
    });
});