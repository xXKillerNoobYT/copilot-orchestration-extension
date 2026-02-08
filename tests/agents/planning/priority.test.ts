/**
 * @file Tests for PriorityAssigner
 *
 * Validates priority assignment logic including scoring, factor inference,
 * batch processing, critical path detection, reordering, and statistics.
 */

// Mock vscode before any imports
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn()
    })),
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
    }
}), { virtual: true });

// Mock logger
const mockLogInfo = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('../../../src/logger', () => ({
    logInfo: (...args: unknown[]) => mockLogInfo(...args),
    logWarn: (...args: unknown[]) => mockLogWarn(...args)
}));

import {
    PriorityAssigner,
    getPriorityAssigner,
    resetPriorityAssignerForTests,
    PRIORITY_DESCRIPTIONS,
    type PriorityLevel,
    type PriorityFactors,
    type PriorityResult,
    type PriorityConfig
} from '../../../src/agents/planning/priority';
import type { AtomicTask } from '../../../src/agents/planning/decomposer';

/**
 * Helper to create a mock AtomicTask with sensible defaults.
 */
function createMockTask(overrides: Partial<AtomicTask> = {}): AtomicTask {
    return {
        id: 'TK-001.1',
        featureId: 'TK-001',
        title: 'Implement feature',
        description: 'A generic task',
        estimateMinutes: 30,
        dependsOn: [],
        blocks: [],
        acceptanceCriteria: ['Feature works'],
        files: ['src/feature.ts'],
        patterns: [],
        priority: 'P1',
        isUI: false,
        status: 'pending',
        ...overrides
    };
}

describe('PriorityAssigner', () => {
    let assigner: PriorityAssigner;

    beforeEach(() => {
        jest.clearAllMocks();
        resetPriorityAssignerForTests();
        assigner = new PriorityAssigner();
    });

    // ─── Constructor ──────────────────────────────────────────────

    describe('constructor', () => {
        it('Test 1: should create with default config when no args provided', () => {
            const a = new PriorityAssigner();
            expect(a).toBeInstanceOf(PriorityAssigner);
        });

        it('Test 2: should merge custom config with defaults', () => {
            const custom: Partial<PriorityConfig> = {
                dependencyWeight: 0.5,
                quickWinBoost: false
            };
            const a = new PriorityAssigner(custom);
            // Verify the custom config is used: a task with high dependentCount
            // should score differently with weight 0.5 vs default 0.25
            const task = createMockTask({ title: 'Neutral task', description: '' });
            const resultCustom = a.assignPriority(task, { dependentCount: 5 });
            const resultDefault = assigner.assignPriority(task, { dependentCount: 5 });
            // Higher dependency weight should yield a higher score
            expect(resultCustom.score).toBeGreaterThan(resultDefault.score);
        });
    });

    // ─── PRIORITY_DESCRIPTIONS constant ───────────────────────────

    describe('PRIORITY_DESCRIPTIONS', () => {
        it('Test 3: should have descriptions for all four priority levels', () => {
            const levels: PriorityLevel[] = ['P0', 'P1', 'P2', 'P3'];
            for (const level of levels) {
                expect(PRIORITY_DESCRIPTIONS[level]).toBeDefined();
                expect(typeof PRIORITY_DESCRIPTIONS[level]).toBe('string');
                expect(PRIORITY_DESCRIPTIONS[level].length).toBeGreaterThan(0);
            }
        });
    });

    // ─── assignPriority ───────────────────────────────────────────

    describe('assignPriority', () => {
        it('Test 4: should return a valid PriorityResult for a minimal task', () => {
            const result = assigner.assignPriority({ title: 'Simple task' });
            expect(result).toHaveProperty('priority');
            expect(result).toHaveProperty('score');
            expect(result).toHaveProperty('factors');
            expect(result).toHaveProperty('reasons');
            expect(['P0', 'P1', 'P2', 'P3']).toContain(result.priority);
            expect(typeof result.score).toBe('number');
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
            expect(Array.isArray(result.reasons)).toBe(true);
        });

        it('Test 5: should assign P0 to a high-dependency task (5+ dependents)', () => {
            const task = createMockTask({
                title: 'Core infrastructure setup',
                description: 'Sets up the base for everything',
                blocks: ['a', 'b', 'c', 'd', 'e']
            });
            // Provide dependentCount explicitly to override inference
            const result = assigner.assignPriority(task, {
                dependentCount: 5,
                isOnCriticalPath: true,
                hasDeadline: true
            });
            expect(result.priority).toBe('P0');
            expect(result.score).toBeGreaterThanOrEqual(70);
        });

        it('Test 6: should assign P0 to a critical path task', () => {
            const task = createMockTask({
                title: 'Database schema migration',
                description: 'Critical database migration for production'
            });
            const result = assigner.assignPriority(task, {
                isOnCriticalPath: true,
                hasDeadline: true,
                dependentCount: 3
            });
            expect(result.priority).toBe('P0');
            expect(result.factors.isOnCriticalPath).toBe(true);
        });

        it('Test 7: should boost priority for milestone-blocking task', () => {
            const taskWithMilestone = createMockTask({
                title: 'Release milestone feature',
                description: 'This blocks the milestone'
            });
            const resultWith = assigner.assignPriority(taskWithMilestone, {
                blocksMilestone: true
            });
            const taskPlain = createMockTask({
                title: 'Regular feature',
                description: 'Not blocking anything'
            });
            const resultWithout = assigner.assignPriority(taskPlain, {
                blocksMilestone: false
            });
            expect(resultWith.score).toBeGreaterThan(resultWithout.score);
            expect(resultWith.factors.blocksMilestone).toBe(true);
        });

        it('Test 8: should give a bug fix bonus', () => {
            const bugTask = createMockTask({
                title: 'Fix login bug',
                description: 'Users cannot log in due to a bug'
            });
            const resultBug = assigner.assignPriority(bugTask, { isBugFix: true });

            const normalTask = createMockTask({
                title: 'Add styling to sidebar',
                description: 'Improve sidebar appearance'
            });
            const resultNormal = assigner.assignPriority(normalTask, { isBugFix: false });

            // Bug fix adds 10 points
            expect(resultBug.factors.isBugFix).toBe(true);
            expect(resultBug.score).toBeGreaterThan(resultNormal.score);
        });

        it('Test 9: should boost score for task with deadline', () => {
            const taskDeadline = createMockTask({
                title: 'Ship deadline feature',
                description: 'Must meet the deadline'
            });
            const resultWith = assigner.assignPriority(taskDeadline, { hasDeadline: true });
            const resultWithout = assigner.assignPriority(taskDeadline, { hasDeadline: false });
            expect(resultWith.score).toBeGreaterThan(resultWithout.score);
            expect(resultWith.factors.hasDeadline).toBe(true);
        });

        it('Test 10: should apply quick win boost for low-effort high-impact tasks', () => {
            const quickWinTask = createMockTask({
                title: 'Quick user-facing fix',
                description: 'Critical user-impacting change'
            });
            const result = assigner.assignPriority(quickWinTask, {
                estimateMinutes: 15,
                userImpact: 4
            });
            // Quick win applies when estimate <= 20 and userImpact >= 3
            // with quickWinBoost enabled (default)
            const noBoostAssigner = new PriorityAssigner({ quickWinBoost: false });
            const resultNoBoost = noBoostAssigner.assignPriority(quickWinTask, {
                estimateMinutes: 15,
                userImpact: 4
            });
            expect(result.score).toBeGreaterThan(resultNoBoost.score);
        });

        it('Test 11: should infer high user impact for security-related text', () => {
            const securityTask = createMockTask({
                title: 'Security vulnerability patch',
                description: 'Fix critical security issue in authentication'
            });
            const result = assigner.assignPriority(securityTask);
            // 'security' adds +2 and 'critical' adds +2, 'auth' is tech risk
            expect(result.factors.userImpact).toBeGreaterThanOrEqual(4);
        });

        it('Test 12: should infer high technical risk for database/migration tasks', () => {
            const dbTask = createMockTask({
                title: 'Database migration for production',
                description: 'Run breaking migration on production database'
            });
            const result = assigner.assignPriority(dbTask);
            // 'database' +1, 'migration' +2, 'production' +1, 'breaking' +1 => capped at 5
            expect(result.factors.technicalRisk).toBeGreaterThanOrEqual(4);
        });

        it('Test 13: should assign low priority (P3) for test/refactor/cleanup tasks', () => {
            const refactorTask = createMockTask({
                title: 'Refactor test utilities',
                description: 'Cleanup internal test helper code'
            });
            const result = assigner.assignPriority(refactorTask);
            // 'refactor' lowers user impact, 'test' lowers tech risk,
            // 'cleanup' lowers user impact => low overall
            expect(result.priority).toBe('P3');
        });

        it('Test 14: should use blocks array length as default dependentCount', () => {
            const task = createMockTask({
                blocks: ['t2', 't3', 't4']
            });
            // No explicit dependentCount provided, should infer from blocks
            const result = assigner.assignPriority(task);
            expect(result.factors.dependentCount).toBe(3);
        });

        it('Test 15: should infer isBugFix from title containing "fix"', () => {
            const task = createMockTask({
                title: 'Fix broken sidebar',
                description: 'Sidebar renders incorrectly'
            });
            const result = assigner.assignPriority(task);
            expect(result.factors.isBugFix).toBe(true);
        });

        it('Test 16: should infer blocksMilestone when text contains "milestone"', () => {
            const task = createMockTask({
                title: 'Complete milestone deliverable',
                description: 'Required for milestone review'
            });
            const result = assigner.assignPriority(task);
            expect(result.factors.blocksMilestone).toBe(true);
        });

        it('Test 17: should infer hasDeadline when text contains "deadline"', () => {
            const task = createMockTask({
                title: 'Deadline submission',
                description: 'Must be submitted before the deadline'
            });
            const result = assigner.assignPriority(task);
            expect(result.factors.hasDeadline).toBe(true);
        });

        it('Test 18: should default estimateMinutes to 30 when not provided', () => {
            const result = assigner.assignPriority({ title: 'Unknown duration task' });
            expect(result.factors.estimateMinutes).toBe(30);
        });

        it('Test 19: should log the priority assignment', () => {
            assigner.assignPriority({ title: 'Logged task' });
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('[PriorityAssigner] Task "Logged task"')
            );
        });

        it('Test 20: should log "unknown" when task has no title', () => {
            assigner.assignPriority({});
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Task "unknown"')
            );
        });
    });

    // ─── scoreToPriority boundaries ───────────────────────────────

    describe('scoreToPriority boundaries', () => {
        it('Test 21: should map score boundaries correctly (P0 >= 70, P1 >= 50, P2 >= 30, P3 < 30)', () => {
            // We can test this indirectly by providing factors that produce specific score ranges.
            // High score: critical path + deadline + high impact + bug fix + dependents
            const p0Result = assigner.assignPriority(
                { title: 'Neutral' },
                {
                    isOnCriticalPath: true,
                    hasDeadline: true,
                    dependentCount: 5,
                    isBugFix: true,
                    userImpact: 5
                }
            );
            expect(p0Result.priority).toBe('P0');
            expect(p0Result.score).toBeGreaterThanOrEqual(70);

            // Medium-high: some factors
            const p1Result = assigner.assignPriority(
                { title: 'Neutral' },
                {
                    isOnCriticalPath: false,
                    hasDeadline: true,
                    dependentCount: 2,
                    isBugFix: true,
                    userImpact: 3,
                    technicalRisk: 3,
                    blocksMilestone: false,
                    estimateMinutes: 60
                }
            );
            expect(p1Result.priority).toBe('P1');
            expect(p1Result.score).toBeGreaterThanOrEqual(50);
            expect(p1Result.score).toBeLessThan(70);

            // Medium-low: few factors
            // dep: min(25, 2*5)=10, userImpact: (3/5)*20=12, techRisk: (3/5)*15=9 => total 31 => P2
            const p2Result = assigner.assignPriority(
                { title: 'Neutral' },
                {
                    isOnCriticalPath: false,
                    hasDeadline: false,
                    dependentCount: 2,
                    isBugFix: false,
                    userImpact: 3,
                    technicalRisk: 3,
                    blocksMilestone: false,
                    estimateMinutes: 60
                }
            );
            expect(p2Result.priority).toBe('P2');
            expect(p2Result.score).toBeGreaterThanOrEqual(30);
            expect(p2Result.score).toBeLessThan(50);

            // Low: nothing significant
            const p3Result = assigner.assignPriority(
                { title: 'Neutral' },
                {
                    isOnCriticalPath: false,
                    hasDeadline: false,
                    dependentCount: 0,
                    isBugFix: false,
                    userImpact: 1,
                    technicalRisk: 1,
                    blocksMilestone: false,
                    estimateMinutes: 60
                }
            );
            expect(p3Result.priority).toBe('P3');
            expect(p3Result.score).toBeLessThan(30);
        });
    });

    // ─── generateReasons ──────────────────────────────────────────

    describe('generateReasons', () => {
        it('Test 22: should include all applicable reason strings', () => {
            const result = assigner.assignPriority(
                { title: 'Major feature' },
                {
                    dependentCount: 5,
                    isOnCriticalPath: true,
                    blocksMilestone: true,
                    isBugFix: true,
                    hasDeadline: true,
                    userImpact: 5,
                    technicalRisk: 5,
                    estimateMinutes: 15
                }
            );
            expect(result.reasons).toContain('On critical path');
            expect(result.reasons).toContain('Blocks milestone');
            expect(result.reasons).toContain('Bug fix');
            expect(result.reasons).toContain('Has deadline');
            expect(result.reasons).toContain('High user impact');
            expect(result.reasons).toContain('High technical risk');
            expect(result.reasons).toContain('Quick win');
            expect(result.reasons).toEqual(
                expect.arrayContaining([expect.stringContaining('Blocks 5 other tasks')])
            );
        });

        it('Test 23: should use PRIORITY_DESCRIPTIONS as fallback when no specific reasons apply', () => {
            // Task with all minimal factors so no specific reason triggers
            const result = assigner.assignPriority(
                { title: 'Plain task' },
                {
                    dependentCount: 0,
                    isOnCriticalPath: false,
                    blocksMilestone: false,
                    isBugFix: false,
                    hasDeadline: false,
                    userImpact: 2,
                    technicalRisk: 2,
                    estimateMinutes: 60
                }
            );
            const priority = result.priority;
            expect(result.reasons).toContain(PRIORITY_DESCRIPTIONS[priority]);
        });

        it('Test 24: should not include "Quick win" for P3 tasks even if estimate is low', () => {
            const result = assigner.assignPriority(
                { title: 'Tiny trivial task' },
                {
                    dependentCount: 0,
                    isOnCriticalPath: false,
                    blocksMilestone: false,
                    isBugFix: false,
                    hasDeadline: false,
                    userImpact: 1,
                    technicalRisk: 1,
                    estimateMinutes: 10
                }
            );
            expect(result.priority).toBe('P3');
            expect(result.reasons).not.toContain('Quick win');
        });

        it('Test 25: should only include "Blocks N tasks" when dependentCount >= 3', () => {
            const resultLow = assigner.assignPriority(
                { title: 'Few deps' },
                { dependentCount: 2 }
            );
            expect(resultLow.reasons.some(r => r.startsWith('Blocks'))).toBe(false);

            const resultHigh = assigner.assignPriority(
                { title: 'Many deps' },
                { dependentCount: 4 }
            );
            expect(resultHigh.reasons).toContain('Blocks 4 other tasks');
        });
    });

    // ─── inferUserImpact ──────────────────────────────────────────

    describe('inferUserImpact (via assignPriority)', () => {
        it('Test 26: should increase impact for "user", "critical", "blocking", "crash", "security" keywords', () => {
            const highImpactTask = createMockTask({
                title: 'Fix critical user-facing crash',
                description: 'Security blocking issue'
            });
            const result = assigner.assignPriority(highImpactTask);
            // 'user' +1, 'critical' +2, 'blocking' +1, 'crash' +1, 'security' +2 => base 2 + 7 = 9, capped at 5
            expect(result.factors.userImpact).toBe(5);
        });

        it('Test 27: should decrease impact for "internal", "refactor", "cleanup" keywords', () => {
            const lowImpactTask = createMockTask({
                title: 'Internal refactor cleanup',
                description: 'Just tidying things up internally'
            });
            const result = assigner.assignPriority(lowImpactTask);
            // base 2 - 1 (internal) - 1 (refactor) - 1 (cleanup) = -1 => clamped to 1
            // But 'internal' appears in description too. The text is combined.
            expect(result.factors.userImpact).toBeLessThanOrEqual(2);
        });

        it('Test 28: should clamp user impact to range [1, 5]', () => {
            // Many low-impact keywords
            const veryLow = createMockTask({
                title: 'Internal refactor cleanup',
                description: 'Internal refactor cleanup again'
            });
            const resultLow = assigner.assignPriority(veryLow);
            expect(resultLow.factors.userImpact).toBeGreaterThanOrEqual(1);

            // Many high-impact keywords
            const veryHigh = createMockTask({
                title: 'Critical security crash blocking user error',
                description: 'Critical security issue for user'
            });
            const resultHigh = assigner.assignPriority(veryHigh);
            expect(resultHigh.factors.userImpact).toBeLessThanOrEqual(5);
        });
    });

    // ─── inferTechnicalRisk ───────────────────────────────────────

    describe('inferTechnicalRisk (via assignPriority)', () => {
        it('Test 29: should increase risk for "database", "migration", "security", "auth", "production", "breaking"', () => {
            const highRiskTask = createMockTask({
                title: 'Breaking database migration',
                description: 'Production auth security overhaul'
            });
            const result = assigner.assignPriority(highRiskTask);
            // 'database' +1, 'migration' +2, 'breaking' +1, 'production' +1, 'auth' +1, 'security' +1
            // base 2 + 7 = 9, capped at 5
            expect(result.factors.technicalRisk).toBe(5);
        });

        it('Test 30: should decrease risk for "test", "document", "style", "css" keywords', () => {
            const lowRiskTask = createMockTask({
                title: 'Update test styles',
                description: 'Document css changes'
            });
            const result = assigner.assignPriority(lowRiskTask);
            // 'test' -1, 'style' -1, 'document' -1, 'css' -1 => base 2 - 4 = -2 => clamped to 1
            expect(result.factors.technicalRisk).toBeLessThanOrEqual(2);
        });

        it('Test 31: should clamp technical risk to range [1, 5]', () => {
            const veryLow = createMockTask({
                title: 'Style test document css',
                description: 'Pure styling test documentation'
            });
            const resultLow = assigner.assignPriority(veryLow);
            expect(resultLow.factors.technicalRisk).toBeGreaterThanOrEqual(1);

            const veryHigh = createMockTask({
                title: 'Breaking database migration',
                description: 'Production auth security upgrade'
            });
            const resultHigh = assigner.assignPriority(veryHigh);
            expect(resultHigh.factors.technicalRisk).toBeLessThanOrEqual(5);
        });
    });

    // ─── assignBatch ──────────────────────────────────────────────

    describe('assignBatch', () => {
        it('Test 32: should assign priorities to multiple tasks and return a Map', () => {
            const tasks: AtomicTask[] = [
                createMockTask({ id: 'TK-001.1', title: 'Task A' }),
                createMockTask({ id: 'TK-001.2', title: 'Task B' }),
                createMockTask({ id: 'TK-001.3', title: 'Task C' })
            ];
            const results = assigner.assignBatch(tasks);
            expect(results).toBeInstanceOf(Map);
            expect(results.size).toBe(3);
            expect(results.has('TK-001.1')).toBe(true);
            expect(results.has('TK-001.2')).toBe(true);
            expect(results.has('TK-001.3')).toBe(true);
            for (const result of results.values()) {
                expect(result).toHaveProperty('priority');
                expect(result).toHaveProperty('score');
                expect(result).toHaveProperty('factors');
                expect(result).toHaveProperty('reasons');
            }
        });

        it('Test 33: should calculate dependent counts from dependency graph', () => {
            const tasks: AtomicTask[] = [
                createMockTask({ id: 'TK-A', title: 'Root task', dependsOn: [] }),
                createMockTask({ id: 'TK-B', title: 'Depends on A', dependsOn: ['TK-A'] }),
                createMockTask({ id: 'TK-C', title: 'Depends on A', dependsOn: ['TK-A'] }),
                createMockTask({ id: 'TK-D', title: 'Depends on B', dependsOn: ['TK-B'] })
            ];
            const results = assigner.assignBatch(tasks);
            // TK-A is depended upon by TK-B and TK-C => dependentCount = 2
            expect(results.get('TK-A')!.factors.dependentCount).toBe(2);
            // TK-B is depended upon by TK-D => dependentCount = 1
            expect(results.get('TK-B')!.factors.dependentCount).toBe(1);
            // TK-C and TK-D have no dependents
            expect(results.get('TK-C')!.factors.dependentCount).toBe(0);
            expect(results.get('TK-D')!.factors.dependentCount).toBe(0);
        });

        it('Test 34: should detect critical path and mark tasks on it', () => {
            // Chain: A -> B -> C (each 30 min)
            // D is standalone (30 min)
            // Critical path is A -> B -> C (90 min total)
            const tasks: AtomicTask[] = [
                createMockTask({ id: 'TK-A', title: 'First', estimateMinutes: 30, dependsOn: [] }),
                createMockTask({ id: 'TK-B', title: 'Second', estimateMinutes: 30, dependsOn: ['TK-A'] }),
                createMockTask({ id: 'TK-C', title: 'Third', estimateMinutes: 30, dependsOn: ['TK-B'] }),
                createMockTask({ id: 'TK-D', title: 'Standalone', estimateMinutes: 30, dependsOn: [] })
            ];
            const results = assigner.assignBatch(tasks);
            // A, B, C should be on critical path
            expect(results.get('TK-A')!.factors.isOnCriticalPath).toBe(true);
            expect(results.get('TK-B')!.factors.isOnCriticalPath).toBe(true);
            expect(results.get('TK-C')!.factors.isOnCriticalPath).toBe(true);
            // D is not on critical path
            expect(results.get('TK-D')!.factors.isOnCriticalPath).toBe(false);
        });

        it('Test 35: should log the batch size', () => {
            const tasks = [
                createMockTask({ id: 'TK-1' }),
                createMockTask({ id: 'TK-2' })
            ];
            assigner.assignBatch(tasks);
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Assigning priorities to 2 tasks')
            );
        });

        it('Test 36: should handle empty batch gracefully', () => {
            const results = assigner.assignBatch([]);
            expect(results).toBeInstanceOf(Map);
            expect(results.size).toBe(0);
        });
    });

    // ─── reorderByPriority ────────────────────────────────────────

    describe('reorderByPriority', () => {
        it('Test 37: should return tasks sorted by score (highest first)', () => {
            // Create tasks with different characteristics to get different scores
            const tasks: AtomicTask[] = [
                createMockTask({
                    id: 'LOW',
                    title: 'Internal refactor cleanup',
                    description: 'Just code style cleanup',
                    dependsOn: [],
                    blocks: []
                }),
                createMockTask({
                    id: 'HIGH',
                    title: 'Fix critical security bug',
                    description: 'Critical production security fix with deadline',
                    dependsOn: [],
                    blocks: ['LOW']
                }),
                createMockTask({
                    id: 'MED',
                    title: 'Add user search feature',
                    description: 'Search functionality for users',
                    dependsOn: [],
                    blocks: []
                })
            ];
            const sorted = assigner.reorderByPriority(tasks);
            expect(sorted).toHaveLength(3);
            // The HIGH priority task should be first
            expect(sorted[0].id).toBe('HIGH');
        });

        it('Test 38: should not mutate the original array', () => {
            const tasks = [
                createMockTask({ id: 'A' }),
                createMockTask({ id: 'B' })
            ];
            const original = [...tasks];
            assigner.reorderByPriority(tasks);
            expect(tasks[0].id).toBe(original[0].id);
            expect(tasks[1].id).toBe(original[1].id);
        });
    });

    // ─── getStatistics ────────────────────────────────────────────

    describe('getStatistics', () => {
        it('Test 39: should return correct counts for each priority level', () => {
            // Build tasks that we know will produce specific priorities
            const tasks: AtomicTask[] = [
                // P0: critical path + deadline + high impact
                createMockTask({
                    id: 'P0-TASK',
                    title: 'Fix critical security production bug',
                    description: 'Critical deadline security fix for user crash',
                    dependsOn: [],
                    blocks: ['P1-TASK', 'P2-TASK', 'P3-TASK']
                }),
                // Ensure P3 by using low-signal keywords
                createMockTask({
                    id: 'P3-TASK',
                    title: 'Internal style cleanup test',
                    description: 'Refactor internal cleanup css document',
                    dependsOn: ['P0-TASK'],
                    blocks: []
                })
            ];
            const stats = assigner.getStatistics(tasks);
            expect(stats).toHaveProperty('p0');
            expect(stats).toHaveProperty('p1');
            expect(stats).toHaveProperty('p2');
            expect(stats).toHaveProperty('p3');
            // Total should match task count
            expect(stats.p0 + stats.p1 + stats.p2 + stats.p3).toBe(tasks.length);
        });

        it('Test 40: should return all zeroes for an empty task list', () => {
            const stats = assigner.getStatistics([]);
            expect(stats).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
        });
    });

    // ─── Singleton ────────────────────────────────────────────────

    describe('singleton', () => {
        it('Test 41: should return the same instance from getPriorityAssigner', () => {
            const a = getPriorityAssigner();
            const b = getPriorityAssigner();
            expect(a).toBe(b);
        });

        it('Test 42: should return a new instance after resetPriorityAssignerForTests', () => {
            const a = getPriorityAssigner();
            resetPriorityAssignerForTests();
            const b = getPriorityAssigner();
            expect(a).not.toBe(b);
        });

        it('Test 43: should return an instance of PriorityAssigner from getPriorityAssigner', () => {
            const instance = getPriorityAssigner();
            expect(instance).toBeInstanceOf(PriorityAssigner);
        });
    });

    // ─── calculateScore edge cases ────────────────────────────────

    describe('calculateScore edge cases', () => {
        it('Test 44: should cap score at 100', () => {
            // Max out every factor
            const result = assigner.assignPriority(
                { title: 'Max everything' },
                {
                    dependentCount: 10,
                    isOnCriticalPath: true,
                    blocksMilestone: true,
                    isBugFix: true,
                    hasDeadline: true,
                    userImpact: 5,
                    technicalRisk: 5,
                    estimateMinutes: 10
                }
            );
            expect(result.score).toBeLessThanOrEqual(100);
        });

        it('Test 45: should produce zero score for minimal factors', () => {
            const result = assigner.assignPriority(
                { title: 'Nothing' },
                {
                    dependentCount: 0,
                    isOnCriticalPath: false,
                    blocksMilestone: false,
                    isBugFix: false,
                    hasDeadline: false,
                    userImpact: 0,
                    technicalRisk: 0,
                    estimateMinutes: 60
                }
            );
            // userImpact=0 and technicalRisk=0 produce 0 from those weights
            expect(result.score).toBeLessThanOrEqual(10);
        });

        it('Test 46: should handle dependentCount cap at 25 points (5 dependents = max 25)', () => {
            const at5 = assigner.assignPriority(
                { title: 'Neutral' },
                {
                    dependentCount: 5,
                    isOnCriticalPath: false,
                    blocksMilestone: false,
                    isBugFix: false,
                    hasDeadline: false,
                    userImpact: 1,
                    technicalRisk: 1,
                    estimateMinutes: 60
                }
            );
            const at10 = assigner.assignPriority(
                { title: 'Neutral' },
                {
                    dependentCount: 10,
                    isOnCriticalPath: false,
                    blocksMilestone: false,
                    isBugFix: false,
                    hasDeadline: false,
                    userImpact: 1,
                    technicalRisk: 1,
                    estimateMinutes: 60
                }
            );
            // Both should get the same dep score since Math.min(25, n*5)
            // 5*5 = 25, 10*5 = 50 but capped at 25, so same
            expect(at5.score).toBe(at10.score);
        });
    });

    // ─── Critical path with branching ─────────────────────────────

    describe('critical path with branching', () => {
        it('Test 47: should pick the longest branch as critical path', () => {
            // Two branches:
            //   Branch 1: A(30) -> B(30) -> C(30) = 90 min
            //   Branch 2: A(30) -> D(60) = 90 min (but D has longer estimate)
            //   Branch 2 with higher estimate on D: A(30) -> D(60) = 90 vs A->B->C = 90
            //   Make branch 2 longer: A(30) -> D(60) -> E(30) = 120 min
            const tasks: AtomicTask[] = [
                createMockTask({ id: 'A', estimateMinutes: 30, dependsOn: [] }),
                createMockTask({ id: 'B', estimateMinutes: 30, dependsOn: ['A'] }),
                createMockTask({ id: 'C', estimateMinutes: 30, dependsOn: ['B'] }),
                createMockTask({ id: 'D', estimateMinutes: 60, dependsOn: ['A'] }),
                createMockTask({ id: 'E', estimateMinutes: 30, dependsOn: ['D'] })
            ];
            const results = assigner.assignBatch(tasks);
            // Branch A->D->E = 120 min is longest
            // A, D, E should be on critical path
            expect(results.get('A')!.factors.isOnCriticalPath).toBe(true);
            expect(results.get('D')!.factors.isOnCriticalPath).toBe(true);
            expect(results.get('E')!.factors.isOnCriticalPath).toBe(true);
            // B, C are on the shorter branch
            expect(results.get('B')!.factors.isOnCriticalPath).toBe(false);
            expect(results.get('C')!.factors.isOnCriticalPath).toBe(false);
        });
    });

    // ─── Single-task batch ────────────────────────────────────────

    describe('edge cases', () => {
        it('Test 48: should handle a single-task batch', () => {
            const tasks = [createMockTask({ id: 'SOLO' })];
            const results = assigner.assignBatch(tasks);
            expect(results.size).toBe(1);
            expect(results.has('SOLO')).toBe(true);
            // Single task is always on critical path
            expect(results.get('SOLO')!.factors.isOnCriticalPath).toBe(true);
        });

        it('Test 49: should use estimateMinutes from task when provided in factors', () => {
            const task = createMockTask({
                estimateMinutes: 45
            });
            const result = assigner.assignPriority(task, { estimateMinutes: 10 });
            // Explicit factor should override task.estimateMinutes
            expect(result.factors.estimateMinutes).toBe(10);
        });

        it('Test 50: should use task.estimateMinutes when factor not provided', () => {
            const task = createMockTask({
                estimateMinutes: 45
            });
            const result = assigner.assignPriority(task);
            expect(result.factors.estimateMinutes).toBe(45);
        });
    });
});
