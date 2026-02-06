import {
    CustomAgentSchema,
    validateCustomAgent,
    validateAgentName,
    extractPromptVariables,
    validatePromptVariables,
    createDefaultAgentTemplate,
    isAllowedTool,
    isBlockedTool,
    CUSTOM_AGENT_CONSTRAINTS,
    RESERVED_AGENT_NAMES,
    CUSTOM_AGENT_ALLOWED_TOOLS,
    CUSTOM_AGENT_BLOCKED_TOOLS,
    SYSTEM_PROMPT_VARIABLES,
    CustomListSchema,
    RoutingRuleSchema,
    AgentMetadataSchema,
    type CustomAgent,
    type CustomList,
} from '../../../src/agents/custom/schema';

describe('Custom Agent Schema', () => {
    // ========================================================================
    // Test Group 1: Basic Validation
    // ========================================================================
    
    describe('Basic Validation', () => {
        it('Test 1: should validate a minimal valid agent', () => {
            const agent = {
                name: 'my-agent',
                description: 'A test agent',
                systemPrompt: 'You are a helpful assistant.',
                goals: ['Help users'],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(true);
            expect(result.data?.name).toBe('my-agent');
        });

        it('Test 2: should validate a complete agent with all fields', () => {
            const agent = {
                name: 'complete-agent',
                description: 'A fully specified agent',
                systemPrompt: 'You are a complete assistant with all options.',
                goals: ['Goal 1', 'Goal 2'],
                checklist: ['Check item 1', 'Check item 2'],
                customLists: [
                    {
                        name: 'Resources',
                        description: 'Helpful resources',
                        items: ['Resource 1', 'Resource 2'],
                        order: 0,
                        collapsed: false,
                    },
                ],
                priority: 'P1',
                routing: {
                    keywords: ['help', 'support'],
                    patterns: ['^help.*'],
                    tags: ['support'],
                    ticketTypes: ['ai_to_human'],
                    priorityBoost: 1,
                },
                metadata: {
                    author: 'Test Author',
                    version: '1.2.3',
                    tags: ['test', 'example'],
                },
                isActive: true,
                timeoutSeconds: 120,
                maxTokens: 4096,
                temperature: 0.5,
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(true);
            expect(result.data?.priority).toBe('P1');
            expect(result.data?.routing.keywords).toContain('help');
        });

        it('Test 3: should reject agent without required fields', () => {
            const result = validateCustomAgent({});
            expect(result.success).toBe(false);
            expect(result.errors?.issues.length).toBeGreaterThan(0);
        });

        it('Test 4: should reject agent with empty name', () => {
            const result = validateCustomAgent({
                name: '',
                description: 'Test',
                systemPrompt: 'Test prompt',
                goals: ['Goal'],
            });
            expect(result.success).toBe(false);
        });

        it('Test 5: should apply default values for optional fields', () => {
            const agent = {
                name: 'defaults-test',
                description: 'Testing defaults',
                systemPrompt: 'Test prompt here.',
                goals: ['One goal'],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(true);
            expect(result.data?.checklist).toEqual([]);
            expect(result.data?.customLists).toEqual([]);
            expect(result.data?.priority).toBe('P2');
            expect(result.data?.isActive).toBe(true);
            expect(result.data?.timeoutSeconds).toBe(60);
            expect(result.data?.maxTokens).toBe(2048);
            expect(result.data?.temperature).toBe(0.7);
        });
    });

    // ========================================================================
    // Test Group 2: Name Validation
    // ========================================================================
    
    describe('Name Validation', () => {
        it('Test 6: should accept valid agent names', () => {
            const validNames = ['my-agent', 'agent1', 'test-agent-2', 'a'];
            validNames.forEach(name => {
                const result = validateAgentName(name);
                expect(result.valid).toBe(true);
            });
        });

        it('Test 7: should reject reserved names', () => {
            RESERVED_AGENT_NAMES.forEach(name => {
                const result = validateAgentName(name);
                expect(result.valid).toBe(false);
                expect(result.error).toContain('reserved');
            });
        });

        it('Test 8: should reject names with uppercase', () => {
            const result = validateAgentName('MyAgent');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('lowercase');
        });

        it('Test 9: should reject names starting with number', () => {
            const result = validateAgentName('1agent');
            expect(result.valid).toBe(false);
        });

        it('Test 10: should reject names with spaces', () => {
            const result = validateAgentName('my agent');
            expect(result.valid).toBe(false);
        });

        it('Test 11: should reject names with special characters', () => {
            const invalidNames = ['my_agent', 'agent!', 'agent@test', 'my.agent'];
            invalidNames.forEach(name => {
                const result = validateAgentName(name);
                expect(result.valid).toBe(false);
            });
        });

        it('Test 12: should reject names exceeding max length', () => {
            const longName = 'a'.repeat(CUSTOM_AGENT_CONSTRAINTS.NAME_MAX_LENGTH + 1);
            const result = validateAgentName(longName);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('characters');
        });

        it('Test 13: should reject empty names', () => {
            const result = validateAgentName('');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('required');
        });
    });

    // ========================================================================
    // Test Group 3: System Prompt Validation
    // ========================================================================
    
    describe('System Prompt Validation', () => {
        it('Test 14: should accept valid system prompt', () => {
            const agent = {
                name: 'prompt-test',
                description: 'Testing prompts',
                systemPrompt: 'You are a helpful assistant that helps users.',
                goals: ['Help users'],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(true);
        });

        it('Test 15: should reject system prompt shorter than 10 chars', () => {
            const agent = {
                name: 'short-prompt',
                description: 'Test',
                systemPrompt: 'Too short',
                goals: ['Goal'],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });

        it('Test 16: should reject system prompt exceeding max length', () => {
            const agent = {
                name: 'long-prompt',
                description: 'Test',
                systemPrompt: 'x'.repeat(CUSTOM_AGENT_CONSTRAINTS.SYSTEM_PROMPT_MAX_LENGTH + 1),
                goals: ['Goal'],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });

        it('Test 17: should accept prompt with variables', () => {
            const agent = {
                name: 'var-prompt',
                description: 'Test',
                systemPrompt: 'Handle {{task_id}} for user {{user_query}}',
                goals: ['Goal'],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(true);
        });
    });

    // ========================================================================
    // Test Group 4: Goals Validation
    // ========================================================================
    
    describe('Goals Validation', () => {
        it('Test 18: should accept valid goals array', () => {
            const agent = {
                name: 'goals-test',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: ['Goal 1', 'Goal 2', 'Goal 3'],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(true);
            expect(result.data?.goals.length).toBe(3);
        });

        it('Test 19: should reject empty goals array', () => {
            const agent = {
                name: 'no-goals',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: [],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });

        it('Test 20: should reject goals exceeding max count', () => {
            const agent = {
                name: 'many-goals',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: Array(CUSTOM_AGENT_CONSTRAINTS.GOALS_MAX + 1).fill('Goal'),
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });

        it('Test 21: should reject goal exceeding max length', () => {
            const agent = {
                name: 'long-goal',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: ['x'.repeat(CUSTOM_AGENT_CONSTRAINTS.GOAL_MAX_LENGTH + 1)],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });

        it('Test 22: should reject empty goal strings', () => {
            const agent = {
                name: 'empty-goal',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: ['Valid goal', ''],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });
    });

    // ========================================================================
    // Test Group 5: Checklist Validation
    // ========================================================================
    
    describe('Checklist Validation', () => {
        it('Test 23: should accept valid checklist', () => {
            const agent = {
                name: 'checklist-test',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: ['Goal'],
                checklist: ['Check 1', 'Check 2'],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(true);
            expect(result.data?.checklist.length).toBe(2);
        });

        it('Test 24: should accept empty checklist', () => {
            const agent = {
                name: 'no-checklist',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: ['Goal'],
                checklist: [],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(true);
        });

        it('Test 25: should reject checklist exceeding max items', () => {
            const agent = {
                name: 'big-checklist',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: ['Goal'],
                checklist: Array(CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_MAX + 1).fill('Item'),
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });

        it('Test 26: should reject checklist item exceeding max length', () => {
            const agent = {
                name: 'long-check',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: ['Goal'],
                checklist: ['x'.repeat(CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_ITEM_MAX_LENGTH + 1)],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });
    });

    // ========================================================================
    // Test Group 6: Custom Lists Validation
    // ========================================================================
    
    describe('Custom Lists Validation', () => {
        it('Test 27: should accept valid custom list', () => {
            const list: CustomList = {
                name: 'My List',
                description: 'A test list',
                items: ['Item 1', 'Item 2'],
                order: 0,
                collapsed: false,
            };

            const result = CustomListSchema.safeParse(list);
            expect(result.success).toBe(true);
        });

        it('Test 28: should reject custom list with empty name', () => {
            const list = {
                name: '',
                items: ['Item 1'],
            };

            const result = CustomListSchema.safeParse(list);
            expect(result.success).toBe(false);
        });

        it('Test 29: should reject custom list with no items', () => {
            const list = {
                name: 'Empty List',
                items: [],
            };

            const result = CustomListSchema.safeParse(list);
            expect(result.success).toBe(false);
        });

        it('Test 30: should reject duplicate custom list names', () => {
            const agent = {
                name: 'dup-lists',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: ['Goal'],
                customLists: [
                    { name: 'Resources', items: ['Item 1'] },
                    { name: 'resources', items: ['Item 2'] }, // Same name, different case
                ],
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });

        it('Test 31: should reject more than 7 custom lists', () => {
            const agent = {
                name: 'many-lists',
                description: 'Test',
                systemPrompt: 'Test prompt here.',
                goals: ['Goal'],
                customLists: Array(CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX + 1)
                    .fill(null)
                    .map((_, i) => ({ name: `List-${i}`, items: ['Item'] })),
            };

            const result = validateCustomAgent(agent);
            expect(result.success).toBe(false);
        });
    });

    // ========================================================================
    // Test Group 7: Prompt Variables
    // ========================================================================
    
    describe('Prompt Variables', () => {
        it('Test 32: should extract variables from prompt', () => {
            const prompt = 'Handle {{task_id}} for {{user_query}} in {{file_path}}';
            const variables = extractPromptVariables(prompt);
            
            expect(variables).toContain('task_id');
            expect(variables).toContain('user_query');
            expect(variables).toContain('file_path');
            expect(variables.length).toBe(3);
        });

        it('Test 33: should deduplicate repeated variables', () => {
            const prompt = '{{task_id}} and again {{task_id}}';
            const variables = extractPromptVariables(prompt);
            
            expect(variables.length).toBe(1);
            expect(variables[0]).toBe('task_id');
        });

        it('Test 34: should return empty array for no variables', () => {
            const prompt = 'No variables here';
            const variables = extractPromptVariables(prompt);
            
            expect(variables).toEqual([]);
        });

        it('Test 35: should validate known variables', () => {
            const prompt = 'Using {{task_id}} and {{user_query}}';
            const result = validatePromptVariables(prompt);
            
            expect(result.valid).toBe(true);
        });

        it('Test 36: should detect unknown variables', () => {
            const prompt = 'Using {{unknown_var}} and {{task_id}}';
            const result = validatePromptVariables(prompt);
            
            expect(result.valid).toBe(false);
            expect(result.unknownVariables).toContain('unknown_var');
        });

        it('Test 37: should recognize all built-in variables', () => {
            SYSTEM_PROMPT_VARIABLES.forEach(variable => {
                const prompt = `Using {{${variable}}}`;
                const result = validatePromptVariables(prompt);
                expect(result.valid).toBe(true);
            });
        });
    });

    // ========================================================================
    // Test Group 8: Tool Type Guards
    // ========================================================================
    
    describe('Tool Type Guards', () => {
        it('Test 38: should identify allowed tools', () => {
            CUSTOM_AGENT_ALLOWED_TOOLS.forEach(tool => {
                expect(isAllowedTool(tool)).toBe(true);
                expect(isBlockedTool(tool)).toBe(false);
            });
        });

        it('Test 39: should identify blocked tools', () => {
            CUSTOM_AGENT_BLOCKED_TOOLS.forEach(tool => {
                expect(isBlockedTool(tool)).toBe(true);
                expect(isAllowedTool(tool)).toBe(false);
            });
        });

        it('Test 40: should return false for unknown tools', () => {
            expect(isAllowedTool('unknown_tool')).toBe(false);
            expect(isBlockedTool('unknown_tool')).toBe(false);
        });
    });

    // ========================================================================
    // Test Group 9: Default Template
    // ========================================================================
    
    describe('Default Template', () => {
        it('Test 41: should create valid default template', () => {
            const template = createDefaultAgentTemplate('My Agent');
            const result = validateCustomAgent(template);
            
            expect(result.success).toBe(true);
            expect(result.data?.name).toBe('my-agent');
        });

        it('Test 42: should convert spaces to hyphens in name', () => {
            const template = createDefaultAgentTemplate('Test Agent Name');
            expect(template.name).toBe('test-agent-name');
        });

        it('Test 43: should include agent name in system prompt', () => {
            const template = createDefaultAgentTemplate('Helper');
            expect(template.systemPrompt).toContain('Helper');
        });

        it('Test 44: should have at least one goal', () => {
            const template = createDefaultAgentTemplate('Test');
            expect(template.goals.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ========================================================================
    // Test Group 10: Routing Rules
    // ========================================================================
    
    describe('Routing Rules', () => {
        it('Test 45: should accept valid routing rules', () => {
            const rules = {
                keywords: ['help', 'support'],
                patterns: ['^help.*'],
                tags: ['urgent'],
                ticketTypes: ['ai_to_human'],
                priorityBoost: 1,
            };

            const result = RoutingRuleSchema.safeParse(rules);
            expect(result.success).toBe(true);
        });

        it('Test 46: should apply defaults for empty routing', () => {
            const result = RoutingRuleSchema.safeParse({});
            expect(result.success).toBe(true);
            expect(result.data?.keywords).toEqual([]);
            expect(result.data?.priorityBoost).toBe(0);
        });

        it('Test 47: should reject invalid priority boost', () => {
            const rules = { priorityBoost: 5 };
            const result = RoutingRuleSchema.safeParse(rules);
            expect(result.success).toBe(false);
        });

        it('Test 48: should reject invalid ticket type', () => {
            const rules = { ticketTypes: ['invalid_type'] };
            const result = RoutingRuleSchema.safeParse(rules);
            expect(result.success).toBe(false);
        });
    });

    // ========================================================================
    // Test Group 11: Metadata
    // ========================================================================
    
    describe('Metadata', () => {
        it('Test 49: should accept valid semantic version', () => {
            const metadata = { version: '2.1.0' };
            const result = AgentMetadataSchema.safeParse(metadata);
            expect(result.success).toBe(true);
        });

        it('Test 50: should reject invalid version format', () => {
            const metadata = { version: 'v1.0' };
            const result = AgentMetadataSchema.safeParse(metadata);
            expect(result.success).toBe(false);
        });

        it('Test 51: should default version to 1.0.0', () => {
            const result = AgentMetadataSchema.safeParse({});
            expect(result.success).toBe(true);
            expect(result.data?.version).toBe('1.0.0');
        });

        it('Test 52: should accept valid datetime for createdAt', () => {
            const metadata = { createdAt: '2026-02-06T12:00:00.000Z' };
            const result = AgentMetadataSchema.safeParse(metadata);
            expect(result.success).toBe(true);
        });

        it('Test 53: should limit tags to max count', () => {
            const metadata = {
                tags: Array(CUSTOM_AGENT_CONSTRAINTS.TAGS_MAX + 1).fill('tag'),
            };
            const result = AgentMetadataSchema.safeParse(metadata);
            expect(result.success).toBe(false);
        });
    });

    // ========================================================================
    // Test Group 12: Constraint Constants
    // ========================================================================
    
    describe('Constraint Constants', () => {
        it('Test 54: should have reasonable constraint values', () => {
            expect(CUSTOM_AGENT_CONSTRAINTS.NAME_MAX_LENGTH).toBe(50);
            expect(CUSTOM_AGENT_CONSTRAINTS.DESCRIPTION_MAX_LENGTH).toBe(200);
            expect(CUSTOM_AGENT_CONSTRAINTS.SYSTEM_PROMPT_MAX_LENGTH).toBe(4000);
            expect(CUSTOM_AGENT_CONSTRAINTS.GOALS_MIN).toBe(1);
            expect(CUSTOM_AGENT_CONSTRAINTS.GOALS_MAX).toBe(20);
            expect(CUSTOM_AGENT_CONSTRAINTS.CHECKLIST_MAX).toBe(50);
            expect(CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX).toBe(7);
        });

        it('Test 55: should have all reserved names', () => {
            expect(RESERVED_AGENT_NAMES).toContain('planning');
            expect(RESERVED_AGENT_NAMES).toContain('orchestrator');
            expect(RESERVED_AGENT_NAMES).toContain('verification');
            expect(RESERVED_AGENT_NAMES).toContain('answer');
        });
    });
});
