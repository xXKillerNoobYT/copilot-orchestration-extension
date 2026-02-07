/**
 * Tests for Custom Agent Executor Module
 *
 * @fileoverview Comprehensive tests for the executor module including
 * variable substitution, system prompt building, and agent execution.
 */

import * as executor from '../../../src/agents/custom/executor';
import * as storage from '../../../src/agents/custom/storage';
import * as hardlock from '../../../src/agents/custom/hardlock';
import * as llmService from '../../../src/services/llmService';
import { CustomAgent } from '../../../src/agents/custom/schema';

// Mock dependencies
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../../src/services/llmService', () => ({
    completeLLM: jest.fn(),
    streamLLM: jest.fn(),
}));

jest.mock('../../../src/agents/custom/storage', () => ({
    loadCustomAgent: jest.fn(),
    saveCustomAgent: jest.fn(),
    customAgentExists: jest.fn(),
    listCustomAgents: jest.fn(),
    getWorkspaceFolder: jest.fn(),
    AgentStorageError: class AgentStorageError extends Error {
        constructor(
            message: string,
            public readonly agentName: string | undefined,
            public readonly operation: 'save' | 'load' | 'delete' | 'list' | 'init',
            public readonly cause?: Error
        ) {
            super(message);
            this.name = 'AgentStorageError';
        }
    },
}));

jest.mock('../../../src/agents/custom/hardlock', () => ({
    validateToolAccess: jest.fn(),
    assertToolAllowed: jest.fn(),
    getHardlockPolicyDescription: jest.fn(() => '## Hardlock Policy\nNo code editing allowed.'),
    createHardlockExecutor: jest.fn(),
    generateEscalationDescription: jest.fn(),
    HardlockViolationError: class HardlockViolationError extends Error {
        readonly code = 'HARDLOCK_VIOLATION';
        constructor(
            public readonly requestedTool: string,
            message: string,
            public readonly requiredCapability: string = 'general'
        ) {
            super(message);
            this.name = 'HardlockViolationError';
        }
        getUserMessage(): string {
            return `Hardlock violation: ${this.message}`;
        }
    },
}));

// Get mocked modules
const mockStorage = storage as jest.Mocked<typeof storage>;
const mockLLM = llmService as jest.Mocked<typeof llmService>;
const mockHardlock = hardlock as jest.Mocked<typeof hardlock>;

// Helper to create a test agent
function createTestAgent(overrides: Partial<CustomAgent> = {}): CustomAgent {
    return {
        name: 'test-agent',
        description: 'A test agent for unit tests',
        systemPrompt: 'You are a helpful assistant.',
        goals: ['Be helpful', 'Be accurate'],
        checklist: ['Check facts', 'Be concise'],
        customLists: [],
        priority: 'P2',
        routing: {
            keywords: [],
            patterns: [],
            tags: [],
            ticketTypes: [],
            priorityBoost: 0,
        },
        metadata: {
            tags: [],
            version: '1.0.0',
        },
        isActive: true,
        timeoutSeconds: 60,
        maxTokens: 2048,
        temperature: 0.7,
        ...overrides,
    };
}

describe('Custom Agent Executor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStorage.getWorkspaceFolder.mockReturnValue('/test/workspace');
        mockStorage.customAgentExists.mockReturnValue(true);
        mockStorage.loadCustomAgent.mockReturnValue(createTestAgent());
        mockLLM.completeLLM.mockResolvedValue({
            content: 'Test response from LLM',
            usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
            },
        });
    });

    // ========================================================================
    // Section 1: substituteVariables Tests
    // ========================================================================

    describe('substituteVariables', () => {
        it('Test 1: should replace single variable', () => {
            const template = 'Hello {{user_query}}!';
            const result = executor.substituteVariables(template, { user_query: 'world' });
            expect(result).toBe('Hello world!');
        });

        it('Test 2: should replace multiple variables', () => {
            const template = '{{task_id}} - {{ticket_id}}';
            const result = executor.substituteVariables(template, {
                task_id: 'TASK-1',
                ticket_id: 'TKT-100',
            });
            expect(result).toBe('TASK-1 - TKT-100');
        });

        it('Test 3: should keep unmatched variables unchanged', () => {
            const template = 'Hello {{unknown_var}}!';
            const result = executor.substituteVariables(template, {});
            expect(result).toBe('Hello {{unknown_var}}!');
        });

        it('Test 4: should auto-fill current_date', () => {
            const template = 'Date: {{current_date}}';
            const result = executor.substituteVariables(template, {});
            // Should match YYYY-MM-DD format
            expect(result).toMatch(/Date: \d{4}-\d{2}-\d{2}/);
        });

        it('Test 5: should auto-fill current_time', () => {
            const template = 'Time: {{current_time}}';
            const result = executor.substituteVariables(template, {});
            // Should match HH:MM:SS format
            expect(result).toMatch(/Time: \d{2}:\d{2}:\d{2}/);
        });

        it('Test 6: should allow overriding auto-filled variables', () => {
            const template = 'Date: {{current_date}}';
            const result = executor.substituteVariables(template, { current_date: '2024-01-01' });
            expect(result).toBe('Date: 2024-01-01');
        });

        it('Test 7: should handle template with no variables', () => {
            const template = 'No variables here';
            const result = executor.substituteVariables(template, { user_query: 'ignored' });
            expect(result).toBe('No variables here');
        });

        it('Test 8: should handle empty template', () => {
            const result = executor.substituteVariables('', { user_query: 'test' });
            expect(result).toBe('');
        });

        it('Test 9: should handle multiple occurrences of same variable', () => {
            const template = '{{user_query}} and {{user_query}}';
            const result = executor.substituteVariables(template, { user_query: 'test' });
            expect(result).toBe('test and test');
        });

        it('Test 10: should handle variables at start and end', () => {
            const template = '{{task_id}} middle {{ticket_id}}';
            const result = executor.substituteVariables(template, {
                task_id: 'START',
                ticket_id: 'END',
            });
            expect(result).toBe('START middle END');
        });

        it('Test 11: should handle nested braces gracefully', () => {
            const template = '{{{{user_query}}}}';
            const result = executor.substituteVariables(template, { user_query: 'test' });
            expect(result).toBe('{{test}}');
        });

        it('Test 12: should handle all available variables', () => {
            const template = '{{task_id}} {{ticket_id}} {{user_query}} {{file_path}} {{selection}} {{project_name}}';
            const result = executor.substituteVariables(template, {
                task_id: 't1',
                ticket_id: 'tkt1',
                user_query: 'q1',
                file_path: '/path',
                selection: 'sel',
                project_name: 'proj',
            });
            expect(result).toBe('t1 tkt1 q1 /path sel proj');
        });
    });

    // ========================================================================
    // Section 2: buildSystemPrompt Tests
    // ========================================================================

    describe('buildSystemPrompt', () => {
        it('Test 13: should include agent name and description', () => {
            const agent = createTestAgent({ name: 'My Agent', description: 'Does things' });
            const result = executor.buildSystemPrompt(agent, {});
            expect(result).toContain('# My Agent');
            expect(result).toContain('Does things');
        });

        it('Test 14: should include substituted system prompt', () => {
            const agent = createTestAgent({ systemPrompt: 'Hello {{user_query}}!' });
            const result = executor.buildSystemPrompt(agent, { user_query: 'world' });
            expect(result).toContain('Hello world!');
        });

        it('Test 15: should include numbered goals', () => {
            const agent = createTestAgent({ goals: ['Goal A', 'Goal B', 'Goal C'] });
            const result = executor.buildSystemPrompt(agent, {});
            expect(result).toContain('## Goals');
            expect(result).toContain('1. Goal A');
            expect(result).toContain('2. Goal B');
            expect(result).toContain('3. Goal C');
        });

        it('Test 16: should handle empty goals', () => {
            const agent = createTestAgent({ goals: [] });
            const result = executor.buildSystemPrompt(agent, {});
            expect(result).toContain('No specific goals defined.');
        });

        it('Test 17: should include checklist with checkboxes', () => {
            const agent = createTestAgent({ checklist: ['Item 1', 'Item 2'] });
            const result = executor.buildSystemPrompt(agent, {});
            expect(result).toContain('## Checklist');
            expect(result).toContain('- [ ] Item 1');
            expect(result).toContain('- [ ] Item 2');
        });

        it('Test 18: should skip checklist section when empty', () => {
            const agent = createTestAgent({ checklist: [] });
            const result = executor.buildSystemPrompt(agent, {});
            expect(result).not.toContain('## Checklist');
        });

        it('Test 19: should include hardlock policy by default', () => {
            const agent = createTestAgent();
            const result = executor.buildSystemPrompt(agent, {});
            expect(result).toContain('## Hardlock Policy');
        });

        it('Test 20: should skip hardlock policy when option set', () => {
            const agent = createTestAgent();
            const result = executor.buildSystemPrompt(agent, {}, { skipHardlockPolicy: true });
            expect(result).not.toContain('## Hardlock Policy');
        });

        it('Test 21: should include custom lists', () => {
            const agent = createTestAgent({
                customLists: [
                    {
                        name: 'Resources',
                        description: 'Helpful links',
                        items: ['Link 1', 'Link 2'],
                        order: 0,
                        collapsed: false,
                    },
                ],
            });
            const result = executor.buildSystemPrompt(agent, {});
            expect(result).toContain('## Resources');
            expect(result).toContain('Helpful links');
            expect(result).toContain('- Link 1');
            expect(result).toContain('- Link 2');
        });

        it('Test 22: should order custom lists by order field', () => {
            const agent = createTestAgent({
                customLists: [
                    { name: 'Second', description: '', items: ['B'], order: 2, collapsed: false },
                    { name: 'First', description: '', items: ['A'], order: 1, collapsed: false },
                ],
            });
            const result = executor.buildSystemPrompt(agent, {});
            const firstIndex = result.indexOf('## First');
            const secondIndex = result.indexOf('## Second');
            expect(firstIndex).toBeLessThan(secondIndex);
        });

        it('Test 23: should skip custom lists section when empty', () => {
            const agent = createTestAgent({ customLists: [] });
            const result = executor.buildSystemPrompt(agent, {});
            // Should not have orphan headings from custom lists
            const customListMatches = result.match(/## [A-Z][a-z]+\n-/g);
            expect(customListMatches).toBeNull();
        });
    });

    // ========================================================================
    // Section 3: executeCustomAgent Tests
    // ========================================================================

    describe('executeCustomAgent', () => {
        it('Test 24: should execute successfully with valid agent', async () => {
            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.success).toBe(true);
            expect(result.content).toBe('Test response from LLM');
            expect(result.agentName).toBe('test-agent');
            expect(result.error).toBeUndefined();
        });

        it('Test 25: should return token usage', async () => {
            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.usage).toBeDefined();
            expect(result.usage?.prompt_tokens).toBe(100);
            expect(result.usage?.completion_tokens).toBe(50);
            expect(result.usage?.total_tokens).toBe(150);
        });

        it('Test 26: should return timing information', async () => {
            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.timing).toBeDefined();
            expect(result.timing?.startedAt).toBeDefined();
            expect(result.timing?.completedAt).toBeDefined();
            expect(result.timing?.durationMs).toBeGreaterThanOrEqual(0);
        });

        it('Test 27: should return error when no workspace', async () => {
            mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('UNKNOWN');
            expect(result.error).toContain('No workspace');
        });

        it('Test 28: should return error when agent not found', async () => {
            mockStorage.customAgentExists.mockReturnValue(false);

            const result = await executor.executeCustomAgent('missing-agent', { query: 'Hello' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('AGENT_NOT_FOUND');
            expect(result.error).toContain('not found');
        });

        it('Test 29: should return error when agent is inactive', async () => {
            mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: false }));

            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('AGENT_INACTIVE');
            expect(result.error).toContain('inactive');
        });

        it('Test 30: should return error when load fails', async () => {
            mockStorage.loadCustomAgent.mockImplementation(() => {
                throw new Error('Failed to read file');
            });

            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('AGENT_LOAD_ERROR');
            expect(result.error).toContain('Failed to load');
        });

        it('Test 31: should call completeLLM with correct messages', async () => {
            await executor.executeCustomAgent('test-agent', { query: 'Test query' });

            expect(mockLLM.completeLLM).toHaveBeenCalled();
            const call = mockLLM.completeLLM.mock.calls[0];
            expect(call[1]!.messages).toBeDefined();
            expect(call[1]!.messages![0].role).toBe('system');
            expect(call[1]!.messages![call[1]!.messages!.length - 1]).toEqual({
                role: 'user',
                content: 'Test query',
            });
        });

        it('Test 32: should include history in messages', async () => {
            const history = [
                { role: 'user' as const, content: 'Previous question' },
                { role: 'assistant' as const, content: 'Previous answer' },
            ];

            await executor.executeCustomAgent('test-agent', {
                query: 'Follow-up',
                history,
            });

            const call = mockLLM.completeLLM.mock.calls[0];
            const messages = call[1]!.messages!;
            expect(messages.length).toBeGreaterThan(2);
            expect(messages[1]).toEqual(history[0]);
            expect(messages[2]).toEqual(history[1]);
        });

        it('Test 33: should use streaming when onStream provided', async () => {
            mockLLM.streamLLM.mockResolvedValue({
                content: 'Streamed response',
                usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
            });

            const onStream = jest.fn();
            const result = await executor.executeCustomAgent(
                'test-agent',
                { query: 'Hello', onStream }
            );

            expect(mockLLM.streamLLM).toHaveBeenCalled();
            expect(mockLLM.completeLLM).not.toHaveBeenCalled();
            expect(result.content).toBe('Streamed response');
        });

        it('Test 34: should pass variables to system prompt', async () => {
            mockStorage.loadCustomAgent.mockReturnValue(
                createTestAgent({ systemPrompt: 'Task: {{task_id}}' })
            );

            await executor.executeCustomAgent('test-agent', {
                query: 'Hello',
                variables: { task_id: 'TASK-123' },
            });

            const call = mockLLM.completeLLM.mock.calls[0];
            const systemPrompt = call[1]!.messages![0].content;
            expect(systemPrompt).toContain('Task: TASK-123');
        });

        it('Test 35: should handle LLM errors', async () => {
            mockLLM.completeLLM.mockRejectedValue(new Error('API failure'));

            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('LLM_ERROR');
            expect(result.error).toContain('API failure');
        });

        it('Test 36: should handle hardlock violations', async () => {
            const HardlockError = (hardlock as any).HardlockViolationError;
            mockLLM.completeLLM.mockRejectedValue(
                new HardlockError('write_file', 'Cannot write code', 'file_write')
            );

            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('HARDLOCK_VIOLATION');
        });

        it('Test 37: should use agent temperature', async () => {
            mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ temperature: 0.3 }));

            await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            const call = mockLLM.completeLLM.mock.calls[0];
            expect(call[1]!.temperature).toBe(0.3);
        });

        it('Test 38: should handle storage errors', async () => {
            const StorageError = (storage as any).AgentStorageError;
            mockStorage.loadCustomAgent.mockImplementation(() => {
                throw new StorageError('Agent corrupted', 'test-agent', 'load');
            });

            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('AGENT_LOAD_ERROR');
        });
    });

    // ========================================================================
    // Section 4: CustomAgentExecutor Class Tests
    // ========================================================================

    describe('CustomAgentExecutor', () => {
        it('Test 39: should initialize successfully', async () => {
            const exec = new executor.CustomAgentExecutor('test-agent');
            await exec.initialize();

            expect(exec.isInitialized()).toBe(true);
            expect(exec.getAgent()).toBeDefined();
        });

        it('Test 40: should throw AgentNotFoundError when agent missing', async () => {
            mockStorage.customAgentExists.mockReturnValue(false);
            const exec = new executor.CustomAgentExecutor('missing-agent');

            await expect(exec.initialize()).rejects.toThrow(executor.AgentNotFoundError);
        });

        it('Test 41: should throw AgentInactiveError when agent inactive', async () => {
            mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: false }));
            const exec = new executor.CustomAgentExecutor('test-agent');

            await expect(exec.initialize()).rejects.toThrow(executor.AgentInactiveError);
        });

        it('Test 42: should throw when no workspace', async () => {
            mockStorage.getWorkspaceFolder.mockReturnValue(undefined);
            const exec = new executor.CustomAgentExecutor('test-agent');

            await expect(exec.initialize()).rejects.toThrow('No workspace');
        });

        it('Test 43: should execute queries', async () => {
            const exec = new executor.CustomAgentExecutor('test-agent');
            const result = await exec.execute('What is TypeScript?');

            expect(result.success).toBe(true);
            expect(result.content).toBe('Test response from LLM');
        });

        it('Test 44: should auto-initialize on first execute', async () => {
            const exec = new executor.CustomAgentExecutor('test-agent');

            expect(exec.isInitialized()).toBe(false);
            await exec.execute('Hello');
            expect(exec.isInitialized()).toBe(true);
        });

        it('Test 45: should maintain conversation history', async () => {
            const exec = new executor.CustomAgentExecutor('test-agent');

            await exec.execute('First message');
            const history = exec.getHistory();

            expect(history.length).toBe(2);
            expect(history[0]).toEqual({ role: 'user', content: 'First message' });
            expect(history[1]).toEqual({ role: 'assistant', content: 'Test response from LLM' });
        });

        it('Test 46: should include history in subsequent calls', async () => {
            const exec = new executor.CustomAgentExecutor('test-agent');

            await exec.execute('First');
            await exec.execute('Second');

            // Second call should include history from first
            const secondCall = mockLLM.completeLLM.mock.calls[1];
            const messages = secondCall[1]!.messages!;

            // Should have: system, user (First), assistant (response), user (Second)
            expect(messages.length).toBeGreaterThan(2);
        });

        it('Test 47: should clear history', async () => {
            const exec = new executor.CustomAgentExecutor('test-agent');

            await exec.execute('First');
            expect(exec.getHistory().length).toBe(2);

            exec.clearHistory();
            expect(exec.getHistory().length).toBe(0);
        });

        it('Test 48: should trim history when too long', async () => {
            const exec = new executor.CustomAgentExecutor('test-agent');

            // Execute 15 times to exceed the 10-exchange (20 message) limit
            for (let i = 0; i < 15; i++) {
                await exec.execute(`Message ${i}`);
            }

            const history = exec.getHistory();
            expect(history.length).toBeLessThanOrEqual(20);
        });

        it('Test 49: should not add to history on failure', async () => {
            mockLLM.completeLLM
                .mockResolvedValueOnce({ content: 'Success', usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
                .mockRejectedValueOnce(new Error('API failure'));

            const exec = new executor.CustomAgentExecutor('test-agent');

            await exec.execute('First');
            expect(exec.getHistory().length).toBe(2);

            await exec.execute('Second'); // This should fail
            expect(exec.getHistory().length).toBe(2); // No change
        });

        it('Test 50: should support streaming', async () => {
            mockLLM.streamLLM.mockResolvedValue({
                content: 'Streamed',
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            });

            const exec = new executor.CustomAgentExecutor('test-agent');
            const onStream = jest.fn();

            await exec.execute('Hello', {}, onStream);

            expect(mockLLM.streamLLM).toHaveBeenCalled();
        });

        it('Test 51: should validate tools', async () => {
            mockHardlock.validateToolAccess.mockReturnValue({ allowed: false, tool: 'write_file', reason: 'No code editing' });

            const exec = new executor.CustomAgentExecutor('test-agent');
            const result = exec.validateTool('write_file');

            expect(result.allowed).toBe(false);
            expect(mockHardlock.validateToolAccess).toHaveBeenCalledWith('write_file');
        });

        it('Test 52: should create tool executor', () => {
            const mockToolExecutor = jest.fn().mockResolvedValue('result');
            mockHardlock.createHardlockExecutor.mockReturnValue(mockToolExecutor as any);

            const exec = new executor.CustomAgentExecutor('test-agent');
            const toolExec = exec.createToolExecutor();

            expect(toolExec).toBe(mockToolExecutor);
            expect(mockHardlock.createHardlockExecutor).toHaveBeenCalledWith('test-agent');
        });

        it('Test 53: should pass options to execution', async () => {
            mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ temperature: 0.5 }));

            const exec = new executor.CustomAgentExecutor('test-agent', { temperature: 0.9 });
            await exec.execute('Hello');

            // Options should override agent settings (handled by executeCustomAgent)
            expect(mockLLM.completeLLM).toHaveBeenCalled();
        });

        it('Test 54: should return immutable history copy', async () => {
            const exec = new executor.CustomAgentExecutor('test-agent');
            await exec.execute('Hello');

            const history = exec.getHistory();
            history.push({ role: 'user', content: 'Injected' });

            expect(exec.getHistory().length).toBe(2); // Original unchanged
        });
    });

    // ========================================================================
    // Section 5: Utility Function Tests
    // ========================================================================

    describe('quickExecute', () => {
        it('Test 55: should execute agent with minimal config', async () => {
            const result = await executor.quickExecute('test-agent', 'Hello');

            expect(result.success).toBe(true);
            expect(result.content).toBe('Test response from LLM');
        });

        it('Test 56: should pass variables', async () => {
            mockStorage.loadCustomAgent.mockReturnValue(
                createTestAgent({ systemPrompt: 'ID: {{task_id}}' })
            );

            await executor.quickExecute('test-agent', 'Hello', { task_id: 'T-1' });

            const call = mockLLM.completeLLM.mock.calls[0];
            expect(call[1]!.messages![0].content).toContain('ID: T-1');
        });

        it('Test 57: should handle errors gracefully', async () => {
            mockStorage.customAgentExists.mockReturnValue(false);

            const result = await executor.quickExecute('missing', 'Hello');

            expect(result.success).toBe(false);
        });
    });

    describe('canExecuteAgent', () => {
        it('Test 58: should return true for active agent', () => {
            expect(executor.canExecuteAgent('test-agent')).toBe(true);
        });

        it('Test 59: should return false when no workspace', () => {
            mockStorage.getWorkspaceFolder.mockReturnValue(undefined);
            expect(executor.canExecuteAgent('test-agent')).toBe(false);
        });

        it('Test 60: should return false when agent not found', () => {
            mockStorage.customAgentExists.mockReturnValue(false);
            expect(executor.canExecuteAgent('missing')).toBe(false);
        });

        it('Test 61: should return false when agent is inactive', () => {
            mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: false }));
            expect(executor.canExecuteAgent('inactive')).toBe(false);
        });

        it('Test 62: should return false on load error', () => {
            mockStorage.loadCustomAgent.mockImplementation(() => {
                throw new Error('Corrupted');
            });
            expect(executor.canExecuteAgent('broken')).toBe(false);
        });
    });

    describe('previewSystemPrompt', () => {
        it('Test 63: should return full system prompt', () => {
            const preview = executor.previewSystemPrompt('test-agent');

            expect(preview).not.toBeNull();
            expect(preview).toContain('# test-agent');
            expect(preview).toContain('## Goals');
        });

        it('Test 64: should substitute variables', () => {
            mockStorage.loadCustomAgent.mockReturnValue(
                createTestAgent({ systemPrompt: 'Query: {{user_query}}' })
            );

            const preview = executor.previewSystemPrompt('test-agent', { user_query: 'test' });

            expect(preview).toContain('Query: test');
        });

        it('Test 65: should return null when no workspace', () => {
            mockStorage.getWorkspaceFolder.mockReturnValue(undefined);
            expect(executor.previewSystemPrompt('test-agent')).toBeNull();
        });

        it('Test 66: should return null on load error', () => {
            mockStorage.loadCustomAgent.mockImplementation(() => {
                throw new Error('Failed');
            });
            expect(executor.previewSystemPrompt('broken')).toBeNull();
        });

        it('Test 67: should work with empty variables', () => {
            const preview = executor.previewSystemPrompt('test-agent', {});

            expect(preview).not.toBeNull();
        });
    });

    // ========================================================================
    // Section 6: Error Class Tests
    // ========================================================================

    describe('Error Classes', () => {
        describe('AgentNotFoundError', () => {
            it('Test 68: should have correct message', () => {
                const error = new executor.AgentNotFoundError('my-agent');
                expect(error.message).toBe('Custom agent "my-agent" not found');
            });

            it('Test 69: should have correct name', () => {
                const error = new executor.AgentNotFoundError('my-agent');
                expect(error.name).toBe('AgentNotFoundError');
            });

            it('Test 70: should have correct code', () => {
                const error = new executor.AgentNotFoundError('my-agent');
                expect(error.code).toBe('AGENT_NOT_FOUND');
            });

            it('Test 71: should store agent name', () => {
                const error = new executor.AgentNotFoundError('my-agent');
                expect(error.agentName).toBe('my-agent');
            });
        });

        describe('AgentInactiveError', () => {
            it('Test 72: should have correct message', () => {
                const error = new executor.AgentInactiveError('my-agent');
                expect(error.message).toBe('Custom agent "my-agent" is inactive');
            });

            it('Test 73: should have correct code', () => {
                const error = new executor.AgentInactiveError('my-agent');
                expect(error.code).toBe('AGENT_INACTIVE');
            });
        });

        describe('AgentTimeoutError', () => {
            it('Test 74: should have correct message', () => {
                const error = new executor.AgentTimeoutError('my-agent', 60);
                expect(error.message).toBe('Custom agent "my-agent" timed out after 60s');
            });

            it('Test 75: should have correct code', () => {
                const error = new executor.AgentTimeoutError('my-agent', 60);
                expect(error.code).toBe('TIMEOUT');
            });

            it('Test 76: should store timeout value', () => {
                const error = new executor.AgentTimeoutError('my-agent', 30);
                expect(error.timeoutSeconds).toBe(30);
            });
        });
    });

    // ========================================================================
    // Section 7: Edge Cases and Integration Tests
    // ========================================================================

    describe('Edge Cases', () => {
        it('Test 77: should handle very long system prompts', async () => {
            const longPrompt = 'A'.repeat(10000);
            mockStorage.loadCustomAgent.mockReturnValue(
                createTestAgent({ systemPrompt: longPrompt })
            );

            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.success).toBe(true);
        });

        it('Test 78: should handle agent with many custom lists', async () => {
            mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({
                customLists: Array.from({ length: 7 }, (_, i) => ({
                    name: `List ${i}`,
                    description: `Description ${i}`,
                    items: [`Item ${i}`],
                    order: i,
                    collapsed: false,
                })),
            }));

            const result = await executor.executeCustomAgent('test-agent', { query: 'Hello' });

            expect(result.success).toBe(true);
        });

        it('Test 79: should handle special characters in variables', async () => {
            const template = 'Query: {{user_query}}';
            const result = executor.substituteVariables(template, {
                user_query: '<script>alert("xss")</script>',
            });
            expect(result).toContain('<script>');
        });

        it('Test 80: should handle unicode in agent config', async () => {
            mockStorage.loadCustomAgent.mockReturnValue(
                createTestAgent({
                    name: '日本語エージェント',
                    description: '🤖 AI Assistant',
                    systemPrompt: 'Помощник',
                })
            );

            const result = await executor.executeCustomAgent('test-agent', { query: '你好' });

            expect(result.success).toBe(true);
        });

        it('Test 81: should handle concurrent executions', async () => {
            const results = await Promise.all([
                executor.executeCustomAgent('test-agent', { query: 'Query 1' }),
                executor.executeCustomAgent('test-agent', { query: 'Query 2' }),
                executor.executeCustomAgent('test-agent', { query: 'Query 3' }),
            ]);

            expect(results.every(r => r.success)).toBe(true);
            expect(mockLLM.completeLLM).toHaveBeenCalledTimes(3);
        });
    });

    // ========================================================================
    // Section 8: Activation/Deactivation Tests (MT-030.15)
    // ========================================================================

    describe('Agent Activation/Deactivation', () => {
        beforeEach(() => {
            // Reset mocks for activation tests
            mockStorage.getWorkspaceFolder.mockReturnValue('/test/workspace');
            mockStorage.customAgentExists.mockReturnValue(true);
            mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: true }));
            (mockStorage.saveCustomAgent as jest.Mock).mockClear();
            (mockStorage.listCustomAgents as jest.Mock).mockClear();
        });

        describe('activateAgent', () => {
            it('Test 82: should activate an inactive agent', () => {
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: false }));

                const result = executor.activateAgent('test-agent');

                expect(result.success).toBe(true);
                expect(result.agentName).toBe('test-agent');
                expect(result.isActive).toBe(true);
                expect(mockStorage.saveCustomAgent).toHaveBeenCalled();
            });

            it('Test 83: should succeed if agent already active', () => {
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: true }));

                const result = executor.activateAgent('test-agent');

                expect(result.success).toBe(true);
                expect(result.isActive).toBe(true);
                // Should not save if already active
                expect(mockStorage.saveCustomAgent).not.toHaveBeenCalled();
            });

            it('Test 84: should fail if no workspace folder', () => {
                mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

                const result = executor.activateAgent('test-agent');

                expect(result.success).toBe(false);
                expect(result.error).toBe('No workspace folder open');
            });

            it('Test 85: should fail if agent not found', () => {
                mockStorage.customAgentExists.mockReturnValue(false);

                const result = executor.activateAgent('nonexistent-agent');

                expect(result.success).toBe(false);
                expect(result.error).toContain('not found');
            });
        });

        describe('deactivateAgent', () => {
            it('Test 86: should deactivate an active agent', () => {
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: true }));

                const result = executor.deactivateAgent('test-agent');

                expect(result.success).toBe(true);
                expect(result.agentName).toBe('test-agent');
                expect(result.isActive).toBe(false);
                expect(mockStorage.saveCustomAgent).toHaveBeenCalled();
            });

            it('Test 87: should succeed if agent already inactive', () => {
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: false }));

                const result = executor.deactivateAgent('test-agent');

                expect(result.success).toBe(true);
                expect(result.isActive).toBe(false);
                // Should not save if already inactive
                expect(mockStorage.saveCustomAgent).not.toHaveBeenCalled();
            });

            it('Test 88: should fail if no workspace folder', () => {
                mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

                const result = executor.deactivateAgent('test-agent');

                expect(result.success).toBe(false);
                expect(result.error).toBe('No workspace folder open');
            });

            it('Test 89: should fail if agent not found', () => {
                mockStorage.customAgentExists.mockReturnValue(false);

                const result = executor.deactivateAgent('nonexistent-agent');

                expect(result.success).toBe(false);
                expect(result.error).toContain('not found');
            });
        });

        describe('toggleAgentActivation', () => {
            it('Test 90: should toggle active to inactive', () => {
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: true }));

                const result = executor.toggleAgentActivation('test-agent');

                expect(result.success).toBe(true);
                expect(result.isActive).toBe(false);
            });

            it('Test 91: should toggle inactive to active', () => {
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: false }));

                const result = executor.toggleAgentActivation('test-agent');

                expect(result.success).toBe(true);
                expect(result.isActive).toBe(true);
            });

            it('Test 92: should fail if no workspace folder', () => {
                mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

                const result = executor.toggleAgentActivation('test-agent');

                expect(result.success).toBe(false);
                expect(result.error).toBe('No workspace folder open');
            });

            it('Test 93: should fail if agent not found', () => {
                mockStorage.customAgentExists.mockReturnValue(false);

                const result = executor.toggleAgentActivation('test-agent');

                expect(result.success).toBe(false);
                expect(result.error).toContain('not found');
            });
        });

        describe('isAgentActive', () => {
            it('Test 94: should return true for active agent', () => {
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: true }));

                const result = executor.isAgentActive('test-agent');

                expect(result).toBe(true);
            });

            it('Test 95: should return false for inactive agent', () => {
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: false }));

                const result = executor.isAgentActive('test-agent');

                expect(result).toBe(false);
            });

            it('Test 96: should return false if no workspace', () => {
                mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

                const result = executor.isAgentActive('test-agent');

                expect(result).toBe(false);
            });

            it('Test 97: should return false if agent not found', () => {
                mockStorage.customAgentExists.mockReturnValue(false);

                const result = executor.isAgentActive('nonexistent-agent');

                expect(result).toBe(false);
            });

            it('Test 98: should return false if load throws', () => {
                mockStorage.loadCustomAgent.mockImplementation(() => {
                    throw new Error('Load failed');
                });

                const result = executor.isAgentActive('test-agent');

                expect(result).toBe(false);
            });
        });

        describe('getActiveAgents', () => {
            it('Test 99: should return list of active agent names', () => {
                (mockStorage.listCustomAgents as jest.Mock).mockReturnValue([
                    { name: 'agent-1', configPath: '/test/agent-1', valid: true, agent: createTestAgent({ name: 'agent-1', isActive: true }) },
                    { name: 'agent-2', configPath: '/test/agent-2', valid: true, agent: createTestAgent({ name: 'agent-2', isActive: true }) },
                ]);

                const result = executor.getActiveAgents();

                expect(result).toEqual(['agent-1', 'agent-2']);
            });

            it('Test 100: should return empty array if no workspace', () => {
                mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

                const result = executor.getActiveAgents();

                expect(result).toEqual([]);
            });

            it('Test 101: should return empty array on error', () => {
                (mockStorage.listCustomAgents as jest.Mock).mockImplementation(() => {
                    throw new Error('List failed');
                });

                const result = executor.getActiveAgents();

                expect(result).toEqual([]);
            });
        });

        describe('getInactiveAgents', () => {
            it('Test 102: should return list of inactive agent names', () => {
                (mockStorage.listCustomAgents as jest.Mock).mockReturnValue([
                    { name: 'agent-1', configPath: '/test/agent-1', valid: true, agent: createTestAgent({ name: 'agent-1', isActive: true }) },
                    { name: 'agent-2', configPath: '/test/agent-2', valid: true, agent: createTestAgent({ name: 'agent-2', isActive: false }) },
                    { name: 'agent-3', configPath: '/test/agent-3', valid: true, agent: createTestAgent({ name: 'agent-3', isActive: false }) },
                ]);

                const result = executor.getInactiveAgents();

                expect(result).toEqual(['agent-2', 'agent-3']);
            });

            it('Test 103: should return empty array if no workspace', () => {
                mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

                const result = executor.getInactiveAgents();

                expect(result).toEqual([]);
            });

            it('Test 104: should return empty array on error', () => {
                (mockStorage.listCustomAgents as jest.Mock).mockImplementation(() => {
                    throw new Error('List failed');
                });

                const result = executor.getInactiveAgents();

                expect(result).toEqual([]);
            });
        });

        describe('activateAgents (bulk)', () => {
            it('Test 105: should activate multiple agents', () => {
                let callCount = 0;
                mockStorage.loadCustomAgent.mockImplementation(() => {
                    callCount++;
                    return createTestAgent({ isActive: false, name: `agent-${callCount}` });
                });

                const results = executor.activateAgents(['agent-1', 'agent-2']);

                expect(results).toHaveLength(2);
                expect(results[0].success).toBe(true);
                expect(results[1].success).toBe(true);
            });

            it('Test 106: should handle partial failures in bulk activate', () => {
                mockStorage.customAgentExists
                    .mockReturnValueOnce(true)
                    .mockReturnValueOnce(false);
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: false }));

                const results = executor.activateAgents(['agent-1', 'nonexistent']);

                expect(results[0].success).toBe(true);
                expect(results[1].success).toBe(false);
            });

            it('Test 107: should return empty array for empty input', () => {
                const results = executor.activateAgents([]);

                expect(results).toEqual([]);
            });
        });

        describe('deactivateAgents (bulk)', () => {
            it('Test 108: should deactivate multiple agents', () => {
                let callCount = 0;
                mockStorage.loadCustomAgent.mockImplementation(() => {
                    callCount++;
                    return createTestAgent({ isActive: true, name: `agent-${callCount}` });
                });

                const results = executor.deactivateAgents(['agent-1', 'agent-2']);

                expect(results).toHaveLength(2);
                expect(results[0].success).toBe(true);
                expect(results[1].success).toBe(true);
            });

            it('Test 109: should handle partial failures in bulk deactivate', () => {
                mockStorage.customAgentExists
                    .mockReturnValueOnce(true)
                    .mockReturnValueOnce(false);
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: true }));

                const results = executor.deactivateAgents(['agent-1', 'nonexistent']);

                expect(results[0].success).toBe(true);
                expect(results[1].success).toBe(false);
            });

            it('Test 110: should return empty array for empty input', () => {
                const results = executor.deactivateAgents([]);

                expect(results).toEqual([]);
            });
        });

        describe('Error handling', () => {
            it('Test 111: should catch save errors during activation', () => {
                mockStorage.loadCustomAgent.mockReturnValue(createTestAgent({ isActive: false }));
                (mockStorage.saveCustomAgent as jest.Mock).mockImplementation(() => {
                    throw new Error('Save failed');
                });

                const result = executor.activateAgent('test-agent');

                expect(result.success).toBe(false);
                expect(result.error).toContain('Failed to activate');
            });

            it('Test 112: should catch load errors during check', () => {
                mockStorage.loadCustomAgent.mockImplementation(() => {
                    throw new Error('Load failed');
                });

                const result = executor.toggleAgentActivation('test-agent');

                expect(result.success).toBe(false);
                expect(result.error).toContain('Failed to toggle');
            });
        });
    });
});
