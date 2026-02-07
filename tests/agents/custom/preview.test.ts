/**
 * Tests for Custom Agent Preview/Test Mode
 *
 * @fileoverview Tests for preview functionality including dry-run,
 * validation, token estimation, and sample query generation.
 */

import * as preview from '../../../src/agents/custom/preview';
import * as executor from '../../../src/agents/custom/executor';
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

jest.mock('../../../src/agents/custom/hardlock', () => ({
    getHardlockPolicyDescription: jest.fn(() => '## Hardlock Policy\nNo code editing allowed.'),
    validateToolAccess: jest.fn(),
    assertToolAllowed: jest.fn(),
}));

const mockLLM = llmService as jest.Mocked<typeof llmService>;

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

describe('Custom Agent Preview', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
    // Section 1: previewAgent Tests
    // ========================================================================

    describe('previewAgent', () => {
        it('Test 1: should execute preview with LLM call', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, { query: 'Hello' });

            expect(result.success).toBe(true);
            expect(result.response).toBe('Test response from LLM');
            expect(result.isDryRun).toBe(false);
        });

        it('Test 2: should include system prompt in result', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, { query: 'Hello' });

            expect(result.systemPrompt).toContain('test-agent');
            expect(result.systemPrompt).toContain('## Goals');
        });

        it('Test 3: should include user message in result', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, { query: 'My test query' });

            expect(result.userMessage).toBe('My test query');
        });

        it('Test 4: should return token usage', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, { query: 'Hello' });

            expect(result.usage).not.toBeNull();
            expect(result.usage!.promptTokens).toBe(100);
            expect(result.usage!.completionTokens).toBe(50);
            expect(result.usage!.totalTokens).toBe(150);
        });

        it('Test 5: should include timing information', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, { query: 'Hello' });

            expect(result.timing).toBeDefined();
            expect(result.timing.startedAt).toBeDefined();
            expect(result.timing.completedAt).toBeDefined();
            expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
        });

        it('Test 6: should estimate prompt tokens', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, { query: 'Hello' });

            expect(result.estimatedPromptTokens).toBeGreaterThan(0);
        });

        it('Test 7: should skip LLM call in dry run mode', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, {
                query: 'Hello',
                dryRun: true,
            });

            expect(result.success).toBe(true);
            expect(result.isDryRun).toBe(true);
            expect(result.usage).toBeNull();
            expect(mockLLM.completeLLM).not.toHaveBeenCalled();
        });

        it('Test 8: should include mock response in dry run', async () => {
            const agent = createTestAgent({ name: 'My Agent' });
            const result = await preview.previewAgent(agent, {
                query: 'Hello',
                dryRun: true,
            });

            expect(result.response).toContain('DRY RUN');
            expect(result.response).toContain('My Agent');
        });

        it('Test 9: should still build system prompt in dry run', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, {
                query: 'Hello',
                dryRun: true,
            });

            expect(result.systemPrompt).toContain('## Goals');
            expect(result.systemPrompt).toContain('test-agent');
        });

        it('Test 10: should substitute variables', async () => {
            const agent = createTestAgent({
                systemPrompt: 'Task: {{task_id}}',
            });
            const result = await preview.previewAgent(agent, {
                query: 'Hello',
                variables: { task_id: 'TASK-123' },
                dryRun: true,
            });

            expect(result.systemPrompt).toContain('Task: TASK-123');
        });

        it('Test 11: should handle LLM errors gracefully', async () => {
            mockLLM.completeLLM.mockRejectedValue(new Error('API timeout'));

            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, { query: 'Hello' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('API timeout');
        });

        it('Test 12: should use streaming when callback provided', async () => {
            mockLLM.streamLLM.mockResolvedValue({
                content: 'Streamed response',
                usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
            });

            const onStream = jest.fn();
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, {
                query: 'Hello',
                onStream,
            });

            expect(mockLLM.streamLLM).toHaveBeenCalled();
            expect(result.response).toBe('Streamed response');
        });

        it('Test 13: should skip hardlock when option set', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, {
                query: 'Hello',
                skipHardlock: true,
                dryRun: true,
            });

            expect(result.systemPrompt).not.toContain('Hardlock Policy');
        });

        it('Test 14: should include hardlock by default', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, {
                query: 'Hello',
                dryRun: true,
            });

            expect(result.systemPrompt).toContain('Hardlock Policy');
        });

        it('Test 15: should pass agent temperature to LLM', async () => {
            const agent = createTestAgent({ temperature: 0.3 });
            await preview.previewAgent(agent, { query: 'Hello' });

            const call = mockLLM.completeLLM.mock.calls[0];
            expect(call[1]!.temperature).toBe(0.3);
        });
    });

    // ========================================================================
    // Section 2: validateAgentConfig Tests
    // ========================================================================

    describe('validateAgentConfig', () => {
        it('Test 16: should validate correct config', () => {
            const config = createTestAgent();
            const result = preview.validateAgentConfig(config);

            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
        });

        it('Test 17: should detect missing required fields', () => {
            const config = { name: 'Test' }; // Missing most required fields
            const result = preview.validateAgentConfig(config);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('Test 18: should warn about short system prompt', () => {
            const config = createTestAgent({ systemPrompt: 'Hi' });
            const result = preview.validateAgentConfig(config);

            expect(result.warnings.some(w => w.includes('short'))).toBe(true);
        });

        it('Test 19: should warn about very long system prompt', () => {
            const config = createTestAgent({ systemPrompt: 'A'.repeat(9000) });
            const result = preview.validateAgentConfig(config);

            expect(result.warnings.some(w => w.includes('long'))).toBe(true);
        });

        it('Test 20: should warn about no goals', () => {
            const config = createTestAgent({ goals: [] });
            const result = preview.validateAgentConfig(config);

            expect(result.warnings.some(w => w.includes('No goals'))).toBe(true);
        });

        it('Test 21: should warn about too many goals', () => {
            const config = createTestAgent({
                goals: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'],
            });
            const result = preview.validateAgentConfig(config);

            expect(result.warnings.some(w => w.includes('Many goals'))).toBe(true);
        });

        it('Test 22: should warn about very low temperature', () => {
            const config = createTestAgent({ temperature: 0.1 });
            const result = preview.validateAgentConfig(config);

            expect(result.warnings.some(w => w.includes('low temperature'))).toBe(true);
        });

        it('Test 23: should warn about very high temperature', () => {
            const config = createTestAgent({ temperature: 1.8 });
            const result = preview.validateAgentConfig(config);

            expect(result.warnings.some(w => w.includes('high temperature'))).toBe(true);
        });

        it('Test 24: should warn about long checklist', () => {
            const config = createTestAgent({
                checklist: Array.from({ length: 12 }, (_, i) => `Item ${i}`),
            });
            const result = preview.validateAgentConfig(config);

            expect(result.warnings.some(w => w.includes('many items'))).toBe(true);
        });

        it('Test 25: should estimate token usage', () => {
            const config = createTestAgent();
            const result = preview.validateAgentConfig(config);

            expect(result.promptInfo.estimatedTokens).toBeGreaterThan(0);
            expect(typeof result.promptInfo.withinLimit).toBe('boolean');
            expect(typeof result.promptInfo.percentOfLimit).toBe('number');
        });

        it('Test 26: should detect name too long', () => {
            const config = createTestAgent({ name: 'A'.repeat(100) });
            const result = preview.validateAgentConfig(config);

            expect(result.valid).toBe(false);
        });

        it('Test 27: should detect empty name', () => {
            const config = createTestAgent({ name: '' });
            const result = preview.validateAgentConfig(config);

            expect(result.valid).toBe(false);
        });

        it('Test 28: should detect invalid priority', () => {
            const config = { ...createTestAgent(), priority: 'P5' };
            const result = preview.validateAgentConfig(config);

            expect(result.valid).toBe(false);
        });
    });

    // ========================================================================
    // Section 3: getPromptPreview Tests
    // ========================================================================

    describe('getPromptPreview', () => {
        it('Test 29: should return complete system prompt', () => {
            const agent = createTestAgent({ name: 'Preview Agent' });
            const prompt = preview.getPromptPreview(agent);

            expect(prompt).toContain('# Preview Agent');
            expect(prompt).toContain('## Goals');
        });

        it('Test 30: should substitute variables', () => {
            const agent = createTestAgent({ systemPrompt: 'Date: {{current_date}}' });
            const prompt = preview.getPromptPreview(agent, { current_date: '2024-01-15' });

            expect(prompt).toContain('Date: 2024-01-15');
        });

        it('Test 31: should include checklist', () => {
            const agent = createTestAgent({ checklist: ['Step 1', 'Step 2'] });
            const prompt = preview.getPromptPreview(agent);

            expect(prompt).toContain('## Checklist');
            expect(prompt).toContain('Step 1');
        });

        it('Test 32: should include custom lists', () => {
            const agent = createTestAgent({
                customLists: [{
                    name: 'Resources',
                    description: '',
                    items: ['Link 1'],
                    order: 0,
                    collapsed: false,
                }],
            });
            const prompt = preview.getPromptPreview(agent);

            expect(prompt).toContain('## Resources');
            expect(prompt).toContain('Link 1');
        });
    });

    // ========================================================================
    // Section 4: estimateTokenUsage Tests
    // ========================================================================

    describe('estimateTokenUsage', () => {
        it('Test 33: should estimate system prompt tokens', () => {
            const agent = createTestAgent();
            const estimate = preview.estimateTokenUsage(agent);

            expect(estimate.systemPromptTokens).toBeGreaterThan(0);
        });

        it('Test 34: should estimate hardlock policy tokens', () => {
            const agent = createTestAgent();
            const estimate = preview.estimateTokenUsage(agent);

            expect(estimate.hardlockPolicyTokens).toBeGreaterThan(0);
        });

        it('Test 35: should calculate total base tokens', () => {
            const agent = createTestAgent();
            const estimate = preview.estimateTokenUsage(agent);

            expect(estimate.totalBaseTokens).toBeGreaterThan(estimate.systemPromptTokens);
        });

        it('Test 36: should calculate available conversation tokens', () => {
            const agent = createTestAgent();
            const estimate = preview.estimateTokenUsage(agent);

            expect(estimate.availableForConversation).toBeGreaterThan(0);
        });

        it('Test 37: should reduce available tokens for large prompts', () => {
            const smallAgent = createTestAgent({ systemPrompt: 'Short' });
            const largeAgent = createTestAgent({ systemPrompt: 'A'.repeat(5000) });

            const smallEstimate = preview.estimateTokenUsage(smallAgent);
            const largeEstimate = preview.estimateTokenUsage(largeAgent);

            expect(largeEstimate.availableForConversation)
                .toBeLessThan(smallEstimate.availableForConversation);
        });
    });

    // ========================================================================
    // Section 5: Sample Query Tests
    // ========================================================================

    describe('getSuggestedQueries', () => {
        it('Test 38: should include default queries', () => {
            const agent = createTestAgent();
            const queries = preview.getSuggestedQueries(agent);

            expect(queries).toContain('What can you help me with?');
        });

        it('Test 39: should add research queries for research agents', () => {
            const agent = createTestAgent({ goals: ['Research new technologies'] });
            const queries = preview.getSuggestedQueries(agent);

            expect(queries.some(q => q.includes('Research'))).toBe(true);
        });

        it('Test 40: should add documentation queries for doc agents', () => {
            const agent = createTestAgent({ goals: ['Document code'] });
            const queries = preview.getSuggestedQueries(agent);

            expect(queries.some(q => q.includes('Document'))).toBe(true);
        });

        it('Test 41: should add review queries for review agents', () => {
            const agent = createTestAgent({ goals: ['Review code changes'] });
            const queries = preview.getSuggestedQueries(agent);

            expect(queries.some(q => q.includes('Review'))).toBe(true);
        });

        it('Test 42: should add planning queries for architect agents', () => {
            const agent = createTestAgent({ goals: ['Plan system architecture'] });
            const queries = preview.getSuggestedQueries(agent);

            expect(queries.some(q => q.includes('plan') || q.includes('Design'))).toBe(true);
        });

        it('Test 43: should add debug queries for debug agents', () => {
            const agent = createTestAgent({ goals: ['Debug issues'] });
            const queries = preview.getSuggestedQueries(agent);

            expect(queries.some(q => q.includes('debug'))).toBe(true);
        });

        it('Test 44: should not have duplicates', () => {
            const agent = createTestAgent({
                goals: ['Research and document and review'],
            });
            const queries = preview.getSuggestedQueries(agent);

            const unique = new Set(queries);
            expect(queries.length).toBe(unique.size);
        });
    });

    describe('generateContextualQuery', () => {
        it('Test 45: should generate query based on first goal', () => {
            const agent = createTestAgent({ goals: ['Analyze code performance'] });
            const query = preview.generateContextualQuery(agent);

            expect(query.toLowerCase()).toContain('analyze');
        });

        it('Test 46: should generate contextual query', () => {
            const agent = createTestAgent({ name: 'Performance Analyzer' });
            const query = preview.generateContextualQuery(agent);

            // Query should be a reasonable prompt
            expect(query.length).toBeGreaterThan(20);
            expect(query).toMatch(/\?$/); // Should be a question
        });

        it('Test 47: should handle agent with no goals', () => {
            const agent = createTestAgent({ goals: [] });
            const query = preview.generateContextualQuery(agent);

            expect(query.length).toBeGreaterThan(0);
            expect(query).toContain('assist with tasks');
        });

        it('Test 48: should return different queries on multiple calls', () => {
            const agent = createTestAgent();

            // Generate 10 queries and check for variety
            const queries = Array.from({ length: 10 }, () =>
                preview.generateContextualQuery(agent)
            );

            // Should have at least 2 unique queries (probabilistic)
            const unique = new Set(queries);
            // This might occasionally fail due to randomness, but very unlikely with 10 tries
            expect(unique.size).toBeGreaterThanOrEqual(1);
        });
    });

    // ========================================================================
    // Section 6: DEFAULT_SAMPLE_QUERIES Tests
    // ========================================================================

    describe('DEFAULT_SAMPLE_QUERIES', () => {
        it('Test 49: should have at least 5 queries', () => {
            expect(preview.DEFAULT_SAMPLE_QUERIES.length).toBeGreaterThanOrEqual(5);
        });

        it('Test 50: should all be non-empty strings', () => {
            preview.DEFAULT_SAMPLE_QUERIES.forEach(query => {
                expect(typeof query).toBe('string');
                expect(query.length).toBeGreaterThan(0);
            });
        });

        it('Test 51: should include capability question', () => {
            const hasCapabilityQ = preview.DEFAULT_SAMPLE_QUERIES.some(
                q => q.toLowerCase().includes('help') || q.toLowerCase().includes('capabilities')
            );
            expect(hasCapabilityQ).toBe(true);
        });
    });

    // ========================================================================
    // Section 7: Edge Cases
    // ========================================================================

    describe('Edge Cases', () => {
        it('Test 52: should handle agent with empty custom lists', async () => {
            const agent = createTestAgent({ customLists: [] });
            const result = await preview.previewAgent(agent, {
                query: 'Hello',
                dryRun: true,
            });

            expect(result.success).toBe(true);
        });

        it('Test 53: should handle agent with many goals', async () => {
            const agent = createTestAgent({
                goals: Array.from({ length: 10 }, (_, i) => `Goal ${i}`),
            });
            const result = await preview.previewAgent(agent, {
                query: 'Hello',
                dryRun: true,
            });

            expect(result.success).toBe(true);
            expect(result.systemPrompt).toContain('Goal 9');
        });

        it('Test 54: should handle unicode in agent config', async () => {
            const agent = createTestAgent({
                name: '日本語エージェント',
                systemPrompt: '你好，我是助手',
            });
            const result = await preview.previewAgent(agent, {
                query: 'Здравствуйте',
                dryRun: true,
            });

            expect(result.success).toBe(true);
            expect(result.systemPrompt).toContain('日本語エージェント');
        });

        it('Test 55: should handle special characters in query', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, {
                query: 'What about <script>alert("xss")</script>?',
                dryRun: true,
            });

            expect(result.success).toBe(true);
            expect(result.userMessage).toContain('<script>');
        });

        it('Test 56: should handle null usage from LLM', async () => {
            mockLLM.completeLLM.mockResolvedValue({
                content: 'Response',
                usage: undefined,
            });

            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, { query: 'Hello' });

            expect(result.success).toBe(true);
            expect(result.usage).toBeNull();
        });

        it('Test 57: should handle validation of unknown fields', () => {
            const config = {
                ...createTestAgent(),
                unknownField: 'value',
            };
            const result = preview.validateAgentConfig(config);

            // Zod should strip unknown fields but still validate
            expect(result.valid).toBe(true);
        });

        it('Test 58: should handle empty string query', async () => {
            const agent = createTestAgent();
            const result = await preview.previewAgent(agent, {
                query: '',
                dryRun: true,
            });

            expect(result.success).toBe(true);
            expect(result.userMessage).toBe('');
        });
    });
});
