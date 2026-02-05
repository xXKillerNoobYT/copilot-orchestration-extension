// ./answerAgent.Test.ts
import { getConversationHistory, resetAnswerAgentForTests, initializeAnswerAgent, getAnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-04 */
describe('getConversationHistory', () => {
    beforeEach(() => {
        resetAnswerAgentForTests();
        initializeAnswerAgent();
    });

    /** @aiContributed-2026-02-04 */
    it('should return the conversation history for a valid chatId', () => {
        const chatId = 'chat-12345';
        const mockHistory = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ];
        const agent = getAnswerAgent();
        agent.getActiveConversations = jest.fn().mockReturnValue([
            {
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-01T01:00:00Z',
                messages: mockHistory,
            },
        ]);

        const result = getConversationHistory(chatId);
        expect(result).toEqual(mockHistory);
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Singleton initialized'));
    });

    /** @aiContributed-2026-02-04 */
    it('should return an empty array if the chatId is not found', () => {
        const chatId = 'non-existent-chat';
        const agent = getAnswerAgent();
        agent.getActiveConversations = jest.fn().mockReturnValue([]);

        const result = getConversationHistory(chatId);
        expect(result).toEqual([]);
    });

    /** @aiContributed-2026-02-04 */
    it('should handle undefined chatId gracefully', () => {
        const result = getConversationHistory(undefined as unknown as string);
        expect(result).toEqual([]);
    });

    /** @aiContributed-2026-02-04 */
    it('should handle null chatId gracefully', () => {
        const result = getConversationHistory(null as unknown as string);
        expect(result).toEqual([]);
    });

    /** @aiContributed-2026-02-04 */
    it('should log an error if getActiveConversations throws an error', () => {
        const chatId = 'chat-12345';
        const agent = getAnswerAgent();
        agent.getActiveConversations = jest.fn(() => {
            throw new Error('Test error');
        });

        expect(() => getConversationHistory(chatId)).toThrow('Test error');
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Test error'));
    });

    /** @aiContributed-2026-02-04 */
    it('should return an empty array if the conversation metadata is undefined', () => {
        const chatId = 'chat-12345';
        const agent = getAnswerAgent();
        agent.getActiveConversations = jest.fn().mockReturnValue([
            {
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-01T01:00:00Z',
                messages: undefined,
            },
        ]);

        const result = getConversationHistory(chatId);
        expect(result).toEqual([]);
    });

    /** @aiContributed-2026-02-04 */
    it('should handle conversations with empty messages array', () => {
        const chatId = 'chat-12345';
        const agent = getAnswerAgent();
        agent.getActiveConversations = jest.fn().mockReturnValue([
            {
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-01T01:00:00Z',
                messages: [],
            },
        ]);

        const result = getConversationHistory(chatId);
        expect(result).toEqual([]);
    });

    /** @aiContributed-2026-02-04 */
    it('should handle conversations with messages exceeding the maximum exchanges', () => {
        const chatId = 'chat-12345';
        const mockHistory = Array(15).fill({ role: 'user', content: 'Message' });
        const agent = getAnswerAgent();
        agent.getActiveConversations = jest.fn().mockReturnValue([
            {
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-01T01:00:00Z',
                messages: mockHistory,
            },
        ]);

        const result = getConversationHistory(chatId);
        expect(result.length).toBeLessThanOrEqual(10); // MAX_HISTORY_EXCHANGES * 2
    });
});