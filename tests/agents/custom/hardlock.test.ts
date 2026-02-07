import {
    HardlockViolationError,
    validateToolAccess,
    assertToolAllowed,
    getAllowedToolsList,
    getBlockedToolsList,
    getHardlockPolicyDescription,
    withHardlockGuard,
    createHardlockExecutor,
    validateToolList,
    generateEscalationDescription,
} from '../../../src/agents/custom/hardlock';
import {
    CUSTOM_AGENT_ALLOWED_TOOLS,
    CUSTOM_AGENT_BLOCKED_TOOLS,
} from '../../../src/agents/custom/schema';

describe('Custom Agent Hardlock', () => {
    // ========================================================================
    // Test Group 1: HardlockViolationError
    // ========================================================================

    describe('HardlockViolationError', () => {
        it('Test 1: should create error with correct properties', () => {
            const error = new HardlockViolationError('create_file', 'my-agent');

            expect(error.name).toBe('HardlockViolationError');
            expect(error.code).toBe('HARDLOCK_VIOLATION');
            expect(error.tool).toBe('create_file');
            expect(error.agentName).toBe('my-agent');
        });

        it('Test 2: should include tool and agent in message', () => {
            const error = new HardlockViolationError('replace_string_in_file', 'doc-agent');

            expect(error.message).toContain('doc-agent');
            expect(error.message).toContain('replace_string_in_file');
            expect(error.message).toContain('blocked');
        });

        it('Test 3: should provide user-friendly message', () => {
            const error = new HardlockViolationError('run_in_terminal', 'helper');
            const userMsg = error.getUserMessage();

            expect(userMsg).toContain('🚫');
            expect(userMsg).toContain('run_in_terminal');
            expect(userMsg).toContain('ticket');
        });

        it('Test 4: should provide tool-specific suggestions', () => {
            const errors = [
                new HardlockViolationError('create_file', 'agent'),
                new HardlockViolationError('replace_string_in_file', 'agent'),
                new HardlockViolationError('run_in_terminal', 'agent'),
                new HardlockViolationError('runTests', 'agent'),
            ];

            errors.forEach(error => {
                const suggestion = error.getSuggestion();
                expect(suggestion.length).toBeGreaterThan(0);
            });
        });

        it('Test 5: should provide default suggestion for unknown blocked tools', () => {
            const error = new HardlockViolationError('unknown_tool', 'agent');
            const suggestion = error.getSuggestion();

            expect(suggestion).toContain('ticket');
        });
    });

    // ========================================================================
    // Test Group 2: Tool Validation
    // ========================================================================

    describe('validateToolAccess', () => {
        it('Test 6: should allow all permitted tools', () => {
            CUSTOM_AGENT_ALLOWED_TOOLS.forEach(tool => {
                const result = validateToolAccess(tool);
                expect(result.allowed).toBe(true);
                expect(result.tool).toBe(tool);
            });
        });

        it('Test 7: should block all blocked tools', () => {
            CUSTOM_AGENT_BLOCKED_TOOLS.forEach(tool => {
                const result = validateToolAccess(tool);
                expect(result.allowed).toBe(false);
                expect(result.tool).toBe(tool);
                expect(result.reason).toBeDefined();
            });
        });

        it('Test 8: should block unknown tools', () => {
            const result = validateToolAccess('some_unknown_tool');

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('not on the allowed');
        });

        it('Test 9: should include suggestion for blocked tools', () => {
            const result = validateToolAccess('create_file');

            expect(result.allowed).toBe(false);
            expect(result.suggestion).toBeDefined();
        });

        it('Test 10: should return reason for allowed tools', () => {
            const result = validateToolAccess('read_file');

            expect(result.allowed).toBe(true);
            expect(result.reason).toContain('allowed');
        });
    });

    // ========================================================================
    // Test Group 3: assertToolAllowed
    // ========================================================================

    describe('assertToolAllowed', () => {
        it('Test 11: should not throw for allowed tools', () => {
            CUSTOM_AGENT_ALLOWED_TOOLS.forEach(tool => {
                expect(() => assertToolAllowed(tool, 'test-agent')).not.toThrow();
            });
        });

        it('Test 12: should throw HardlockViolationError for blocked tools', () => {
            CUSTOM_AGENT_BLOCKED_TOOLS.forEach(tool => {
                expect(() => assertToolAllowed(tool, 'test-agent'))
                    .toThrow(HardlockViolationError);
            });
        });

        it('Test 13: should throw with correct agent name', () => {
            try {
                assertToolAllowed('create_file', 'my-custom-agent');
            } catch (error) {
                expect(error).toBeInstanceOf(HardlockViolationError);
                expect((error as HardlockViolationError).agentName).toBe('my-custom-agent');
            }
        });

        it('Test 14: should throw for unknown tools', () => {
            expect(() => assertToolAllowed('mystery_tool', 'agent'))
                .toThrow();
        });
    });

    // ========================================================================
    // Test Group 4: Tool Lists
    // ========================================================================

    describe('Tool Lists', () => {
        it('Test 15: should format allowed tools list', () => {
            const list = getAllowedToolsList();

            CUSTOM_AGENT_ALLOWED_TOOLS.forEach(tool => {
                expect(list).toContain(tool);
            });
            expect(list).toContain('•');
        });

        it('Test 16: should format blocked tools list', () => {
            const list = getBlockedToolsList();

            CUSTOM_AGENT_BLOCKED_TOOLS.forEach(tool => {
                expect(list).toContain(tool);
            });
            expect(list).toContain('•');
        });

        it('Test 17: should generate complete policy description', () => {
            const policy = getHardlockPolicyDescription();

            expect(policy).toContain('CUSTOM AGENT');
            expect(policy).toContain('ALLOWED');
            expect(policy).toContain('BLOCKED');
            expect(policy).toContain('ask_questions');
            expect(policy).toContain('security');
        });
    });

    // ========================================================================
    // Test Group 5: Hardlock Guard
    // ========================================================================

    describe('withHardlockGuard', () => {
        it('Test 18: should execute allowed tools', async () => {
            const executor = jest.fn().mockResolvedValue('success');

            const result = await withHardlockGuard(
                'test-agent',
                'read_file',
                executor
            );

            expect(result).toBe('success');
            expect(executor).toHaveBeenCalled();
        });

        it('Test 19: should block execution of blocked tools', async () => {
            const executor = jest.fn().mockResolvedValue('should not run');

            await expect(
                withHardlockGuard('test-agent', 'create_file', executor)
            ).rejects.toThrow(HardlockViolationError);

            expect(executor).not.toHaveBeenCalled();
        });

        it('Test 20: should pass through executor result', async () => {
            const complexResult = { data: [1, 2, 3], count: 3 };
            const executor = jest.fn().mockResolvedValue(complexResult);

            const result = await withHardlockGuard(
                'agent',
                'grep_search',
                executor
            );

            expect(result).toEqual(complexResult);
        });

        it('Test 21: should pass through executor errors', async () => {
            const executor = jest.fn().mockRejectedValue(new Error('File not found'));

            await expect(
                withHardlockGuard('agent', 'read_file', executor)
            ).rejects.toThrow('File not found');
        });
    });

    // ========================================================================
    // Test Group 6: Hardlock Executor Factory
    // ========================================================================

    describe('createHardlockExecutor', () => {
        it('Test 22: should create executor bound to agent', async () => {
            const executor = createHardlockExecutor('bound-agent');
            const toolFn = jest.fn().mockResolvedValue('result');

            const result = await executor('read_file', toolFn);

            expect(result).toBe('result');
        });

        it('Test 23: should block tools with bound agent name in error', async () => {
            const executor = createHardlockExecutor('my-bound-agent');
            const toolFn = jest.fn();

            try {
                await executor('create_file', toolFn);
            } catch (error) {
                expect(error).toBeInstanceOf(HardlockViolationError);
                expect((error as HardlockViolationError).agentName).toBe('my-bound-agent');
            }
        });

        it('Test 24: should allow multiple tool calls', async () => {
            const executor = createHardlockExecutor('multi-agent');

            await executor('read_file', async () => 'a');
            await executor('grep_search', async () => 'b');
            await executor('list_dir', async () => 'c');

            // All should succeed without throwing
        });
    });

    // ========================================================================
    // Test Group 7: Tool List Validation
    // ========================================================================

    describe('validateToolList', () => {
        it('Test 25: should categorize tools correctly', () => {
            const result = validateToolList([
                'read_file',      // allowed
                'create_file',    // blocked
                'mystery_tool',   // unknown
            ]);

            expect(result.allowed).toContain('read_file');
            expect(result.blocked).toContain('create_file');
            expect(result.unknown).toContain('mystery_tool');
        });

        it('Test 26: should return allAllowed=true when all allowed', () => {
            const result = validateToolList(['read_file', 'grep_search']);

            expect(result.allAllowed).toBe(true);
        });

        it('Test 27: should return allAllowed=false when any blocked', () => {
            const result = validateToolList(['read_file', 'create_file']);

            expect(result.allAllowed).toBe(false);
        });

        it('Test 28: should return allAllowed=false when any unknown', () => {
            const result = validateToolList(['read_file', 'unknown']);

            expect(result.allAllowed).toBe(false);
        });

        it('Test 29: should handle empty list', () => {
            const result = validateToolList([]);

            expect(result.allowed).toEqual([]);
            expect(result.blocked).toEqual([]);
            expect(result.unknown).toEqual([]);
            expect(result.allAllowed).toBe(true);
        });

        it('Test 30: should validate all allowed tools', () => {
            const result = validateToolList([...CUSTOM_AGENT_ALLOWED_TOOLS]);

            expect(result.allowed.length).toBe(CUSTOM_AGENT_ALLOWED_TOOLS.length);
            expect(result.blocked.length).toBe(0);
            expect(result.allAllowed).toBe(true);
        });

        it('Test 31: should identify all blocked tools', () => {
            const result = validateToolList([...CUSTOM_AGENT_BLOCKED_TOOLS]);

            expect(result.blocked.length).toBe(CUSTOM_AGENT_BLOCKED_TOOLS.length);
            expect(result.allowed.length).toBe(0);
            expect(result.allAllowed).toBe(false);
        });
    });

    // ========================================================================
    // Test Group 8: Escalation Helpers
    // ========================================================================

    describe('generateEscalationDescription', () => {
        it('Test 32: should include agent name', () => {
            const desc = generateEscalationDescription(
                'doc-writer',
                'create_file',
                'Need to create documentation'
            );

            expect(desc).toContain('doc-writer');
        });

        it('Test 33: should include tool name', () => {
            const desc = generateEscalationDescription(
                'agent',
                'run_in_terminal',
                'Need to run build command'
            );

            expect(desc).toContain('run_in_terminal');
        });

        it('Test 34: should include context', () => {
            const context = 'The agent needs to update the README file with new API documentation.';
            const desc = generateEscalationDescription(
                'agent',
                'replace_string_in_file',
                context
            );

            expect(desc).toContain(context);
        });

        it('Test 35: should be markdown formatted', () => {
            const desc = generateEscalationDescription(
                'agent',
                'create_file',
                'Context here'
            );

            expect(desc).toContain('##');
            expect(desc).toContain('###');
            expect(desc).toContain('`');
        });

        it('Test 36: should explain the restriction', () => {
            const desc = generateEscalationDescription(
                'agent',
                'create_file',
                'Context'
            );

            expect(desc).toContain('read-only');
            expect(desc).toContain('elevated permissions');
        });
    });

    // ========================================================================
    // Test Group 9: Integration Scenarios
    // ========================================================================

    describe('Integration Scenarios', () => {
        it('Test 37: should handle typical read workflow', async () => {
            const executor = createHardlockExecutor('researcher');

            // Typical research workflow
            const fileContent = await executor('read_file', async () => 'file content');
            const searchResults = await executor('grep_search', async () => ['match1', 'match2']);
            const dirListing = await executor('list_dir', async () => ['file1', 'file2']);

            expect(fileContent).toBe('file content');
            expect(searchResults).toHaveLength(2);
            expect(dirListing).toHaveLength(2);
        });

        it('Test 38: should block write attempts in workflow', async () => {
            const executor = createHardlockExecutor('researcher');

            // Read succeeds
            await executor('read_file', async () => 'content');

            // But write is blocked
            await expect(
                executor('create_file', async () => 'created')
            ).rejects.toThrow(HardlockViolationError);
        });

        it('Test 39: should provide actionable errors', () => {
            const error = new HardlockViolationError('replace_string_in_file', 'fixer-agent');

            // Error should help user understand what to do
            expect(error.message).toContain('Planning or Programming team');
            expect(error.getUserMessage()).toContain('ticket');
            expect(error.getSuggestion()).toContain('ticket');
        });

        it('Test 40: should validate agent permission set', () => {
            // Simulate checking if an agent's configured tools are all allowed
            const agentTools = ['read_file', 'grep_search', 'semantic_search'];
            const result = validateToolList(agentTools);

            expect(result.allAllowed).toBe(true);

            // If someone tries to add a blocked tool
            const badTools = [...agentTools, 'create_file'];
            const badResult = validateToolList(badTools);

            expect(badResult.allAllowed).toBe(false);
            expect(badResult.blocked).toContain('create_file');
        });
    });
});
