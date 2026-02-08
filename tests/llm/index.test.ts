/**
 * @file Tests for LLM barrel exports
 */

// Mock vscode before any imports
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn()
    })),
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn()
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn()
        })
    }
}), { virtual: true });

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn()
}));

// Mock config
jest.mock('../../src/config', () => ({
    getConfigInstance: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue({}),
        config: {
            llm: { endpoint: 'http://localhost:1234/v1', model: 'test', timeoutSeconds: 30, maxTokens: 2048 }
        }
    })
}));

// Import directly to trigger coverage
import {
    LLMQueue,
    getLLMQueueInstance,
    resetLLMQueueForTests,
    TokenPoller,
    getTokenPollerInstance,
    resetTokenPollerForTests,
    QueueWarningManager,
    getQueueWarningManager,
    resetQueueWarningForTests,
    StreamProcessor,
    getStreamProcessorInstance,
    resetStreamProcessorForTests
} from '../../src/llm/index';

describe('llm/index', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetLLMQueueForTests();
        resetTokenPollerForTests();
        resetQueueWarningForTests();
        resetStreamProcessorForTests();
    });

    it('Test 1: should export LLMQueue and related functions', () => {
        expect(LLMQueue).toBeDefined();
        expect(getLLMQueueInstance).toBeDefined();
        expect(resetLLMQueueForTests).toBeDefined();
    });

    it('Test 2: should export TokenPoller and related functions', () => {
        expect(TokenPoller).toBeDefined();
        expect(getTokenPollerInstance).toBeDefined();
        expect(resetTokenPollerForTests).toBeDefined();
    });

    it('Test 3: should export QueueWarningManager', () => {
        expect(QueueWarningManager).toBeDefined();
        expect(getQueueWarningManager).toBeDefined();
        expect(resetQueueWarningForTests).toBeDefined();
    });

    it('Test 4: should export StreamProcessor and related functions', () => {
        expect(StreamProcessor).toBeDefined();
        expect(getStreamProcessorInstance).toBeDefined();
        expect(resetStreamProcessorForTests).toBeDefined();
    });

    it('Test 5: LLMQueue export is a class/function', () => {
        expect(typeof LLMQueue).toBe('function');
    });

    it('Test 6: TokenPoller export is a class/function', () => {
        expect(typeof TokenPoller).toBe('function');
    });

    it('Test 7: QueueWarningManager export is a class/function', () => {
        expect(typeof QueueWarningManager).toBe('function');
    });

    it('Test 8: StreamProcessor export is a class/function', () => {
        expect(typeof StreamProcessor).toBe('function');
    });

    it('Test 9: getter functions are functions', () => {
        expect(typeof getLLMQueueInstance).toBe('function');
        expect(typeof getTokenPollerInstance).toBe('function');
        expect(typeof getQueueWarningManager).toBe('function');
        expect(typeof getStreamProcessorInstance).toBe('function');
    });

    it('Test 10: reset functions are functions', () => {
        expect(typeof resetLLMQueueForTests).toBe('function');
        expect(typeof resetTokenPollerForTests).toBe('function');
        expect(typeof resetQueueWarningForTests).toBe('function');
        expect(typeof resetStreamProcessorForTests).toBe('function');
    });
});
