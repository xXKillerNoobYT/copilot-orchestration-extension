// ./ticketsTreeProvider.Test.ts
import * as vscode from 'vscode';
import { TicketsTreeDataProvider } from '../../src/ui/ticketsTreeProvider';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
    TreeItemCollapsibleState: { None: 0 },
    ThemeIcon: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('TicketsTreeDataProvider', () => {
    let provider: TicketsTreeDataProvider;

    beforeEach(() => {
        provider = new TicketsTreeDataProvider();
    });

    /** @aiContributed-2026-02-03 */
    describe('createTicketItem', () => {
        /** @aiContributed-2026-02-03 */
        it('should create a TreeItem with correct properties for a valid ticket', () => {
            const ticket = {
                id: '1',
                title: 'Test Ticket',
                status: 'Open',
                createdAt: '2023-01-01T00:00:00Z',
                description: 'This is a test ticket description.',
            };

            const mockGetIconForStatus = jest.spyOn(provider as unknown as { getIconForStatus: (status: string) => vscode.ThemeIcon }, 'getIconForStatus').mockReturnValue(new vscode.ThemeIcon('icon'));

            const treeItem = (provider as unknown as { createTicketItem: (ticket: typeof ticket) => vscode.TreeItem }).createTicketItem(ticket);

            expect(treeItem.label).toBe(ticket.title);
            expect(treeItem.description).toBe('Open • 1/1/2023 • Plan: This is a test ticket description.');
            expect(treeItem.tooltip).toBe(ticket.description);
            expect(treeItem.iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(treeItem.command).toEqual({
                command: 'coe.openTicket',
                title: 'Open Ticket',
                arguments: [ticket.id],
            });
            expect(treeItem.contextValue).toBe('ticket');
            expect(mockGetIconForStatus).toHaveBeenCalledWith(ticket.status);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle tickets with no description', () => {
            const ticket = {
                id: '2',
                title: 'No Description Ticket',
                status: 'Closed',
                createdAt: '2023-01-02T00:00:00Z',
                description: undefined,
            };

            const mockGetIconForStatus = jest.spyOn(provider as unknown as { getIconForStatus: (status: string) => vscode.ThemeIcon }, 'getIconForStatus').mockReturnValue(new vscode.ThemeIcon('icon'));

            const treeItem = (provider as unknown as { createTicketItem: (ticket: typeof ticket) => vscode.TreeItem }).createTicketItem(ticket);

            expect(treeItem.description).toBe('Closed • 1/2/2023 • Plan: —');
            expect(treeItem.tooltip).toBe('No plan stored yet');
            expect(mockGetIconForStatus).toHaveBeenCalledWith(ticket.status);
        });

        /** @aiContributed-2026-02-03 */
        it('should truncate long descriptions to 200 characters', () => {
            const longDescription = 'a'.repeat(250);
            const ticket = {
                id: '3',
                title: 'Long Description Ticket',
                status: 'In Progress',
                createdAt: '2023-01-03T00:00:00Z',
                description: longDescription,
            };

            const mockGetIconForStatus = jest.spyOn(provider as unknown as { getIconForStatus: (status: string) => vscode.ThemeIcon }, 'getIconForStatus').mockReturnValue(new vscode.ThemeIcon('icon'));

            const treeItem = (provider as unknown as { createTicketItem: (ticket: typeof ticket) => vscode.TreeItem }).createTicketItem(ticket);

            expect(treeItem.description).toContain('Plan: ' + 'a'.repeat(200) + '...');
            expect(treeItem.tooltip).toBe(longDescription);
            expect(mockGetIconForStatus).toHaveBeenCalledWith(ticket.status);
        });

        /** @aiContributed-2026-02-03 */
        it('should clean whitespace from descriptions', () => {
            const ticket = {
                id: '4',
                title: 'Whitespace Ticket',
                status: 'Resolved',
                createdAt: '2023-01-04T00:00:00Z',
                description: '   Line 1\nLine 2\tLine 3\r\n   ',
            };

            const mockGetIconForStatus = jest.spyOn(provider as unknown as { getIconForStatus: (status: string) => vscode.ThemeIcon }, 'getIconForStatus').mockReturnValue(new vscode.ThemeIcon('icon'));

            const treeItem = (provider as unknown as { createTicketItem: (ticket: typeof ticket) => vscode.TreeItem }).createTicketItem(ticket);

            expect(treeItem.description).toContain('Plan: Line 1 Line 2 Line 3');
            expect(treeItem.tooltip).toBe('Line 1 Line 2 Line 3');
            expect(mockGetIconForStatus).toHaveBeenCalledWith(ticket.status);
        });

        /** @aiContributed-2026-02-03 */
        it('should throw an error if ticket is null or undefined', () => {
            expect(() => (provider as unknown as { createTicketItem: (ticket: null | undefined) => vscode.TreeItem }).createTicketItem(null)).toThrow();
            expect(() => (provider as unknown as { createTicketItem: (ticket: null | undefined) => vscode.TreeItem }).createTicketItem(undefined)).toThrow();
        });

        /** @aiContributed-2026-02-03 */
        it('should handle tickets with empty title', () => {
            const ticket = {
                id: '5',
                title: '',
                status: 'Pending',
                createdAt: '2023-01-05T00:00:00Z',
                description: 'Empty title ticket description.',
            };

            const mockGetIconForStatus = jest.spyOn(provider as unknown as { getIconForStatus: (status: string) => vscode.ThemeIcon }, 'getIconForStatus').mockReturnValue(new vscode.ThemeIcon('icon'));

            const treeItem = (provider as unknown as { createTicketItem: (ticket: typeof ticket) => vscode.TreeItem }).createTicketItem(ticket);

            expect(treeItem.label).toBe('');
            expect(treeItem.description).toBe('Pending • 1/5/2023 • Plan: Empty title ticket description.');
            expect(treeItem.tooltip).toBe(ticket.description);
            expect(mockGetIconForStatus).toHaveBeenCalledWith(ticket.status);
        });
    });
});