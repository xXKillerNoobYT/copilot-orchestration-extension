// ./answerAgent.Test.ts
import { AnswerAgent } from '../../src/agents/answerAgent';
import { logWarn } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('AnswerAgent', () => {
    /** @aiContributed-2026-02-04 */
    describe('serializeHistory', () => {
        let answerAgent: AnswerAgent;

        beforeEach(() => {
            answerAgent = new AnswerAgent();
            (answerAgent as unknown as { conversationHistory: Map<string, unknown> }).conversationHistory = new Map();
            jest.clearAllMocks();
        });

        /** @aiContributed-2026-02-04 */
        it('should serialize conversation history correctly', () => {
            const chatId = 'chat1';
            const metadata = {
                messages: [{ text: 'Hello' }, { text: 'Hi' }],
                otherData: 'test',
            };
            (answerAgent as unknown as { conversationHistory: Map<string, typeof metadata> }).conversationHistory.set(chatId, metadata);

            const result = answerAgent.serializeHistory();

            expect(result).toHaveProperty(chatId);
            expect(JSON.parse(result[chatId])).toEqual(metadata);
        });

        /** @aiContributed-2026-02-04 */
        it('should truncate messages if serialized size exceeds 1MB', () => {
            const chatId = 'chat1';
            const largeMessage = { text: 'a'.repeat(1024 * 1024) }; // 1MB message
            const metadata = {
                messages: [largeMessage, largeMessage, largeMessage],
                otherData: 'test',
            };
            (answerAgent as unknown as { conversationHistory: Map<string, typeof metadata> }).conversationHistory.set(chatId, metadata);

            const result = answerAgent.serializeHistory();

            expect(result).toHaveProperty(chatId);
            const parsed = JSON.parse(result[chatId]);
            expect(parsed.messages.length).toBe(6); // 3 exchanges = 6 messages
            expect(logWarn).toHaveBeenCalledWith(
                `[Answer Agent] History truncated due to size for chat ${chatId} (kept last 3 exchanges)`
            );
        });

        /** @aiContributed-2026-02-04 */
        it('should handle empty conversation history', () => {
            const result = answerAgent.serializeHistory();

            expect(result).toEqual({});
        });

        /** @aiContributed-2026-02-04 */
        it('should handle metadata with undefined messages', () => {
            const chatId = 'chat1';
            const metadata = {
                messages: undefined,
                otherData: 'test',
            };
            (answerAgent as unknown as { conversationHistory: Map<string, typeof metadata> }).conversationHistory.set(chatId, metadata);

            const result = answerAgent.serializeHistory();

            expect(result).toHaveProperty(chatId);
            expect(JSON.parse(result[chatId])).toEqual(metadata);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle multiple chat histories', () => {
            const chat1 = 'chat1';
            const chat2 = 'chat2';
            const metadata1 = { messages: [{ text: 'Hello' }], otherData: 'test1' };
            const metadata2 = { messages: [{ text: 'Hi' }], otherData: 'test2' };
            (answerAgent as unknown as { conversationHistory: Map<string, typeof metadata1> }).conversationHistory.set(chat1, metadata1);
            (answerAgent as unknown as { conversationHistory: Map<string, typeof metadata2> }).conversationHistory.set(chat2, metadata2);

            const result = answerAgent.serializeHistory();

            expect(result).toHaveProperty(chat1);
            expect(result).toHaveProperty(chat2);
            expect(JSON.parse(result[chat1])).toEqual(metadata1);
            expect(JSON.parse(result[chat2])).toEqual(metadata2);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle metadata with messages exceeding maxMessages', () => {
            const chatId = 'chat1';
            const metadata = {
                messages: Array(10).fill({ text: 'Message' }), // 10 messages
                otherData: 'test',
            };
            (answerAgent as unknown as { conversationHistory: Map<string, typeof metadata> }).conversationHistory.set(chatId, metadata);

            const result = answerAgent.serializeHistory();

            expect(result).toHaveProperty(chatId);
            const parsed = JSON.parse(result[chatId]);
            expect(parsed.messages.length).toBe(6); // 3 exchanges = 6 messages
            expect(logWarn).toHaveBeenCalledWith(
                `[Answer Agent] History truncated due to size for chat ${chatId} (kept last 3 exchanges)`
            );
        });

        /** @aiContributed-2026-02-04 */
        it('should handle metadata with large messages and truncate correctly', () => {
            const chatId = 'chat1';
            const largeMessage = { text: 'a'.repeat(512 * 1024) }; // 512KB message
            const metadata = {
                messages: [largeMessage, largeMessage, largeMessage, largeMessage],
                otherData: 'test',
            };
            (answerAgent as unknown as { conversationHistory: Map<string, typeof metadata> }).conversationHistory.set(chatId, metadata);

            const result = answerAgent.serializeHistory();

            expect(result).toHaveProperty(chatId);
            const parsed = JSON.parse(result[chatId]);
            expect(parsed.messages.length).toBe(6); // 3 exchanges = 6 messages
            expect(logWarn).toHaveBeenCalledWith(
                `[Answer Agent] History truncated due to size for chat ${chatId} (kept last 3 exchanges)`
            );
        });

        /** @aiContributed-2026-02-04 */
        it('should handle metadata with no messages property', () => {
            const chatId = 'chat1';
            const metadata = {
                otherData: 'test',
            };
            (answerAgent as unknown as { conversationHistory: Map<string, typeof metadata> }).conversationHistory.set(chatId, metadata);

            const result = answerAgent.serializeHistory();

            expect(result).toHaveProperty(chatId);
            expect(JSON.parse(result[chatId])).toEqual(metadata);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle metadata with messages as null', () => {
            const chatId = 'chat1';
            const metadata = {
                messages: null,
                otherData: 'test',
            };
            (answerAgent as unknown as { conversationHistory: Map<string, typeof metadata> }).conversationHistory.set(chatId, metadata);

            const result = answerAgent.serializeHistory();

            expect(result).toHaveProperty(chatId);
            expect(JSON.parse(result[chatId])).toEqual(metadata);
        });
    });
});