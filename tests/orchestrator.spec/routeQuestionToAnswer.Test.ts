// ./orchestrator.Test.ts
import { routeQuestionToAnswer } from '../../src/services/orchestrator';
import { completeLLM } from '../../src/services/llmService';
import { logInfo, logError } from '../../src/logger';

jest.mock('../../src/services/llmService', () => ({
    ...jest.requireActual('../../src/services/llmService'),
    completeLLM: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('routeQuestionToAnswer', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should return the response content on success', async () => {
    const mockResponse = { content: 'This is the answer.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await routeQuestionToAnswer('What is TypeScript?');

    expect(completeLLM).toHaveBeenCalledWith('What is TypeScript?', {
      systemPrompt: expect.any(String),
    });
    expect(logInfo).toHaveBeenCalledWith('Answer agent response received');
    expect(result).toBe('This is the answer.');
  });

  /** @aiContributed-2026-02-03 */
    it('should log an error and return a fallback message on failure', async () => {
    (completeLLM as jest.Mock).mockRejectedValue(new Error('Network error'));

    const result = await routeQuestionToAnswer('What is TypeScript?');

    expect(completeLLM).toHaveBeenCalledWith('What is TypeScript?', {
      systemPrompt: expect.any(String),
    });
    expect(logError).toHaveBeenCalledWith('Answer agent failed: Network error');
    expect(result).toBe(
      'LLM service is currently unavailable. A ticket has been created for manual review.'
    );
  });

  /** @aiContributed-2026-02-03 */
    it('should handle non-Error exceptions gracefully', async () => {
    (completeLLM as jest.Mock).mockRejectedValue('Unknown error');

    const result = await routeQuestionToAnswer('What is TypeScript?');

    expect(completeLLM).toHaveBeenCalledWith('What is TypeScript?', {
      systemPrompt: expect.any(String),
    });
    expect(logError).toHaveBeenCalledWith('Answer agent failed: Unknown error');
    expect(result).toBe(
      'LLM service is currently unavailable. A ticket has been created for manual review.'
    );
  });
});