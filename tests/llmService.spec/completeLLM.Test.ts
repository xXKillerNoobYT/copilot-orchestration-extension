// ./llmService.Test.ts
import { completeLLM } from '../../src/services/llmService';
import { llmStatusBar } from '../../src/ui/llmStatusBar';
import { logWarn, logError, logInfo } from '../../src/logger';
import { createTicket } from '../../src/services/ticketDb';

jest.mock('../../src/ui/llmStatusBar', () => ({
  ...jest.requireActual('../../src/ui/llmStatusBar'),
  llmStatusBar: {
    start: jest.fn(),
    end: jest.fn(),
  },
}));

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logWarn: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
  ...jest.requireActual('../../src/services/ticketDb'),
  createTicket: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('completeLLM', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /** @aiContributed-2026-02-04 */
    it('should call the LLM endpoint and return a response on success', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Test response' } }],
        usage: { total_tokens: 100 },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const prompt = 'Test prompt';
    const options = { systemPrompt: 'System context', temperature: 0.5 };
    const result = await completeLLM(prompt, options);

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      })
    );
    expect(result).toEqual({
      content: 'Test response',
      usage: { total_tokens: 100 },
    });
    expect(llmStatusBar.end).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle a timeout error', async () => {
    const prompt = 'Test prompt';
    const options = { systemPrompt: 'System context' };

    mockFetch.mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        })
    );

    await expect(completeLLM(prompt, options)).rejects.toThrow(
      'LLM request timed out after 900 seconds'
    );

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith('LLM request timeout after 900s');
    expect(llmStatusBar.end).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle an HTTP error response', async () => {
    const mockResponse = { ok: false, status: 500 };
    mockFetch.mockResolvedValue(mockResponse);

    const prompt = 'Test prompt';
    const options = {};

    await expect(completeLLM(prompt, options)).rejects.toThrow(
      'HTTP error! status: 500'
    );

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith('LLM call failed: HTTP error! status: 500');
    expect(llmStatusBar.end).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should create a ticket on error', async () => {
    const error = new Error('Test error');
    mockFetch.mockRejectedValue(error);

    const prompt = 'Test prompt';
    const options = {};

    await expect(completeLLM(prompt, options)).rejects.toThrow('Test error');

    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'LLM FAILURE: Test prompt',
        status: 'blocked',
        description: expect.stringContaining('Test error'),
      })
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should handle invalid configuration gracefully', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Test response' } }],
        usage: { total_tokens: 100 },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const prompt = 'Test prompt';
    const options = { systemPrompt: 'System context', temperature: -1 };

    const result = await completeLLM(prompt, options);

    expect(result).toEqual({
      content: 'Test response',
      usage: { total_tokens: 100 },
    });
  });

  /** @aiContributed-2026-02-04 */
    it('should trim messages exceeding token limit', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Trimmed response' } }],
        usage: { total_tokens: 2048 },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const prompt = 'A'.repeat(10000); // Large prompt to exceed token limit
    const options = { systemPrompt: 'System context' };

    const result = await completeLLM(prompt, options);

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
    expect(result).toEqual({
      content: 'Trimmed response',
      usage: { total_tokens: 2048 },
    });
    expect(llmStatusBar.end).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle system message exceeding token limit', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'System message response' } }],
        usage: { total_tokens: 3000 },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const prompt = '';
    const options = {
      systemPrompt: 'A'.repeat(5000), // Large system prompt
    };

    const result = await completeLLM(prompt, options);

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
    expect(result).toEqual({
      content: 'System message response',
      usage: { total_tokens: 3000 },
    });
    expect(llmStatusBar.end).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should log info for successful requests', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Info log response' } }],
        usage: { total_tokens: 150 },
      }),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const prompt = 'Log info test';
    const options = {};

    const result = await completeLLM(prompt, options);

    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('LLM request:'));
    expect(result).toEqual({
      content: 'Info log response',
      usage: { total_tokens: 150 },
    });
  });

  /** @aiContributed-2026-02-04 */
    it('should handle fetch abort due to timeout', async () => {
    const prompt = 'Test prompt';
    const options = {};

    mockFetch.mockImplementation(() => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });

    await expect(completeLLM(prompt, options)).rejects.toThrow(
      'LLM request timed out after 900 seconds'
    );

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith('LLM request timeout after 900s');
    expect(llmStatusBar.end).toHaveBeenCalled();
  });
});