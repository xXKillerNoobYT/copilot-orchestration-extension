/**
 * Tests for Custom Agent Routing Module
 *
 * @fileoverview Comprehensive tests for the routing module including
 * keyword matching, pattern matching, priority scoring, and task routing.
 */

import * as routing from '../../../src/agents/custom/routing';
import * as storage from '../../../src/agents/custom/storage';
import * as executor from '../../../src/agents/custom/executor';
import { CustomAgent } from '../../../src/agents/custom/schema';

// Mock dependencies
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../../src/agents/custom/storage', () => ({
    listCustomAgents: jest.fn(),
    loadCustomAgent: jest.fn(),
    getWorkspaceFolder: jest.fn(),
}));

jest.mock('../../../src/agents/custom/executor', () => ({
    isAgentActive: jest.fn(),
}));

const mockStorage = storage as jest.Mocked<typeof storage>;
const mockExecutor = executor as jest.Mocked<typeof executor>;

// Helper to create a test agent
function createTestAgent(overrides: Partial<CustomAgent> = {}): CustomAgent {
    return {
        name: 'test-agent',
        description: 'A test agent for unit tests',
        systemPrompt: 'You are a helpful assistant.',
        goals: ['Be helpful'],
        checklist: ['Check facts'],
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

describe('Custom Agent Routing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStorage.getWorkspaceFolder.mockReturnValue('/test/workspace');
    });

    // ========================================================================
    // Section 1: Priority Scoring Tests
    // ========================================================================

    describe('getPriorityScore', () => {
        it('Test 1: should return 4 for P0 (highest)', () => {
            expect(routing.getPriorityScore('P0')).toBe(4);
        });

        it('Test 2: should return 3 for P1', () => {
            expect(routing.getPriorityScore('P1')).toBe(3);
        });

        it('Test 3: should return 2 for P2', () => {
            expect(routing.getPriorityScore('P2')).toBe(2);
        });

        it('Test 4: should return 1 for P3 (lowest)', () => {
            expect(routing.getPriorityScore('P3')).toBe(1);
        });
    });

    describe('calculateScore', () => {
        it('Test 5: should calculate base score from priority', () => {
            const match = {
                agent: createTestAgent({ priority: 'P1' }),
                basePriority: 3,
                priorityBoost: 0,
                matchedKeywords: [],
                matchedPatterns: [],
                matchedTags: [],
                ticketTypeMatched: false,
                isOverride: false,
            };
            expect(routing.calculateScore(match)).toBe(3);
        });

        it('Test 6: should add priority boost', () => {
            const match = {
                agent: createTestAgent(),
                basePriority: 2,
                priorityBoost: 1,
                matchedKeywords: [],
                matchedPatterns: [],
                matchedTags: [],
                ticketTypeMatched: false,
                isOverride: false,
            };
            expect(routing.calculateScore(match)).toBe(3);
        });

        it('Test 7: should add keyword bonus (0.5 each)', () => {
            const match = {
                agent: createTestAgent(),
                basePriority: 2,
                priorityBoost: 0,
                matchedKeywords: ['doc', 'help'],
                matchedPatterns: [],
                matchedTags: [],
                ticketTypeMatched: false,
                isOverride: false,
            };
            expect(routing.calculateScore(match)).toBe(3); // 2 + (2 * 0.5)
        });

        it('Test 8: should add pattern bonus (0.8 each)', () => {
            const match = {
                agent: createTestAgent(),
                basePriority: 2,
                priorityBoost: 0,
                matchedKeywords: [],
                matchedPatterns: ['test.*'],
                matchedTags: [],
                ticketTypeMatched: false,
                isOverride: false,
            };
            expect(routing.calculateScore(match)).toBe(2.8); // 2 + 0.8
        });

        it('Test 9: should add tag bonus (0.3 each)', () => {
            const match = {
                agent: createTestAgent(),
                basePriority: 2,
                priorityBoost: 0,
                matchedKeywords: [],
                matchedPatterns: [],
                matchedTags: ['bug', 'urgent'],
                ticketTypeMatched: false,
                isOverride: false,
            };
            expect(routing.calculateScore(match)).toBe(2.6); // 2 + (2 * 0.3)
        });

        it('Test 10: should add ticket type bonus (0.5)', () => {
            const match = {
                agent: createTestAgent(),
                basePriority: 2,
                priorityBoost: 0,
                matchedKeywords: [],
                matchedPatterns: [],
                matchedTags: [],
                ticketTypeMatched: true,
                isOverride: false,
            };
            expect(routing.calculateScore(match)).toBe(2.5);
        });

        it('Test 11: should give max score for override', () => {
            const match = {
                agent: createTestAgent(),
                basePriority: 1,
                priorityBoost: 0,
                matchedKeywords: [],
                matchedPatterns: [],
                matchedTags: [],
                ticketTypeMatched: false,
                isOverride: true,
            };
            expect(routing.calculateScore(match)).toBe(100);
        });
    });

    // ========================================================================
    // Section 2: Keyword Matching Tests
    // ========================================================================

    describe('matchKeyword', () => {
        it('Test 12: should match exact word', () => {
            expect(routing.matchKeyword('I need documentation', 'documentation')).toBe(true);
        });

        it('Test 13: should match case-insensitive', () => {
            expect(routing.matchKeyword('I need DOCUMENTATION', 'documentation')).toBe(true);
        });

        it('Test 14: should match at start of query', () => {
            expect(routing.matchKeyword('Help me with this', 'help')).toBe(true);
        });

        it('Test 15: should match at end of query', () => {
            expect(routing.matchKeyword('I need help', 'help')).toBe(true);
        });

        it('Test 16: should not match partial words', () => {
            expect(routing.matchKeyword('I need helper', 'help')).toBe(false);
        });

        it('Test 17: should handle empty query', () => {
            expect(routing.matchKeyword('', 'test')).toBe(false);
        });

        it('Test 18: should handle special characters via fuzzy matching', () => {
            // Word boundary matching doesn't work well with special chars like +
            // Use fuzzy matching instead for these cases
            expect(routing.matchKeyword('Use c++ for this', 'c++', true)).toBe(true);
        });

        describe('fuzzy matching', () => {
            it('Test 19: should fuzzy match skipping characters', () => {
                expect(routing.matchKeyword('documentation', 'doc', true)).toBe(true);
            });

            it('Test 20: should fuzzy match non-contiguous', () => {
                expect(routing.matchKeyword('hello world', 'hwd', true)).toBe(true);
            });

            it('Test 21: should not fuzzy match wrong order', () => {
                expect(routing.matchKeyword('cat', 'tac', true)).toBe(false);
            });
        });
    });

    // ========================================================================
    // Section 3: Pattern Matching Tests
    // ========================================================================

    describe('matchPattern', () => {
        it('Test 22: should match simple pattern', () => {
            expect(routing.matchPattern('hello world', 'world')).toBe(true);
        });

        it('Test 23: should match regex pattern', () => {
            expect(routing.matchPattern('test-123', 'test-\\d+')).toBe(true);
        });

        it('Test 24: should match case-insensitive', () => {
            expect(routing.matchPattern('HELLO', 'hello')).toBe(true);
        });

        it('Test 25: should handle invalid regex gracefully', () => {
            expect(routing.matchPattern('test', '[invalid')).toBe(false);
        });

        it('Test 26: should match anchored pattern', () => {
            expect(routing.matchPattern('start here', '^start')).toBe(true);
        });

        it('Test 27: should not match anchored pattern incorrectly', () => {
            expect(routing.matchPattern('not start', '^start')).toBe(false);
        });
    });

    // ========================================================================
    // Section 4: Tag Matching Tests
    // ========================================================================

    describe('matchTag', () => {
        it('Test 28: should match exact tag', () => {
            expect(routing.matchTag(['bug', 'urgent'], 'bug')).toBe(true);
        });

        it('Test 29: should match case-insensitive', () => {
            expect(routing.matchTag(['BUG', 'urgent'], 'bug')).toBe(true);
        });

        it('Test 30: should not match non-existent tag', () => {
            expect(routing.matchTag(['bug', 'urgent'], 'feature')).toBe(false);
        });

        it('Test 31: should handle empty tag list', () => {
            expect(routing.matchTag([], 'bug')).toBe(false);
        });
    });

    // ========================================================================
    // Section 5: Agent Matching Tests
    // ========================================================================

    describe('matchAgent', () => {
        it('Test 32: should return match with keywords', () => {
            const agent = createTestAgent({
                routing: {
                    keywords: ['documentation', 'docs'],
                    patterns: [],
                    tags: [],
                    ticketTypes: [],
                    priorityBoost: 0,
                },
            });
            const context: routing.TaskContext = { query: 'Update the documentation' };
            const match = routing.matchAgent(agent, context);

            expect(match.matchedKeywords).toContain('documentation');
            expect(match.score).toBeGreaterThan(2);
        });

        it('Test 33: should return match with patterns', () => {
            const agent = createTestAgent({
                routing: {
                    keywords: [],
                    patterns: ['bug-\\d+'],
                    tags: [],
                    ticketTypes: [],
                    priorityBoost: 0,
                },
            });
            const context: routing.TaskContext = { query: 'Fix bug-123' };
            const match = routing.matchAgent(agent, context);

            expect(match.matchedPatterns).toHaveLength(1);
        });

        it('Test 34: should return match with tags', () => {
            const agent = createTestAgent({
                routing: {
                    keywords: [],
                    patterns: [],
                    tags: ['urgent'],
                    ticketTypes: [],
                    priorityBoost: 0,
                },
            });
            const context: routing.TaskContext = { query: 'Fix this', tags: ['urgent', 'bug'] };
            const match = routing.matchAgent(agent, context);

            expect(match.matchedTags).toContain('urgent');
        });

        it('Test 35: should match ticket type', () => {
            const agent = createTestAgent({
                routing: {
                    keywords: [],
                    patterns: [],
                    tags: [],
                    ticketTypes: ['ai_to_human'],
                    priorityBoost: 0,
                },
            });
            const context: routing.TaskContext = {
                query: 'Review this',
                ticketType: 'ai_to_human'
            };
            const match = routing.matchAgent(agent, context);

            expect(match.ticketTypeMatched).toBe(true);
        });

        it('Test 36: should apply priority boost', () => {
            const agent = createTestAgent({
                routing: {
                    keywords: ['test'],
                    patterns: [],
                    tags: [],
                    ticketTypes: [],
                    priorityBoost: 2,
                },
            });
            const context: routing.TaskContext = { query: 'Run the test' };
            const match = routing.matchAgent(agent, context);

            expect(match.priorityBoost).toBe(2);
        });

        it('Test 37: should detect manual override', () => {
            const agent = createTestAgent({ name: 'my-agent' });
            const context: routing.TaskContext = {
                query: 'Any query',
                agentOverride: 'my-agent'
            };
            const match = routing.matchAgent(agent, context);

            expect(match.isOverride).toBe(true);
            expect(match.score).toBe(100);
        });

        it('Test 38: should be case-insensitive for override', () => {
            const agent = createTestAgent({ name: 'My-Agent' });
            const context: routing.TaskContext = {
                query: 'Any query',
                agentOverride: 'MY-AGENT'
            };
            const match = routing.matchAgent(agent, context);

            expect(match.isOverride).toBe(true);
        });
    });

    describe('hasAnyMatch', () => {
        it('Test 39: should return true for override', () => {
            const match: routing.RoutingMatch = {
                agent: createTestAgent(),
                basePriority: 2,
                priorityBoost: 0,
                matchedKeywords: [],
                matchedPatterns: [],
                matchedTags: [],
                ticketTypeMatched: false,
                isOverride: true,
                score: 100,
            };
            expect(routing.hasAnyMatch(match)).toBe(true);
        });

        it('Test 40: should return true for keyword match', () => {
            const match: routing.RoutingMatch = {
                agent: createTestAgent(),
                basePriority: 2,
                priorityBoost: 0,
                matchedKeywords: ['doc'],
                matchedPatterns: [],
                matchedTags: [],
                ticketTypeMatched: false,
                isOverride: false,
                score: 2.5,
            };
            expect(routing.hasAnyMatch(match)).toBe(true);
        });

        it('Test 41: should return false for no matches', () => {
            const match: routing.RoutingMatch = {
                agent: createTestAgent(),
                basePriority: 2,
                priorityBoost: 0,
                matchedKeywords: [],
                matchedPatterns: [],
                matchedTags: [],
                ticketTypeMatched: false,
                isOverride: false,
                score: 2,
            };
            expect(routing.hasAnyMatch(match)).toBe(false);
        });
    });

    // ========================================================================
    // Section 6: Core Routing Tests
    // ========================================================================

    describe('routeTask', () => {
        it('Test 42: should return error when no workspace', () => {
            mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

            const result = routing.routeTask({ query: 'test' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('No workspace folder open');
        });

        it('Test 43: should return error when no agents', () => {
            mockStorage.listCustomAgents.mockReturnValue([]);

            const result = routing.routeTask({ query: 'test' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('No custom agents found');
        });

        it('Test 44: should find matching agent', () => {
            const docAgent = createTestAgent({
                name: 'doc-agent',
                routing: {
                    keywords: ['documentation'],
                    patterns: [],
                    tags: [],
                    ticketTypes: [],
                    priorityBoost: 0,
                },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'doc-agent', configPath: '/test', valid: true, agent: docAgent },
            ]);

            const result = routing.routeTask({ query: 'Update the documentation' });

            expect(result.success).toBe(true);
            expect(result.bestMatch?.agent.name).toBe('doc-agent');
        });

        it('Test 45: should sort by score', () => {
            const lowPriorityAgent = createTestAgent({
                name: 'low-agent',
                priority: 'P3',
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const highPriorityAgent = createTestAgent({
                name: 'high-agent',
                priority: 'P0',
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'low-agent', configPath: '/test', valid: true, agent: lowPriorityAgent },
                { name: 'high-agent', configPath: '/test', valid: true, agent: highPriorityAgent },
            ]);

            const result = routing.routeTask({ query: 'Run the test' });

            expect(result.bestMatch?.agent.name).toBe('high-agent');
            expect(result.candidates[0].agent.name).toBe('high-agent');
        });

        it('Test 46: should skip inactive agents by default', () => {
            const activeAgent = createTestAgent({
                name: 'active-agent',
                isActive: true,
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const inactiveAgent = createTestAgent({
                name: 'inactive-agent',
                isActive: false,
                priority: 'P0',
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'active-agent', configPath: '/test', valid: true, agent: activeAgent },
                { name: 'inactive-agent', configPath: '/test', valid: true, agent: inactiveAgent },
            ]);

            const result = routing.routeTask({ query: 'Run the test' });

            expect(result.candidates).toHaveLength(1);
            expect(result.bestMatch?.agent.name).toBe('active-agent');
        });

        it('Test 47: should include inactive when option set', () => {
            const activeAgent = createTestAgent({
                name: 'active-agent',
                isActive: true,
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const inactiveAgent = createTestAgent({
                name: 'inactive-agent',
                isActive: false,
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'active-agent', configPath: '/test', valid: true, agent: activeAgent },
                { name: 'inactive-agent', configPath: '/test', valid: true, agent: inactiveAgent },
            ]);

            const result = routing.routeTask({ query: 'Run the test' }, { includeInactive: true });

            expect(result.candidates).toHaveLength(2);
        });

        it('Test 48: should respect maxCandidates', () => {
            const agents = [1, 2, 3, 4, 5].map(i => createTestAgent({
                name: `agent-${i}`,
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            }));
            mockStorage.listCustomAgents.mockReturnValue(
                agents.map(a => ({ name: a.name, configPath: '/test', valid: true, agent: a }))
            );

            const result = routing.routeTask({ query: 'Run the test' }, { maxCandidates: 2 });

            expect(result.candidates).toHaveLength(2);
        });

        it('Test 49: should respect minScore', () => {
            const goodAgent = createTestAgent({
                name: 'good-agent',
                priority: 'P0',
                routing: { keywords: ['test', 'run'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 1 },
            });
            const weakAgent = createTestAgent({
                name: 'weak-agent',
                priority: 'P3',
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: -1 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'good-agent', configPath: '/test', valid: true, agent: goodAgent },
                { name: 'weak-agent', configPath: '/test', valid: true, agent: weakAgent },
            ]);

            const result = routing.routeTask({ query: 'Run the test' }, { minScore: 4 });

            expect(result.candidates).toHaveLength(1);
            expect(result.bestMatch?.agent.name).toBe('good-agent');
        });

        it('Test 50: should handle override correctly', () => {
            const agent1 = createTestAgent({
                name: 'agent-1',
                priority: 'P0',
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const agent2 = createTestAgent({
                name: 'agent-2',
                priority: 'P3',
                routing: { keywords: [], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'agent-1', configPath: '/test', valid: true, agent: agent1 },
                { name: 'agent-2', configPath: '/test', valid: true, agent: agent2 },
            ]);

            const result = routing.routeTask({
                query: 'Run the test',
                agentOverride: 'agent-2'
            });

            expect(result.bestMatch?.agent.name).toBe('agent-2');
            expect(result.wasOverride).toBe(true);
        });
    });

    // ========================================================================
    // Section 7: Utility Function Tests
    // ========================================================================

    describe('findBestAgent', () => {
        it('Test 51: should return best agent', () => {
            const agent = createTestAgent({
                name: 'doc-agent',
                routing: { keywords: ['doc'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'doc-agent', configPath: '/test', valid: true, agent },
            ]);

            const result = routing.findBestAgent('Update the doc');

            expect(result?.name).toBe('doc-agent');
        });

        it('Test 52: should return null when no match', () => {
            mockStorage.listCustomAgents.mockReturnValue([]);

            const result = routing.findBestAgent('Random query');

            expect(result).toBeNull();
        });
    });

    describe('getAgentsForTicketType', () => {
        it('Test 53: should filter by ticket type', () => {
            const aiAgent = createTestAgent({
                name: 'ai-agent',
                routing: { keywords: [], patterns: [], tags: [], ticketTypes: ['ai_to_human'], priorityBoost: 0 },
            });
            const humanAgent = createTestAgent({
                name: 'human-agent',
                routing: { keywords: [], patterns: [], tags: [], ticketTypes: ['human_to_ai'], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'ai-agent', configPath: '/test', valid: true, agent: aiAgent },
                { name: 'human-agent', configPath: '/test', valid: true, agent: humanAgent },
            ]);

            const result = routing.getAgentsForTicketType('ai_to_human');

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('ai-agent');
        });

        it('Test 54: should return empty for no workspace', () => {
            mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

            const result = routing.getAgentsForTicketType('ai_to_human');

            expect(result).toEqual([]);
        });
    });

    describe('getAgentsByKeyword', () => {
        it('Test 55: should find agents with keyword', () => {
            const agent = createTestAgent({
                name: 'doc-agent',
                routing: { keywords: ['documentation'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'doc-agent', configPath: '/test', valid: true, agent },
            ]);

            const result = routing.getAgentsByKeyword('documentation');

            expect(result).toHaveLength(1);
        });

        it('Test 56: should be case-insensitive', () => {
            const agent = createTestAgent({
                name: 'doc-agent',
                routing: { keywords: ['DOCUMENTATION'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'doc-agent', configPath: '/test', valid: true, agent },
            ]);

            const result = routing.getAgentsByKeyword('documentation');

            expect(result).toHaveLength(1);
        });
    });

    describe('getAgentsByTag', () => {
        it('Test 57: should find agents with tag', () => {
            const agent = createTestAgent({
                name: 'bug-agent',
                routing: { keywords: [], patterns: [], tags: ['bug'], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'bug-agent', configPath: '/test', valid: true, agent },
            ]);

            const result = routing.getAgentsByTag('bug');

            expect(result).toHaveLength(1);
        });
    });

    // ========================================================================
    // Section 8: Analysis Functions Tests
    // ========================================================================

    describe('analyzeRouting', () => {
        it('Test 58: should analyze agent routing', () => {
            const agent = createTestAgent({
                name: 'test-agent',
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.loadCustomAgent.mockReturnValue(agent);

            const result = routing.analyzeRouting('test-agent', { query: 'Run the test' });

            expect(result).not.toBeNull();
            expect(result?.matchedKeywords).toContain('test');
        });

        it('Test 59: should return null for missing agent', () => {
            mockStorage.loadCustomAgent.mockImplementation(() => {
                throw new Error('Not found');
            });

            const result = routing.analyzeRouting('missing-agent', { query: 'test' });

            expect(result).toBeNull();
        });

        it('Test 60: should return null for no workspace', () => {
            mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

            const result = routing.analyzeRouting('test-agent', { query: 'test' });

            expect(result).toBeNull();
        });
    });

    describe('getRoutingSummary', () => {
        it('Test 61: should return summary', () => {
            const agent1 = createTestAgent({
                name: 'agent-1',
                isActive: true,
                routing: { keywords: ['doc'], patterns: [], tags: ['urgent'], ticketTypes: ['ai_to_human'], priorityBoost: 0 },
            });
            const agent2 = createTestAgent({
                name: 'agent-2',
                isActive: false,
                routing: { keywords: ['test'], patterns: [], tags: ['bug'], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'agent-1', configPath: '/test', valid: true, agent: agent1 },
                { name: 'agent-2', configPath: '/test', valid: true, agent: agent2 },
            ]);

            const summary = routing.getRoutingSummary();

            expect(summary.totalAgents).toBe(2);
            expect(summary.activeAgents).toBe(1);
            expect(summary.allKeywords).toContain('doc');
            expect(summary.allKeywords).toContain('test');
            expect(summary.allTags).toContain('urgent');
            expect(summary.ticketTypesCovered).toContain('ai_to_human');
        });

        it('Test 62: should identify agents without rules', () => {
            const agentWithRules = createTestAgent({
                name: 'with-rules',
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const agentWithoutRules = createTestAgent({
                name: 'without-rules',
                routing: { keywords: [], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'with-rules', configPath: '/test', valid: true, agent: agentWithRules },
                { name: 'without-rules', configPath: '/test', valid: true, agent: agentWithoutRules },
            ]);

            const summary = routing.getRoutingSummary();

            expect(summary.agentsWithoutRules).toContain('without-rules');
            expect(summary.agentsWithoutRules).not.toContain('with-rules');
        });

        it('Test 63: should return empty summary for no workspace', () => {
            mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

            const summary = routing.getRoutingSummary();

            expect(summary.totalAgents).toBe(0);
        });
    });

    describe('findRoutingConflicts', () => {
        it('Test 64: should find keyword conflicts', () => {
            const agent1 = createTestAgent({
                name: 'agent-1',
                routing: { keywords: ['help', 'support'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const agent2 = createTestAgent({
                name: 'agent-2',
                routing: { keywords: ['help'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'agent-1', configPath: '/test', valid: true, agent: agent1 },
                { name: 'agent-2', configPath: '/test', valid: true, agent: agent2 },
            ]);

            const conflicts = routing.findRoutingConflicts();

            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].keyword).toBe('help');
            expect(conflicts[0].agents).toContain('agent-1');
            expect(conflicts[0].agents).toContain('agent-2');
        });

        it('Test 65: should return empty for no conflicts', () => {
            const agent1 = createTestAgent({
                name: 'agent-1',
                routing: { keywords: ['help'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const agent2 = createTestAgent({
                name: 'agent-2',
                routing: { keywords: ['support'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            mockStorage.listCustomAgents.mockReturnValue([
                { name: 'agent-1', configPath: '/test', valid: true, agent: agent1 },
                { name: 'agent-2', configPath: '/test', valid: true, agent: agent2 },
            ]);

            const conflicts = routing.findRoutingConflicts();

            expect(conflicts).toHaveLength(0);
        });

        it('Test 66: should return empty for no workspace', () => {
            mockStorage.getWorkspaceFolder.mockReturnValue(undefined);

            const conflicts = routing.findRoutingConflicts();

            expect(conflicts).toEqual([]);
        });
    });

    // ========================================================================
    // Section 9: Edge Cases
    // ========================================================================

    describe('Edge Cases', () => {
        it('Test 67: should handle empty routing rules', () => {
            const agent = createTestAgent({
                routing: { keywords: [], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const context: routing.TaskContext = { query: 'test query' };
            const match = routing.matchAgent(agent, context);

            expect(routing.hasAnyMatch(match)).toBe(false);
        });

        it('Test 68: should handle very long query', () => {
            const agent = createTestAgent({
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const longQuery = 'test '.repeat(1000);
            const match = routing.matchAgent(agent, { query: longQuery });

            expect(match.matchedKeywords).toContain('test');
        });

        it('Test 69: should handle special characters in query', () => {
            const agent = createTestAgent({
                routing: { keywords: ['test'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const context: routing.TaskContext = { query: 'test @#$%^&*()' };
            const match = routing.matchAgent(agent, context);

            expect(match.matchedKeywords).toContain('test');
        });

        it('Test 70: should handle unicode in keywords with fuzzy', () => {
            // Word boundary matching doesn't work well with non-ASCII
            // Use fuzzy matching for unicode keywords
            const agent = createTestAgent({
                routing: { keywords: ['日本語'], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
            });
            const context: routing.TaskContext = { query: '日本語のテスト' };
            const match = routing.matchAgent(agent, context, { fuzzyMatch: true });

            expect(match.matchedKeywords).toContain('日本語');
        });
    });
});
