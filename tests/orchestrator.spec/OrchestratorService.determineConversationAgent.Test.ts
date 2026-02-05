// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-04 */
describe('OrchestratorService.determineConversationAgent', () => {
  let orchestratorService: any;

  beforeEach(() => {
    orchestratorService = new OrchestratorService();
    jest.spyOn(orchestratorService, 'classifyConversationIntent').mockResolvedValue('verification');
  });

  /** @aiContributed-2026-02-04 */
    it('should return "planning" when ticket type is "ai_to_human"', async () => {
    const ticket = { type: 'ai_to_human' };
    const userMessage = 'Test message';

    const result = await orchestratorService.determineConversationAgent(ticket, userMessage);

    expect(result).toBe('planning');
  });

  /** @aiContributed-2026-02-04 */
    it('should call classifyConversationIntent and return its result when ticket type is "human_to_ai"', async () => {
    const ticket = { type: 'human_to_ai' };
    const userMessage = 'Test message';

    const result = await orchestratorService.determineConversationAgent(ticket, userMessage);

    expect(orchestratorService.classifyConversationIntent).toHaveBeenCalledWith(userMessage);
    expect(result).toBe('verification');
  });

  /** @aiContributed-2026-02-04 */
    it('should return "answer" when ticket type is "answer_agent"', async () => {
    const ticket = { type: 'answer_agent' };
    const userMessage = 'Test message';

    const result = await orchestratorService.determineConversationAgent(ticket, userMessage);

    expect(result).toBe('answer');
  });

  /** @aiContributed-2026-02-04 */
    it('should call classifyConversationIntent and return its result for unknown ticket types', async () => {
    const ticket = { type: 'unknown_type' };
    const userMessage = 'Test message';

    const result = await orchestratorService.determineConversationAgent(ticket, userMessage);

    expect(orchestratorService.classifyConversationIntent).toHaveBeenCalledWith(userMessage);
    expect(result).toBe('verification');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle errors thrown by classifyConversationIntent', async () => {
    const ticket = { type: 'human_to_ai' };
    const userMessage = 'Test message';
    jest.spyOn(orchestratorService, 'classifyConversationIntent').mockRejectedValue(new Error('Intent classification failed'));

    await expect(orchestratorService.determineConversationAgent(ticket, userMessage)).rejects.toThrow('Intent classification failed');
    expect(Logger.error).toHaveBeenCalled();
  });
});