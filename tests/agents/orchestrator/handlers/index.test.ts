/**
 * @file Tests for orchestrator handlers barrel exports
 */

// Mock vscode before any imports
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn()
    })),
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
    }
}), { virtual: true });

// Mock logger
jest.mock('../../../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn()
}));

// Mock dependencies
jest.mock('../../../../src/services/ticketDb', () => ({
    getTicket: jest.fn(),
    updateTicket: jest.fn(),
    createTicket: jest.fn(),
    getTicketsByStatus: jest.fn()
}));

jest.mock('../../../../src/services/llmService', () => ({
    getLLMServiceInstance: jest.fn().mockReturnValue({
        chat: jest.fn().mockResolvedValue({ content: 'response' })
    })
}));

jest.mock('../../../../src/services/orchestrator', () => ({
    getOrchestratorInstance: jest.fn().mockReturnValue({
        routeToAgent: jest.fn()
    })
}));

// Import directly to trigger coverage
import {
    handleGetNextTask,
    handleReportTaskDone
} from '../../../../src/agents/orchestrator/handlers/index';

describe('orchestrator/handlers/index', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Test 1: should export handleGetNextTask handler', () => {
        expect(handleGetNextTask).toBeDefined();
        expect(typeof handleGetNextTask).toBe('function');
    });

    it('Test 2: should export handleReportTaskDone handler', () => {
        expect(handleReportTaskDone).toBeDefined();
        expect(typeof handleReportTaskDone).toBe('function');
    });

    it('Test 3: all handler exports are functions', () => {
        expect(typeof handleGetNextTask).toBe('function');
        expect(typeof handleReportTaskDone).toBe('function');
    });
});
