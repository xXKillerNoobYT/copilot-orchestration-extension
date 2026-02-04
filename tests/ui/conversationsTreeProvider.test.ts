/**
 * Tests for ConversationsTreeDataProvider
 * 
 * Now tests real data loading from TicketDb and JSON parsing.
 */

import * as vscode from 'vscode';
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';

// Mock vscode module
jest.mock('vscode');

// Mock ticketDb
jest.mock('../../src/services/ticketDb', () => ({
    listTickets: jest.fn(),
    onTicketChange: jest.fn(),
}));

// Mock orchestrator for in-memory AnswerAgent conversations
jest.mock('../../src/services/orchestrator', () => ({
    getOrchestratorInstance: jest.fn(),
}));

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));

import { listTickets, onTicketChange } from '../../src/services/ticketDb';
import { getOrchestratorInstance } from '../../src/services/orchestrator';
import { logError, logInfo, logWarn } from '../../src/logger';

describe('ConversationsTreeDataProvider', () => {
    let provider: ConversationsTreeDataProvider;
    let mockListTickets: jest.Mock;
    let mockOnTicketChange: jest.Mock;
    let mockGetOrchestratorInstance: jest.Mock;
    let mockGetActiveConversations: jest.Mock;
    let capturedListener: (() => void) | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        mockListTickets = listTickets as jest.Mock;
        mockOnTicketChange = onTicketChange as jest.Mock;
        mockGetOrchestratorInstance = getOrchestratorInstance as jest.Mock;
        mockGetActiveConversations = jest.fn().mockReturnValue([]);

        mockListTickets.mockResolvedValue([]);
        mockOnTicketChange.mockImplementation((callback: () => void) => {
            capturedListener = callback;
        });
        mockGetOrchestratorInstance.mockReturnValue({
            getAnswerAgent: () => ({
                getActiveConversations: mockGetActiveConversations
            })
        });

        provider = new ConversationsTreeDataProvider();
    });

    describe('constructor', () => {
        it('should subscribe to ticket changes on instantiation', () => {
            expect(mockOnTicketChange).toHaveBeenCalled();
        });

        it('should handle subscription errors gracefully', () => {
            mockOnTicketChange.mockImplementationOnce(() => {
                throw new Error('Subscription failed');
            });

            expect(() => new ConversationsTreeDataProvider()).not.toThrow();
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Failed to subscribe to ticket changes')
            );
        });
    });

    describe('getTreeItem', () => {
        it('should return the element as-is', () => {
            const mockItem = new vscode.TreeItem('Test Item', vscode.TreeItemCollapsibleState.None);
            const result = provider.getTreeItem(mockItem);
            expect(result).toBe(mockItem);
        });
    });

    describe('getChildren', () => {
        it('should return empty array when element is provided (flat list)', async () => {
            const mockElement = new vscode.TreeItem('Parent', vscode.TreeItemCollapsibleState.None);
            const result = await provider.getChildren(mockElement);
            expect(result).toEqual([]);
        });

        it('should return placeholder when no conversations exist', async () => {
            mockListTickets.mockResolvedValueOnce([]);
            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('No active conversations');
            expect(result[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
        });

        it('should create TreeItem for a valid conversation ticket', async () => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-02-03T00:03:00.000Z'));

            const history = {
                chatId: 'TICKET-1',
                createdAt: '2026-02-03T00:00:00.000Z',
                lastActivityAt: '2026-02-03T00:01:00.000Z',
                messages: [
                    { role: 'user', content: 'How do I use COE?' },
                    { role: 'assistant', content: 'Here is how you use it.' },
                ],
            };

            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-1',
                    title: 'Answer Agent Conversation',
                    status: 'open',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    updatedAt: '2026-02-03T00:01:00.000Z',
                    conversationHistory: JSON.stringify(history),
                },
            ]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('User: How do I use COE?');
            expect(result[0].description).toBe('Last active: 2 minutes ago | 2 messages');
            expect(result[0].tooltip).toBe('Click to continue chat');
            expect(result[0].iconPath).toBeInstanceOf(vscode.ThemeIcon);
            expect(result[0].contextValue).toBe('coe-conversation');
            expect(result[0].command).toBeDefined();
            expect(result[0].command?.command).toBe('coe.openTicket');
            expect(result[0].command?.arguments).toEqual(['TICKET-1']);

            jest.useRealTimers();
        });

        it('should skip tickets with invalid JSON and show placeholder', async () => {
            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-BAD',
                    title: 'Bad Ticket',
                    status: 'open',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    updatedAt: '2026-02-03T00:01:00.000Z',
                    conversationHistory: 'not-json',
                },
            ]);

            const result = await provider.getChildren();

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Skipping ticket TICKET-BAD')
            );
            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('No active conversations');
        });

        it('should fall back to message count when timestamps are missing', async () => {
            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-NO-TIME',
                    title: 'No Time Ticket',
                    status: 'open',
                    createdAt: '',
                    updatedAt: '',
                    conversationHistory: JSON.stringify([
                        { role: 'user', content: 'Hello' },
                        { role: 'assistant', content: 'Hi there!' },
                        { role: 'user', content: 'Thanks' },
                    ]),
                },
            ]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('3 messages');
        });

        it('should ignore tickets with empty conversation arrays', async () => {
            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-EMPTY',
                    title: 'Empty Ticket',
                    status: 'open',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    updatedAt: '2026-02-03T00:01:00.000Z',
                    conversationHistory: '[]',
                },
            ]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('No active conversations');
        });

        it('should include answer_agent tickets even when type is set', async () => {
            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-ANSWER',
                    title: 'Answer Agent Ticket',
                    status: 'open',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    updatedAt: '2026-02-03T00:01:00.000Z',
                    type: 'answer_agent',
                    conversationHistory: JSON.stringify({
                        chatId: 'TICKET-ANSWER',
                        createdAt: '2026-02-03T00:00:00.000Z',
                        lastActivityAt: '2026-02-03T00:01:00.000Z',
                        messages: [{ role: 'user', content: 'Hello Answer' }],
                    }),
                },
            ]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toContain('User:');
        });

        it('should show empty answer_agent tickets as new chats', async () => {
            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-EMPTY-ANSWER',
                    title: 'Empty Answer Agent Ticket',
                    status: 'open',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    updatedAt: '2026-02-03T00:01:00.000Z',
                    type: 'answer_agent'
                },
            ]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('New chat (TICKET-EMPTY-ANSWER)');
            expect(result[0].description).toContain('0 messages');
        });

        it('should merge active conversations with tickets and prefer memory', async () => {
            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-MEMORY',
                    title: 'Answer Agent Ticket',
                    status: 'open',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    updatedAt: '2026-02-03T00:01:00.000Z',
                    type: 'answer_agent',
                    conversationHistory: JSON.stringify({
                        chatId: 'TICKET-MEMORY',
                        createdAt: '2026-02-03T00:00:00.000Z',
                        lastActivityAt: '2026-02-03T00:01:00.000Z',
                        messages: [{ role: 'user', content: 'Old history' }],
                    }),
                },
            ]);

            mockGetActiveConversations.mockReturnValueOnce([
                {
                    chatId: 'TICKET-MEMORY',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    lastActivityAt: '2026-02-03T00:02:00.000Z',
                    messages: [
                        { role: 'user', content: 'Live history' },
                        { role: 'assistant', content: 'Live answer' }
                    ]
                }
            ]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('User: Live history');
            expect(result[0].description).toContain('2 messages');
        });

        it('should skip unexpected conversation formats', async () => {
            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-WEIRD',
                    title: 'Weird Ticket',
                    status: 'open',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    updatedAt: '2026-02-03T00:01:00.000Z',
                    conversationHistory: JSON.stringify({ foo: 'bar' }),
                },
            ]);

            const result = await provider.getChildren();

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('unexpected conversation format')
            );
            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('No active conversations');
        });

        it('should handle database errors gracefully', async () => {
            mockListTickets.mockRejectedValueOnce(new Error('DB down'));
            const result = await provider.getChildren();

            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load conversations')
            );
            expect(result[0].label).toBe('Error loading conversations');
        });
    });

    describe('auto-refresh on ticket changes', () => {
        it('should refresh when ticket change event fires', () => {
            const refreshSpy = jest.spyOn(provider, 'refresh');

            capturedListener?.();

            expect(refreshSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('refresh', () => {
        it('should fire onDidChangeTreeData event', () => {
            const mockFire = jest.fn();
            (provider as any)._onDidChangeTreeData.fire = mockFire;

            provider.refresh();

            expect(mockFire).toHaveBeenCalledTimes(1);
        });

        it('should log info message when refreshing', () => {
            jest.clearAllMocks();
            provider.refresh();
            expect(logInfo).toHaveBeenCalledWith('[ConversationsTreeProvider] Refreshing...');
        });
    });

    describe('onDidChangeTreeData', () => {
        it('should expose the event emitter', () => {
            expect(provider.onDidChangeTreeData).toBeDefined();
            expect(typeof provider.onDidChangeTreeData).toBe('function');
        });
    });

    describe('contextValue and command integration', () => {
        it('should set contextValue on all conversation items', async () => {
            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-CTX',
                    title: 'Context Test',
                    status: 'open',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    updatedAt: '2026-02-03T00:01:00.000Z',
                    type: 'answer_agent',
                    conversationHistory: JSON.stringify({
                        chatId: 'TICKET-CTX',
                        createdAt: '2026-02-03T00:00:00.000Z',
                        lastActivityAt: '2026-02-03T00:01:00.000Z',
                        messages: [{ role: 'user', content: 'Test' }],
                    }),
                },
            ]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].contextValue).toBe('coe-conversation');
        });

        it('should include command with chatId for context menu handlers', async () => {
            mockListTickets.mockResolvedValueOnce([
                {
                    id: 'TICKET-CMD',
                    title: 'Command Test',
                    status: 'open',
                    createdAt: '2026-02-03T00:00:00.000Z',
                    updatedAt: '2026-02-03T00:01:00.000Z',
                    type: 'answer_agent',
                    conversationHistory: JSON.stringify({
                        chatId: 'TICKET-CMD',
                        createdAt: '2026-02-03T00:00:00.000Z',
                        lastActivityAt: '2026-02-03T00:01:00.000Z',
                        messages: [],
                    }),
                },
            ]);

            const result = await provider.getChildren();

            expect(result).toHaveLength(1);
            expect(result[0].command).toBeDefined();
            expect(result[0].command?.command).toBe('coe.openTicket');
            expect(result[0].command?.arguments).toEqual(['TICKET-CMD']);
        });
    });
});
