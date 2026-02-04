// ./orchestrator.Test.ts
import { routeQuestionToAnswer } from '../../src/services/orchestrator';
import { completeLLM } from '../../src/services/llmService';
import { logInfo, logError, logWarn } from '../../src/logger';
import { createTicket } from '../../src/services/ticketDb';

jest.mock('../../src/services/llmService', () => ({
    ...jest.requireActual('../../src/services/llmService'),
    completeLLM: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    createTicket: jest.fn(),
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

  /** @aiContributed-2026-02-03 */
    it('should create a ticket and log a warning if the response contains action keywords', async () => {
    const mockResponse = { content: 'Please create a ticket for this issue.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await routeQuestionToAnswer('What is TypeScript?');

    expect(completeLLM).toHaveBeenCalledWith('What is TypeScript?', {
      systemPrompt: expect.any(String),
    });
    expect(createTicket).toHaveBeenCalledWith({
      title: expect.stringContaining('ANSWER NEEDS ACTION'),
      status: 'blocked',
      description: 'Please create a ticket for this issue.',
    });
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Created ticket for action'));
    expect(result).toBe('Please create a ticket for this issue.');
  });

  /** @aiContributed-2026-02-03 */
    it('should log a warning and return a fallback message if the response is empty', async () => {
    const mockResponse = { content: '' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await routeQuestionToAnswer('What is TypeScript?');

    expect(completeLLM).toHaveBeenCalledWith('What is TypeScript?', {
      systemPrompt: expect.any(String),
    });
    expect(logWarn).toHaveBeenCalledWith('[Answer] Answer agent returned an empty response.');
    expect(result).toBe('Could not generate an answer.');
  });

  /** @aiContributed-2026-02-03 */
    it('should not create a ticket if the response does not contain action keywords', async () => {
    const mockResponse = { content: 'This is a general answer.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await routeQuestionToAnswer('What is TypeScript?');

    expect(completeLLM).toHaveBeenCalledWith('What is TypeScript?', {
      systemPrompt: expect.any(String),
    });
    expect(createTicket).not.toHaveBeenCalled();
    expect(result).toBe('This is a general answer.');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle a response with mixed-case action keywords', async () => {
    const mockResponse = { content: 'Please Create a Ticket for this issue.' };
    (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await routeQuestionToAnswer('What is TypeScript?');

    expect(completeLLM).toHaveBeenCalledWith('What is TypeScript?', {
      systemPrompt: expect.any(String),
    });
    expect(createTicket).toHaveBeenCalledWith({
      title: expect.stringContaining('ANSWER NEEDS ACTION'),
      status: 'blocked',
      description: 'Please Create a Ticket for this issue.',
    });
    expect(result).toBe('Please Create a Ticket for this issue.');
  });
});