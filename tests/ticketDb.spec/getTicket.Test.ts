// ./ticketDb.Test.ts
import { getTicket, initializeTicketDb, resetTicketDbForTests, createTicket } from '../../src/services/ticketDb';
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
describe('getTicket', () => {
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
    it('should return the ticket when it exists in memory', async () => {
        const ticket = {
            title: 'Test Ticket',
            status: 'open',
        };

        const createdTicket = await createTicket(ticket);
        const result = await getTicket(createdTicket.id);

        expect(result).toEqual(createdTicket);
        expect(Logger.info).toHaveBeenCalledWith(`Created ticket: ${createdTicket.id}`);
    });

    /** @aiContributed-2026-02-03 */
    it('should return null when the ticket does not exist', async () => {
        const result = await getTicket('non-existent-id');
        expect(result).toBeNull();
    });

    /** @aiContributed-2026-02-03 */
    it('should throw an error if the database is not initialized', async () => {
        resetTicketDbForTests();

        await expect(getTicket('any-id')).rejects.toThrow('TicketDb not initialized');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle SQLite fallback to in-memory mode gracefully', async () => {
        jest.spyOn(Logger, 'warn').mockImplementation(() => {});
        jest.spyOn(Logger, 'info').mockImplementation(() => {});

        const ticket = {
            title: 'Fallback Test Ticket',
            status: 'open',
        };

        const createdTicket = await createTicket(ticket);
        const result = await getTicket(createdTicket.id);

        expect(result).toEqual(createdTicket);
        expect(Logger.info).toHaveBeenCalledWith(`Created ticket: ${createdTicket.id}`);
        expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('SQLite init failed'));
    });

    /** @aiContributed-2026-02-03 */
    it('should parse thread data correctly when present', async () => {
        const ticket = {
            title: 'Thread Test Ticket',
            status: 'open',
            thread: [
                { role: 'user', content: 'Message 1', createdAt: '2026-02-01T10:30:00Z' },
                { role: 'assistant', content: 'Message 2', createdAt: '2026-02-01T10:35:00Z' },
            ],
        };

        const createdTicket = await createTicket(ticket);
        const result = await getTicket(createdTicket.id);

        expect(result?.thread).toEqual(ticket.thread);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle invalid thread data gracefully', async () => {
        jest.spyOn(Logger, 'warn').mockImplementation(() => {});

        const ticket = {
            title: 'Invalid Thread Test Ticket',
            status: 'open',
            thread: '[Invalid JSON]',
        };

        const createdTicket = await createTicket(ticket);
        const result = await getTicket(createdTicket.id);

        expect(result?.thread).toBeUndefined();
        expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to parse thread'));
    });
});