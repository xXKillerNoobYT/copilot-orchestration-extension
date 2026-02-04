// ./answerAgent.Test.ts
import { answerQuestion, initializeAnswerAgent, resetAnswerAgentForTests, getAnswerAgent } from '../../src/agents/answerAgent';
import { completeLLM, streamLLM } from '../../src/services/llmService';
import { logInfo, logError } from '../../src/logger';

jest.mock('../../src/services/llmService', () => ({
    ...jest.requireActual('../../src/services/llmService'),
    completeLLM: jest.fn(),
    streamLLM: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('answerQuestion', () => {
  beforeEach(() => {
    initializeAnswerAgent();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetAnswerAgentForTests();
  });

  /** @aiContributed-2026-02-03 */
  it('should return an answer for a valid question (happy path)', async () => {
    const mockResponse = { content: 'This is the answer.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const question = 'What is the capital of France?';
    const answer = await answerQuestion(question);

    expect(answer).toBe(mockResponse.content);
    expect(completeLLM).toHaveBeenCalledWith('', expect.objectContaining({ messages: expect.any(Array) }));
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Starting question'));
  });

  /** @aiContributed-2026-02-03 */
  it('should handle streaming mode correctly', async () => {
    const mockStreamResponse = { content: 'Streaming answer.' };
    const onStream = jest.fn();
    (streamLLM as jest.Mock).mockResolvedValue(mockStreamResponse);

    const question = 'What is the capital of Germany?';
    const answer = await answerQuestion(question, undefined, { onStream });

    expect(answer).toBe(mockStreamResponse.content);
    expect(streamLLM).toHaveBeenCalledWith('', onStream, expect.objectContaining({ messages: expect.any(Array) }));
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Starting question'));
  });

  /** @aiContributed-2026-02-03 */
  it('should generate a new chat ID if none is provided', async () => {
    const mockResponse = { content: 'Generated chat ID answer.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const question = 'What is the capital of Italy?';
    const answer = await answerQuestion(question);

    expect(answer).toBe(mockResponse.content);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Starting question'));
  });

  /** @aiContributed-2026-02-03 */
  it('should throw an error if LLM call fails', async () => {
    const errorMessage = 'LLM service error';
    (completeLLM as jest.Mock).mockRejectedValue(new Error(errorMessage));

    const question = 'What is the capital of Spain?';

    await expect(answerQuestion(question)).rejects.toThrow(errorMessage);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Error in chat'));
  });

  /** @aiContributed-2026-02-03 */
  it('should handle undefined question input gracefully', async () => {
    const mockResponse = { content: 'Default answer.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const answer = await answerQuestion(undefined as unknown as string);

    expect(answer).toBe(mockResponse.content);
    expect(completeLLM).toHaveBeenCalledWith('', expect.objectContaining({ messages: expect.any(Array) }));
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Starting question'));
  });

  /** @aiContributed-2026-02-03 */
  it('should trim conversation history if it exceeds the maximum exchanges', async () => {
    const mockResponse = { content: 'Trimmed history answer.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const question = 'What is the capital of Japan?';
    const chatId = 'test-chat-id';
    const agent = getAnswerAgent();
    const longHistory = Array(15).fill({ role: 'user', content: 'Previous question' });

    agent.deserializeHistory({
      [chatId]: JSON.stringify({
        chatId,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        messages: longHistory,
      }),
    });

    const answer = await answerQuestion(question, chatId);

    expect(answer).toBe(mockResponse.content);
    expect(completeLLM).toHaveBeenCalledWith('', expect.objectContaining({ messages: expect.any(Array) }));
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('history trimmed'));
  });
});