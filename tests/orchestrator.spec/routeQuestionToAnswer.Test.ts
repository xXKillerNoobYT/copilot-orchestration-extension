// ./orchestrator.Test.ts
import { routeQuestionToAnswer } from '../../src/services/orchestrator';
import { completeLLM } from '../../src/services/llmService';
import { createTicket } from '../../src/services/ticketDb';
import { logInfo, logError } from '../../src/logger';

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
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('routeQuestionToAnswer', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should return the LLM response content on success', async () => {
    const mockResponse = { content: 'This is the answer.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await routeQuestionToAnswer('What is TypeScript?');

    expect(completeLLM).toHaveBeenCalledWith('What is TypeScript?', {
      systemPrompt: expect.any(String),
    });
    expect(logInfo).toHaveBeenCalledWith('Answer agent response received');
    expect(result).toBe('This is the answer.');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle LLM errors and return a fallback message', async () => {
    const errorMessage = 'Network error';
    (completeLLM as jest.Mock).mockRejectedValue(new Error(errorMessage));

    const result = await routeQuestionToAnswer('What is TypeScript?');

    expect(completeLLM).toHaveBeenCalledWith('What is TypeScript?', {
      systemPrompt: expect.any(String),
    });
    expect(logError).toHaveBeenCalledWith(`Answer agent failed: ${errorMessage}`);
    expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
  });

  /** @aiContributed-2026-02-04 */
    it('should create a ticket if LLM fails', async () => {
    const errorMessage = 'Timeout error';
    (completeLLM as jest.Mock).mockRejectedValue(new Error(errorMessage));

    await routeQuestionToAnswer('What is TypeScript?');

    expect(createTicket).toHaveBeenCalledWith({
      title: expect.any(String),
      status: 'blocked',
      description: expect.any(String),
    });
  });
});