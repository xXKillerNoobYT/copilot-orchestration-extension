// ./answerAgent.Test.ts
import { createChatId } from '../../src/agents/answerAgent';

/** @aiContributed-2026-02-03 */
describe('createChatId', () => {
    /** @aiContributed-2026-02-03 */
    it('should generate a unique chat ID', () => {
        const chatId1 = createChatId();
        const chatId2 = createChatId();
        expect(chatId1).not.toEqual(chatId2);
        expect(chatId1).toMatch(/^chat-[a-z0-9]+-[a-z0-9]+$/);
        expect(chatId2).toMatch(/^chat-[a-z0-9]+-[a-z0-9]+$/);
    });

    /** @aiContributed-2026-02-03 */
    it('should include a timestamp in the chat ID', () => {
        const mockDateNow = jest.spyOn(global.Date, 'now').mockReturnValue(1690000000000);
        const chatId = createChatId();
        const timestampPart = chatId.split('-')[1];
        expect(parseInt(timestampPart, 36)).toBe(1690000000000);
        mockDateNow.mockRestore();
    });

    /** @aiContributed-2026-02-03 */
    it('should include a random string in the chat ID', () => {
        const mockMathRandom = jest.spyOn(global.Math, 'random').mockReturnValue(0.1234567);
        const chatId = createChatId();
        const randomPart = chatId.split('-')[2];
        expect(randomPart).toBe('4td1z0x');
        mockMathRandom.mockRestore();
    });
});