// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { logWarn } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
}));

type ConversationHistory = Map<string, { id: string; messages: string[] }>;

/** @aiContributed-2026-02-03 */
describe('AnswerAgent.deserializeHistory', () => {
  let answerAgent: AnswerAgent;

  beforeEach(() => {
    answerAgent = new AnswerAgent();
    (answerAgent as { conversationHistory: ConversationHistory }).conversationHistory = new Map();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should deserialize and store valid history entries', () => {
    const serialized = {
      chat1: JSON.stringify({ id: 'chat1', messages: ['Hello'] }),
      chat2: JSON.stringify({ id: 'chat2', messages: ['Hi'] }),
    };

    answerAgent.deserializeHistory(serialized);

    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.size).toBe(2);
    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.get('chat1')).toEqual({
      id: 'chat1',
      messages: ['Hello'],
    });
    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.get('chat2')).toEqual({
      id: 'chat2',
      messages: ['Hi'],
    });
  });

  /** @aiContributed-2026-02-03 */
    it('should log a warning and skip invalid JSON entries', () => {
    const serialized = {
      chat1: JSON.stringify({ id: 'chat1', messages: ['Hello'] }),
      chat2: 'invalid-json',
    };

    answerAgent.deserializeHistory(serialized);

    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.size).toBe(1);
    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.get('chat1')).toEqual({
      id: 'chat1',
      messages: ['Hello'],
    });
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to load history for chat chat2'));
  });

  /** @aiContributed-2026-02-03 */
    it('should handle an empty serialized object', () => {
    const serialized = {};

    answerAgent.deserializeHistory(serialized);

    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.size).toBe(0);
    expect(logWarn).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
    it('should handle null or undefined input gracefully', () => {
    answerAgent.deserializeHistory(null as unknown as Record<string, string>);
    answerAgent.deserializeHistory(undefined as unknown as Record<string, string>);

    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.size).toBe(0);
    expect(logWarn).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
    it('should handle partially valid serialized data', () => {
    const serialized = {
      chat1: JSON.stringify({ id: 'chat1', messages: ['Hello'] }),
      chat2: 'invalid-json',
      chat3: JSON.stringify({ id: 'chat3', messages: ['Hey'] }),
    };

    answerAgent.deserializeHistory(serialized);

    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.size).toBe(2);
    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.get('chat1')).toEqual({
      id: 'chat1',
      messages: ['Hello'],
    });
    expect((answerAgent as { conversationHistory: ConversationHistory }).conversationHistory.get('chat3')).toEqual({
      id: 'chat3',
      messages: ['Hey'],
    });
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to load history for chat chat2'));
  });
});