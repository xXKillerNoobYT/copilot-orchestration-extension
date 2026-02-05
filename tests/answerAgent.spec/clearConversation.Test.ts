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

/** @aiContributed-2026-02-04 */
describe('clearConversation', () => {
    beforeEach(() => {
        resetAnswerAgentForTests();
        initializeAnswerAgent();
    });

    /** @aiContributed-2026-02-04 */
    it('should clear the conversation history for a valid chatId', () => {
        const chatId = 'test-chat-id';
        const agent = getAnswerAgent();
        jest.spyOn(agent, 'getHistory').mockReturnValue([{ role: 'user', content: 'Hello' }]);
        jest.spyOn(agent, 'clearHistory').mockImplementation(() => true);

        clearConversation(chatId);

        expect(agent.clearHistory).toHaveBeenCalledWith(chatId);
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining(`Cleared history for chat ${chatId}`));
    });

    /** @aiContributed-2026-02-04 */
    it('should handle clearing a non-existent chatId gracefully', () => {
        const chatId = 'non-existent-chat-id';
        const agent = getAnswerAgent();
        jest.spyOn(agent, 'clearHistory').mockImplementation(() => false);

        clearConversation(chatId);

        expect(agent.clearHistory).toHaveBeenCalledWith(chatId);
        expect(Logger.info).not.toHaveBeenCalledWith(expect.stringContaining(`Cleared history for chat ${chatId}`));
    });

    /** @aiContributed-2026-02-04 */
    it('should throw an error if AnswerAgent is not initialized', () => {
        resetAnswerAgentForTests();

        expect(() => clearConversation('test-chat-id')).toThrow(
            'AnswerAgent not initialized. Call initializeAnswerAgent() first.'
        );
    });

    /** @aiContributed-2026-02-04 */
    it('should log an error if clearHistory throws an exception', () => {
        const chatId = 'test-chat-id';
        const agent = getAnswerAgent();
        jest.spyOn(agent, 'clearHistory').mockImplementation(() => {
            throw new Error('Test error');
        });

        expect(() => clearConversation(chatId)).toThrow('Test error');
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Test error'));
    });
});