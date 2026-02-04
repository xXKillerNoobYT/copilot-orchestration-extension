// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

/** @aiContributed-2026-02-03 */
describe('AnswerAgent', () => {
    let answerAgent: AnswerAgent;

    beforeEach(() => {
        answerAgent = new AnswerAgent();
        Logger.debug = jest.fn();
        Logger.info = jest.fn();
        Logger.error = jest.fn();
    });

    /** @aiContributed-2026-02-03 */
    describe('getActiveConversations', () => {
        /** @aiContributed-2026-02-03 */
        it('should return an empty array when there are no active conversations', () => {
            const result = answerAgent.getActiveConversations();
            expect(result).toEqual([]);
            expect(Logger.debug).toHaveBeenCalledWith('Fetching active conversations');
        });

        /** @aiContributed-2026-02-03 */
        it('should return all active conversations from the conversationHistory', () => {
            const mockConversation1 = { id: '1', title: 'Conversation 1' };
            const mockConversation2 = { id: '2', title: 'Conversation 2' };

            (answerAgent as unknown as { conversationHistory: Map<string, typeof mockConversation1> })
                .conversationHistory.set('1', mockConversation1);
            (answerAgent as unknown as { conversationHistory: Map<string, typeof mockConversation2> })
                .conversationHistory.set('2', mockConversation2);

            const result = answerAgent.getActiveConversations();
            expect(result).toEqual([mockConversation1, mockConversation2]);
            expect(Logger.debug).toHaveBeenCalledWith('Fetching active conversations');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle conversationHistory with undefined or null values gracefully', () => {
            const mockConversationHistory: Map<string, null | undefined> = new Map();
            mockConversationHistory.set('1', null);
            mockConversationHistory.set('2', undefined);

            (answerAgent as unknown as { conversationHistory: Map<string, null | undefined> })
                .conversationHistory = mockConversationHistory;

            const result = answerAgent.getActiveConversations();
            expect(result).toEqual([]);
            expect(Logger.debug).toHaveBeenCalledWith('Fetching active conversations');
        });
    });
});