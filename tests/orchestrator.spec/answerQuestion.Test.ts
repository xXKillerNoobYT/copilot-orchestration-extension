// ./orchestrator.Test.ts
import { answerQuestion } from '../../src/services/orchestrator';
import { Logger } from '../../utils/logger';
import AnswerAgent from '../../src/agents/answerAgent';
import { llmStatusBar } from '../../src/ui/llmStatusBar';

jest.mock('../../src/agents/answerAgent');
jest.mock('../../utils/logger');
jest.mock('../../src/ui/llmStatusBar');

/** @aiContributed-2026-02-04 */
describe('answerQuestion', () => {
  let mockAsk: jest.Mock;

  beforeEach(() => {
    mockAsk = jest.fn();
    (AnswerAgent as jest.Mock).mockImplementation(() => ({
      ask: mockAsk,
    }));
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should return the answer from AnswerAgent on success', async () => {
    const question = 'What is TypeScript?';
    const chatId = 'chat-123';
    const isContinue = false;
    const expectedAnswer = 'TypeScript is a typed superset of JavaScript.';
    mockAsk.mockResolvedValue(expectedAnswer);

    const result = await answerQuestion(question, chatId, isContinue);

    expect(result).toBe(expectedAnswer);
    expect(mockAsk).toHaveBeenCalledWith(question, chatId);
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith(
      `[Answer] Starting conversation (chat-123): What is TypeScript?...`
    );
    expect(Logger.info).toHaveBeenCalledWith('[Answer] Response generated');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle errors and return fallback message', async () => {
    const question = 'Explain closures in JavaScript.';
    const chatId = 'chat-456';
    const isContinue = true;
    const errorMessage = 'LLM service unavailable';
    mockAsk.mockRejectedValue(new Error(errorMessage));

    const result = await answerQuestion(question, chatId, isContinue);

    expect(result).toBe(
      'LLM service is currently unavailable. A ticket has been created for manual review.'
    );
    expect(mockAsk).toHaveBeenCalledWith(question, chatId);
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith(
      `[Answer] Continuing conversation (chat-456): Explain closures in JavaScript....`
    );
    expect(Logger.error).toHaveBeenCalledWith(
      `[Answer] Failed to answer question: ${errorMessage}`
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should initialize AnswerAgent lazily', async () => {
    const question = 'What is the difference between var, let, and const?';
    const expectedAnswer = 'var is function-scoped, let and const are block-scoped.';
    mockAsk.mockResolvedValue(expectedAnswer);

    const result = await answerQuestion(question);

    expect(result).toBe(expectedAnswer);
    expect(mockAsk).toHaveBeenCalledWith(question, undefined);
    expect(AnswerAgent).toHaveBeenCalledTimes(1);
  });
});