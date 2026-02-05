// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

interface ConversationMetadata {
    id: string;
    title: string;
}

interface AnswerAgentWithHistory extends AnswerAgent {
    conversationHistory?: Map<string, ConversationMetadata | null>;
}

/** @aiContributed-2026-02-04 */
describe('AnswerAgent', () => {
    let answerAgent: AnswerAgentWithHistory;

    beforeEach(() => {
        answerAgent = new AnswerAgent() as AnswerAgentWithHistory;
        Logger.debug = jest.fn();
        Logger.info = jest.fn();
        Logger.error = jest.fn();
    });

    /** @aiContributed-2026-02-04 */
    describe('getActiveConversations', () => {
        /** @aiContributed-2026-02-04 */
        it('should return an empty array when there are no active conversations', () => {
            const result = answerAgent.getActiveConversations();
            expect(result).toEqual([]);
        });

        /** @aiContributed-2026-02-04 */
        it('should return all active conversations from the conversationHistory', () => {
            const mockConversation1: ConversationMetadata = { id: '1', title: 'Conversation 1' };
            const mockConversation2: ConversationMetadata = { id: '2', title: 'Conversation 2' };

            answerAgent.conversationHistory = new Map([
                ['1', mockConversation1],
                ['2', mockConversation2],
            ]);

            const result = answerAgent.getActiveConversations();
            expect(result).toEqual([mockConversation1, mockConversation2]);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle conversationHistory with undefined or null values gracefully', () => {
            const mockConversationHistory = new Map<string, ConversationMetadata | null>([
                ['1', null],
                ['2', undefined],
            ]);

            answerAgent.conversationHistory = mockConversationHistory;

            const result = answerAgent.getActiveConversations();
            expect(result).toEqual([]);
        });

        /** @aiContributed-2026-02-04 */
        it('should return an empty array if conversationHistory is not initialized', () => {
            answerAgent.conversationHistory = undefined;

            const result = answerAgent.getActiveConversations();
            expect(result).toEqual([]);
        });
    });
});