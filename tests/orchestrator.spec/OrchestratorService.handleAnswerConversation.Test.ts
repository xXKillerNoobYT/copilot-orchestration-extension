// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { completeLLM } from '../../src/services/llmService';
import { Logger } from '../../utils/logger';

jest.mock('../../src/services/llmService', () => ({
  ...jest.requireActual('../../src/services/llmService'),
  completeLLM: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  ...jest.requireActual('../../utils/logger'),
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService.handleAnswerConversation', () => {
  let orchestratorService: OrchestratorService;

  beforeEach(() => {
    orchestratorService = new OrchestratorService();
    orchestratorService.buildMessagesFromThread = jest.fn();
    orchestratorService.appendThreadMessage = jest.fn();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle the happy path correctly', async () => {
    const ticket = { thread: [{ content: 'message' }] };
    const userMessage = 'test message';
    const mockMessages = [{ role: 'user', content: 'message' }];
    const mockResponse = { content: 'response content' };

    (orchestratorService.buildMessagesFromThread as jest.Mock).mockReturnValue(mockMessages);
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    await orchestratorService.handleAnswerConversation(ticket, userMessage);

    expect(orchestratorService.buildMessagesFromThread).toHaveBeenCalledWith(ticket.thread);
    expect(completeLLM).toHaveBeenCalledWith('', { messages: mockMessages });
    expect(orchestratorService.appendThreadMessage).toHaveBeenCalledWith(ticket, {
      role: 'assistant',
      content: mockResponse.content,
    });
  });

  /** @aiContributed-2026-02-03 */
  it('should handle null thread gracefully', async () => {
    const ticket = { thread: null };
    const userMessage = 'test message';
    const mockMessages: { role: string; content: string }[] = [];
    const mockResponse = { content: 'response content' };

    (orchestratorService.buildMessagesFromThread as jest.Mock).mockReturnValue(mockMessages);
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    await orchestratorService.handleAnswerConversation(ticket, userMessage);

    expect(orchestratorService.buildMessagesFromThread).toHaveBeenCalledWith([]);
    expect(completeLLM).toHaveBeenCalledWith('', { messages: mockMessages });
    expect(orchestratorService.appendThreadMessage).toHaveBeenCalledWith(ticket, {
      role: 'assistant',
      content: mockResponse.content,
    });
  });

  /** @aiContributed-2026-02-03 */
  it('should log an error if completeLLM throws', async () => {
    const ticket = { thread: [{ content: 'message' }] };
    const userMessage = 'test message';
    const mockMessages = [{ role: 'user', content: 'message' }];

    (orchestratorService.buildMessagesFromThread as jest.Mock).mockReturnValue(mockMessages);
    (completeLLM as jest.Mock).mockRejectedValue(new Error('LLM error'));

    await expect(orchestratorService.handleAnswerConversation(ticket, userMessage)).rejects.toThrow('LLM error');

    expect(orchestratorService.buildMessagesFromThread).toHaveBeenCalledWith(ticket.thread);
    expect(completeLLM).toHaveBeenCalledWith('', { messages: mockMessages });
    expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
    expect(orchestratorService.appendThreadMessage).not.toHaveBeenCalled();
  });
});