/**
 * @file context/index.test.ts
 * @description Tests for ContextManager (MT-017)
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn()
}));

import {
    ContextManager,
    initializeContextManager,
    getContextManagerInstance,
    resetContextManagerForTests
} from '../../../src/services/context/index';

describe('ContextManager', () => {
    let manager: ContextManager;

    beforeEach(() => {
        resetContextManagerForTests();
        manager = new ContextManager({
            maxTokens: 1000,
            reservedTokens: 200,
            warningThreshold: 0.8
        });
    });

    afterEach(() => {
        resetContextManagerForTests();
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            const defaultManager = new ContextManager();
            expect(defaultManager).toBeInstanceOf(ContextManager);
            expect(defaultManager.effectiveLimit).toBe(8192 - 2048);
        });

        it('should create instance with custom config', () => {
            expect(manager.effectiveLimit).toBe(800); // 1000 - 200
        });
    });

    describe('Test 2: setSystemPrompt', () => {
        it('should add system prompt', () => {
            manager.setSystemPrompt('You are a helpful assistant.');
            const context = manager.buildContext();
            expect(context).toContain('helpful assistant');
        });
    });

    describe('Test 3: addConversationHistory', () => {
        it('should add conversation history', () => {
            manager.addConversationHistory([
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' }
            ]);
            const context = manager.buildContext();
            expect(context).toContain('Hello');
            expect(context).toContain('Hi there!');
        });
    });

    describe('Test 4: addTaskContext', () => {
        it('should add task context', () => {
            manager.addTaskContext('TASK-1', 'Implement login feature');
            const context = manager.buildContext();
            expect(context).toContain('login feature');
        });
    });

    describe('Test 5: addFileContext', () => {
        it('should add file context', () => {
            manager.addFileContext('/src/auth.ts', 'export function login() {}');
            const context = manager.buildContext();
            expect(context).toContain('/src/auth.ts');
            expect(context).toContain('function login');
        });
    });

    describe('Test 6: addDocumentation', () => {
        it('should add documentation context', () => {
            manager.addDocumentation('api-ref', 'API Reference: POST /login');
            const context = manager.buildContext();
            expect(context).toContain('API Reference');
        });
    });

    describe('Test 7: removeSection', () => {
        it('should remove a section', () => {
            manager.addTaskContext('TASK-1', 'Test content');
            manager.removeSection('task-TASK-1');
            const context = manager.buildContext();
            expect(context).not.toContain('Test content');
        });
    });

    describe('Test 8: getStats', () => {
        it('should return correct statistics', () => {
            manager.setSystemPrompt('System prompt');
            manager.addTaskContext('TASK-1', 'Task content');
            
            const stats = manager.getStats();
            expect(stats.sectionCount).toBe(2);
            expect(stats.usedTokens).toBeGreaterThan(0);
            expect(stats.totalTokens).toBe(800);
        });
    });

    describe('Test 9: buildContext with truncation', () => {
        it('should truncate when over limit', () => {
            // Add lots of low-priority content
            for (let i = 0; i < 50; i++) {
                manager.addDocumentation(`doc-${i}`, `This is documentation ${i} with some content to take up space.`);
            }
            
            // Should still build without error
            const context = manager.buildContext();
            expect(context.length).toBeGreaterThan(0);
        });

        it('should emit context-truncated event', () => {
            const truncatedSpy = jest.fn();
            manager.on('context-truncated', truncatedSpy);
            
            // Add lots of content to trigger truncation
            for (let i = 0; i < 50; i++) {
                manager.addDocumentation(`doc-${i}`, `Documentation ${i} - `.repeat(20));
            }
            
            manager.buildContext();
            expect(truncatedSpy).toHaveBeenCalled();
        });
    });

    describe('Test 10: estimateTokens', () => {
        it('should estimate tokens for text', () => {
            const tokens = manager.estimateTokens('Hello world');
            expect(tokens).toBeGreaterThan(0);
            expect(tokens).toBeLessThan(100);
        });
    });

    describe('Test 11: clear', () => {
        it('should clear all context', () => {
            manager.setSystemPrompt('System');
            manager.addTaskContext('TASK-1', 'Task');
            manager.clear();
            
            const stats = manager.getStats();
            expect(stats.sectionCount).toBe(0);
        });
    });

    describe('Test 12: singleton pattern', () => {
        it('should throw if initialized twice', () => {
            initializeContextManager();
            expect(() => initializeContextManager()).toThrow('already initialized');
        });

        it('should throw if getInstance called before init', () => {
            expect(() => getContextManagerInstance()).toThrow('not initialized');
        });

        it('should return instance after initialization', () => {
            initializeContextManager();
            const instance = getContextManagerInstance();
            expect(instance).toBeInstanceOf(ContextManager);
        });
    });
});
