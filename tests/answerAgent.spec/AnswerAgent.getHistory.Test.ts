// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

/** @aiContributed-2026-02-03 */
describe('AnswerAgent.getHistory', () => {
    let answerAgent: AnswerAgent;

    beforeEach(() => {
        answerAgent = new AnswerAgent();
        (answerAgent as unknown as { conversationHistory: Map<string, { messages?: { text: string }[] }> }).conversationHistory = new Map();
    });

    /** @aiContributed-2026-02-03 */
    it('should return messages for a valid chatId', () => {
        const chatId = 'chat1';
        const messages = [{ text: 'Hello' }, { text: 'World' }];
        (answerAgent as unknown as { conversationHistory: Map<string, { messages?: { text: string }[] }> }).conversationHistory.set(chatId, { messages });

        const result = answerAgent.getHistory(chatId);

        expect(result).toEqual(messages);
    });

    /** @aiContributed-2026-02-03 */
    it('should return undefined for a non-existent chatId', () => {
        const chatId = 'nonExistentChat';

        const result = answerAgent.getHistory(chatId);

        expect(result).toBeUndefined();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle chatId with no messages gracefully', () => {
        const chatId = 'chat2';
        (answerAgent as unknown as { conversationHistory: Map<string, { messages?: { text: string }[] }> }).conversationHistory.set(chatId, {});

        const result = answerAgent.getHistory(chatId);

        expect(result).toBeUndefined();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle null chatId gracefully', () => {
        const result = answerAgent.getHistory(null as unknown as string);

        expect(result).toBeUndefined();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle undefined chatId gracefully', () => {
        const result = answerAgent.getHistory(undefined as unknown as string);

        expect(result).toBeUndefined();
    });

    /** @aiContributed-2026-02-03 */
    it('should log debug information at critical steps', () => {
        const chatId = 'chat3';
        const messages = [{ text: 'Test' }];
        (answerAgent as unknown as { conversationHistory: Map<string, { messages?: { text: string }[] }> }).conversationHistory.set(chatId, { messages });

        const debugSpy = jest.spyOn(Logger, 'debug');

        answerAgent.getHistory(chatId);

        expect(debugSpy).toHaveBeenCalledWith(`Fetching history for chatId: ${chatId}`);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle empty conversationHistory gracefully', () => {
        const chatId = 'chat4';

        const result = answerAgent.getHistory(chatId);

        expect(result).toBeUndefined();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle chatId with undefined messages gracefully', () => {
        const chatId = 'chat5';
        (answerAgent as unknown as { conversationHistory: Map<string, { messages?: undefined }> }).conversationHistory.set(chatId, { messages: undefined });

        const result = answerAgent.getHistory(chatId);

        expect(result).toBeUndefined();
    });
});