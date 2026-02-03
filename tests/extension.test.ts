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
            cleanupInactiveConversations: jest.fn(async () => { })
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

jest.mock('vscode', () => {
    // EventEmitter implementation for testing
    class EventEmitter {
        private listeners: Array<(e: any) => void> = [];

        get event() {
            return (listener: (e: any) => void) => {
                this.listeners.push(listener);
                return { dispose: () => { } };
            };
        }

        fire(data?: any): void {
            this.listeners.forEach(listener => listener(data));
        }
    }

    return {
        EventEmitter,
        commands: {
            registerCommand: jest.fn((cmd, handler) => ({ dispose: jest.fn() })),
            executeCommand: jest.fn(),
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
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
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
    };
});

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
                    cleanupInactiveConversations: jest.fn(async () => { })
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
                    cleanupInactiveConversations: jest.fn(async () => { })
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

    describe('Context Menu Commands', () => {
        beforeEach(() => {
            // Clear all mocks before each test in this describe block
            jest.clearAllMocks();
        });

        it('should register the COE: View Ticket Progress command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.viewTicketProgress',
                expect.any(Function)
            );
        });

        it('should register the COE: Update Ticket Status command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.updateTicketStatus',
                expect.any(Function)
            );
        });

        it('should register the COE: Add Ticket Comment command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.addTicketComment',
                expect.any(Function)
            );
        });

        it('should execute openTicket when viewTicketProgress is called', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const viewProgressCall = registerCommandCalls.find(
                call => call[0] === 'coe.viewTicketProgress'
            );

            const handler = viewProgressCall![1];

            // Mock TreeItem with command.arguments containing ticket ID
            const mockTreeItem = {
                label: 'Test Ticket',
                command: {
                    command: 'coe.openTicket',
                    arguments: ['TICKET-123']
                }
            };

            // Mock executeCommand to track calls
            const executeCommandSpy = jest.spyOn(vscode.commands, 'executeCommand');

            await handler(mockTreeItem);

            // Verify: openTicket was executed with ticket ID
            expect(executeCommandSpy).toHaveBeenCalledWith('coe.openTicket', 'TICKET-123');
        });

        it('should show warning when viewTicketProgress called with no ticket ID', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const viewProgressCall = registerCommandCalls.find(
                call => call[0] === 'coe.viewTicketProgress'
            );

            const handler = viewProgressCall![1];

            // Mock TreeItem without command/arguments
            const mockTreeItem = {
                label: 'Test Ticket'
            };

            await handler(mockTreeItem);

            // Verify: warning shown
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No ticket selected');
        });

        it('should update ticket status when updateTicketStatus called with selection', async () => {
            const mockTicketDb = require('../src/services/ticketDb');
            mockTicketDb.updateTicket.mockResolvedValue({
                id: 'TICKET-123',
                title: 'Test',
                status: 'done',
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z',
            });

            // Mock showQuickPick to return 'done'
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('done');

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const updateStatusCall = registerCommandCalls.find(
                call => call[0] === 'coe.updateTicketStatus'
            );

            const handler = updateStatusCall![1];

            const mockTreeItem = {
                label: 'Test Ticket',
                command: {
                    command: 'coe.openTicket',
                    arguments: ['TICKET-123']
                }
            };

            await handler(mockTreeItem);

            // Verify: showQuickPick was called with status options
            expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
                ['open', 'in-progress', 'blocked', 'done'],
                expect.objectContaining({
                    placeHolder: expect.stringMatching(/TICKET-123/)
                })
            );

            // Verify: updateTicket was called with new status
            expect(mockTicketDb.updateTicket).toHaveBeenCalledWith(
                'TICKET-123',
                { status: 'done' }
            );

            // Verify: success message shown
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringMatching(/TICKET-123.*done/)
            );
        });

        it('should handle user cancellation in updateTicketStatus', async () => {
            const mockTicketDb = require('../src/services/ticketDb');

            // Mock showQuickPick to return undefined (user cancelled)
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const updateStatusCall = registerCommandCalls.find(
                call => call[0] === 'coe.updateTicketStatus'
            );

            const handler = updateStatusCall![1];

            const mockTreeItem = {
                label: 'Test Ticket',
                command: {
                    command: 'coe.openTicket',
                    arguments: ['TICKET-123']
                }
            };

            await handler(mockTreeItem);

            // Verify: updateTicket was NOT called
            expect(mockTicketDb.updateTicket).not.toHaveBeenCalled();
        });

        it('should show warning when updateTicketStatus ticket not found', async () => {
            const mockTicketDb = require('../src/services/ticketDb');
            mockTicketDb.updateTicket.mockResolvedValue(null); // Ticket not found

            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('done');

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const updateStatusCall = registerCommandCalls.find(
                call => call[0] === 'coe.updateTicketStatus'
            );

            const handler = updateStatusCall![1];

            const mockTreeItem = {
                label: 'Test Ticket',
                command: {
                    command: 'coe.openTicket',
                    arguments: ['TICKET-123']
                }
            };

            await handler(mockTreeItem);

            // Verify: warning shown about ticket not found
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringMatching(/TICKET-123.*not found/)
            );
        });

        it('should add comment to ticket when addTicketComment called', async () => {
            const mockTicketDb = require('../src/services/ticketDb');
            mockTicketDb.getTicket.mockResolvedValue({
                id: 'TICKET-123',
                title: 'Test',
                status: 'open',
                description: 'Original description',
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z',
            });
            mockTicketDb.updateTicket.mockResolvedValue({
                id: 'TICKET-123',
                title: 'Test',
                status: 'open',
                description: 'Updated with comment',
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z',
            });

            // Mock showInputBox to return comment text
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('This is my comment');

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const addCommentCall = registerCommandCalls.find(
                call => call[0] === 'coe.addTicketComment'
            );

            const handler = addCommentCall![1];

            const mockTreeItem = {
                label: 'Test Ticket',
                command: {
                    command: 'coe.openTicket',
                    arguments: ['TICKET-123']
                }
            };

            await handler(mockTreeItem);

            // Verify: showInputBox was called with validation
            expect(vscode.window.showInputBox).toHaveBeenCalledWith(
                expect.objectContaining({
                    prompt: expect.stringMatching(/max 500/),
                    validateInput: expect.any(Function)
                })
            );

            // Verify: getTicket was called
            expect(mockTicketDb.getTicket).toHaveBeenCalledWith('TICKET-123');

            // Verify: updateTicket was called with appended comment
            expect(mockTicketDb.updateTicket).toHaveBeenCalledWith(
                'TICKET-123',
                expect.objectContaining({
                    description: expect.stringMatching(/Original description.*---.*User Comment.*This is my comment/s)
                })
            );

            // Verify: success message shown
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringMatching(/Comment added.*TICKET-123/)
            );
        });

        it('should validate comment length in addTicketComment', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const addCommentCall = registerCommandCalls.find(
                call => call[0] === 'coe.addTicketComment'
            );

            const handler = addCommentCall![1];

            const mockTreeItem = {
                label: 'Test Ticket',
                command: {
                    command: 'coe.openTicket',
                    arguments: ['TICKET-123']
                }
            };

            // Mock showInputBox to capture validator
            let capturedValidator: ((value: string) => string | null) | undefined;
            (vscode.window.showInputBox as jest.Mock).mockImplementation((options: any) => {
                capturedValidator = options.validateInput;
                return Promise.resolve(undefined); // User cancels
            });

            await handler(mockTreeItem);

            // Test validator with long comment
            const longComment = 'x'.repeat(501);
            const validationResult = capturedValidator!(longComment);

            expect(validationResult).toMatch(/too long/i);
        });

        it('should handle user cancellation in addTicketComment', async () => {
            const mockTicketDb = require('../src/services/ticketDb');

            // Mock showInputBox to return undefined (user cancelled)
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const addCommentCall = registerCommandCalls.find(
                call => call[0] === 'coe.addTicketComment'
            );

            const handler = addCommentCall![1];

            const mockTreeItem = {
                label: 'Test Ticket',
                command: {
                    command: 'coe.openTicket',
                    arguments: ['TICKET-123']
                }
            };

            await handler(mockTreeItem);

            // Verify: getTicket was NOT called
            expect(mockTicketDb.getTicket).not.toHaveBeenCalled();
            // Verify: updateTicket was NOT called
            expect(mockTicketDb.updateTicket).not.toHaveBeenCalled();
        });

        it('should show warning when addTicketComment ticket not found', async () => {
            const mockTicketDb = require('../src/services/ticketDb');
            mockTicketDb.getTicket.mockResolvedValue(null); // Ticket not found

            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('My comment');

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const addCommentCall = registerCommandCalls.find(
                call => call[0] === 'coe.addTicketComment'
            );

            const handler = addCommentCall![1];

            const mockTreeItem = {
                label: 'Test Ticket',
                command: {
                    command: 'coe.openTicket',
                    arguments: ['TICKET-123']
                }
            };

            await handler(mockTreeItem);

            // Verify: warning shown about ticket not found
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringMatching(/TICKET-123.*not found/)
            );

            // Verify: updateTicket was NOT called
            expect(mockTicketDb.updateTicket).not.toHaveBeenCalled();
        });
    });

    describe('coe.researchWithAgent command', () => {
        it('should register the COE: Research with Agent command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            // Verify that registerCommand was called with 'coe.researchWithAgent' command
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.researchWithAgent',
                expect.any(Function)
            );
        });

        it('should show info message when Research Agent is disabled in settings', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            // Mock workspace.getConfiguration to return disabled setting
            const mockGetConfiguration = jest.fn(() => ({
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'enableResearchAgent') return false;
                    return defaultValue;
                }),
            }));
            (vscode.workspace as any).getConfiguration = mockGetConfiguration;

            await activate(mockContext);

            // Find the handler for the 'coe.researchWithAgent' command
            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const researchCommandCall = registerCommandCalls.find(
                call => call[0] === 'coe.researchWithAgent'
            );
            expect(researchCommandCall).toBeDefined();

            const researchHandler = researchCommandCall![1];

            // Execute the handler
            await researchHandler();

            // Verify that showInformationMessage was called with disabled message
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Research Agent is disabled')
            );

            // Verify that showInputBox was NOT called
            expect(vscode.window.showInputBox).not.toHaveBeenCalled();
        });

        it('should abort silently when no query is provided', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            // Mock workspace.getConfiguration to return enabled setting
            const mockGetConfiguration = jest.fn(() => ({
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'enableResearchAgent') return true;
                    return defaultValue;
                }),
            }));
            (vscode.workspace as any).getConfiguration = mockGetConfiguration;

            // Mock showInputBox to return undefined (user cancelled)
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const researchCommandCall = registerCommandCalls.find(
                call => call[0] === 'coe.researchWithAgent'
            );

            const researchHandler = researchCommandCall![1];

            // Execute the handler
            await researchHandler();

            // Verify that workspace.openTextDocument was NOT called
            expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();

            // Verify that showErrorMessage was NOT called (silent abort)
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('should abort silently when empty query is provided', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            // Mock workspace.getConfiguration to return enabled setting
            const mockGetConfiguration = jest.fn(() => ({
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'enableResearchAgent') return true;
                    return defaultValue;
                }),
            }));
            (vscode.workspace as any).getConfiguration = mockGetConfiguration;

            // Mock showInputBox to return empty string
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('   ');

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const researchCommandCall = registerCommandCalls.find(
                call => call[0] === 'coe.researchWithAgent'
            );

            const researchHandler = researchCommandCall![1];

            // Execute the handler
            await researchHandler();

            // Verify that workspace.openTextDocument was NOT called
            expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
        });
    });
});