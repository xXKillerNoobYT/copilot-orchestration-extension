// ./ticketDb.Test.ts
import { updateTicket, initializeTicketDb, createTicket, resetTicketDbForTests } from '../../src/services/ticketDb';
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
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('updateTicket', () => {
    let context: vscode.ExtensionContext;

    beforeEach(async () => {
        context = { extensionPath: '/mock/path' } as vscode.ExtensionContext;
        await initializeTicketDb(context);
    });

    afterEach(() => {
        resetTicketDbForTests();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should update an existing ticket successfully', async () => {
        const ticket = await createTicket({
            title: 'Test Ticket',
            status: 'open',
        });

        const updatedTicket = await updateTicket(ticket.id, { status: 'in-progress' });

        expect(updatedTicket).toEqual({
            ...ticket,
            status: 'in-progress',
            updatedAt: expect.any(String),
        });
        expect(Logger.info).toHaveBeenCalledWith(`Updated ticket: ${ticket.id}`);
    });

    /** @aiContributed-2026-02-03 */
    it('should return null if the ticket does not exist', async () => {
        const result = await updateTicket('non-existent-id', { status: 'done' });

        expect(result).toBeNull();
        expect(Logger.warn).toHaveBeenCalledWith('Ticket non-existent-id not found for update');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle updates with partial fields', async () => {
        const ticket = await createTicket({
            title: 'Partial Update Ticket',
            status: 'open',
        });

        const updatedTicket = await updateTicket(ticket.id, { description: 'Updated description' });

        expect(updatedTicket).toEqual({
            ...ticket,
            description: 'Updated description',
            updatedAt: expect.any(String),
        });
    });

    /** @aiContributed-2026-02-03 */
    it('should throw an error if the database is not initialized', async () => {
        resetTicketDbForTests();

        await expect(updateTicket('some-id', { status: 'done' })).rejects.toThrow(
            'TicketDb not initialized'
        );
    });

    /** @aiContributed-2026-02-03 */
    it('should handle in-memory mode updates', async () => {
        const ticket = await createTicket({
            title: 'In-Memory Ticket',
            status: 'open',
        });

        const updatedTicket = await updateTicket(ticket.id, { status: 'blocked' });

        expect(updatedTicket).toEqual({
            ...ticket,
            status: 'blocked',
            updatedAt: expect.any(String),
        });
    });

    /** @aiContributed-2026-02-03 */
    it('should not update createdAt field during update', async () => {
        const ticket = await createTicket({
            title: 'CreatedAt Test Ticket',
            status: 'open',
        });

        const updatedTicket = await updateTicket(ticket.id, { title: 'Updated Title' });

        expect(updatedTicket).toEqual({
            ...ticket,
            title: 'Updated Title',
            updatedAt: expect.any(String),
        });
        expect(updatedTicket?.createdAt).toBe(ticket.createdAt);
    });

    /** @aiContributed-2026-02-03 */
    it('should log an error if SQLite update fails', async () => {
        const ticket = await createTicket({
            title: 'SQLite Failure Test',
            status: 'open',
        });

        jest.spyOn(Logger, 'error').mockImplementation(() => {});
        jest.spyOn(ticket, 'updatedAt' as keyof typeof ticket).mockImplementation(() => {
            throw new Error('SQLite update failed');
        });

        await expect(updateTicket(ticket.id, { status: 'done' })).rejects.toThrow(
            'SQLite update failed'
        );
        expect(Logger.error).toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle thread updates correctly', async () => {
        const ticket = await createTicket({
            title: 'Thread Update Test',
            status: 'open',
            thread: [{ role: 'user', content: 'Initial message', createdAt: '2026-02-01T10:30:00Z' }],
        });

        const updatedThread = [
            ...ticket.thread!,
            { role: 'assistant', content: 'Response message', createdAt: '2026-02-01T11:00:00Z' },
        ];

        const updatedTicket = await updateTicket(ticket.id, { thread: updatedThread });

        expect(updatedTicket).toEqual({
            ...ticket,
            thread: updatedThread,
            updatedAt: expect.any(String),
        });
    });

    /** @aiContributed-2026-02-03 */
    it('should handle conversationHistory updates correctly', async () => {
        const ticket = await createTicket({
            title: 'Conversation History Test',
            status: 'open',
            conversationHistory: JSON.stringify([{ message: 'Initial history' }]),
        });

        const updatedHistory = JSON.stringify([
            { message: 'Initial history' },
            { message: 'Added history' },
        ]);

        const updatedTicket = await updateTicket(ticket.id, { conversationHistory: updatedHistory });

        expect(updatedTicket).toEqual({
            ...ticket,
            conversationHistory: updatedHistory,
            updatedAt: expect.any(String),
        });
    });
});