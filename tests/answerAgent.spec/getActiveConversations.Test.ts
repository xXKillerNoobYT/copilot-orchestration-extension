// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('getActiveConversations', () => {
    let agent: AnswerAgent;

    beforeEach(() => {
        agent = new AnswerAgent();
    });

    /** @aiContributed-2026-02-03 */
    it('should return an empty array when there are no active conversations', () => {
        const result = agent.getActiveConversations();
        expect(result).toEqual([]);
        expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Auto-close cleanup: no inactive conversations found');
    });

    /** @aiContributed-2026-02-03 */
    it('should return all active conversations', () => {
        const conversation1 = {
            chatId: 'chat-1',
            createdAt: '2023-01-01T00:00:00Z',
            lastActivityAt: '2023-01-01T01:00:00Z',
            messages: [{ role: 'user', content: 'Hello' }],
        };
        const conversation2 = {
            chatId: 'chat-2',
            createdAt: '2023-01-02T00:00:00Z',
            lastActivityAt: '2023-01-02T01:00:00Z',
            messages: [{ role: 'assistant', content: 'Hi there!' }],
        };

        agent.deserializeHistory({
            'chat-1': JSON.stringify(conversation1),
            'chat-2': JSON.stringify(conversation2),
        });

        const result = agent.getActiveConversations();
        expect(result).toEqual([conversation1, conversation2]);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle invalid conversation data gracefully', () => {
        agent.deserializeHistory({
            'chat-1': 'invalid-json',
        });

        const result = agent.getActiveConversations();
        expect(result).toEqual([]);
        expect(Logger.warn).toHaveBeenCalledWith(
            '[Answer Agent] Failed to load history for chat chat-1: Unexpected token i in JSON at position 0'
        );
    });
});