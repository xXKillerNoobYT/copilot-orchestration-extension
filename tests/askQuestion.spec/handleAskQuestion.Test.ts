// ./askQuestion.Test.ts
import { handleAskQuestion } from '../../src/mcpServer/tools/askQuestion';
import { routeToAnswerAgent } from '../../src/services/orchestrator';
import { createTicket } from '../../src/services/ticketDb';
import { logInfo, logWarn, logError } from '../../src/logger';

jest.mock('../../src/services/orchestrator', () => ({
    ...jest.requireActual('../../src/services/orchestrator'),
    routeToAnswerAgent: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    createTicket: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('handleAskQuestion', () => {
  const DEFAULT_TIMEOUT_MS = 45000;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should return a successful response with an answer from the Answer Agent', async () => {
    const mockAnswer = 'This is the answer';
    (routeToAnswerAgent as jest.Mock).mockResolvedValue(mockAnswer);

    const params = { question: 'What is the capital of France?' };
    const result = await handleAskQuestion(params);

    expect(result).toEqual({ success: true, answer: mockAnswer });
    expect(routeToAnswerAgent).toHaveBeenCalledWith(params.question);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[askQuestion] Sending question'));
  });

  /** @aiContributed-2026-02-04 */
    it('should handle timeout and create a ticket', async () => {
    (routeToAnswerAgent as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('Delayed answer'), DEFAULT_TIMEOUT_MS + 1000))
    );
    const mockTicket = { id: '12345' };
    (createTicket as jest.Mock).mockResolvedValue(mockTicket);

    const params = { question: 'What is the capital of France?' };
    const result = await handleAskQuestion(params);

    expect(result).toEqual({
      success: false,
      error: {
        code: 'ANSWER_TIMEOUT',
        message: `Answer Agent timed out after ${DEFAULT_TIMEOUT_MS / 1000}s. Ticket created.`,
      },
      ticketId: mockTicket.id,
    });
    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('ANSWER TIMEOUT'),
        status: 'blocked',
        type: 'human_to_ai',
      })
    );
    expect(logWarn).toHaveBeenCalledWith('[askQuestion] Answer Agent timeout, creating ticket');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle internal errors and return an error response', async () => {
    const mockError = new Error('Internal failure');
    (routeToAnswerAgent as jest.Mock).mockRejectedValue(mockError);

    const params = { question: 'What is the capital of France?' };
    const result = await handleAskQuestion(params);

    expect(result).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: `Failed to get answer: ${mockError.message}`,
      },
    });
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('[askQuestion] Error: Internal failure'));
  });

  /** @aiContributed-2026-02-04 */
    it('should validate and reject invalid parameters', async () => {
    const invalidParams = { question: '' };
    const result = await handleAskQuestion(invalidParams);

    expect(result).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get answer: Cannot read properties of undefined (reading \'trim\')',
      },
    });
    expect(logError).toHaveBeenCalled();
  });
});