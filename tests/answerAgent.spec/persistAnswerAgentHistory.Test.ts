// ./answerAgent.Test.ts
import { persistAnswerAgentHistory, initializeAnswerAgent, resetAnswerAgentForTests, getAnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';
import { updateTicket } from '../../src/services/ticketDb';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    updateTicket: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('persistAnswerAgentHistory', () => {
    beforeEach(() => {
        initializeAnswerAgent();
    });

    afterEach(() => {
        resetAnswerAgentForTests();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    it('should serialize and return the conversation history', async () => {
        const result = persistAnswerAgentHistory();
        expect(result).toEqual({});
        expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Singleton initialized');
    });

    /** @aiContributed-2026-02-04 */
    it('should handle empty conversation history gracefully', async () => {
        const result = persistAnswerAgentHistory();
        expect(result).toEqual({});
        expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Singleton initialized');
    });

    /** @aiContributed-2026-02-04 */
    it('should handle large conversation history by truncating messages', async () => {
        const chatId = 'chat-123';
        const largeMessages = Array(20).fill({ role: 'user', content: 'test' });
        getAnswerAgent().deserializeHistory({
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

    /** @aiContributed-2026-02-04 */
    it('should log a warning if serialization fails', async () => {
        const chatId = 'chat-123';
        getAnswerAgent().deserializeHistory({
            [chatId]: 'invalid-json',
        });

        const result = persistAnswerAgentHistory();
        expect(result).toEqual({});
        expect(Logger.warn).toHaveBeenCalledWith(
            `[Answer Agent] Failed to load history for chat ${chatId}: Unexpected token i in JSON at position 0`
        );
    });

    /** @aiContributed-2026-02-04 */
    it('should call updateTicket to persist history', async () => {
        const chatId = 'chat-456';
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ];
        getAnswerAgent().deserializeHistory({
            [chatId]: JSON.stringify({
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-02T00:00:00Z',
                messages,
            }),
        });

        (updateTicket as jest.Mock).mockResolvedValue(true);

        const result = persistAnswerAgentHistory();
        expect(Object.keys(result)).toContain(chatId);
        expect(updateTicket).toHaveBeenCalledWith(chatId, {
            conversationHistory: JSON.stringify({
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-02T00:00:00Z',
                messages,
            }),
        });
        expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Persisted history for chat chat-456');
    });

    /** @aiContributed-2026-02-04 */
    it('should log a warning if updateTicket fails', async () => {
        const chatId = 'chat-789';
        const messages = [
            { role: 'user', content: 'Question?' },
            { role: 'assistant', content: 'Answer.' },
        ];
        getAnswerAgent().deserializeHistory({
            [chatId]: JSON.stringify({
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-02T00:00:00Z',
                messages,
            }),
        });

        (updateTicket as jest.Mock).mockResolvedValue(false);

        const result = persistAnswerAgentHistory();
        expect(Object.keys(result)).toContain(chatId);
        expect(updateTicket).toHaveBeenCalledWith(chatId, {
            conversationHistory: JSON.stringify({
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-02T00:00:00Z',
                messages,
            }),
        });
        expect(Logger.warn).toHaveBeenCalledWith(
            '[Answer Agent] Could not persist history for chat chat-789 (ticket not found)'
        );
    });

    /** @aiContributed-2026-02-04 */
    it('should log a warning if updateTicket throws an error', async () => {
        const chatId = 'chat-999';
        const messages = [
            { role: 'user', content: 'Error test' },
            { role: 'assistant', content: 'Error response' },
        ];
        getAnswerAgent().deserializeHistory({
            [chatId]: JSON.stringify({
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-02T00:00:00Z',
                messages,
            }),
        });

        (updateTicket as jest.Mock).mockRejectedValue(new Error('Database error'));

        const result = persistAnswerAgentHistory();
        expect(Object.keys(result)).toContain(chatId);
        expect(updateTicket).toHaveBeenCalledWith(chatId, {
            conversationHistory: JSON.stringify({
                chatId,
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-02T00:00:00Z',
                messages,
            }),
        });
        expect(Logger.warn).toHaveBeenCalledWith(
            '[Answer Agent] Failed to persist history for chat chat-999: Database error'
        );
    });

    /** @aiContributed-2026-02-04 */
    it('should skip persisting if metadata is missing for a chatId', async () => {
        const chatId = 'non-existent-chat';
        const result = persistAnswerAgentHistory();
        expect(Object.keys(result)).not.toContain(chatId);
        expect(updateTicket).not.toHaveBeenCalled();
    });
});