// ./ticketsTreeProvider.Test.ts
import * as vscode from 'vscode';
import { TicketsTreeDataProvider } from '../../src/ui/ticketsTreeProvider';
import { listTickets } from '../../src/services/ticketDb';
import { logError } from '../../src/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
    ThemeIcon: jest.fn(),
    TreeItemCollapsibleState: { None: 0 },
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    listTickets: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('TicketsTreeDataProvider', () => {
    let provider: TicketsTreeDataProvider;

    beforeEach(() => {
        provider = new TicketsTreeDataProvider();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    describe('getChildren', () => {
        /** @aiContributed-2026-02-04 */
        it('should return an empty array if element is provided', async () => {
            const result = await provider.getChildren(new vscode.TreeItem('Test'));
            expect(result).toEqual([]);
        });

        /** @aiContributed-2026-02-04 */
        it('should return a placeholder item if no open tickets are found', async () => {
            (listTickets as jest.Mock).mockResolvedValueOnce([
                { id: '1', title: 'Ticket 1', status: 'done', createdAt: '', updatedAt: '' },
            ]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('No open tickets');
            expect(result[0].iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(result[0].tooltip).toBe('All tickets are completed or no tickets exist');
        });

        /** @aiContributed-2026-02-04 */
        it('should return TreeItems for open tickets', async () => {
            const mockTickets = [
                { id: '1', title: 'Ticket 1', status: 'open', createdAt: '', updatedAt: '' },
                { id: '2', title: 'Ticket 2', status: 'in-progress', createdAt: '', updatedAt: '' },
            ];
            (listTickets as jest.Mock).mockResolvedValueOnce(mockTickets);

            jest.spyOn(provider as unknown as { createTicketItem: (ticket: { id: string; title: string; status: string; createdAt: string; updatedAt: string }) => vscode.TreeItem }, 'createTicketItem').mockImplementation((ticket) => {
                return new vscode.TreeItem(ticket.title);
            });

            const result = await provider.getChildren();

            expect(result).toHaveLength(2);
            expect(result[0].label).toBe('Ticket 1');
            expect(result[1].label).toBe('Ticket 2');
        });

        /** @aiContributed-2026-02-04 */
        it('should return an error item if listTickets throws an error', async () => {
            const error = new Error('Database error');
            (listTickets as jest.Mock).mockRejectedValueOnce(error);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('Error loading tickets');
            expect(result[0].iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(result[0].tooltip).toBe(`Database error: ${error}`);
            expect(logError).toHaveBeenCalledWith(`Failed to load tickets: ${error}`);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle tickets with undefined or missing status gracefully', async () => {
            const mockTickets = [
                { id: '1', title: 'Ticket 1', status: undefined, createdAt: '', updatedAt: '' },
                { id: '2', title: 'Ticket 2', status: 'open', createdAt: '', updatedAt: '' },
            ];
            (listTickets as jest.Mock).mockResolvedValueOnce(mockTickets);

            jest.spyOn(provider as unknown as { createTicketItem: (ticket: { id: string; title: string; status: string | undefined; createdAt: string; updatedAt: string }) => vscode.TreeItem }, 'createTicketItem').mockImplementation((ticket) => {
                return new vscode.TreeItem(ticket.title);
            });

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('Ticket 2');
        });

        /** @aiContributed-2026-02-04 */
        it('should handle an empty ticket list gracefully', async () => {
            (listTickets as jest.Mock).mockResolvedValueOnce([]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('No open tickets');
            expect(result[0].iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(result[0].tooltip).toBe('All tickets are completed or no tickets exist');
        });

        /** @aiContributed-2026-02-04 */
        it('should handle tickets with unexpected properties gracefully', async () => {
            const mockTickets = [
                { id: '1', title: 'Ticket 1', status: 'done', createdAt: '', updatedAt: '' },
                { id: '2', title: 'Ticket 2', status: 'open', createdAt: '', updatedAt: '', extraProp: 'unexpected' },
            ];
            (listTickets as jest.Mock).mockResolvedValueOnce(mockTickets);

            jest.spyOn(provider as unknown as { createTicketItem: (ticket: { id: string; title: string; status: string; createdAt: string; updatedAt: string }) => vscode.TreeItem }, 'createTicketItem').mockImplementation((ticket) => {
                return new vscode.TreeItem(ticket.title);
            });

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('Ticket 2');
        });
    });
});