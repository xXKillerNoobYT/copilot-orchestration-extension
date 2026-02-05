// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { completeLLM } from '../../src/services/llmService';
import { logInfo } from '../../src/logger';

jest.mock('../../src/services/llmService', () => ({
  ...jest.requireActual('../../src/services/llmService'),
  completeLLM: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('AnswerAgent', () => {
  let answerAgent: AnswerAgent;

  beforeEach(() => {
    answerAgent = new AnswerAgent();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  describe('ask', () => {
    /** @aiContributed-2026-02-04 */
    it('should return the response from completeLLM on the happy path', async () => {
      const mockResponse = { content: 'Mocked response' };
      (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

      const question = 'What is the capital of France?';
      const chatId = 'test-chat-id';

      const result = await answerAgent.ask(question, chatId);

      expect(result).toBe(mockResponse.content);
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining(`[Answer Agent] Starting question in chat ${chatId}`)
      );
      expect(completeLLM).toHaveBeenCalledWith('', expect.any(Object));
    });

    /** @aiContributed-2026-02-04 */
    it('should trim history if it exceeds the maximum exchanges', async () => {
      const mockResponse = { content: 'Mocked response' };
      (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

      const question = 'What is the capital of France?';
      const chatId = 'test-chat-id';

      const longHistory: { role: string; content: string }[] = Array(50)
        .fill(null)
        .flatMap((_, i) => [
          { role: 'user', content: `Question ${i}` },
          { role: 'assistant', content: `Answer ${i}` },
        ]);
      (answerAgent as unknown as { conversationHistory: Map<string, { messages: { role: string; content: string }[]; createdAt: string }> })
        .conversationHistory.set(chatId, {
          messages: longHistory,
          createdAt: '2023-01-01T00:00:00.000Z',
        });

      const result = await answerAgent.ask(question, chatId);

      expect(result).toBe(mockResponse.content);
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining(`[Answer Agent] Chat ${chatId} history trimmed to last`)
      );
    });

    /** @aiContributed-2026-02-04 */
    it('should update conversation history with new messages', async () => {
      const mockResponse = { content: 'Mocked response' };
      (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

      const question = 'What is the capital of France?';
      const chatId = 'test-chat-id';

      const result = await answerAgent.ask(question, chatId);

      const updatedHistory: { role: string; content: string }[] | undefined = (
        answerAgent as unknown as { conversationHistory: Map<string, { messages: { role: string; content: string }[] }> }
      ).conversationHistory.get(chatId)?.messages;

      expect(result).toBe(mockResponse.content);
      expect(updatedHistory).toEqual([
        { role: 'system', content: expect.any(String) },
        { role: 'user', content: question },
        { role: 'assistant', content: mockResponse.content },
      ]);
    });

    /** @aiContributed-2026-02-04 */
    it('should persist conversation history after updating', async () => {
      const mockResponse = { content: 'Mocked response' };
      (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

      const persistSpy = jest
        .spyOn(answerAgent as unknown as { persistConversationHistory: (chatId: string) => Promise<void> }, 'persistConversationHistory')
        .mockResolvedValue();

      const question = 'What is the capital of France?';
      const chatId = 'test-chat-id';

      await answerAgent.ask(question, chatId);

      expect(persistSpy).toHaveBeenCalledWith(chatId);
    });
  });
});