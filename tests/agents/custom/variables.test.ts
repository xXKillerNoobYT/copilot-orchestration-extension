/**
 * Tests for Variable Substitution Engine
 *
 * Tests for placeholder replacement in agent prompts.
 */

import {
    SubstitutionContext,
    findVariables,
    validateVariables,
    substituteVariables,
    AVAILABLE_VARIABLES,
    getVariableDefinition,
    createMockContext,
    createContextFromExecution,
    safeSubstitute,
} from '../../../src/agents/custom/variables';

describe('Variable Substitution Engine', () => {
    // ============================================================================
    // findVariables Tests
    // ============================================================================
    describe('findVariables', () => {
        it('Test 1: should find single variable', () => {
            const result = findVariables('Hello {{name}}!');
            expect(result).toEqual(['name']);
        });

        it('Test 2: should find multiple variables', () => {
            const result = findVariables('Task {{task_id}} for user {{user_id}}');
            expect(result).toEqual(['task_id', 'user_id']);
        });

        it('Test 3: should return empty array when no variables', () => {
            const result = findVariables('No variables here');
            expect(result).toEqual([]);
        });

        it('Test 4: should deduplicate repeated variables', () => {
            const result = findVariables('{{name}} is {{name}}');
            expect(result).toEqual(['name']);
        });

        it('Test 5: should find variables with underscores', () => {
            const result = findVariables('{{task_id}} {{user_name}}');
            expect(result).toContain('task_id');
            expect(result).toContain('user_name');
        });

        it('Test 6: should not match incomplete brackets', () => {
            const result = findVariables('{{incomplete} {single}');
            expect(result).toEqual([]);
        });

        it('Test 7: should handle empty string', () => {
            const result = findVariables('');
            expect(result).toEqual([]);
        });

        it('Test 8: should handle multiline text', () => {
            const text = `Line 1: {{var1}}
Line 2: {{var2}}
Line 3: no variable`;
            const result = findVariables(text);
            expect(result).toEqual(['var1', 'var2']);
        });

        it('Test 9: should find variables in complex prompts', () => {
            const prompt = `You are helping with task {{task_id}}.
The user query is: {{query}}
Current time: {{timestamp}}`;
            const result = findVariables(prompt);
            expect(result).toContain('task_id');
            expect(result).toContain('query');
            expect(result).toContain('timestamp');
        });
    });

    // ============================================================================
    // validateVariables Tests
    // ============================================================================
    describe('validateVariables', () => {
        it('Test 10: should validate when all variables present', () => {
            const context: SubstitutionContext = {
                name: 'John',
                age: '30'
            };
            const result = validateVariables('{{name}} is {{age}}', context);

            expect(result.valid).toBe(true);
            expect(result.missing).toEqual([]);
        });

        it('Test 11: should detect missing variables', () => {
            const context: SubstitutionContext = {
                name: 'John'
            };
            const result = validateVariables('{{name}} {{missing}}', context);

            expect(result.valid).toBe(false);
            expect(result.missing).toEqual(['missing']);
        });

        it('Test 12: should detect multiple missing variables', () => {
            const context: SubstitutionContext = {};
            const result = validateVariables('{{a}} {{b}} {{c}}', context);

            expect(result.valid).toBe(false);
            expect(result.missing).toContain('a');
            expect(result.missing).toContain('b');
            expect(result.missing).toContain('c');
        });

        it('Test 13: should be valid for text without variables', () => {
            const result = validateVariables('No variables here', {});

            expect(result.valid).toBe(true);
            expect(result.missing).toEqual([]);
        });

        it('Test 14: should handle empty context', () => {
            const result = validateVariables('{{required}}', {});

            expect(result.valid).toBe(false);
            expect(result.missing).toEqual(['required']);
        });

        it('Test 15: should not count undefined as valid', () => {
            const context: SubstitutionContext = {
                defined: 'value',
                undef: undefined
            };
            const result = validateVariables('{{defined}} {{undef}}', context);

            expect(result.valid).toBe(false);
            expect(result.missing).toEqual(['undef']);
        });
    });

    // ============================================================================
    // substituteVariables Tests
    // ============================================================================
    describe('substituteVariables', () => {
        it('Test 16: should substitute single variable', () => {
            const context: SubstitutionContext = { name: 'World' };
            const result = substituteVariables('Hello {{name}}!', context);

            expect(result).toBe('Hello World!');
        });

        it('Test 17: should substitute multiple variables', () => {
            const context: SubstitutionContext = {
                task_id: 'TASK-001',
                user_id: 'user123'
            };
            const result = substituteVariables('Task {{task_id}} by {{user_id}}', context);

            expect(result).toBe('Task TASK-001 by user123');
        });

        it('Test 18: should keep placeholder when variable missing', () => {
            const context: SubstitutionContext = { defined: 'yes' };
            const result = substituteVariables('{{defined}} {{missing}}', context);

            expect(result).toBe('yes {{missing}}');
        });

        it('Test 19: should handle empty string', () => {
            const result = substituteVariables('', { a: 'b' });
            expect(result).toBe('');
        });

        it('Test 20: should handle text without variables', () => {
            const result = substituteVariables('Plain text', { a: 'b' });
            expect(result).toBe('Plain text');
        });

        it('Test 21: should substitute same variable multiple times', () => {
            const context: SubstitutionContext = { x: 'X' };
            const result = substituteVariables('{{x}} + {{x}} = 2{{x}}', context);

            expect(result).toBe('X + X = 2X');
        });

        it('Test 22: should handle multiline substitution', () => {
            const context: SubstitutionContext = { a: 'A', b: 'B' };
            const text = 'Line 1: {{a}}\nLine 2: {{b}}';
            const result = substituteVariables(text, context);

            expect(result).toBe('Line 1: A\nLine 2: B');
        });
    });

    // ============================================================================
    // AVAILABLE_VARIABLES Tests
    // ============================================================================
    describe('AVAILABLE_VARIABLES', () => {
        it('Test 23: should include task_id', () => {
            expect(AVAILABLE_VARIABLES).toContain('task_id');
        });

        it('Test 24: should include ticket_id', () => {
            expect(AVAILABLE_VARIABLES).toContain('ticket_id');
        });

        it('Test 25: should include query', () => {
            expect(AVAILABLE_VARIABLES).toContain('query');
        });

        it('Test 26: should include user_id', () => {
            expect(AVAILABLE_VARIABLES).toContain('user_id');
        });

        it('Test 27: should include timestamp', () => {
            expect(AVAILABLE_VARIABLES).toContain('timestamp');
        });

        it('Test 28: should include agent_name', () => {
            expect(AVAILABLE_VARIABLES).toContain('agent_name');
        });

        it('Test 29: should include agent_version', () => {
            expect(AVAILABLE_VARIABLES).toContain('agent_version');
        });
    });

    // ============================================================================
    // getVariableDefinition Tests
    // ============================================================================
    describe('getVariableDefinition', () => {
        it('Test 30: should return definition for task_id', () => {
            const def = getVariableDefinition('task_id');
            expect(def).not.toBeNull();
            expect(def?.description).toBeTruthy();
            expect(def?.example).toBeTruthy();
        });

        it('Test 31: should return definition for ticket_id', () => {
            const def = getVariableDefinition('ticket_id');
            expect(def).not.toBeNull();
        });

        it('Test 32: should return definition for query', () => {
            const def = getVariableDefinition('query');
            expect(def).not.toBeNull();
        });

        it('Test 33: should return definition for user_id', () => {
            const def = getVariableDefinition('user_id');
            expect(def).not.toBeNull();
        });

        it('Test 34: should return definition for timestamp', () => {
            const def = getVariableDefinition('timestamp');
            expect(def).not.toBeNull();
        });

        it('Test 35: should return definition for agent_name', () => {
            const def = getVariableDefinition('agent_name');
            expect(def).not.toBeNull();
        });

        it('Test 36: should return definition for agent_version', () => {
            const def = getVariableDefinition('agent_version');
            expect(def).not.toBeNull();
        });

        it('Test 37: should return null for unknown variable', () => {
            const def = getVariableDefinition('unknown_variable');
            expect(def).toBeNull();
        });

        it('Test 38: should return null for empty string', () => {
            const def = getVariableDefinition('');
            expect(def).toBeNull();
        });
    });

    // ============================================================================
    // createMockContext Tests
    // ============================================================================
    describe('createMockContext', () => {
        it('Test 39: should create context with default values', () => {
            const context = createMockContext();

            expect(context.task_id).toBeTruthy();
            expect(context.ticket_id).toBeTruthy();
            expect(context.query).toBeTruthy();
            expect(context.user_id).toBeTruthy();
            expect(context.timestamp).toBeTruthy();
        });

        it('Test 40: should allow overriding values', () => {
            const context = createMockContext({ task_id: 'CUSTOM-123' });

            expect(context.task_id).toBe('CUSTOM-123');
            // Other values should still be defaults
            expect(context.ticket_id).toBeTruthy();
        });

        it('Test 41: should allow overriding multiple values', () => {
            const context = createMockContext({
                task_id: 'TASK-1',
                user_id: 'USER-1'
            });

            expect(context.task_id).toBe('TASK-1');
            expect(context.user_id).toBe('USER-1');
        });

        it('Test 42: should generate valid ISO timestamp', () => {
            const context = createMockContext();
            const timestamp = context.timestamp!;

            // Should be valid ISO date
            expect(() => new Date(timestamp)).not.toThrow();
        });
    });

    // ============================================================================
    // createContextFromExecution Tests
    // ============================================================================
    describe('createContextFromExecution', () => {
        it('Test 43: should create context from execution params', () => {
            const context = createContextFromExecution({
                taskId: 'T1',
                ticketId: 'TK1',
                userQuery: 'How?',
                userId: 'U1'
            });

            expect(context.task_id).toBe('T1');
            expect(context.ticket_id).toBe('TK1');
            expect(context.query).toBe('How?');
            expect(context.user_id).toBe('U1');
        });

        it('Test 44: should include timestamp', () => {
            const context = createContextFromExecution({});
            expect(context.timestamp).toBeTruthy();
        });

        it('Test 45: should include agent info when provided', () => {
            const context = createContextFromExecution({
                agentName: 'test-agent',
                agentVersion: '2.0.0'
            });

            expect(context.agent_name).toBe('test-agent');
            expect(context.agent_version).toBe('2.0.0');
        });

        it('Test 46: should handle empty params', () => {
            const context = createContextFromExecution({});

            // Should not throw, should have timestamp
            expect(context.timestamp).toBeTruthy();
        });

        it('Test 47: should leave undefined for missing params', () => {
            const context = createContextFromExecution({
                taskId: 'T1'
            });

            expect(context.task_id).toBe('T1');
            expect(context.ticket_id).toBeUndefined();
            expect(context.user_id).toBeUndefined();
        });
    });

    // ============================================================================
    // safeSubstitute Tests
    // ============================================================================
    describe('safeSubstitute', () => {
        it('Test 48: should substitute with no warnings when all present', () => {
            const context: SubstitutionContext = {
                name: 'John',
                age: '30'
            };
            const { result, warnings } = safeSubstitute('{{name}} is {{age}}', context);

            expect(result).toBe('John is 30');
            expect(warnings).toEqual([]);
        });

        it('Test 49: should return warnings for missing variables', () => {
            const context: SubstitutionContext = { name: 'John' };
            const { result, warnings } = safeSubstitute('{{name}} {{missing}}', context);

            expect(result).toBe('John {{missing}}');
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('missing');
        });

        it('Test 50: should list all missing variables in warning', () => {
            const context: SubstitutionContext = {};
            const { result, warnings } = safeSubstitute('{{a}} {{b}}', context);

            expect(warnings[0]).toContain('a');
            expect(warnings[0]).toContain('b');
        });

        it('Test 51: should handle text without variables', () => {
            const { result, warnings } = safeSubstitute('Plain text', {});

            expect(result).toBe('Plain text');
            expect(warnings).toEqual([]);
        });

        it('Test 52: should work with complete context', () => {
            const context = createMockContext();
            const text = 'Task {{task_id}} query: {{query}}';
            const { result, warnings } = safeSubstitute(text, context);

            expect(result).not.toContain('{{task_id}}');
            expect(result).not.toContain('{{query}}');
            expect(warnings).toEqual([]);
        });
    });
});
