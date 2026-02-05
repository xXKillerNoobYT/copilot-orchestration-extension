// ./answerAgent.Test.ts
import { restoreAnswerAgentHistory, resetAnswerAgentForTests, getAnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
  ...jest.requireActual('../../utils/logger'),
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-04 */
describe('restoreAnswerAgentHistory', () => {
  beforeEach(() => {
    resetAnswerAgentForTests();
  });

  /** @aiContributed-2026-02-04 */
    it('should restore conversation history from serialized data', () => {
    const serialized = {
      chat1: JSON.stringify({
        chatId: 'chat1',
        createdAt: '2023-01-01T00:00:00Z',
        lastActivityAt: '2023-01-02T00:00:00Z',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      }),
    };

    restoreAnswerAgentHistory(serialized);

    const agent = getAnswerAgent();
    const history = agent.getHistory('chat1');

    expect(history).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);
    expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Singleton initialized');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle invalid JSON in serialized data gracefully', () => {
    const serialized = {
      chat1: 'invalid-json',
    };

    restoreAnswerAgentHistory(serialized);

    expect(Logger.warn).toHaveBeenCalledWith(
      '[Answer Agent] Failed to load history for chat chat1: Unexpected token i in JSON at position 0'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should not throw an error if serialized data is empty', () => {
    const serialized = {};

    expect(() => restoreAnswerAgentHistory(serialized)).not.toThrow();
    expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Singleton initialized');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle multiple chat histories', () => {
    const serialized = {
      chat1: JSON.stringify({
        chatId: 'chat1',
        createdAt: '2023-01-01T00:00:00Z',
        lastActivityAt: '2023-01-02T00:00:00Z',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      }),
      chat2: JSON.stringify({
        chatId: 'chat2',
        createdAt: '2023-01-03T00:00:00Z',
        lastActivityAt: '2023-01-04T00:00:00Z',
        messages: [
          { role: 'user', content: 'How are you?' },
          { role: 'assistant', content: 'I am fine, thank you!' },
        ],
      }),
    };

    restoreAnswerAgentHistory(serialized);

    const agent = getAnswerAgent();
    const history1 = agent.getHistory('chat1');
    const history2 = agent.getHistory('chat2');

    expect(history1).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);
    expect(history2).toEqual([
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am fine, thank you!' },
    ]);
  });

  /** @aiContributed-2026-02-04 */
    it('should skip restoring history if chatId is missing in serialized data', () => {
    const serialized = {
      chat1: JSON.stringify({
        createdAt: '2023-01-01T00:00:00Z',
        lastActivityAt: '2023-01-02T00:00:00Z',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      }),
    };

    restoreAnswerAgentHistory(serialized);

    const agent = getAnswerAgent();
    const history = agent.getHistory('chat1');

    expect(history).toBeUndefined();
    expect(Logger.warn).toHaveBeenCalledWith(
      '[Answer Agent] Failed to load history for chat chat1: Cannot read properties of undefined (reading \'chatId\')'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should log a warning if deserialization fails for a specific chatId', () => {
    const serialized = {
      chat1: JSON.stringify({
        chatId: 'chat1',
        createdAt: '2023-01-01T00:00:00Z',
        lastActivityAt: '2023-01-02T00:00:00Z',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      }),
      chat2: 'invalid-json',
    };

    restoreAnswerAgentHistory(serialized);

    const agent = getAnswerAgent();
    const history = agent.getHistory('chat1');

    expect(history).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);
    expect(Logger.warn).toHaveBeenCalledWith(
      '[Answer Agent] Failed to load history for chat chat2: Unexpected token i in JSON at position 0'
    );
  });
});