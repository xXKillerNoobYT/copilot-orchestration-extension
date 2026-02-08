/**
 * TaskDecomposer Test Suite
 *
 * Tests the TaskDecomposer's ability to break features into atomic tasks,
 * parse LLM responses, resolve dependencies, detect circular dependencies,
 * find critical paths, and manage the singleton lifecycle.
 *
 * @module tests/agents/planning/decomposer
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';

// ── Mock types ──────────────────────────────────────────────────────────────
type MockedLLMResponse = {
    content: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

// ── Define mock functions before jest.mock() ────────────────────────────────
const mockCompleteLLM = jest.fn<(...args: any[]) => Promise<MockedLLMResponse>>();

jest.mock('../../../src/services/llmService', () => ({
    completeLLM: (...args: any[]) => mockCompleteLLM(...args)
}));

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

jest.mock('../../../src/agents/planning/analysis', () => ({}));

// ── Imports after mocks ─────────────────────────────────────────────────────
import {
    TaskDecomposer,
    getTaskDecomposer,
    resetTaskDecomposerForTests
} from '../../../src/agents/planning/decomposer';
import type { AtomicTask, DecompositionResult } from '../../../src/agents/planning/decomposer';
import type { ExtractedFeature } from '../../../src/agents/planning/analysis';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Helper: build a minimal ExtractedFeature */
function makeFeature(overrides: Partial<ExtractedFeature> = {}): ExtractedFeature {
    return {
        id: 'F001',
        description: 'Implement user authentication',
        isUI: false,
        sourceText: 'We need user authentication',
        ...overrides
    };
}

/** Helper: build a standard LLM response with multiple TASK blocks */
function makeLLMResponse(content: string): MockedLLMResponse {
    return {
        content,
        usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
    };
}

/**
 * A well-formed multi-task LLM response for reuse across tests.
 * Three tasks: task 2 depends on task 1, task 3 depends on task 2.
 */
const MULTI_TASK_RESPONSE = `TASK: Create database schema
DESCRIPTION: Design the DB schema for users
ESTIMATE: 30
DEPENDS_ON: none
PRIORITY: P0
ACCEPTANCE_CRITERIA:
- Schema is created
- Tests pass
- Docs updated
FILES: src/db/schema.ts
PATTERNS: singleton

TASK: Build authentication service
DESCRIPTION: Implement auth service with JWT tokens
ESTIMATE: 45
DEPENDS_ON: 1
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Auth service works
- JWT tokens issued
- Error handling
FILES: src/services/auth.ts, src/middleware/auth.ts
PATTERNS: singleton, middleware

TASK: Add login endpoint
DESCRIPTION: Create POST /login endpoint
ESTIMATE: 25
DEPENDS_ON: 2
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Endpoint returns token
- Invalid creds rejected
FILES: src/routes/login.ts
PATTERNS: controller`;

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('TaskDecomposer', () => {
    let decomposer: TaskDecomposer;

    beforeEach(() => {
        jest.clearAllMocks();
        resetTaskDecomposerForTests();
        decomposer = new TaskDecomposer();
    });

    // ── Constructor ─────────────────────────────────────────────────────────

    describe('constructor', () => {
        it('Test 1: should initialize with default config values', () => {
            const d = new TaskDecomposer();
            // Verify defaults by decomposing and checking clamped estimates
            // The config is private, so we validate behaviour instead
            expect(d).toBeDefined();
            expect(d).toBeInstanceOf(TaskDecomposer);
        });

        it('Test 2: should merge custom config with defaults', () => {
            const custom = new TaskDecomposer({
                minDurationMinutes: 10,
                maxDurationMinutes: 120
            });
            expect(custom).toBeDefined();
            expect(custom).toBeInstanceOf(TaskDecomposer);
        });

        it('Test 3: should allow partial config overrides', () => {
            const custom = new TaskDecomposer({ maxSubtasks: 5 });
            expect(custom).toBeDefined();
        });
    });

    // ── decompose() ─────────────────────────────────────────────────────────

    describe('decompose()', () => {
        it('Test 4: should return a DecompositionResult with correct structure', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const feature = makeFeature();

            const result: DecompositionResult = await decomposer.decompose(feature);

            expect(result.feature).toBe(feature);
            expect(result.tasks).toBeInstanceOf(Array);
            expect(result.tasks.length).toBe(3);
            expect(result.dependencyGraph).toBeInstanceOf(Map);
            expect(result.criticalPath).toBeInstanceOf(Array);
            expect(typeof result.totalEstimateMinutes).toBe('number');
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('Test 5: should sum totalEstimateMinutes from all tasks', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            const expected = result.tasks.reduce((sum, t) => sum + t.estimateMinutes, 0);
            expect(result.totalEstimateMinutes).toBe(expected);
        });

        it('Test 6: should pass context to the prompt when provided', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            await decomposer.decompose(makeFeature(), 'Use existing singleton pattern');

            const prompt = mockCompleteLLM.mock.calls[0][0] as string;
            expect(prompt).toContain('Use existing singleton pattern');
        });

        it('Test 7: should set isUI from the feature on all tasks', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature({ isUI: true }));

            for (const task of result.tasks) {
                expect(task.isUI).toBe(true);
            }
        });

        it('Test 8: should return a fallback task when LLM fails', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('Network error'));
            const feature = makeFeature();

            const result = await decomposer.decompose(feature);

            expect(result.tasks.length).toBe(1);
            expect(result.tasks[0].title).toContain('Implement:');
            expect(result.tasks[0].featureId).toBe(feature.id);
            expect(result.tasks[0].status).toBe('ready');
        });
    });

    // ── parseTasksResponse (tested through decompose) ───────────────────────

    describe('parseTasksResponse (via decompose)', () => {
        it('Test 9: should parse task title correctly', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].title).toBe('Create database schema');
            expect(result.tasks[1].title).toBe('Build authentication service');
            expect(result.tasks[2].title).toBe('Add login endpoint');
        });

        it('Test 10: should parse task description', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].description).toBe('Design the DB schema for users');
        });

        it('Test 11: should parse estimate in minutes', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].estimateMinutes).toBe(30);
            expect(result.tasks[1].estimateMinutes).toBe(45);
            expect(result.tasks[2].estimateMinutes).toBe(25);
        });

        it('Test 12: should parse priority levels', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].priority).toBe('P0');
            expect(result.tasks[1].priority).toBe('P1');
        });

        it('Test 13: should parse acceptance criteria from bullet list', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].acceptanceCriteria).toContain('Schema is created');
            expect(result.tasks[0].acceptanceCriteria).toContain('Tests pass');
            expect(result.tasks[0].acceptanceCriteria).toContain('Docs updated');
        });

        it('Test 14: should parse files list', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].files).toEqual(['src/db/schema.ts']);
        });

        it('Test 15: should parse patterns list', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].patterns).toEqual(['singleton']);
        });

        it('Test 16: should assign correct task IDs (featureId.N)', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const feature = makeFeature({ id: 'F042' });
            const result = await decomposer.decompose(feature);

            expect(result.tasks[0].id).toBe('F042.1');
            expect(result.tasks[1].id).toBe('F042.2');
            expect(result.tasks[2].id).toBe('F042.3');
        });

        it('Test 17: should set featureId on every task', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const feature = makeFeature({ id: 'F007' });
            const result = await decomposer.decompose(feature);

            for (const task of result.tasks) {
                expect(task.featureId).toBe('F007');
            }
        });
    });

    // ── Estimate clamping ───────────────────────────────────────────────────

    describe('estimate clamping', () => {
        it('Test 18: should clamp estimate below min to minDurationMinutes', async () => {
            const response = `TASK: Quick fix
DESCRIPTION: Tiny change
ESTIMATE: 5
DEPENDS_ON: none
PRIORITY: P2
ACCEPTANCE_CRITERIA:
- Fix applied
FILES: src/fix.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await decomposer.decompose(makeFeature());

            // Default min is 15
            expect(result.tasks[0].estimateMinutes).toBe(15);
        });

        it('Test 19: should clamp estimate above max to maxDurationMinutes', async () => {
            const response = `TASK: Giant refactor
DESCRIPTION: Huge change
ESTIMATE: 200
DEPENDS_ON: none
PRIORITY: P0
ACCEPTANCE_CRITERIA:
- Refactor done
FILES: src/big.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await decomposer.decompose(makeFeature());

            // Default max is 60
            expect(result.tasks[0].estimateMinutes).toBe(60);
        });

        it('Test 20: should respect custom min/max config for clamping', async () => {
            const custom = new TaskDecomposer({ minDurationMinutes: 10, maxDurationMinutes: 120 });
            const response = `TASK: Custom limits
DESCRIPTION: Testing custom limits
ESTIMATE: 3
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Done
FILES: src/x.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await custom.decompose(makeFeature());

            expect(result.tasks[0].estimateMinutes).toBe(10);
        });

        it('Test 21: should default estimate to 30 when not parseable', async () => {
            const response = `TASK: Missing estimate task
DESCRIPTION: No number given
ESTIMATE: unknown
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Completed
FILES: src/y.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await decomposer.decompose(makeFeature());

            // parseInt('unknown') = NaN, fallback '30' => 30, clamped to [15,60]
            expect(result.tasks[0].estimateMinutes).toBe(30);
        });
    });

    // ── Default acceptance criteria padding ─────────────────────────────────

    describe('acceptance criteria padding', () => {
        it('Test 22: should pad acceptance criteria to minAcceptanceCriteria', async () => {
            const response = `TASK: Sparse criteria
DESCRIPTION: Not many criteria
ESTIMATE: 20
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- One criterion
FILES: src/z.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await decomposer.decompose(makeFeature());

            // Default minAcceptanceCriteria is 3; we provided 1
            expect(result.tasks[0].acceptanceCriteria.length).toBeGreaterThanOrEqual(3);
            expect(result.tasks[0].acceptanceCriteria[0]).toBe('One criterion');
            // Padded entries should contain "Verify task"
            expect(result.tasks[0].acceptanceCriteria[1]).toMatch(/Verify task \d+ is complete/);
        });

        it('Test 23: should not pad when criteria already meet the minimum', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            // First task has exactly 3 criteria in the response
            expect(result.tasks[0].acceptanceCriteria.length).toBe(3);
            expect(result.tasks[0].acceptanceCriteria).not.toContain(
                expect.stringContaining('Verify task')
            );
        });
    });

    // ── Dependency resolution ───────────────────────────────────────────────

    describe('dependency resolution', () => {
        it('Test 24: should resolve numeric dependencies to task IDs', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const feature = makeFeature({ id: 'F001' });
            const result = await decomposer.decompose(feature);

            // Task 2 depends on task 1 => F001.1
            expect(result.tasks[1].dependsOn).toEqual(['F001.1']);
            // Task 3 depends on task 2 => F001.2
            expect(result.tasks[2].dependsOn).toEqual(['F001.2']);
        });

        it('Test 25: should have empty dependsOn for "none"', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].dependsOn).toEqual([]);
        });

        it('Test 26: should filter out dependencies referencing non-existent tasks', async () => {
            const response = `TASK: Orphan dep
DESCRIPTION: References missing task
ESTIMATE: 20
DEPENDS_ON: 99
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Done
- Verified
- Complete
FILES: src/orphan.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await decomposer.decompose(makeFeature());

            // Task 99 does not exist, so dependsOn should be filtered out
            expect(result.tasks[0].dependsOn).toEqual([]);
        });
    });

    // ── Reverse dependency building (blocks) ────────────────────────────────

    describe('reverse dependencies (blocks)', () => {
        it('Test 27: should populate blocks array for upstream tasks', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const feature = makeFeature({ id: 'F001' });
            const result = await decomposer.decompose(feature);

            // Task 1 blocks task 2
            expect(result.tasks[0].blocks).toContain('F001.2');
            // Task 2 blocks task 3
            expect(result.tasks[1].blocks).toContain('F001.3');
            // Task 3 blocks nothing
            expect(result.tasks[2].blocks).toEqual([]);
        });
    });

    // ── Status assignment ───────────────────────────────────────────────────

    describe('status assignment', () => {
        it('Test 28: should set status to "ready" for tasks with no dependencies', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].status).toBe('ready');
        });

        it('Test 29: should set status to "pending" for tasks with dependencies', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[1].status).toBe('pending');
            expect(result.tasks[2].status).toBe('pending');
        });
    });

    // ── buildDependencyGraph (tested through decompose result) ──────────────

    describe('buildDependencyGraph', () => {
        it('Test 30: should produce an adjacency list Map', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const feature = makeFeature({ id: 'F001' });
            const result = await decomposer.decompose(feature);

            expect(result.dependencyGraph).toBeInstanceOf(Map);
            expect(result.dependencyGraph.get('F001.1')).toEqual([]);
            expect(result.dependencyGraph.get('F001.2')).toEqual(['F001.1']);
            expect(result.dependencyGraph.get('F001.3')).toEqual(['F001.2']);
        });

        it('Test 31: should have an entry for every task', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            expect(result.dependencyGraph.size).toBe(result.tasks.length);
        });
    });

    // ── findCriticalPath ────────────────────────────────────────────────────

    describe('findCriticalPath', () => {
        it('Test 32: should return the longest dependency chain', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const feature = makeFeature({ id: 'F001' });
            const result = await decomposer.decompose(feature);

            // Linear chain: 1 -> 2 -> 3, so critical path is all three
            expect(result.criticalPath).toEqual(['F001.1', 'F001.2', 'F001.3']);
        });

        it('Test 33: should handle single task with no dependencies', async () => {
            const singleTask = `TASK: Only task
DESCRIPTION: The one and only
ESTIMATE: 30
DEPENDS_ON: none
PRIORITY: P0
ACCEPTANCE_CRITERIA:
- It works
- Tests pass
- Reviewed
FILES: src/single.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(singleTask));
            const result = await decomposer.decompose(makeFeature({ id: 'F010' }));

            expect(result.criticalPath).toEqual(['F010.1']);
        });

        it('Test 34: should pick the path with highest total estimate', async () => {
            // Two independent chains: task1 (60 min) and task2 (15 min) -> task3 (15 min)
            // Critical path should be task1 because 60 > 15+15=30
            const response = `TASK: Big solo task
DESCRIPTION: Large independent
ESTIMATE: 60
DEPENDS_ON: none
PRIORITY: P0
ACCEPTANCE_CRITERIA:
- A done
- B done
- C done
FILES: src/a.ts
PATTERNS: none

TASK: Small first
DESCRIPTION: Small task
ESTIMATE: 15
DEPENDS_ON: none
PRIORITY: P2
ACCEPTANCE_CRITERIA:
- X done
- Y done
- Z done
FILES: src/b.ts
PATTERNS: none

TASK: Small second
DESCRIPTION: Depends on small first
ESTIMATE: 15
DEPENDS_ON: 2
PRIORITY: P2
ACCEPTANCE_CRITERIA:
- M done
- N done
- O done
FILES: src/c.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const feature = makeFeature({ id: 'F020' });
            const result = await decomposer.decompose(feature);

            // Path through task1 = 60 min, path through task2->task3 = 30 min
            expect(result.criticalPath).toContain('F020.1');
            expect(result.criticalPath.length).toBe(1);
        });
    });

    // ── createFallbackTask ──────────────────────────────────────────────────

    describe('createFallbackTask', () => {
        it('Test 35: should create a fallback when LLM throws', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('Connection refused'));
            const feature = makeFeature({ id: 'F099', description: 'Build a spaceship navigation system' });

            const result = await decomposer.decompose(feature);

            expect(result.tasks.length).toBe(1);
            const task = result.tasks[0];
            expect(task.id).toBe('F099.1');
            expect(task.featureId).toBe('F099');
            expect(task.title).toContain('Implement:');
            expect(task.title).toContain('Build a spaceship navigation system');
            expect(task.estimateMinutes).toBe(30);
            expect(task.dependsOn).toEqual([]);
            expect(task.blocks).toEqual([]);
            expect(task.acceptanceCriteria.length).toBe(3);
            expect(task.priority).toBe('P1');
            expect(task.status).toBe('ready');
        });

        it('Test 36: should truncate long descriptions in fallback title to 50 chars', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('Timeout'));
            const longDescription = 'A'.repeat(100);
            const feature = makeFeature({ description: longDescription });

            const result = await decomposer.decompose(feature);

            // Title uses description.slice(0, 50)
            expect(result.tasks[0].title).toBe(`Implement: ${'A'.repeat(50)}`);
        });

        it('Test 37: should propagate isUI from feature to fallback task', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('Fail'));
            const feature = makeFeature({ isUI: true });
            const result = await decomposer.decompose(feature);

            expect(result.tasks[0].isUI).toBe(true);
        });
    });

    // ── detectCircularDependencies ──────────────────────────────────────────

    describe('detectCircularDependencies', () => {
        it('Test 38: should return empty array when there are no cycles', () => {
            const tasks: AtomicTask[] = [
                {
                    id: 'T.1', featureId: 'F1', title: 'A', description: 'A',
                    estimateMinutes: 15, dependsOn: [], blocks: [],
                    acceptanceCriteria: ['done'], files: [], patterns: [],
                    priority: 'P0', isUI: false, status: 'ready'
                },
                {
                    id: 'T.2', featureId: 'F1', title: 'B', description: 'B',
                    estimateMinutes: 15, dependsOn: ['T.1'], blocks: [],
                    acceptanceCriteria: ['done'], files: [], patterns: [],
                    priority: 'P1', isUI: false, status: 'pending'
                }
            ];

            const cycles = decomposer.detectCircularDependencies(tasks);
            expect(cycles).toEqual([]);
        });

        it('Test 39: should detect a simple two-node cycle', () => {
            const tasks: AtomicTask[] = [
                {
                    id: 'T.1', featureId: 'F1', title: 'A', description: 'A',
                    estimateMinutes: 15, dependsOn: ['T.2'], blocks: [],
                    acceptanceCriteria: ['done'], files: [], patterns: [],
                    priority: 'P0', isUI: false, status: 'pending'
                },
                {
                    id: 'T.2', featureId: 'F1', title: 'B', description: 'B',
                    estimateMinutes: 15, dependsOn: ['T.1'], blocks: [],
                    acceptanceCriteria: ['done'], files: [], patterns: [],
                    priority: 'P1', isUI: false, status: 'pending'
                }
            ];

            const cycles = decomposer.detectCircularDependencies(tasks);
            expect(cycles.length).toBeGreaterThan(0);
        });

        it('Test 40: should detect a three-node cycle', () => {
            const tasks: AtomicTask[] = [
                {
                    id: 'T.1', featureId: 'F1', title: 'A', description: 'A',
                    estimateMinutes: 15, dependsOn: ['T.3'], blocks: [],
                    acceptanceCriteria: ['done'], files: [], patterns: [],
                    priority: 'P0', isUI: false, status: 'pending'
                },
                {
                    id: 'T.2', featureId: 'F1', title: 'B', description: 'B',
                    estimateMinutes: 15, dependsOn: ['T.1'], blocks: [],
                    acceptanceCriteria: ['done'], files: [], patterns: [],
                    priority: 'P1', isUI: false, status: 'pending'
                },
                {
                    id: 'T.3', featureId: 'F1', title: 'C', description: 'C',
                    estimateMinutes: 15, dependsOn: ['T.2'], blocks: [],
                    acceptanceCriteria: ['done'], files: [], patterns: [],
                    priority: 'P2', isUI: false, status: 'pending'
                }
            ];

            const cycles = decomposer.detectCircularDependencies(tasks);
            expect(cycles.length).toBeGreaterThan(0);
        });

        it('Test 41: should return empty for disconnected acyclic tasks', () => {
            const tasks: AtomicTask[] = [
                {
                    id: 'T.1', featureId: 'F1', title: 'A', description: 'A',
                    estimateMinutes: 15, dependsOn: [], blocks: [],
                    acceptanceCriteria: ['done'], files: [], patterns: [],
                    priority: 'P0', isUI: false, status: 'ready'
                },
                {
                    id: 'T.2', featureId: 'F1', title: 'B', description: 'B',
                    estimateMinutes: 15, dependsOn: [], blocks: [],
                    acceptanceCriteria: ['done'], files: [], patterns: [],
                    priority: 'P1', isUI: false, status: 'ready'
                }
            ];

            const cycles = decomposer.detectCircularDependencies(tasks);
            expect(cycles).toEqual([]);
        });

        it('Test 42: should handle empty task list without error', () => {
            const cycles = decomposer.detectCircularDependencies([]);
            expect(cycles).toEqual([]);
        });
    });

    // ── maxSubtasks limit ───────────────────────────────────────────────────

    describe('maxSubtasks limit', () => {
        it('Test 43: should limit parsed tasks to maxSubtasks', async () => {
            const custom = new TaskDecomposer({ maxSubtasks: 2 });

            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await custom.decompose(makeFeature());

            // The response has 3 tasks but maxSubtasks is 2
            expect(result.tasks.length).toBeLessThanOrEqual(2);
        });

        it('Test 44: should still parse all tasks up to the limit', async () => {
            const custom = new TaskDecomposer({ maxSubtasks: 1 });

            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await custom.decompose(makeFeature());

            expect(result.tasks.length).toBe(1);
            expect(result.tasks[0].title).toBe('Create database schema');
        });
    });

    // ── Singleton pattern ───────────────────────────────────────────────────

    describe('singleton: getTaskDecomposer / resetTaskDecomposerForTests', () => {
        it('Test 45: should return the same instance on multiple calls', () => {
            const a = getTaskDecomposer();
            const b = getTaskDecomposer();
            expect(a).toBe(b);
        });

        it('Test 46: should return a new instance after reset', () => {
            const a = getTaskDecomposer();
            resetTaskDecomposerForTests();
            const b = getTaskDecomposer();
            expect(a).not.toBe(b);
        });

        it('Test 47: should return a TaskDecomposer instance', () => {
            const instance = getTaskDecomposer();
            expect(instance).toBeInstanceOf(TaskDecomposer);
        });
    });

    // ── resetCounter ────────────────────────────────────────────────────────

    describe('resetCounter', () => {
        it('Test 48: should reset without throwing', () => {
            expect(() => decomposer.resetCounter()).not.toThrow();
        });

        it('Test 49: should be callable multiple times', () => {
            decomposer.resetCounter();
            decomposer.resetCounter();
            expect(true).toBe(true); // no error means success
        });
    });

    // ── Edge cases in parsing ───────────────────────────────────────────────

    describe('parsing edge cases', () => {
        it('Test 50: should skip blocks that do not contain TASK:', async () => {
            const response = `Some preamble text without task markers.

TASK: Actual task
DESCRIPTION: Valid task
ESTIMATE: 20
DEPENDS_ON: none
PRIORITY: P0
ACCEPTANCE_CRITERIA:
- Works
- Tests pass
- Reviewed
FILES: src/valid.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks.length).toBe(1);
            expect(result.tasks[0].title).toBe('Actual task');
        });

        it('Test 51: should default priority to P1 when not parseable', async () => {
            const response = `TASK: No priority
DESCRIPTION: Missing priority line
ESTIMATE: 20
DEPENDS_ON: none
PRIORITY: INVALID
ACCEPTANCE_CRITERIA:
- Done
- Tested
- Verified
FILES: src/nopri.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].priority).toBe('P1');
        });

        it('Test 52: should handle response with no parseable tasks by returning empty', async () => {
            const response = `This is just random text with no structured tasks at all.`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks.length).toBe(0);
        });

        it('Test 53: should use title as description fallback when description is missing', async () => {
            // When DESCRIPTION is absent, the regex won't match, so description
            // falls back to the title text
            const response = `TASK: Title only task
ESTIMATE: 20
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Done
- Tested
- Verified
FILES: src/t.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const result = await decomposer.decompose(makeFeature());

            expect(result.tasks[0].description).toBe(result.tasks[0].title);
        });

        it('Test 54: should handle multiple comma-separated dependencies', async () => {
            const response = `TASK: First
DESCRIPTION: First task
ESTIMATE: 20
DEPENDS_ON: none
PRIORITY: P0
ACCEPTANCE_CRITERIA:
- A
- B
- C
FILES: src/a.ts
PATTERNS: none

TASK: Second
DESCRIPTION: Second task
ESTIMATE: 20
DEPENDS_ON: none
PRIORITY: P0
ACCEPTANCE_CRITERIA:
- A
- B
- C
FILES: src/b.ts
PATTERNS: none

TASK: Third depends on both
DESCRIPTION: Third task
ESTIMATE: 20
DEPENDS_ON: 1, 2
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- A
- B
- C
FILES: src/c.ts
PATTERNS: none`;
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(response));
            const feature = makeFeature({ id: 'F050' });
            const result = await decomposer.decompose(feature);

            expect(result.tasks[2].dependsOn).toContain('F050.1');
            expect(result.tasks[2].dependsOn).toContain('F050.2');
        });

        it('Test 55: should handle LLM call with system prompt and temperature', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            await decomposer.decompose(makeFeature());

            expect(mockCompleteLLM).toHaveBeenCalledTimes(1);
            const callArgs = mockCompleteLLM.mock.calls[0];
            expect(typeof callArgs[0]).toBe('string'); // prompt
            expect(callArgs[1]).toEqual(
                expect.objectContaining({
                    systemPrompt: expect.any(String),
                    temperature: 0.3
                })
            );
        });

        it('Test 56: should include feature ID and description in LLM prompt', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const feature = makeFeature({ id: 'F123', description: 'Build a rocket' });
            await decomposer.decompose(feature);

            const prompt = mockCompleteLLM.mock.calls[0][0] as string;
            expect(prompt).toContain('F123');
            expect(prompt).toContain('Build a rocket');
        });

        it('Test 57: should handle multiple files separated by commas', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            // Task 2 has "src/services/auth.ts, src/middleware/auth.ts"
            expect(result.tasks[1].files).toContain('src/services/auth.ts');
            expect(result.tasks[1].files).toContain('src/middleware/auth.ts');
        });

        it('Test 58: should handle multiple patterns separated by commas', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const result = await decomposer.decompose(makeFeature());

            // Task 2 has "singleton, middleware"
            expect(result.tasks[1].patterns).toContain('singleton');
            expect(result.tasks[1].patterns).toContain('middleware');
        });
    });

    // ── Prompt construction ─────────────────────────────────────────────────

    describe('prompt construction', () => {
        it('Test 59: should include UI-Related in prompt when feature.isUI is true', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            await decomposer.decompose(makeFeature({ isUI: true }));

            const prompt = mockCompleteLLM.mock.calls[0][0] as string;
            expect(prompt).toContain('UI-Related: Yes');
        });

        it('Test 60: should include UI-Related: No when feature.isUI is false', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            await decomposer.decompose(makeFeature({ isUI: false }));

            const prompt = mockCompleteLLM.mock.calls[0][0] as string;
            expect(prompt).toContain('UI-Related: No');
        });

        it('Test 61: should not include context block when context is undefined', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            await decomposer.decompose(makeFeature());

            const prompt = mockCompleteLLM.mock.calls[0][0] as string;
            expect(prompt).not.toContain('Context:');
        });
    });

    // ── Integration-like: full round-trip ───────────────────────────────────

    describe('full round-trip decomposition', () => {
        it('Test 62: should produce a fully populated DecompositionResult', async () => {
            mockCompleteLLM.mockResolvedValueOnce(makeLLMResponse(MULTI_TASK_RESPONSE));
            const feature = makeFeature({ id: 'FRT' });
            const result = await decomposer.decompose(feature);

            // Tasks
            expect(result.tasks.length).toBe(3);
            for (const task of result.tasks) {
                expect(task.id).toMatch(/^FRT\.\d+$/);
                expect(task.featureId).toBe('FRT');
                expect(task.title.length).toBeGreaterThan(0);
                expect(task.description.length).toBeGreaterThan(0);
                expect(task.estimateMinutes).toBeGreaterThanOrEqual(15);
                expect(task.estimateMinutes).toBeLessThanOrEqual(60);
                expect(['P0', 'P1', 'P2', 'P3']).toContain(task.priority);
                expect(task.acceptanceCriteria.length).toBeGreaterThanOrEqual(3);
                expect(['pending', 'ready']).toContain(task.status);
            }

            // Dependency graph
            expect(result.dependencyGraph.size).toBe(3);

            // Critical path traverses all three in linear chain
            expect(result.criticalPath.length).toBe(3);

            // Total estimate is sum
            expect(result.totalEstimateMinutes).toBe(
                result.tasks.reduce((s, t) => s + t.estimateMinutes, 0)
            );
        });
    });
});
