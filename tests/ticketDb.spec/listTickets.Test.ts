// ./ticketDb.Test.ts
import { listTickets, initializeTicketDb, resetTicketDbForTests, createTicket } from '../../src/services/ticketDb';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    ExtensionContext: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('listTickets', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(async () => {
        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeTicketDb(mockContext);
    });

    afterEach(() => {
        resetTicketDbForTests();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should return an empty array when no tickets exist', async () => {
        const tickets = await listTickets();
        expect(tickets).toEqual([]);
        expect(Logger.info).toHaveBeenCalledWith('Ticket DB initialized: In-memory mode');
    });

    /** @aiContributed-2026-02-03 */
    it('should return all tickets in descending order of creation', async () => {
        const ticket1 = {
            title: 'Ticket 1',
            status: 'open',
        };
        const ticket2 = {
            title: 'Ticket 2',
            status: 'in-progress',
        };

        const createdTicket1 = await createTicket(ticket1);
        const createdTicket2 = await createTicket(ticket2);

        const tickets = await listTickets();
        expect(tickets.length).toBe(2);
        expect(tickets[0].id).toBe(createdTicket2.id);
        expect(tickets[1].id).toBe(createdTicket1.id);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle in-memory mode gracefully', async () => {
        const ticket = {
            title: 'In-memory Ticket',
            status: 'done',
        };

        const createdTicket = await createTicket(ticket);
        const tickets = await listTickets();

        expect(tickets).toHaveLength(1);
        expect(tickets[0].id).toBe(createdTicket.id);
        expect(Logger.info).toHaveBeenCalledWith('Ticket DB initialized: In-memory mode');
    });

    /** @aiContributed-2026-02-03 */
    it('should throw an error if the database is not initialized', async () => {
        resetTicketDbForTests();
        await expect(listTickets()).rejects.toThrow('TicketDb not initialized');
    });

    /** @aiContributed-2026-02-03 */
    it('should return tickets with all fields populated correctly', async () => {
        const ticket = {
            title: 'Detailed Ticket',
            status: 'blocked',
            type: 'ai_to_human',
            description: 'This is a detailed ticket',
            conversationHistory: JSON.stringify([{ message: 'Hello' }]),
            thread: [
                {
                    role: 'user',
                    content: 'Test message',
                    createdAt: '2026-02-01T10:30:00Z',
                },
            ],
        };

        const createdTicket = await createTicket(ticket);
        const tickets = await listTickets();

        expect(tickets).toHaveLength(1);
        expect(tickets[0]).toMatchObject({
            id: createdTicket.id,
            title: ticket.title,
            status: ticket.status,
            type: ticket.type,
            description: ticket.description,
            conversationHistory: ticket.conversationHistory,
            thread: ticket.thread,
        });
    });

    /** @aiContributed-2026-02-03 */
    it('should handle tickets with invalid thread JSON gracefully', async () => {
        const ticket = {
            title: 'Invalid Thread Ticket',
            status: 'open',
            thread: '[Invalid JSON]',
        };

        const createdTicket = await createTicket(ticket);
        const tickets = await listTickets();

        expect(tickets).toHaveLength(1);
        expect(tickets[0].thread).toBeUndefined();
        expect(Logger.warn).toHaveBeenCalledWith(
            `Failed to parse thread for ticket ${createdTicket.id}: SyntaxError: Unexpected token I in JSON at position 0`
        );
    });
});