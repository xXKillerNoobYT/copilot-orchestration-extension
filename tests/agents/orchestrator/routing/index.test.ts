/**
 * @file Tests for orchestrator routing barrel exports
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

// Import directly to trigger coverage
import {
    CodingAIRouter,
    getCodingAIRouter,
    resetCodingAIRouter,
    VerificationRouter,
    getVerificationRouter,
    resetVerificationRouter
} from '../../../../src/agents/orchestrator/routing/index';

describe('orchestrator/routing/index', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetCodingAIRouter();
        resetVerificationRouter();
    });

    it('Test 1: should export CodingAIRouter from codingAI module', () => {
        expect(CodingAIRouter).toBeDefined();
        expect(getCodingAIRouter).toBeDefined();
        expect(resetCodingAIRouter).toBeDefined();
    });

    it('Test 2: should export VerificationRouter from verification module', () => {
        expect(VerificationRouter).toBeDefined();
        expect(getVerificationRouter).toBeDefined();
        expect(resetVerificationRouter).toBeDefined();
    });

    it('Test 3: should have all exports as functions', () => {
        expect(typeof CodingAIRouter).toBe('function');
        expect(typeof getCodingAIRouter).toBe('function');
        expect(typeof resetCodingAIRouter).toBe('function');
        expect(typeof VerificationRouter).toBe('function');
        expect(typeof getVerificationRouter).toBe('function');
        expect(typeof resetVerificationRouter).toBe('function');
    });

    it('Test 4: can reset routers', () => {
        resetCodingAIRouter();
        resetVerificationRouter();
        // No error thrown
        expect(true).toBe(true);
    });
});
