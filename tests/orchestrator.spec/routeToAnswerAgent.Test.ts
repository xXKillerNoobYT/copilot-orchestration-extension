// ./orchestrator.Test.ts
import { routeToAnswerAgent } from '../../src/services/orchestrator';
import { completeLLM } from '../../src/services/llmService';
import { createTicket } from '../../src/services/ticketDb';
import { logInfo, logWarn, logError } from '../../src/logger';

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
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('routeToAnswerAgent', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should return a response from the Answer agent on success', async () => {
        const question = 'What is TypeScript?';
        const mockResponse = { content: 'TypeScript is a typed superset of JavaScript.' };
        (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToAnswerAgent(question);

        expect(completeLLM).toHaveBeenCalledWith(question, { systemPrompt: expect.any(String) });
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Routing question to Answer agent'));
        expect(result).toBe(mockResponse.content);
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning and return a fallback message for an empty question', async () => {
        const question = '';

        const result = await routeToAnswerAgent(question);

        expect(logWarn).toHaveBeenCalledWith('[Answer] Empty question provided');
        expect(result).toBe('Please ask a question.');
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning and return a fallback message if the Answer agent returns an empty response', async () => {
        const question = 'Explain closures in JavaScript.';
        const mockResponse = { content: '' };
        (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToAnswerAgent(question);

        expect(logWarn).toHaveBeenCalledWith('[Answer] Answer agent returned an empty response.');
        expect(result).toBe('Could not generate an answer.');
    });

    /** @aiContributed-2026-02-03 */
    it('should create a ticket if the response contains action keywords', async () => {
        const question = 'How do I fix this bug?';
        const mockResponse = { content: 'You should create a ticket to track this issue.' };
        (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToAnswerAgent(question);

        expect(createTicket).toHaveBeenCalledWith({
            title: expect.stringContaining('ANSWER NEEDS ACTION'),
            status: 'blocked',
            description: mockResponse.content,
        });
        expect(result).toBe(mockResponse.content);
    });

    /** @aiContributed-2026-02-03 */
    it('should log an error and return a fallback message if the LLM service fails', async () => {
        const question = 'What is the purpose of unit tests?';
        const errorMessage = 'Network error';
        (completeLLM as jest.Mock).mockRejectedValue(new Error(errorMessage));

        const result = await routeToAnswerAgent(question);

        expect(logError).toHaveBeenCalledWith(expect.stringContaining('[Answer] Answer agent failed'));
        expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
    });

    /** @aiContributed-2026-02-03 */
    it('should truncate and log the response if it exceeds 500 characters', async () => {
        const question = 'Explain the concept of microservices.';
        const longResponse = 'A'.repeat(600);
        const mockResponse = { content: longResponse };
        (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToAnswerAgent(question);

        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining(longResponse.substring(0, 500)));
        expect(result).toBe(longResponse);
    });

    /** @aiContributed-2026-02-03 */
    it('should not create a ticket if the response does not contain action keywords', async () => {
        const question = 'What is a closure in JavaScript?';
        const mockResponse = { content: 'A closure is a function that retains access to its lexical scope.' };
        (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToAnswerAgent(question);

        expect(createTicket).not.toHaveBeenCalled();
        expect(result).toBe(mockResponse.content);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle responses with mixed case action keywords and create a ticket', async () => {
        const question = 'Can you implement this feature?';
        const mockResponse = { content: 'You should Implement a new feature for this.' };
        (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToAnswerAgent(question);

        expect(createTicket).toHaveBeenCalledWith({
            title: expect.stringContaining('ANSWER NEEDS ACTION'),
            status: 'blocked',
            description: mockResponse.content,
        });
        expect(result).toBe(mockResponse.content);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle responses without action keywords and not create a ticket', async () => {
        const question = 'What is the difference between var and let?';
        const mockResponse = { content: 'var is function-scoped, while let is block-scoped.' };
        (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToAnswerAgent(question);

        expect(createTicket).not.toHaveBeenCalled();
        expect(result).toBe(mockResponse.content);
    });
});