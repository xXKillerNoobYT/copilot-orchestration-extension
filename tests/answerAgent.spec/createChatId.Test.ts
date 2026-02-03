// ./answerAgent.Test.ts
import { createChatId } from '../../src/agents/answerAgent';

/** @aiContributed-2026-02-02 */
describe('createChatId', () => {
    /** @aiContributed-2026-02-02 */
    it('should generate a unique chat ID', () => {
        const chatId1 = createChatId();
        const chatId2 = createChatId();
        expect(chatId1).not.toEqual(chatId2);
        expect(chatId1).toMatch(/^chat-[a-z0-9]+-[a-z0-9]+$/);
        expect(chatId2).toMatch(/^chat-[a-z0-9]+-[a-z0-9]+$/);
    });

    /** @aiContributed-2026-02-02 */
    it('should include a timestamp in the chat ID', () => {
        const chatId = createChatId();
        const timestampPart = chatId.split('-')[1];
        expect(parseInt(timestampPart, 36)).not.toBeNaN();
    });

    /** @aiContributed-2026-02-02 */
    it('should include a random string in the chat ID', () => {
        const chatId = createChatId();
        const randomPart = chatId.split('-')[2];
        expect(randomPart).toHaveLength(7);
        expect(randomPart).toMatch(/^[a-z0-9]+$/);
    });
});