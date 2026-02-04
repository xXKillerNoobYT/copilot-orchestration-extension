// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
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
describe('OrchestratorService - routeQuestionToAnswer', () => {
  let orchestratorService: OrchestratorService;

  beforeEach(() => {
    orchestratorService = new OrchestratorService();
  });

  /** @aiContributed-2026-02-03 */
    it('should return the response content on successful LLM call', async () => {
    const mockResponse = { content: 'Answer from LLM' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await orchestratorService.routeQuestionToAnswer('What is AI?');

    expect(logInfo).toHaveBeenCalledWith('Routing question to Answer agent: What is AI?');
    expect(completeLLM).toHaveBeenCalledWith('What is AI?', { systemPrompt: ANSWER_SYSTEM_PROMPT });
    expect(logInfo).toHaveBeenCalledWith('Answer agent response received');
    expect(result).toBe('Answer from LLM');
  });

  /** @aiContributed-2026-02-03 */
    it('should return fallback message and log error on LLM failure', async () => {
    const mockError = new Error('LLM service error');
    (completeLLM as jest.Mock).mockRejectedValue(mockError);

    const result = await orchestratorService.routeQuestionToAnswer('What is AI?');

    expect(logInfo).toHaveBeenCalledWith('Routing question to Answer agent: What is AI?');
    expect(logError).toHaveBeenCalledWith('Answer agent failed: LLM service error');
    expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle non-Error exceptions gracefully', async () => {
    (completeLLM as jest.Mock).mockRejectedValue('Unknown error');

    const result = await orchestratorService.routeQuestionToAnswer('What is AI?');

    expect(logInfo).toHaveBeenCalledWith('Routing question to Answer agent: What is AI?');
    expect(logError).toHaveBeenCalledWith('Answer agent failed: Unknown error');
    expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle null or undefined question input', async () => {
    const mockResponse = { content: 'Answer from LLM' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await orchestratorService.routeQuestionToAnswer(null as unknown as string);

    expect(logInfo).toHaveBeenCalledWith('Routing question to Answer agent: null');
    expect(completeLLM).toHaveBeenCalledWith(null, { systemPrompt: ANSWER_SYSTEM_PROMPT });
    expect(logInfo).toHaveBeenCalledWith('Answer agent response received');
    expect(result).toBe('Answer from LLM');
  });

  /** @aiContributed-2026-02-03 */
    it('should log error and return fallback message if completeLLM throws a timeout error', async () => {
    const mockError = new Error('Timeout error');
    (completeLLM as jest.Mock).mockRejectedValue(mockError);

    const result = await orchestratorService.routeQuestionToAnswer('What is AI?');

    expect(logInfo).toHaveBeenCalledWith('Routing question to Answer agent: What is AI?');
    expect(logError).toHaveBeenCalledWith('Answer agent failed: Timeout error');
    expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
  });
});