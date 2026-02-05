// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import { Logger } from '../../utils/logger';

/** @aiContributed-2026-02-04 */
describe('ConversationsTreeDataProvider', () => {
    let provider: ConversationsTreeDataProvider;

    beforeEach(() => {
        provider = new ConversationsTreeDataProvider();
    });

    /** @aiContributed-2026-02-04 */
    describe('getConversationTimestamp', () => {
        /** @aiContributed-2026-02-04 */
        it('should return the parsed timestamp from history.lastActivityAt', () => {
            const history = { lastActivityAt: '2023-01-01T12:00:00Z', createdAt: null };
            const ticket = { updatedAt: null, createdAt: null };
            const result = (provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }).getConversationTimestamp(history, ticket);
            expect(result).toBe(Date.parse('2023-01-01T12:00:00Z'));
        });

        /** @aiContributed-2026-02-04 */
        it('should return the parsed timestamp from history.createdAt if lastActivityAt is null', () => {
            const history = { lastActivityAt: null, createdAt: '2023-01-01T12:00:00Z' };
            const ticket = { updatedAt: null, createdAt: null };
            const result = (provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }).getConversationTimestamp(history, ticket);
            expect(result).toBe(Date.parse('2023-01-01T12:00:00Z'));
        });

        /** @aiContributed-2026-02-04 */
        it('should return the parsed timestamp from ticket.updatedAt if history fields are null', () => {
            const history = { lastActivityAt: null, createdAt: null };
            const ticket = { updatedAt: '2023-01-01T12:00:00Z', createdAt: null };
            const result = (provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }).getConversationTimestamp(history, ticket);
            expect(result).toBe(Date.parse('2023-01-01T12:00:00Z'));
        });

        /** @aiContributed-2026-02-04 */
        it('should return the parsed timestamp from ticket.createdAt if all other fields are null', () => {
            const history = { lastActivityAt: null, createdAt: null };
            const ticket = { updatedAt: null, createdAt: '2023-01-01T12:00:00Z' };
            const result = (provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }).getConversationTimestamp(history, ticket);
            expect(result).toBe(Date.parse('2023-01-01T12:00:00Z'));
        });

        /** @aiContributed-2026-02-04 */
        it('should return 0 if all fields are null or invalid', () => {
            const history = { lastActivityAt: null, createdAt: null };
            const ticket = { updatedAt: null, createdAt: null };
            const result = (provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }).getConversationTimestamp(history, ticket);
            expect(result).toBe(0);
        });

        /** @aiContributed-2026-02-04 */
        it('should return 0 if the parsed timestamp is NaN', () => {
            const history = { lastActivityAt: 'invalid-date', createdAt: null };
            const ticket = { updatedAt: null, createdAt: null };
            const result = (provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }).getConversationTimestamp(history, ticket);
            expect(result).toBe(0);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle different timezones correctly', () => {
            const history = { lastActivityAt: '2023-01-01T12:00:00+05:30', createdAt: null };
            const ticket = { updatedAt: null, createdAt: null };
            const result = (provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }).getConversationTimestamp(history, ticket);
            expect(result).toBe(Date.parse('2023-01-01T12:00:00+05:30'));
        });

        /** @aiContributed-2026-02-04 */
        it('should log debug information at critical steps', () => {
            const history = { lastActivityAt: '2023-01-01T12:00:00Z', createdAt: null };
            const ticket = { updatedAt: null, createdAt: null };
            const debugSpy = jest.spyOn(Logger, 'debug');
            (provider as unknown as { getConversationTimestamp: (history: typeof history, ticket: typeof ticket) => number }).getConversationTimestamp(history, ticket);
            expect(debugSpy).toHaveBeenCalledWith('Parsing timestamp: 2023-01-01T12:00:00Z');
        });
    });
});