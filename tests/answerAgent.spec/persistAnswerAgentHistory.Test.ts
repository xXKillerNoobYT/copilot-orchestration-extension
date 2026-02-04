// ./answerAgent.Test.ts
import { persistAnswerAgentHistory, initializeAnswerAgent, resetAnswerAgentForTests, getAnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('persistAnswerAgentHistory', () => {
    beforeEach(() => {
        initializeAnswerAgent();
    });

    afterEach(() => {
        resetAnswerAgentForTests();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should serialize and return the conversation history', () => {
        const result = persistAnswerAgentHistory();
        expect(result).toEqual({});
        expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Singleton initialized');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle empty conversation history gracefully', () => {
        const result = persistAnswerAgentHistory();
        expect(result).toEqual({});
        expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Singleton initialized');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle large conversation history by truncating messages', () => {
        const agent = getAnswerAgent();
        const chatId = 'chat-123';
        const largeMessages = Array(20).fill({ role: 'user', content: 'test' });
        agent.deserializeHistory({
            [chatId]: JSON.stringify({
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-02T00:00:00Z',
                messages: largeMessages,
            }),
        });

        const result = persistAnswerAgentHistory();
        expect(Object.keys(result)).toContain(chatId);
        const savedHistory = JSON.parse(result[chatId]);
        expect(savedHistory.messages.length).toBeLessThanOrEqual(6);
        expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Singleton initialized');
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning if serialization fails', () => {
        const agent = getAnswerAgent();
        const chatId = 'chat-123';
        agent.deserializeHistory({
            [chatId]: 'invalid-json',
        });

        const result = persistAnswerAgentHistory();
        expect(result).toEqual({});
        expect(Logger.warn).toHaveBeenCalledWith(
            `[Answer Agent] Failed to load history for chat ${chatId}: Unexpected token i in JSON at position 0`
        );
    });
});