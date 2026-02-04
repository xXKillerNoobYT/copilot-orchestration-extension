// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { completeLLM } from '../../src/services/llmService';
import { logError } from '../../src/logger';

jest.mock('../../src/services/llmService', () => ({
    ...jest.requireActual('../../src/services/llmService'),
    completeLLM: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService - classifyConversationIntent', () => {
  let orchestratorService: OrchestratorService;

  beforeEach(() => {
    orchestratorService = new OrchestratorService();
  });

  /** @aiContributed-2026-02-03 */
  it('should return "planning" when the response includes "planning"', async () => {
    (completeLLM as jest.Mock).mockResolvedValueOnce({
      content: 'This is a planning task.',
    });

    const result = await orchestratorService.classifyConversationIntent('Test message');
    expect(result).toBe('planning');
  });

  /** @aiContributed-2026-02-03 */
  it('should return "verification" when the response includes "verification"', async () => {
    (completeLLM as jest.Mock).mockResolvedValueOnce({
      content: 'This is a verification task.',
    });

    const result = await orchestratorService.classifyConversationIntent('Test message');
    expect(result).toBe('verification');
  });

  /** @aiContributed-2026-02-03 */
  it('should return "answer" when the response does not include "planning" or "verification"', async () => {
    (completeLLM as jest.Mock).mockResolvedValueOnce({
      content: 'This is an answer task.',
    });

    const result = await orchestratorService.classifyConversationIntent('Test message');
    expect(result).toBe('answer');
  });

  /** @aiContributed-2026-02-03 */
  it('should return "answer" and log an error when completeLLM throws an error', async () => {
    const errorMessage = 'LLM service failed';
    (completeLLM as jest.Mock).mockRejectedValueOnce(new Error(errorMessage));

    const result = await orchestratorService.classifyConversationIntent('Test message');
    expect(result).toBe('answer');
    expect(logError).toHaveBeenCalledWith(`Conversation classification failed: ${errorMessage}`);
  });

  /** @aiContributed-2026-02-03 */
  it('should handle undefined or null userMessage gracefully and return "answer"', async () => {
    (completeLLM as jest.Mock).mockResolvedValueOnce({
      content: '',
    });

    const resultUndefined = await orchestratorService.classifyConversationIntent(undefined as unknown as string);
    const resultNull = await orchestratorService.classifyConversationIntent(null as unknown as string);

    expect(resultUndefined).toBe('answer');
    expect(resultNull).toBe('answer');
  });
});