// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import { Logger } from '../../utils/logger';

/** @aiContributed-2026-02-03 */
describe('ConversationsTreeDataProvider', () => {
    let provider: ConversationsTreeDataProvider;

    beforeEach(() => {
        provider = new ConversationsTreeDataProvider();
        jest.spyOn(Logger, 'debug').mockImplementation(() => {});
        jest.spyOn(Logger, 'info').mockImplementation(() => {});
        jest.spyOn(Logger, 'error').mockImplementation(() => {});
    });

    /** @aiContributed-2026-02-03 */
    describe('getConversationLabel', () => {
        /** @aiContributed-2026-02-03 */
        it('should return the truncated user message when a user message exists', () => {
            const ticket = { id: '123' };
            const history = {
                messages: [
                    { role: 'user', content: 'This is a user message that exceeds sixty characters in length.' },
                ],
            };

            jest.spyOn(provider, 'truncateText').mockReturnValue('This is a user message that exceeds sixty charact...');

            const result = provider.getConversationLabel(ticket, history);

            expect(result).toBe('User: This is a user message that exceeds sixty charact...');
            expect(provider.truncateText).toHaveBeenCalledWith('This is a user message that exceeds sixty characters in length.', 60);
        });

        /** @aiContributed-2026-02-03 */
        it('should return "New chat" with ticket ID when no user message exists', () => {
            const ticket = { id: '123' };
            const history = { messages: [{ role: 'system', content: 'System message' }] };

            const result = provider.getConversationLabel(ticket, history);

            expect(result).toBe('New chat (123)');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle null or undefined history gracefully', () => {
            const ticket = { id: '123' };

            const result = provider.getConversationLabel(ticket, null);

            expect(result).toBe('New chat (123)');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle null or undefined messages array in history gracefully', () => {
            const ticket = { id: '123' };
            const history = { messages: null };

            const result = provider.getConversationLabel(ticket, history);

            expect(result).toBe('New chat (123)');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle empty messages array in history gracefully', () => {
            const ticket = { id: '123' };
            const history = { messages: [] };

            const result = provider.getConversationLabel(ticket, history);

            expect(result).toBe('New chat (123)');
        });

        /** @aiContributed-2026-02-03 */
        it('should log an error if truncateText throws an error', () => {
            const ticket = { id: '123' };
            const history = {
                messages: [
                    { role: 'user', content: 'This is a user message.' },
                ],
            };

            jest.spyOn(provider, 'truncateText').mockImplementation(() => {
                throw new Error('Truncate error');
            });

            const result = provider.getConversationLabel(ticket, history);

            expect(result).toBe('New chat (123)');
            expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
        });
    });
});