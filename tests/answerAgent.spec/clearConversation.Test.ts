// ./answerAgent.Test.ts
import { clearConversation, resetAnswerAgentForTests, initializeAnswerAgent, getAnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('clearConversation', () => {
    beforeEach(() => {
        resetAnswerAgentForTests();
        initializeAnswerAgent();
    });

    /** @aiContributed-2026-02-03 */
    it('should clear the conversation history for a valid chatId', () => {
        const chatId = 'test-chat-id';
        const agent = getAnswerAgent();
        agent.getHistory = jest.fn().mockReturnValue([{ role: 'user', content: 'Hello' }]);
        agent.clearHistory = jest.fn();

        clearConversation(chatId);

        expect(agent.clearHistory).toHaveBeenCalledWith(chatId);
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining(`Cleared history for chat ${chatId}`));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle clearing a non-existent chatId gracefully', () => {
        const chatId = 'non-existent-chat-id';
        const agent = getAnswerAgent();
        agent.clearHistory = jest.fn();

        clearConversation(chatId);

        expect(agent.clearHistory).toHaveBeenCalledWith(chatId);
        expect(Logger.info).not.toHaveBeenCalledWith(expect.stringContaining(`Cleared history for chat ${chatId}`));
    });

    /** @aiContributed-2026-02-03 */
    it('should throw an error if AnswerAgent is not initialized', () => {
        resetAnswerAgentForTests();

        expect(() => clearConversation('test-chat-id')).toThrow(
            'AnswerAgent not initialized. Call initializeAnswerAgent() first.'
        );
    });
});