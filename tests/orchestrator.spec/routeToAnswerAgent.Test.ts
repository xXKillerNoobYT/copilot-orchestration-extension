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

/** @aiContributed-2026-02-04 */
describe('routeToAnswerAgent', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should return a valid response from the LLM', async () => {
    const question = 'What is TypeScript?';
    const mockResponse = { content: 'TypeScript is a strongly typed programming language.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await routeToAnswerAgent(question);

    expect(completeLLM).toHaveBeenCalledWith(question, { systemPrompt: expect.any(String) });
    expect(result).toBe(mockResponse.content);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[INFO] Answer:'));
  });

  /** @aiContributed-2026-02-04 */
    it('should handle empty question input', async () => {
    const result = await routeToAnswerAgent('');

    expect(result).toBe('Please ask a question.');
    expect(logWarn).toHaveBeenCalledWith('[Answer] Empty question provided');
    expect(completeLLM).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle LLM returning an empty response', async () => {
    const question = 'Explain closures in JavaScript.';
    (completeLLM as jest.Mock).mockResolvedValue({ content: '' });

    const result = await routeToAnswerAgent(question);

    expect(result).toBe('Could not generate an answer.');
    expect(logWarn).toHaveBeenCalledWith('[Answer] Answer agent returned an empty response.');
  });

  /** @aiContributed-2026-02-04 */
    it('should create a ticket if the response contains action keywords', async () => {
    const question = 'How do I fix this bug?';
    const mockResponse = { content: 'You should create a ticket to fix this issue.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await routeToAnswerAgent(question);

    expect(createTicket).toHaveBeenCalledWith({
      title: expect.stringContaining('ANSWER NEEDS ACTION'),
      status: 'blocked',
      description: mockResponse.content,
    });
    expect(result).toBe(mockResponse.content);
  });

  /** @aiContributed-2026-02-04 */
    it('should handle LLM errors gracefully', async () => {
    const question = 'What is the purpose of unit testing?';
    (completeLLM as jest.Mock).mockRejectedValue(new Error('LLM service unavailable'));

    const result = await routeToAnswerAgent(question);

    expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('[Answer] Answer agent failed:'));
  });
});