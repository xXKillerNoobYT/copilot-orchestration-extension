// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import { Logger } from '../../utils/logger';

interface Metadata {
    chatId: string;
    createdAt?: string;
    lastActivityAt?: string;
}

/** @aiContributed-2026-02-03 */
describe('ConversationsTreeDataProvider', () => {
    /** @aiContributed-2026-02-03 */
    describe('createMemoryTicket', () => {
        let provider: ConversationsTreeDataProvider;

        beforeEach(() => {
            provider = new ConversationsTreeDataProvider();
            jest.spyOn(Logger, 'debug').mockImplementation(() => {});
            jest.spyOn(Logger, 'info').mockImplementation(() => {});
            jest.spyOn(Logger, 'error').mockImplementation(() => {});
        });

        /** @aiContributed-2026-02-03 */
        it('should create a ticket with metadata values', () => {
            const metadata: Metadata = {
                chatId: '123',
                createdAt: '2023-01-01T00:00:00Z',
                lastActivityAt: '2023-01-02T00:00:00Z',
            };

            const ticket = (provider as unknown as { createMemoryTicket: (metadata: Metadata) => unknown }).createMemoryTicket(metadata);

            expect(ticket).toEqual({
                id: '123',
                title: 'Answer Agent Conversation',
                status: 'open',
                type: 'answer_agent',
                createdAt: '2023-01-01T00:00:00Z',
                updatedAt: '2023-01-02T00:00:00Z',
                conversationHistory: undefined,
            });
        });

        /** @aiContributed-2026-02-03 */
        it('should use lastActivityAt as timestamp if available', () => {
            const metadata: Metadata = {
                chatId: '456',
                lastActivityAt: '2023-01-03T00:00:00Z',
            };

            const ticket = (provider as unknown as { createMemoryTicket: (metadata: Metadata) => unknown }).createMemoryTicket(metadata);

            expect(ticket.createdAt).toBe('2023-01-03T00:00:00Z');
            expect(ticket.updatedAt).toBe('2023-01-03T00:00:00Z');
        });

        /** @aiContributed-2026-02-03 */
        it('should use createdAt as timestamp if lastActivityAt is not available', () => {
            const metadata: Metadata = {
                chatId: '789',
                createdAt: '2023-01-04T00:00:00Z',
            };

            const ticket = (provider as unknown as { createMemoryTicket: (metadata: Metadata) => unknown }).createMemoryTicket(metadata);

            expect(ticket.createdAt).toBe('2023-01-04T00:00:00Z');
            expect(ticket.updatedAt).toBe('2023-01-04T00:00:00Z');
        });

        /** @aiContributed-2026-02-03 */
        it('should use current timestamp if neither lastActivityAt nor createdAt is available', () => {
            const metadata: Metadata = { chatId: '101112' };
            const mockDate = '2023-01-05T00:00:00Z';
            jest.spyOn(global, 'Date').mockImplementation(() => ({
                toISOString: () => mockDate,
            }) as unknown as string);

            const ticket = (provider as unknown as { createMemoryTicket: (metadata: Metadata) => unknown }).createMemoryTicket(metadata);

            expect(ticket.createdAt).toBe(mockDate);
            expect(ticket.updatedAt).toBe(mockDate);

            jest.restoreAllMocks();
        });

        /** @aiContributed-2026-02-03 */
        it('should handle null metadata gracefully', () => {
            const metadata = null;

            expect(() => (provider as unknown as { createMemoryTicket: (metadata: Metadata | null) => unknown }).createMemoryTicket(metadata)).toThrow();
        });

        /** @aiContributed-2026-02-03 */
        it('should handle undefined metadata gracefully', () => {
            const metadata = undefined;

            expect(() => (provider as unknown as { createMemoryTicket: (metadata: Metadata | undefined) => unknown }).createMemoryTicket(metadata)).toThrow();
        });
    });
});