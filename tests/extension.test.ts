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
}));

jest.mock('../src/services/orchestrator', () => ({
    initializeOrchestrator: jest.fn(),
    getOrchestratorInstance: jest.fn(() => ({
        routeToPlanningAgent: jest.fn(async () => 'Mocked plan response'),
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

        // We manually call activate() because Jest doesn't run the real extension host —
        // this simulates extension startup and should trigger all registerCommand calls
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
});