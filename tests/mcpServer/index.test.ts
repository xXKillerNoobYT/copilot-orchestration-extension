/**
 * Tests for MCP Server Index (Singleton Pattern)
 *
 * Tests for the MCP server initialization and singleton management.
 */

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

// Mock the server class
const mockStart = jest.fn();
const mockStop = jest.fn();
jest.mock('../../src/mcpServer/server', () => ({
    MCPServer: jest.fn().mockImplementation(() => ({
        start: mockStart,
        stop: mockStop,
    })),
}));

import {
    initializeMCPServer,
    getMCPServerInstance,
    resetMCPServerForTests,
} from '../../src/mcpServer/index';
import { logWarn, logInfo } from '../../src/logger';
import { MCPServer } from '../../src/mcpServer/server';

describe('MCP Server Index', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the singleton before each test
        resetMCPServerForTests();
    });

    afterEach(() => {
        // Clean up after each test
        resetMCPServerForTests();
    });

    describe('initializeMCPServer()', () => {
        it('Test 1: should create MCPServer instance', () => {
            initializeMCPServer();
            
            expect(MCPServer).toHaveBeenCalledTimes(1);
        });

        it('Test 2: should start the server', () => {
            initializeMCPServer();
            
            expect(mockStart).toHaveBeenCalledTimes(1);
        });

        it('Test 3: should log initialization messages', () => {
            initializeMCPServer();
            
            expect(logInfo).toHaveBeenCalledWith('Initializing MCP server...');
            expect(logInfo).toHaveBeenCalledWith('MCP server initialized and started');
        });

        it('Test 4: should not create second instance', () => {
            initializeMCPServer();
            initializeMCPServer(); // Second call
            
            expect(MCPServer).toHaveBeenCalledTimes(1);
            expect(logWarn).toHaveBeenCalledWith('MCP server already exists, not creating a new instance');
        });
    });

    describe('getMCPServerInstance()', () => {
        it('Test 5: should return null before initialization', () => {
            const instance = getMCPServerInstance();
            
            expect(instance).toBeNull();
        });

        it('Test 6: should return instance after initialization', () => {
            initializeMCPServer();
            const instance = getMCPServerInstance();
            
            expect(instance).not.toBeNull();
            expect(instance).toHaveProperty('start');
            expect(instance).toHaveProperty('stop');
        });
    });

    describe('resetMCPServerForTests()', () => {
        it('Test 7: should stop running server', () => {
            initializeMCPServer();
            resetMCPServerForTests();
            
            expect(mockStop).toHaveBeenCalledTimes(1);
        });

        it('Test 8: should clear the instance', () => {
            initializeMCPServer();
            resetMCPServerForTests();
            
            expect(getMCPServerInstance()).toBeNull();
        });

        it('Test 9: should handle null instance safely', () => {
            // Should not throw when called without initialization
            expect(() => resetMCPServerForTests()).not.toThrow();
        });

        it('Test 10: should allow reinitialization after reset', () => {
            initializeMCPServer();
            resetMCPServerForTests();
            initializeMCPServer();
            
            expect(MCPServer).toHaveBeenCalledTimes(2);
            expect(getMCPServerInstance()).not.toBeNull();
        });
    });

    describe('Singleton pattern', () => {
        it('Test 11: should return same instance on multiple gets', () => {
            initializeMCPServer();
            const instance1 = getMCPServerInstance();
            const instance2 = getMCPServerInstance();
            
            expect(instance1).toBe(instance2);
        });
    });
});
