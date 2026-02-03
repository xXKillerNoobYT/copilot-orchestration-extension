// ./llmService.Test.ts
import { streamLLM } from '../../src/services/llmService';
import { llmStatusBar } from '../../src/ui/llmStatusBar';
import { logWarn, logError } from '../../src/logger';
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
}));

jest.mock('../../src/services/ticketDb', () => ({
  ...jest.requireActual('../../src/services/ticketDb'),
  createTicket: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('streamLLM', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /** @aiContributed-2026-02-03 */
  it('should handle a successful streaming response', async () => {
    const prompt = 'Test prompt';
    const onChunk = jest.fn();
    const mockResponse = {
      body: {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"chunk1"}}]}\n') })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"chunk2"}}]}\n') })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: [DONE]\n') })
            .mockResolvedValue({ done: true }),
        }),
      },
      ok: true,
    };

    mockFetch.mockResolvedValue(mockResponse);

    const result = await streamLLM(prompt, onChunk);

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenCalledWith('chunk1');
    expect(onChunk).toHaveBeenCalledWith('chunk2');
    expect(result.content).toBe('chunk1chunk2');
  });

  /** @aiContributed-2026-02-03 */
  it('should handle a timeout error', async () => {
    const prompt = 'Test prompt';
    const onChunk = jest.fn();

    mockFetch.mockImplementation(() =>
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 1000);
      })
    );

    await expect(streamLLM(prompt, onChunk)).rejects.toThrow('LLM streaming startup timeout after');

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
    expect(createTicket).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle an HTTP error response', async () => {
    const prompt = 'Test prompt';
    const onChunk = jest.fn();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(streamLLM(prompt, onChunk)).rejects.toThrow('HTTP error! status: 500');

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
    expect(createTicket).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle a network error', async () => {
    const prompt = 'Test prompt';
    const onChunk = jest.fn();

    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(streamLLM(prompt, onChunk)).rejects.toThrow('Network error');

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
    expect(createTicket).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle invalid SSE data', async () => {
    const prompt = 'Test prompt';
    const onChunk = jest.fn();
    const mockResponse = {
      body: {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: invalid-json\n') })
            .mockResolvedValueOnce({ done: true }),
        }),
      },
      ok: true,
    };

    mockFetch.mockResolvedValue(mockResponse);

    const result = await streamLLM(prompt, onChunk);

    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to parse SSE line'));
    expect(result.content).toBe('');
  });
});