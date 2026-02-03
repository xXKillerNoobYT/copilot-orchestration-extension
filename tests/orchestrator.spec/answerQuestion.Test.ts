// ./orchestrator.Test.ts
import { answerQuestion, resetOrchestratorForTests, initializeOrchestrator } from '../../src/services/orchestrator';
import { Logger } from '../../utils/logger';
import AnswerAgent from '../../src/agents/answerAgent';
import { llmStatusBar } from '../../src/ui/llmStatusBar';

jest.mock('../../src/agents/answerAgent');
jest.mock('../../utils/logger');
jest.mock('../../src/ui/llmStatusBar');

/** @aiContributed-2026-02-03 */
describe('answerQuestion', () => {
  let mockAnswerAgent: jest.Mocked<AnswerAgent>;

  beforeEach(() => {
    resetOrchestratorForTests();
    mockAnswerAgent = new AnswerAgent() as jest.Mocked<AnswerAgent>;
    (AnswerAgent as jest.Mock).mockImplementation(() => mockAnswerAgent);
  });

  /** @aiContributed-2026-02-03 */
  it('should return the answer from AnswerAgent on success', async () => {
    const mockContext = { extensionPath: '/mock/path' } as { extensionPath: string };
    await initializeOrchestrator(mockContext);

    const question = 'What is TypeScript?';
    const expectedAnswer = 'TypeScript is a strongly typed superset of JavaScript.';
    mockAnswerAgent.ask.mockResolvedValue(expectedAnswer);

    const result = await answerQuestion(question);

    expect(result).toBe(expectedAnswer);
    expect(mockAnswerAgent.ask).toHaveBeenCalledWith(question, undefined);
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle errors from AnswerAgent gracefully', async () => {
    const mockContext = { extensionPath: '/mock/path' } as { extensionPath: string };
    await initializeOrchestrator(mockContext);

    const question = 'What is TypeScript?';
    const errorMessage = 'AnswerAgent failed';
    mockAnswerAgent.ask.mockRejectedValue(new Error(errorMessage));

    const result = await answerQuestion(question);

    expect(result).toBe('LLM service is currently unavailable. A ticket has been created for manual review.');
    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should log and return a message for empty questions', async () => {
    const mockContext = { extensionPath: '/mock/path' } as { extensionPath: string };
    await initializeOrchestrator(mockContext);

    const question = '';

    const result = await answerQuestion(question);

    expect(result).toBe('Please ask a question.');
    expect(Logger.warn).toHaveBeenCalledWith('[Answer] Empty question provided');
    expect(llmStatusBar.start).not.toHaveBeenCalled();
    expect(llmStatusBar.end).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle multi-turn conversations with chatId', async () => {
    const mockContext = { extensionPath: '/mock/path' } as { extensionPath: string };
    await initializeOrchestrator(mockContext);

    const question = 'What is TypeScript?';
    const chatId = 'chat-123';
    const expectedAnswer = 'TypeScript is a strongly typed superset of JavaScript.';
    mockAnswerAgent.ask.mockResolvedValue(expectedAnswer);

    const result = await answerQuestion(question, chatId, true);

    expect(result).toBe(expectedAnswer);
    expect(mockAnswerAgent.ask).toHaveBeenCalledWith(question, chatId);
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Continuing conversation'));
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
  });
});