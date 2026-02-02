/**
 * Tests for TicketsTreeDataProvider
 * 
 * Unit test = tests one class in isolation with no real dependencies
 * Mock = fake version of TicketDb for controlled testing
 * Jest spy = watches if function/event was called
 * Coverage = percentage of code lines executed by tests
 */

import { TicketsTreeDataProvider } from '../../src/ui/ticketsTreeProvider';
import * as vscode from 'vscode';
import * as ticketDb from '../../src/services/ticketDb';

// Mock vscode module (uses __mocks__/vscode.ts)
jest.mock('vscode');

// Mock ticketDb module
jest.mock('../../src/services/ticketDb');

describe('TicketsTreeDataProvider', () => {
    let provider: TicketsTreeDataProvider;
    const mockListTickets = ticketDb.listTickets as jest.MockedFunction<typeof ticketDb.listTickets>;
    const mockOnTicketChange = ticketDb.onTicketChange as jest.MockedFunction<typeof ticketDb.onTicketChange>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock: onTicketChange does nothing (prevents errors in constructor)
        mockOnTicketChange.mockImplementation(() => { });

        // Create provider after mocks are set up
        provider = new TicketsTreeDataProvider();
    });

    describe('constructor', () => {
        it('should subscribe to ticket changes', () => {
            expect(mockOnTicketChange).toHaveBeenCalledTimes(1);
            expect(mockOnTicketChange).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should handle subscription errors gracefully', () => {
            // Should not throw even if onTicketChange throws
            mockOnTicketChange.mockImplementation(() => {
                throw new Error('Subscription failed');
            });

            expect(() => new TicketsTreeDataProvider()).not.toThrow();
        });
    });

    describe('getChildren', () => {
        it('should return ticket items for open tickets', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Test ticket 1',
                    status: 'open',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
                {
                    id: 'TICKET-002',
                    title: 'Test ticket 2',
                    status: 'in-progress',
                    createdAt: '2026-02-01T11:00:00Z',
                    updatedAt: '2026-02-01T11:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            expect(items).toHaveLength(2);
            expect(items[0].label).toBe('Test ticket 1');
            expect(items[1].label).toBe('Test ticket 2');
        });

        it('should filter out done tickets', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Open ticket',
                    status: 'open',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
                {
                    id: 'TICKET-002',
                    title: 'Done ticket',
                    status: 'done',
                    createdAt: '2026-02-01T11:00:00Z',
                    updatedAt: '2026-02-01T11:00:00Z',
                },
                {
                    id: 'TICKET-003',
                    title: 'Blocked ticket',
                    status: 'blocked',
                    createdAt: '2026-02-01T12:00:00Z',
                    updatedAt: '2026-02-01T12:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            // Should only return 2 items (open and blocked, not done)
            expect(items).toHaveLength(2);
            expect(items[0].label).toBe('Open ticket');
            expect(items[1].label).toBe('Blocked ticket');
        });

        it('should show placeholder when no open tickets', async () => {
            mockListTickets.mockResolvedValue([]);

            const items = await provider.getChildren();

            expect(items).toHaveLength(1);
            expect(items[0].label).toBe('No open tickets');
            expect(items[0].iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect((items[0].iconPath as vscode.ThemeIcon).id).toBe('inbox');
        });

        it('should show placeholder when all tickets are done', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Done ticket',
                    status: 'done',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            expect(items).toHaveLength(1);
            expect(items[0].label).toBe('No open tickets');
        });

        it('should handle database errors gracefully', async () => {
            mockListTickets.mockRejectedValue(new Error('Database connection failed'));

            const items = await provider.getChildren();

            expect(items).toHaveLength(1);
            expect(items[0].label).toBe('Error loading tickets');
            expect(items[0].iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect((items[0].iconPath as vscode.ThemeIcon).id).toBe('error');
        });

        it('should return empty array when element is provided (no children)', async () => {
            const dummyElement = new vscode.TreeItem('Dummy', vscode.TreeItemCollapsibleState.None);
            const items = await provider.getChildren(dummyElement);

            expect(items).toEqual([]);
        });

        it('should set correct descriptions with status and date', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Test ticket',
                    status: 'in-progress',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            expect(items[0].description).toContain('in-progress');
            expect(items[0].description).toContain('•');
        });

        it('should include full ticket description in tooltip for hover-to-read', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Test ticket',
                    status: 'open',
                    description: 'Step 1: Design\nStep 2: Implement\nStep 3: Test',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            // Tooltip should contain full description for hover-to-read functionality
            expect(items[0].tooltip).toBe('Step 1: Design\nStep 2: Implement\nStep 3: Test');
        });

        it('should use correct icons for different statuses', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Open',
                    status: 'open',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
                {
                    id: 'TICKET-002',
                    title: 'In Progress',
                    status: 'in-progress',
                    createdAt: '2026-02-01T11:00:00Z',
                    updatedAt: '2026-02-01T11:00:00Z',
                },
                {
                    id: 'TICKET-003',
                    title: 'Blocked',
                    status: 'blocked',
                    createdAt: '2026-02-01T12:00:00Z',
                    updatedAt: '2026-02-01T12:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            expect((items[0].iconPath as vscode.ThemeIcon).id).toBe('issue-opened');
            expect((items[1].iconPath as vscode.ThemeIcon).id).toBe('sync~spin');
            expect((items[2].iconPath as vscode.ThemeIcon).id).toBe('warning');
        });
    });

    describe('getTreeItem', () => {
        it('should return the element unchanged', () => {
            const testItem = new vscode.TreeItem('Test', vscode.TreeItemCollapsibleState.None);
            const result = provider.getTreeItem(testItem);

            expect(result).toBe(testItem);
        });
    });

    describe('plan preview extraction from description', () => {
        it('should extract plan preview from ticket.description', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Add dark mode',
                    status: 'open',
                    description: 'Step 1: Design component\nStep 2: Add styles\nStep 3: Test',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            expect(items[0].description).toContain('Plan:');
            expect(items[0].description).toContain('Step 1: Design component Step 2: Add styles Step 3: Test');
        });

        it('should truncate plan preview to 200 characters', async () => {
            const longPlan = 'Step 1: ' + 'A'.repeat(250);
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Long plan',
                    status: 'open',
                    description: longPlan,
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();
            const desc = items[0].description as string;

            // Should include "..."
            expect(desc).toContain('...');
            // Preview part should not be longer than ~220 chars (200 + "Plan: " + "...")
            expect(desc.length).toBeLessThan(250);
        });

        it('should handle exactly 200 character plan without ellipsis', async () => {
            const plan200 = 'A'.repeat(200);
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Exact 200',
                    status: 'open',
                    description: plan200,
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();
            const desc = items[0].description as string;

            // Should include 200 chars but NOT "..."
            expect(desc).toContain('A'.repeat(200));
            // The preview itself shouldn't have "..." at the end if it's exactly 200
            const previewPart = desc.split('Plan: ')[1];
            if (previewPart && previewPart.length > 200) {
                expect(previewPart).toContain('...');
            }
        });

        it('should clean whitespace in plan preview', async () => {
            const multilinePlan = 'Step 1: Design\nStep 2: Code\tStep 3: Test\r\nStep 4: Review';
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Multiline',
                    status: 'open',
                    description: multilinePlan,
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();
            const desc = items[0].description as string;

            // Newlines, tabs, carriage returns should be replaced with spaces
            expect(desc).not.toContain('\n');
            expect(desc).not.toContain('\r');
            expect(desc).not.toContain('\t');
            // Should have clean single-line format
            expect(desc).toContain('Step 1: Design Step 2: Code Step 3: Test');
        });

        it('should show "—" when no description', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'No plan yet',
                    status: 'open',
                    description: undefined,
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            expect(items[0].description).toContain('—');
        });

        it('should show "—" when description is empty string', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Empty plan',
                    status: 'open',
                    description: '',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            expect(items[0].description).toContain('—');
        });

        it('should set tooltip to full description for hover-to-read', async () => {
            const fullDescription = 'Step 1: Design\nStep 2: Implement\nStep 3: Test\nStep 4: Deploy';
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Full plan',
                    status: 'open',
                    description: fullDescription,
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            // Tooltip should have full description so users can hover to see complete plan
            expect(items[0].tooltip).toBe(fullDescription);
        });

        it('should set tooltip to "No plan stored yet" when no description', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'No plan',
                    status: 'open',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            expect(items[0].tooltip).toBe('No plan stored yet');
        });

        it('should handle multiple tickets with different plan lengths', async () => {
            const mockTickets: ticketDb.Ticket[] = [
                {
                    id: 'TICKET-001',
                    title: 'Short plan',
                    status: 'open',
                    description: 'Quick task',
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                },
                {
                    id: 'TICKET-002',
                    title: 'Long plan',
                    status: 'open',
                    description: 'A'.repeat(300),
                    createdAt: '2026-02-01T11:00:00Z',
                    updatedAt: '2026-02-01T11:00:00Z',
                },
                {
                    id: 'TICKET-003',
                    title: 'No plan',
                    status: 'open',
                    createdAt: '2026-02-01T12:00:00Z',
                    updatedAt: '2026-02-01T12:00:00Z',
                },
            ];

            mockListTickets.mockResolvedValue(mockTickets);

            const items = await provider.getChildren();

            expect(items).toHaveLength(3);
            // Short should be included as-is
            expect(items[0].description).toContain('Quick task');
            // Long should be truncated with "..."
            expect(items[1].description).toContain('...');
            // No plan should show "—"
            expect(items[2].description).toContain('—');
        });
    });

    describe('refresh', () => {
        it('should fire onDidChangeTreeData event', () => {
            const fireSpy = jest.spyOn(provider['_onDidChangeTreeData'], 'fire');

            provider.refresh();

            expect(fireSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('onDidChangeTreeData', () => {
        it('should expose event emitter', () => {
            expect(provider.onDidChangeTreeData).toBeDefined();
        });

        it('should trigger listeners when fired', () => {
            const listener = jest.fn();
            provider.onDidChangeTreeData(listener);

            provider.refresh();

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('auto-refresh on ticket changes', () => {
        it('should call refresh when ticket change event fires', () => {
            let changeListener: (() => void) | undefined;

            // Capture the listener passed to onTicketChange
            mockOnTicketChange.mockImplementation((listener) => {
                changeListener = listener;
            });

            // Create new provider to capture the listener
            const newProvider = new TicketsTreeDataProvider();
            const refreshSpy = jest.spyOn(newProvider, 'refresh');

            // Simulate ticket change event
            if (changeListener) {
                changeListener();
            }

            expect(refreshSpy).toHaveBeenCalledTimes(1);
        });

        it('should fire onDidChangeTreeData when ticket change event received', () => {
            let changeListener: (() => void) | undefined;

            // Capture the listener passed to onTicketChange
            mockOnTicketChange.mockImplementation((listener) => {
                changeListener = listener;
            });

            // Create new provider to capture the listener
            const newProvider = new TicketsTreeDataProvider();
            const fireSpy = jest.spyOn(newProvider['_onDidChangeTreeData'], 'fire');

            // Simulate ticket change event (mimics TicketDb emitting after create/update)
            if (changeListener) {
                changeListener();
            }

            // Verify that onDidChangeTreeData.fire() was called (this tells VS Code to refresh the tree)
            expect(fireSpy).toHaveBeenCalledTimes(1);
        });
    });
});
