import * as vscode from 'vscode';
import { activate } from '../src/extension';

// Mock all dependencies before importing activate
jest.mock('../src/logger', () => ({
    initializeLogger: jest.fn(),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../src/services/ticketDb', () => ({
    initializeTicketDb: jest.fn(),
    createTicket: jest.fn(),
    updateTicket: jest.fn(),
    listTickets: jest.fn(),
    getTicket: jest.fn(),
    onTicketChange: jest.fn(),
}));

jest.mock('../src/services/orchestrator', () => ({
    initializeOrchestrator: jest.fn(),
    getOrchestratorInstance: jest.fn(() => ({
        routeToPlanningAgent: jest.fn(async () => 'Mocked plan response'),
        routeToVerificationAgent: jest.fn(async () => ({
            passed: true,
            explanation: 'All criteria met'
        })),
        getAnswerAgent: jest.fn(() => ({
            cleanupInactiveConversations: jest.fn(async () => {})
        }))
    })),
}));

jest.mock('../src/services/llmService', () => ({
    initializeLLMService: jest.fn(),
}));

jest.mock('../src/mcpServer/mcpServer', () => ({
    startMCPServer: jest.fn(),
}));

jest.mock('../src/ui/agentsTreeProvider', () => ({
    AgentsTreeDataProvider: jest.fn(() => ({
        refresh: jest.fn(),
    })),
}));

jest.mock('../src/ui/ticketsTreeProvider', () => ({
    TicketsTreeDataProvider: jest.fn(() => ({
        refresh: jest.fn(),
    })),
}));

jest.mock('vscode', () => ({
    commands: {
        registerCommand: jest.fn((cmd, handler) => ({ dispose: jest.fn() })),
    },
    window: {
        registerTreeDataProvider: jest.fn(() => ({ dispose: jest.fn() })),
        createStatusBarItem: jest.fn(() => ({
            text: '',
            show: jest.fn(),
            dispose: jest.fn(),
        })),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showTextDocument: jest.fn().mockResolvedValue(undefined),
    },
    workspace: {
        openTextDocument: jest.fn().mockResolvedValue({
            uri: { scheme: 'untitled' },
            languageId: 'markdown',
            getText: jest.fn().mockReturnValue(''),
        }),
    },
    ViewColumn: {
        One: 1,
        Two: 2,
    },
    StatusBarAlignment: {
        Right: 1,
    },
}));

describe('Extension Commands', () => {
    it('should register the COE: Plan Task command', async () => {
        // Create mock context with subscriptions array
        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        // Manually call activate() because Jest does not run the extension host —
        // this simulates real startup and triggers all registerCommand calls
        await activate(mockContext);

        // Verify that registerCommand was called with 'coe.planTask' command
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('coe.planTask', expect.any(Function));

        // Find the handler for the 'coe.planTask' command
        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const planTaskCall = registerCommandCalls.find(call => call[0] === 'coe.planTask');
        expect(planTaskCall).toBeDefined();

        const planTaskHandler = planTaskCall![1];

        // Execute the handler
        await planTaskHandler();

        // Verify that showInformationMessage was called with expected message
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Plan generated: Mocked plan response...'
        );
    });

    it('should register the COE: Verify Task command', async () => {
        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        await activate(mockContext);

        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('coe.verifyTask', expect.any(Function));

        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const verifyTaskCall = registerCommandCalls.find(call => call[0] === 'coe.verifyTask');
        expect(verifyTaskCall).toBeDefined();

        const verifyTaskHandler = verifyTaskCall![1];
        await verifyTaskHandler();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Verification PASSED: All criteria met'
        );
    });

    it('should register the COE: Ask Answer Agent command', async () => {
        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        await activate(mockContext);

        // Verify that registerCommand was called with 'coe.askAnswerAgent' command
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('coe.askAnswerAgent', expect.any(Function));

        // Find the handler for the 'coe.askAnswerAgent' command
        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const askAnswerAgentCall = registerCommandCalls.find(call => call[0] === 'coe.askAnswerAgent');
        expect(askAnswerAgentCall).toBeDefined();

        const askAnswerAgentHandler = askAnswerAgentCall![1];

        // Execute the handler
        await askAnswerAgentHandler();

        // Verify that showInformationMessage was called with expected message
        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should register the COE: Open Ticket command', async () => {
        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        await activate(mockContext);

        // Verify that registerCommand was called with 'coe.openTicket' command
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('coe.openTicket', expect.any(Function));

        // Find the handler for the 'coe.openTicket' command
        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const openTicketCall = registerCommandCalls.find(call => call[0] === 'coe.openTicket');
        expect(openTicketCall).toBeDefined();
    });

    it('should open a ticket with description when clicked', async () => {
        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        // Mock getTicket to return a ticket with description
        const mockTicketDb = require('../src/services/ticketDb');
        mockTicketDb.getTicket.mockResolvedValue({
            id: 'TICKET-123',
            title: 'Add dark mode toggle',
            status: 'open',
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '2026-02-01T10:00:00Z',
            description: '# Plan\nStep 1: Design\nStep 2: Code'
        });

        await activate(mockContext);

        // Find the handler for the 'coe.openTicket' command
        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const openTicketCall = registerCommandCalls.find(call => call[0] === 'coe.openTicket');

        if (openTicketCall) {
            const openTicketHandler = openTicketCall[1];

            // Execute the handler with a ticket ID
            await openTicketHandler('TICKET-123');

            // Verify: getTicket was called with the correct ticket ID
            expect(mockTicketDb.getTicket).toHaveBeenCalledWith('TICKET-123');

            // Verify: workspace.openTextDocument was called
            const vscodeModule = require('vscode');
            expect(vscodeModule.workspace?.openTextDocument).toHaveBeenCalledWith({
                content: '# Plan\nStep 1: Design\nStep 2: Code',
                language: 'markdown'
            });
        }
    });

    it('should show fallback content when ticket has no description', async () => {
        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        // Mock getTicket to return a ticket without description
        const mockTicketDb = require('../src/services/ticketDb');
        mockTicketDb.getTicket.mockResolvedValue({
            id: 'TICKET-456',
            title: 'Fix bug',
            status: 'open',
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '2026-02-01T10:00:00Z',
            // No description
        });

        await activate(mockContext);

        // Find and execute the handler
        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const openTicketCall = registerCommandCalls.find(call => call[0] === 'coe.openTicket');

        if (openTicketCall) {
            const openTicketHandler = openTicketCall[1];
            await openTicketHandler('TICKET-456');

            // Verify: fallback content was used
            const vscodeModule = require('vscode');
            expect(vscodeModule.workspace?.openTextDocument).toHaveBeenCalledWith({
                content: expect.stringMatching(/No Plan Yet/),
                language: 'markdown'
            });
        }
    });

    it('should show warning when ticket not found', async () => {
        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        // Mock getTicket to return null (ticket not found)
        const mockTicketDb = require('../src/services/ticketDb');
        mockTicketDb.getTicket.mockResolvedValue(null);

        await activate(mockContext);

        // Find and execute the handler
        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const openTicketCall = registerCommandCalls.find(call => call[0] === 'coe.openTicket');

        if (openTicketCall) {
            const openTicketHandler = openTicketCall[1];
            await openTicketHandler('TICKET-MISSING');

            // Verify: warning message was shown
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringMatching(/TICKET-MISSING/)
            );
        }
    });

    describe('Orchestration Flow', () => {
        it('should register the COE: Verify Last Ticket command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            // Verify the command is registered
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.verifyLastTicket',
                expect.any(Function)
            );
        });

        it('should handle verify last ticket with PASS result', async () => {
            // Setup: Mock listTickets to return an open ticket
            const mockTicketDb = require('../src/services/ticketDb');
            const openTicket = {
                id: 'TICKET-001',
                title: 'Add feature',
                type: 'ai_to_human',
                status: 'open',
                description: 'Step 1: Do X',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            mockTicketDb.listTickets.mockResolvedValue([openTicket]);

            const mockOrchestrator = require('../src/services/orchestrator');
            mockOrchestrator.getOrchestratorInstance = jest.fn(() => ({
                routeToVerificationAgent: jest.fn(async () => ({
                    passed: true,
                    explanation: 'All criteria met'
                })),
                getAnswerAgent: jest.fn(() => ({
                    cleanupInactiveConversations: jest.fn(async () => {})
                }))
            }));

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            // Get the verify command handler
            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const verifyLastCall = registerCommandCalls.find(
                call => call[0] === 'coe.verifyLastTicket'
            );
            expect(verifyLastCall).toBeDefined();

            const handler = verifyLastCall![1];
            await handler();

            // Verify: ticket status updated to done
            expect(mockTicketDb.updateTicket).toHaveBeenCalledWith(
                'TICKET-001',
                { status: 'done' }
            );

            // Verify: success message shown
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringMatching(/TICKET-001/)
            );
        });

        it('should handle verify last ticket with FAIL result', async () => {
            const mockTicketDb = require('../src/services/ticketDb');
            const openTicket = {
                id: 'TICKET-002',
                title: 'Add feature 2',
                type: 'ai_to_human',
                status: 'open',
                description: 'Step 1: Do Y',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            mockTicketDb.listTickets.mockResolvedValue([openTicket]);

            const mockOrchestrator = require('../src/services/orchestrator');
            mockOrchestrator.getOrchestratorInstance = jest.fn(() => ({
                routeToVerificationAgent: jest.fn(async () => ({
                    passed: false,
                    explanation: 'Missing criteria'
                })),
                getAnswerAgent: jest.fn(() => ({
                    cleanupInactiveConversations: jest.fn(async () => {})
                }))
            }));

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const verifyLastCall = registerCommandCalls.find(
                call => call[0] === 'coe.verifyLastTicket'
            );

            const handler = verifyLastCall![1];
            await handler();

            // Verify: ticket status set to blocked
            expect(mockTicketDb.updateTicket).toHaveBeenCalledWith(
                'TICKET-002',
                { status: 'blocked' }
            );

            // Verify: warning shown
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringMatching(/TICKET-002/)
            );
        });

        it('should show info message when no open ticket exists', async () => {
            const mockTicketDb = require('../src/services/ticketDb');
            mockTicketDb.listTickets.mockResolvedValue([]); // No tickets

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const verifyLastCall = registerCommandCalls.find(
                call => call[0] === 'coe.verifyLastTicket'
            );

            const handler = verifyLastCall![1];
            await handler();

            // Verify: info message about no open ticket
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringMatching(/No open ticket/)
            );
        });

        it('should setup auto-planning listener on startup', async () => {
            const mockTicketDb = require('../src/services/ticketDb');

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            // Verify: onTicketChange was called to register listener
            expect(mockTicketDb.onTicketChange).toHaveBeenCalledWith(expect.any(Function));
        });
    });
});