import * as vscode from 'vscode';
import { activate, deactivate, updateStatusBar } from '../src/extension';
import { DEFAULT_CONFIG } from '../src/config/schema';

// Mock config module first - return default config
jest.mock('../src/config', () => ({
    initializeConfig: jest.fn(),
    getConfigInstance: jest.fn(() => DEFAULT_CONFIG),
    resetConfigForTests: jest.fn(),
}));

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
    listTickets: jest.fn().mockResolvedValue([]),
    getTicket: jest.fn(),
    onTicketChange: jest.fn(),
}));

jest.mock('../src/services/orchestrator', () => {
    const mockAnswerAgent = {
        cleanupInactiveConversations: jest.fn(async () => { }),
        deserializeHistory: jest.fn(),
        serializeHistory: jest.fn(() => ({}))
    };

    const mockOrchestratorInstance = {
        routeToPlanningAgent: jest.fn(async () => 'Mocked plan response'),
        routeToVerificationAgent: jest.fn(async () => ({
            passed: true,
            explanation: 'All criteria met'
        })),
        refreshQueueFromTickets: jest.fn(async () => { }),
        getQueueDetails: jest.fn(async () => ({
            queueTitles: [],
            pickedTitles: [],
            blockedP1Titles: [],
            lastPickedTitle: null,
            lastPickedAt: null
        })),
        getAnswerAgent: jest.fn(() => mockAnswerAgent),
        processConversationTicket: jest.fn(async () => { })
    };

    return {
        __mockAnswerAgent: mockAnswerAgent,
        initializeOrchestrator: jest.fn(),
        answerQuestion: jest.fn(async () => 'Mocked answer'),
        processConversationTicket: jest.fn(async () => { }),
        getOrchestratorInstance: jest.fn(() => mockOrchestratorInstance),
        __mockOrchestratorInstance: mockOrchestratorInstance,
    };
});

jest.mock('../src/services/llmService', () => ({
    initializeLLMService: jest.fn(),
}));

jest.mock('../src/mcpServer', () => ({
    initializeMCPServer: jest.fn(),
}));

jest.mock('../src/agents/answerAgent', () => ({
    initializeAnswerAgent: jest.fn(),
    createChatId: jest.fn(() => 'test-chat-id'),
    persistAnswerAgentHistory: jest.fn(() => ({})),
    restoreAnswerAgentHistory: jest.fn(),
    getAnswerQuestion: jest.fn(),
    getActiveConversations: jest.fn(),
}));

jest.mock('../src/ui/conversationWebview', () => ({
    ConversationWebviewPanel: {
        disposeAll: jest.fn(),
    },
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

jest.mock('../src/ui/orchestratorStatusTreeProvider', () => ({
    OrchestratorStatusTreeDataProvider: jest.fn(() => ({
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
            withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
        },
        workspace: {
            openTextDocument: jest.fn().mockResolvedValue({
                uri: { scheme: 'untitled' },
                languageId: 'markdown',
                getText: jest.fn().mockReturnValue(''),
            }),
            getConfiguration: jest.fn(() => ({
                get: jest.fn(),
                update: jest.fn(),
            })),
        },
        ProgressLocation: {
            Notification: 15,
            Window: 10,
            SourceControl: 1,
        },
        ViewColumn: {
            One: 1,
            Two: 2,
        },
        StatusBarAlignment: {
            Right: 1,
        },
        ConfigurationTarget: {
            Global: 1,
            Workspace: 2,
            WorkspaceFolder: 3,
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
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as any;

        const mockTicketDb = require('../src/services/ticketDb');
        const mockOrchestrator = require('../src/services/orchestrator');
        const createdTicket = {
            id: 'TICKET-ASK-1',
            title: 'User Question: Test',
            status: 'open',
            createdAt: '2026-02-03T00:00:00.000Z',
            updatedAt: '2026-02-03T00:00:00.000Z'
        };

        mockTicketDb.createTicket.mockResolvedValue(createdTicket);
        (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Test question');

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

        expect(mockTicketDb.createTicket).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'open',
                type: 'human_to_ai',
                thread: expect.any(Array)
            })
        );
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

        it('should register the COE: Reply Conversation command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.replyConversation',
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

    describe('coe.processTicket command', () => {
        it('should register the COE: Process Ticket command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.processTicket',
                expect.any(Function)
            );
        });

        it('should process ticket by calling planning agent', async () => {
            const mockTicketDb = require('../src/services/ticketDb');
            const mockOrchestrator = require('../src/services/orchestrator');

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            const mockRouteToPlanningAgent = jest.fn(async () => 'Generated plan for ticket');

            const answerAgent = {
                cleanupInactiveConversations: jest.fn(async () => { }),
                deserializeHistory: jest.fn(),
                serializeHistory: jest.fn(() => ({}))
            };

            mockOrchestrator.getOrchestratorInstance.mockReturnValue({
                routeToPlanningAgent: mockRouteToPlanningAgent,
                routeToVerificationAgent: jest.fn(async () => ({
                    passed: true,
                    explanation: 'All criteria met'
                })),
                getAnswerAgent: jest.fn(() => answerAgent)
            });

            mockTicketDb.getTicket.mockResolvedValue({
                id: 'TICKET-123',
                title: 'Test ticket to process',
                status: 'open',
                type: 'ai_to_human',
            });

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const processTicketCall = registerCommandCalls.find(
                call => call[0] === 'coe.processTicket'
            );
            expect(processTicketCall).toBeDefined();

            const processTicketHandler = processTicketCall![1];

            jest.clearAllMocks();

            const mockTreeItem = {
                label: 'Test ticket',
                description: 'open',
                command: {
                    command: 'coe.openTicket',
                    title: 'Open Ticket',
                    arguments: ['TICKET-123']
                }
            } as vscode.TreeItem;

            await processTicketHandler(mockTreeItem);

            // Verify planning agent was called with ticket title
            expect(mockRouteToPlanningAgent).toHaveBeenCalledWith('Test ticket to process');

            // Verify ticket was updated with plan and status
            expect(mockTicketDb.updateTicket).toHaveBeenCalledWith('TICKET-123', {
                description: 'Generated plan for ticket',
                status: 'in-progress'
            });

            // Verify success message
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                '✅ Ticket TICKET-123 processed successfully'
            );
        });

        it('should handle ticket not found error', async () => {
            const mockTicketDb = require('../src/services/ticketDb');
            const mockOrchestrator = require('../src/services/orchestrator');

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            const answerAgent = {
                cleanupInactiveConversations: jest.fn(async () => { }),
                deserializeHistory: jest.fn(),
                serializeHistory: jest.fn(() => ({}))
            };

            mockOrchestrator.getOrchestratorInstance.mockReturnValue({
                routeToPlanningAgent: jest.fn(),
                routeToVerificationAgent: jest.fn(),
                getAnswerAgent: jest.fn(() => answerAgent)
            });

            mockTicketDb.getTicket.mockResolvedValue(null);

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const processTicketCall = registerCommandCalls.find(
                call => call[0] === 'coe.processTicket'
            );
            const processTicketHandler = processTicketCall![1];

            jest.clearAllMocks();

            const mockTreeItem = {
                label: 'Missing ticket',
                description: 'open',
                command: {
                    command: 'coe.openTicket',
                    title: 'Open Ticket',
                    arguments: ['TICKET-999']
                }
            } as vscode.TreeItem;

            await processTicketHandler(mockTreeItem);

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'Ticket TICKET-999 not found or was deleted'
            );
        });

        it('should handle processing errors gracefully', async () => {
            const mockTicketDb = require('../src/services/ticketDb');
            const mockOrchestrator = require('../src/services/orchestrator');

            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            const answerAgent = {
                cleanupInactiveConversations: jest.fn(async () => { }),
                deserializeHistory: jest.fn(),
                serializeHistory: jest.fn(() => ({}))
            };

            mockTicketDb.getTicket.mockResolvedValue({
                id: 'TICKET-456',
                title: 'Error ticket',
                status: 'open',
            });

            mockOrchestrator.getOrchestratorInstance.mockReturnValue({
                routeToPlanningAgent: jest.fn(async () => {
                    throw new Error('LLM connection failed');
                }),
                routeToVerificationAgent: jest.fn(),
                getAnswerAgent: jest.fn(() => answerAgent)
            });

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const processTicketCall = registerCommandCalls.find(
                call => call[0] === 'coe.processTicket'
            );
            const processTicketHandler = processTicketCall![1];

            jest.clearAllMocks();

            const mockTreeItem = {
                label: 'Error ticket',
                description: 'open',
                command: {
                    command: 'coe.openTicket',
                    title: 'Open Ticket',
                    arguments: ['TICKET-456']
                }
            } as vscode.TreeItem;

            await processTicketHandler(mockTreeItem);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to process ticket: LLM connection failed'
            );
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

            // Find the handler for the 'coe.researchWithAgent' command BEFORE clearing mocks
            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const researchCommandCall = registerCommandCalls.find(
                call => call[0] === 'coe.researchWithAgent'
            );
            expect(researchCommandCall).toBeDefined();

            const researchHandler = researchCommandCall![1];

            // Clear mocks after getting handler to avoid interference
            jest.clearAllMocks();

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

            // Get handler BEFORE clearing mocks
            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const researchCommandCall = registerCommandCalls.find(
                call => call[0] === 'coe.researchWithAgent'
            );
            const researchHandler = researchCommandCall![1];

            // Clear mocks and re-setup showInputBox
            jest.clearAllMocks();
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

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

            // Get handler BEFORE clearing mocks
            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const researchCommandCall = registerCommandCalls.find(
                call => call[0] === 'coe.researchWithAgent'
            );
            const researchHandler = researchCommandCall![1];

            // Clear mocks and re-setup showInputBox
            jest.clearAllMocks();
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('   ');

            // Execute the handler
            await researchHandler();

            // Verify that workspace.openTextDocument was NOT called
            expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
        });
    });
});

describe('Extension Helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        const mockOrchestrator = require('../src/services/orchestrator');
        mockOrchestrator.getOrchestratorInstance.mockReturnValue({
            routeToPlanningAgent: jest.fn(async () => 'Mocked plan response'),
            routeToVerificationAgent: jest.fn(async () => ({
                passed: true,
                explanation: 'All criteria met'
            })),
            getAnswerAgent: jest.fn(() => ({
                cleanupInactiveConversations: jest.fn(async () => { })
            }))
        });

        mockOrchestrator.answerQuestion.mockResolvedValue('Mocked answer');
    });

    it('should update the status bar text and tooltip', async () => {
        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        await activate(mockContext);

        const statusBarItem = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;

        await updateStatusBar('$(sync) Planning...', 'Planning in progress');

        expect(statusBarItem.text).toBe('$(sync) Planning...');
        expect(statusBarItem.tooltip).toBe('Planning in progress');
    });

    it('should auto-plan for new ai_to_human tickets', async () => {
        const mockTicketDb = require('../src/services/ticketDb');
        const mockOrchestrator = require('../src/services/orchestrator');

        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        // Mock settings to return true for autoProcessTickets (Auto mode)
        const mockGetConfiguration = jest.fn(() => ({
            get: jest.fn((key: string, defaultValue?: any) => {
                if (key === 'autoProcessTickets') {
                    return true; // Auto mode
                }
                return defaultValue;
            }),
        }));
        (vscode.workspace as any).getConfiguration = mockGetConfiguration;

        const answerAgent = {
            cleanupInactiveConversations: jest.fn(async () => { })
        };

        mockOrchestrator.getOrchestratorInstance.mockReturnValue({
            routeToPlanningAgent: jest.fn(async () => 'Auto-plan result'),
            routeToVerificationAgent: jest.fn(async () => ({
                passed: true,
                explanation: 'All criteria met'
            })),
            getAnswerAgent: jest.fn(() => answerAgent)
        });

        mockTicketDb.listTickets.mockResolvedValue([
            {
                id: 'TICKET-101',
                title: 'Auto plan task',
                status: 'open',
                type: 'ai_to_human',
                createdAt: '2026-02-01T00:00:00.000Z',
                updatedAt: '2026-02-01T00:00:00.000Z'
            }
        ]);

        await activate(mockContext);

        const listener = mockTicketDb.onTicketChange.mock.calls[0][0];
        await listener();

        expect(mockTicketDb.updateTicket).toHaveBeenCalledWith('TICKET-101', {
            description: 'Auto-plan result'
        });
    });

    it('should skip auto-planning when autoProcessTickets is false (Manual mode)', async () => {
        const mockTicketDb = require('../src/services/ticketDb');
        const mockOrchestrator = require('../src/services/orchestrator');

        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        // Mock settings to return false for autoProcessTickets (Manual mode)
        const mockGetConfiguration = jest.fn(() => ({
            get: jest.fn((key: string, defaultValue?: any) => {
                if (key === 'autoProcessTickets') {
                    return false; // Manual mode
                }
                return defaultValue;
            }),
        }));
        (vscode.workspace as any).getConfiguration = mockGetConfiguration;

        const answerAgent = {
            cleanupInactiveConversations: jest.fn(async () => { })
        };

        const mockRouteToPlanningAgent = jest.fn(async () => 'Auto-plan result');

        mockOrchestrator.getOrchestratorInstance.mockReturnValue({
            routeToPlanningAgent: mockRouteToPlanningAgent,
            routeToVerificationAgent: jest.fn(async () => ({
                passed: true,
                explanation: 'All criteria met'
            })),
            getAnswerAgent: jest.fn(() => answerAgent)
        });

        mockTicketDb.listTickets.mockResolvedValue([
            {
                id: 'TICKET-102',
                title: 'Should not auto-plan',
                status: 'open',
                type: 'ai_to_human',
                createdAt: '2026-02-01T00:00:00.000Z',
                updatedAt: '2026-02-01T00:00:00.000Z'
            }
        ]);

        await activate(mockContext);

        const listener = mockTicketDb.onTicketChange.mock.calls[0][0];
        await listener();

        // Planning agent should NOT be called in Manual mode
        expect(mockRouteToPlanningAgent).not.toHaveBeenCalled();
        expect(mockTicketDb.updateTicket).not.toHaveBeenCalled();
    });

    it('should run Ask Answer Agent continue with active chat', async () => {
        const mockTicketDb = require('../src/services/ticketDb');
        const mockOrchestrator = require('../src/services/orchestrator');

        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
            globalState: {
                get: jest.fn(() => 'chat-continue'),
                update: jest.fn(),
            },
        } as any;

        const mockedInstance = {
            routeToPlanningAgent: jest.fn(async () => 'Mocked plan response'),
            routeToVerificationAgent: jest.fn(async () => ({
                passed: true,
                explanation: 'All criteria met'
            })),
            getAnswerAgent: jest.fn(() => ({
                cleanupInactiveConversations: jest.fn(async () => { })
            })),
            processConversationTicket: jest.fn(async () => { })
        };

        mockOrchestrator.getOrchestratorInstance.mockReturnValue(mockedInstance);

        mockTicketDb.getTicket.mockResolvedValue({
            id: 'chat-continue',
            title: 'Chat Ticket',
            status: 'open',
            createdAt: '2026-02-03T00:00:00.000Z',
            updatedAt: '2026-02-03T00:00:00.000Z',
            thread: []
        });
        (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Follow-up question');

        await activate(mockContext);

        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const continueCommandCall = registerCommandCalls.find(
            call => call[0] === 'coe.askAnswerAgentContinue'
        );
        const continueHandler = continueCommandCall![1];

        await continueHandler();

        expect(mockTicketDb.updateTicket).toHaveBeenCalledWith(
            'chat-continue',
            expect.objectContaining({
                thread: expect.any(Array)
            })
        );
        expect(mockedInstance.processConversationTicket).toHaveBeenCalledWith('chat-continue');
    });

    it('should warn when continuing without an active chat', async () => {
        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
            globalState: {
                get: jest.fn(() => undefined),
                update: jest.fn(),
            },
        } as any;

        await activate(mockContext);

        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const continueCommandCall = registerCommandCalls.find(
            call => call[0] === 'coe.askAnswerAgentContinue'
        );
        const continueHandler = continueCommandCall![1];

        await continueHandler();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('No active conversation')
        );
    });

    it('should show error when opening a ticket fails', async () => {
        const mockTicketDb = require('../src/services/ticketDb');

        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        mockTicketDb.getTicket.mockRejectedValue(new Error('DB error'));

        await activate(mockContext);

        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const openTicketCall = registerCommandCalls.find(call => call[0] === 'coe.openTicket');
        const openTicketHandler = openTicketCall![1];

        await openTicketHandler('TICKET-ERROR');

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('Failed to open ticket')
        );
    });

    it('should refresh agents and tickets via commands', async () => {
        const mockAgentsProvider = require('../src/ui/agentsTreeProvider');
        const mockTicketsProvider = require('../src/ui/ticketsTreeProvider');

        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        await activate(mockContext);

        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const refreshAgentsCall = registerCommandCalls.find(call => call[0] === 'coe.refreshAgents');
        const refreshTicketsCall = registerCommandCalls.find(call => call[0] === 'coe.refreshTickets');

        const refreshAgentsHandler = refreshAgentsCall![1];
        const refreshTicketsHandler = refreshTicketsCall![1];

        await refreshAgentsHandler();
        await refreshTicketsHandler();

        const agentsProviderInstance = mockAgentsProvider.AgentsTreeDataProvider.mock.results[0].value;
        const ticketsProviderInstance = mockTicketsProvider.TicketsTreeDataProvider.mock.results[0].value;

        expect(agentsProviderInstance.refresh).toHaveBeenCalled();
        expect(ticketsProviderInstance.refresh).toHaveBeenCalled();
    });

    it('should run Ask Answer Agent with a new question', async () => {
        const mockOrchestrator = require('../src/services/orchestrator');
        const mockTicketDb = require('../src/services/ticketDb');

        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as any;

        const mockTicket = {
            id: 'TICKET-123',
            title: 'User Question: New question',
            status: 'open',
            type: 'human_to_ai',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        mockTicketDb.createTicket.mockResolvedValue(mockTicket);
        (vscode.window.showInputBox as jest.Mock).mockResolvedValue('New question');

        await activate(mockContext);

        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const askCommandCall = registerCommandCalls.find(call => call[0] === 'coe.askAnswerAgent');
        const askHandler = askCommandCall![1];

        await askHandler();

        expect(mockTicketDb.createTicket).toHaveBeenCalledWith({
            title: 'User Question: New question',
            status: 'open',
            type: 'human_to_ai',
            description: 'User question submitted: New question',
            thread: expect.any(Array)
        });
    });

    it('should show error when verify last ticket fails', async () => {
        const mockTicketDb = require('../src/services/ticketDb');

        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        mockTicketDb.listTickets.mockRejectedValue(new Error('List failed'));

        await activate(mockContext);

        const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
        const verifyLastCall = registerCommandCalls.find(call => call[0] === 'coe.verifyLastTicket');
        const verifyLastHandler = verifyLastCall![1];

        await verifyLastHandler();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('Verification failed')
        );
    });
});

describe('Answer Agent Persistence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should restore Answer Agent history on activate', async () => {
        const mockTicketDb = require('../src/services/ticketDb');
        const mockOrchestrator = require('../src/services/orchestrator');
        const mockLogger = require('../src/logger');

        const answerAgent = {
            cleanupInactiveConversations: jest.fn(async () => { }),
            deserializeHistory: jest.fn(),
            serializeHistory: jest.fn(() => ({}))
        };

        mockOrchestrator.getOrchestratorInstance.mockReturnValue({
            routeToPlanningAgent: jest.fn(async () => 'Mocked plan response'),
            routeToVerificationAgent: jest.fn(async () => ({
                passed: true,
                explanation: 'All criteria met'
            })),
            getAnswerAgent: jest.fn(() => answerAgent)
        });

        const mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as any;

        const conversationHistory = JSON.stringify({
            chatId: 'TICKET-100',
            createdAt: '2026-02-01T00:00:00.000Z',
            lastActivityAt: '2026-02-02T00:00:00.000Z',
            messages: []
        });

        mockTicketDb.listTickets.mockResolvedValue([
            {
                id: 'TICKET-100',
                title: 'Test',
                status: 'open',
                createdAt: '2026-02-01T00:00:00.000Z',
                updatedAt: '2026-02-01T00:00:00.000Z',
                conversationHistory
            }
        ]);

        await activate(mockContext);

        expect(answerAgent.deserializeHistory).toHaveBeenCalledWith({
            'TICKET-100': conversationHistory
        });
        expect(mockLogger.logWarn).not.toHaveBeenCalledWith(
            expect.stringContaining('Failed to load Answer Agent history')
        );
    });

    it('Test 1: should persist Answer Agent history on deactivate', async () => {
        const mockTicketDb = require('../src/services/ticketDb');
        const mockAnswerAgent = require('../src/agents/answerAgent');
        const mockLogger = require('../src/logger');

        mockAnswerAgent.persistAnswerAgentHistory.mockReturnValue({
            'TICKET-300': JSON.stringify({
                chatId: 'TICKET-300',
                createdAt: '2026-02-01T00:00:00.000Z',
                lastActivityAt: '2026-02-02T00:00:00.000Z',
                messages: []
            })
        });

        mockTicketDb.listTickets.mockResolvedValue([
            {
                id: 'TICKET-300',
                title: 'Test',
                status: 'open',
                createdAt: '2026-02-01T00:00:00.000Z',
                updatedAt: '2026-02-01T00:00:00.000Z'
            }
        ]);

        mockTicketDb.updateTicket.mockResolvedValue({
            id: 'TICKET-300',
            title: 'Test',
            status: 'open',
            createdAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-02-01T00:00:00.000Z'
        });

        await expect(deactivate()).resolves.not.toThrow();

        expect(mockTicketDb.updateTicket).toHaveBeenCalledWith('TICKET-300', {
            conversationHistory: expect.any(String)
        });
        expect(mockLogger.logInfo).toHaveBeenCalledWith(
            expect.stringContaining('Saved 1 conversation histories')
        );
    });

    it('should warn and continue if persistence fails on deactivate', async () => {
        const mockTicketDb = require('../src/services/ticketDb');
        const mockAnswerAgent = require('../src/agents/answerAgent');
        const mockLogger = require('../src/logger');

        mockAnswerAgent.persistAnswerAgentHistory.mockReturnValue({
            'TICKET-200': JSON.stringify({
                chatId: 'TICKET-200',
                createdAt: '2026-02-01T00:00:00.000Z',
                lastActivityAt: '2026-02-02T00:00:00.000Z',
                messages: []
            })
        });

        mockTicketDb.listTickets.mockResolvedValue([
            {
                id: 'TICKET-200',
                title: 'Test',
                status: 'open',
                createdAt: '2026-02-01T00:00:00.000Z',
                updatedAt: '2026-02-01T00:00:00.000Z'
            }
        ]);

        mockTicketDb.updateTicket.mockRejectedValue(new Error('DB failure'));

        await expect(deactivate()).resolves.not.toThrow();

        expect(mockTicketDb.updateTicket).toHaveBeenCalledWith('TICKET-200', {
            conversationHistory: expect.any(String)
        });
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
            expect.stringContaining('Failed to persist Answer Agent history for ticket TICKET-200')
        );
    });

    describe('coe.enableAgent command', () => {
        it('should register the COE: Enable Agent command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.enableAgent',
                expect.any(Function)
            );
        });

        it('should enable a disabled agent and refresh tree view', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            const mockUpdate = jest.fn(async () => { });
            const mockGetConfiguration = jest.fn(() => ({
                get: jest.fn(),
                update: mockUpdate,
            }));
            (vscode.workspace as any).getConfiguration = mockGetConfiguration;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const enableAgentCall = registerCommandCalls.find(
                call => call[0] === 'coe.enableAgent'
            );
            expect(enableAgentCall).toBeDefined();

            const enableAgentHandler = enableAgentCall![1];

            jest.clearAllMocks();

            // Create mock TreeItem for Research agent
            const mockTreeItem = {
                label: 'Research',
            } as vscode.TreeItem;

            await enableAgentHandler(mockTreeItem);

            expect(mockUpdate).toHaveBeenCalledWith(
                'enableResearchAgent',
                true,
                vscode.ConfigurationTarget.Global
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Research Agent enabled'
            );
        });

        it('should handle missing tree item gracefully', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const enableAgentCall = registerCommandCalls.find(
                call => call[0] === 'coe.enableAgent'
            );
            const enableAgentHandler = enableAgentCall![1];

            jest.clearAllMocks();

            await enableAgentHandler(null);

            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });
    });

    describe('coe.disableAgent command', () => {
        it('should register the COE: Disable Agent command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.disableAgent',
                expect.any(Function)
            );
        });

        it('should disable an enabled agent and refresh tree view', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            const mockUpdate = jest.fn(async () => { });
            const mockGetConfiguration = jest.fn(() => ({
                get: jest.fn(),
                update: mockUpdate,
            }));
            (vscode.workspace as any).getConfiguration = mockGetConfiguration;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const disableAgentCall = registerCommandCalls.find(
                call => call[0] === 'coe.disableAgent'
            );
            expect(disableAgentCall).toBeDefined();

            const disableAgentHandler = disableAgentCall![1];

            jest.clearAllMocks();

            const mockTreeItem = {
                label: 'Planning',
            } as vscode.TreeItem;

            await disableAgentHandler(mockTreeItem);

            expect(mockUpdate).toHaveBeenCalledWith(
                'enablePlanningAgent',
                false,
                vscode.ConfigurationTarget.Global
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Planning Agent disabled'
            );
        });

        it('should handle errors when updating settings', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            const mockUpdate = jest.fn(async () => {
                throw new Error('Settings update failed');
            });
            const mockGetConfiguration = jest.fn(() => ({
                get: jest.fn(),
                update: mockUpdate,
            }));
            (vscode.workspace as any).getConfiguration = mockGetConfiguration;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const disableAgentCall = registerCommandCalls.find(
                call => call[0] === 'coe.disableAgent'
            );
            const disableAgentHandler = disableAgentCall![1];

            jest.clearAllMocks();

            const mockTreeItem = {
                label: 'Answer',
            } as vscode.TreeItem;

            await disableAgentHandler(mockTreeItem);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to disable Answer Agent'
            );
        });
    });

    describe('coe.toggleAutoProcessing command', () => {
        it('should register the COE: Toggle Auto Processing command', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
            } as any;

            await activate(mockContext);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.toggleAutoProcessing',
                expect.any(Function)
            );
        });

        it('should toggle from Manual to Auto mode', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            const mockUpdate = jest.fn(async () => { });
            const mockGet = jest.fn((key: string, defaultValue?: any) => {
                if (key === 'autoProcessTickets') {
                    return false; // Currently Manual
                }
                return defaultValue;
            });
            const mockGetConfiguration = jest.fn(() => ({
                get: mockGet,
                update: mockUpdate,
            }));
            (vscode.workspace as any).getConfiguration = mockGetConfiguration;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const toggleCall = registerCommandCalls.find(
                call => call[0] === 'coe.toggleAutoProcessing'
            );
            expect(toggleCall).toBeDefined();

            const toggleHandler = toggleCall![1];

            jest.clearAllMocks();

            await toggleHandler();

            expect(mockUpdate).toHaveBeenCalledWith(
                'autoProcessTickets',
                true,
                vscode.ConfigurationTarget.Global
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Processing mode: Auto'
            );
        });

        it('should toggle from Auto to Manual mode', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            const mockUpdate = jest.fn(async () => { });
            const mockGet = jest.fn((key: string, defaultValue?: any) => {
                if (key === 'autoProcessTickets') {
                    return true; // Currently Auto
                }
                return defaultValue;
            });
            const mockGetConfiguration = jest.fn(() => ({
                get: mockGet,
                update: mockUpdate,
            }));
            (vscode.workspace as any).getConfiguration = mockGetConfiguration;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const toggleCall = registerCommandCalls.find(
                call => call[0] === 'coe.toggleAutoProcessing'
            );
            const toggleHandler = toggleCall![1];

            jest.clearAllMocks();

            await toggleHandler();

            expect(mockUpdate).toHaveBeenCalledWith(
                'autoProcessTickets',
                false,
                vscode.ConfigurationTarget.Global
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Processing mode: Manual'
            );
        });

        it('should handle errors when updating settings', async () => {
            const mockContext = {
                extensionPath: '/mock/path',
                subscriptions: [],
                globalState: {
                    get: jest.fn(),
                    update: jest.fn(),
                },
            } as any;

            const mockUpdate = jest.fn(async () => {
                throw new Error('Settings update failed');
            });
            const mockGetConfiguration = jest.fn(() => ({
                get: jest.fn(() => false),
                update: mockUpdate,
            }));
            (vscode.workspace as any).getConfiguration = mockGetConfiguration;

            await activate(mockContext);

            const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const toggleCall = registerCommandCalls.find(
                call => call[0] === 'coe.toggleAutoProcessing'
            );
            const toggleHandler = toggleCall![1];

            jest.clearAllMocks();

            await toggleHandler();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to toggle processing mode'
            );
        });
    });
});