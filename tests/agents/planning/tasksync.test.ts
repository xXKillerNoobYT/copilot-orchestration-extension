/**
 * TaskSyncManager Test Suite
 *
 * Tests the TaskSyncManager class which collects feedback during task execution
 * and uses it to improve future estimates and plans. Validates feedback recording,
 * analysis, adjustment generation, improvement stats, and history management.
 *
 * @module tests/agents/planning/tasksync
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';

// Mock logger before imports
const mockLogInfo = jest.fn();
const mockLogWarn = jest.fn();

jest.mock('../../../src/logger', () => ({
    logInfo: (...args: any[]) => mockLogInfo(...args),
    logWarn: (...args: any[]) => mockLogWarn(...args)
}));

// Import after mocks
import {
    TaskSyncManager,
    getTaskSyncManager,
    resetTaskSyncManagerForTests
} from '../../../src/agents/planning/tasksync';
import type {
    BlockerFeedback,
    TaskFeedback,
    FeedbackAnalysis,
    PlanAdjustment,
    TaskSyncConfig
} from '../../../src/agents/planning/tasksync';
import type { AtomicTask } from '../../../src/agents/planning/decomposer';
import type { ZenTask } from '../../../src/agents/planning/zenTasks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal feedback input (without accuracyRatio and timestamp).
 */
function makeFeedbackInput(overrides: Partial<Omit<TaskFeedback, 'accuracyRatio' | 'timestamp'>> = {}): Omit<TaskFeedback, 'accuracyRatio' | 'timestamp'> {
    return {
        taskId: overrides.taskId ?? 'TK-001.1',
        estimatedMinutes: overrides.estimatedMinutes ?? 30,
        actualMinutes: overrides.actualMinutes ?? 30,
        completed: overrides.completed ?? true,
        blockers: overrides.blockers ?? [],
        positives: overrides.positives ?? [],
        improvements: overrides.improvements ?? []
    };
}

/**
 * Create a minimal AtomicTask for suggestAdjustments testing.
 */
function makeAtomicTask(overrides: Partial<AtomicTask> = {}): AtomicTask {
    return {
        id: overrides.id ?? 'TK-001.1',
        featureId: overrides.featureId ?? 'F-001',
        title: overrides.title ?? 'Test task',
        description: overrides.description ?? 'A test task',
        estimateMinutes: overrides.estimateMinutes ?? 30,
        dependsOn: overrides.dependsOn ?? [],
        blocks: overrides.blocks ?? [],
        acceptanceCriteria: overrides.acceptanceCriteria ?? ['criterion'],
        files: overrides.files ?? [],
        patterns: overrides.patterns ?? [],
        priority: overrides.priority ?? 'P1',
        isUI: overrides.isUI ?? false,
        status: overrides.status ?? 'pending'
    };
}

/**
 * Create a minimal ZenTask for recordFromZenTask testing.
 */
function makeZenTask(overrides: Partial<ZenTask> = {}): ZenTask {
    return {
        id: overrides.id ?? 'ZT-001',
        featureId: overrides.featureId ?? 'F-001',
        title: overrides.title ?? 'Zen task',
        description: overrides.description ?? 'A zen task',
        estimateMinutes: overrides.estimateMinutes ?? 30,
        dependsOn: overrides.dependsOn ?? [],
        blocks: overrides.blocks ?? [],
        acceptanceCriteria: overrides.acceptanceCriteria ?? [],
        files: overrides.files ?? [],
        patterns: overrides.patterns ?? [],
        priority: overrides.priority ?? 'P1',
        isUI: overrides.isUI ?? false,
        status: overrides.status ?? 'pending',
        zenState: overrides.zenState ?? 'zen_complete',
        stateEnteredAt: overrides.stateEnteredAt ?? new Date(),
        focusSessions: overrides.focusSessions ?? 1,
        totalFocusMinutes: overrides.totalFocusMinutes ?? 25,
        interruptions: overrides.interruptions ?? [],
        contextNotes: overrides.contextNotes ?? []
    };
}

/**
 * Create a blocker feedback entry.
 */
function makeBlocker(overrides: Partial<BlockerFeedback> = {}): BlockerFeedback {
    return {
        type: overrides.type ?? 'technical',
        description: overrides.description ?? 'Some blocker',
        resolution: overrides.resolution ?? 'Fixed it',
        timeLostMinutes: overrides.timeLostMinutes ?? 10
    };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('TaskSyncManager Test Suite', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetTaskSyncManagerForTests();
    });

    afterEach(() => {
        jest.useRealTimers();
        resetTaskSyncManagerForTests();
    });

    // =========================================================================
    // Constructor Tests
    // =========================================================================
    describe('Constructor', () => {
        it('Test 1: should create an instance with default config', () => {
            const manager = new TaskSyncManager();
            expect(manager).toBeDefined();
            expect(manager).toBeInstanceOf(TaskSyncManager);
            // Default config means empty analysis returns defaults
            const analysis = manager.analyzeFeedback();
            expect(analysis.totalTasks).toBe(0);
        });

        it('Test 2: should create an instance with custom config', () => {
            const customConfig: Partial<TaskSyncConfig> = {
                minDataPoints: 10,
                accuracyThreshold: 0.9,
                historyRetentionDays: 60
            };
            const manager = new TaskSyncManager(customConfig);
            expect(manager).toBeDefined();

            // With minDataPoints=10, calibration should stay at 1.0 even with 5 records
            for (let i = 0; i < 5; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 60
                }));
            }
            const analysis = manager.analyzeFeedback();
            // With only 5 data points but minDataPoints=10, calibration should be 1.0
            expect(analysis.suggestedCalibration).toBe(1.0);
        });

        it('Test 3: should merge partial config with defaults', () => {
            const manager = new TaskSyncManager({ minDataPoints: 3 });
            // Should still work with other defaults intact
            // Record 3 data points (matches the custom minDataPoints)
            for (let i = 0; i < 3; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 45
                }));
            }
            const analysis = manager.analyzeFeedback();
            // With minDataPoints=3 and 3 records, calibration should be computed
            expect(analysis.suggestedCalibration).not.toBe(1.0);
        });
    });

    // =========================================================================
    // recordFeedback Tests
    // =========================================================================
    describe('recordFeedback', () => {
        it('Test 4: should calculate accuracyRatio correctly', () => {
            const manager = new TaskSyncManager();
            const result = manager.recordFeedback(makeFeedbackInput({
                estimatedMinutes: 30,
                actualMinutes: 45
            }));
            expect(result.accuracyRatio).toBe(1.5);
        });

        it('Test 5: should handle zero estimated minutes (default ratio to 1)', () => {
            const manager = new TaskSyncManager();
            const result = manager.recordFeedback(makeFeedbackInput({
                estimatedMinutes: 0,
                actualMinutes: 20
            }));
            expect(result.accuracyRatio).toBe(1);
        });

        it('Test 6: should add feedback to history', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({ taskId: 'TK-001' }));
            manager.recordFeedback(makeFeedbackInput({ taskId: 'TK-002' }));
            const history = manager.exportHistory();
            expect(history).toHaveLength(2);
            expect(history[0].taskId).toBe('TK-001');
            expect(history[1].taskId).toBe('TK-002');
        });

        it('Test 7: should set timestamp on recorded feedback', () => {
            const manager = new TaskSyncManager();
            const before = new Date();
            const result = manager.recordFeedback(makeFeedbackInput());
            const after = new Date();
            expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
        });

        it('Test 8: should prune old history beyond retention period', () => {
            const manager = new TaskSyncManager({ historyRetentionDays: 7 });

            // Insert a feedback record with an old timestamp directly via importHistory
            const oldFeedback: TaskFeedback = {
                ...makeFeedbackInput({ taskId: 'OLD-001' }),
                accuracyRatio: 1.0,
                timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days old
            };
            manager.importHistory([oldFeedback]);

            // Now record a new one - pruning runs after each recordFeedback
            manager.recordFeedback(makeFeedbackInput({ taskId: 'NEW-001' }));

            const history = manager.exportHistory();
            expect(history).toHaveLength(1);
            expect(history[0].taskId).toBe('NEW-001');
        });

        it('Test 9: should trigger estimate adjustment for severe overrun (ratio > 2.0)', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-OVERRUN',
                estimatedMinutes: 30,
                actualMinutes: 90 // ratio = 3.0
            }));
            const adjustments = manager.getPendingAdjustments();
            expect(adjustments.length).toBeGreaterThanOrEqual(1);
            const estimateAdj = adjustments.find(a => a.type === 'estimate');
            expect(estimateAdj).toBeDefined();
            expect(estimateAdj!.affectedTasks).toContain('TK-OVERRUN');
            expect(estimateAdj!.confidence).toBe(0.8);
        });

        it('Test 10: should NOT trigger estimate adjustment when ratio is exactly 2.0', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-EXACT',
                estimatedMinutes: 30,
                actualMinutes: 60 // ratio = 2.0 exactly, not > 2.0
            }));
            const adjustments = manager.getPendingAdjustments();
            const estimateAdj = adjustments.find(a =>
                a.type === 'estimate' && a.affectedTasks.includes('TK-EXACT')
            );
            expect(estimateAdj).toBeUndefined();
        });

        it('Test 11: should trigger dependency adjustment for significant blockers (>30 min total)', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-BLOCKED',
                blockers: [
                    makeBlocker({ timeLostMinutes: 20 }),
                    makeBlocker({ timeLostMinutes: 15 })
                ]
            }));
            const adjustments = manager.getPendingAdjustments();
            const depAdj = adjustments.find(a => a.type === 'dependency');
            expect(depAdj).toBeDefined();
            expect(depAdj!.affectedTasks).toContain('TK-BLOCKED');
            expect(depAdj!.suggestion).toContain('35 min lost');
        });

        it('Test 12: should NOT trigger dependency adjustment when blocker time is exactly 30 min', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-EDGE',
                blockers: [
                    makeBlocker({ timeLostMinutes: 15 }),
                    makeBlocker({ timeLostMinutes: 15 })
                ]
            }));
            const adjustments = manager.getPendingAdjustments();
            const depAdj = adjustments.find(a =>
                a.type === 'dependency' && a.affectedTasks.includes('TK-EDGE')
            );
            expect(depAdj).toBeUndefined();
        });

        it('Test 13: should log feedback recording', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-LOG',
                estimatedMinutes: 20,
                actualMinutes: 30
            }));
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('[TaskSync] Recorded feedback for TK-LOG')
            );
        });
    });

    // =========================================================================
    // recordFromZenTask Tests
    // =========================================================================
    describe('recordFromZenTask', () => {
        it('Test 14: should record feedback from a ZenTask', () => {
            const manager = new TaskSyncManager();
            const zenTask = makeZenTask({
                id: 'ZT-100',
                estimateMinutes: 40,
                totalFocusMinutes: 35,
                zenState: 'zen_complete'
            });
            const result = manager.recordFromZenTask(zenTask);
            expect(result.taskId).toBe('ZT-100');
            expect(result.estimatedMinutes).toBe(40);
            expect(result.actualMinutes).toBe(35);
            expect(result.completed).toBe(true);
        });

        it('Test 15: should extract blocker interruptions from ZenTask', () => {
            const manager = new TaskSyncManager();
            const zenTask = makeZenTask({
                id: 'ZT-BLOCK',
                interruptions: [
                    {
                        timestamp: new Date(),
                        reason: 'Blocked by missing dependency',
                        durationMinutes: 15,
                        savedContext: 'Waiting for API endpoint'
                    },
                    {
                        timestamp: new Date(),
                        reason: 'Coffee break', // Not a blocker
                        durationMinutes: 5,
                        savedContext: 'Taking a break'
                    },
                    {
                        timestamp: new Date(),
                        reason: 'Blocked on review',
                        durationMinutes: 10,
                        savedContext: 'Waiting for code review'
                    }
                ]
            });
            const result = manager.recordFromZenTask(zenTask);
            // Only interruptions with 'block' in reason should be converted
            expect(result.blockers).toHaveLength(2);
            expect(result.blockers[0].description).toContain('Blocked by missing dependency');
            expect(result.blockers[1].description).toContain('Blocked on review');
        });

        it('Test 16: should pass positives and improvements through', () => {
            const manager = new TaskSyncManager();
            const zenTask = makeZenTask({ id: 'ZT-META' });
            const result = manager.recordFromZenTask(
                zenTask,
                ['Good naming conventions'],
                ['Needs more test coverage']
            );
            expect(result.positives).toEqual(['Good naming conventions']);
            expect(result.improvements).toEqual(['Needs more test coverage']);
        });

        it('Test 17: should mark incomplete ZenTask as not completed', () => {
            const manager = new TaskSyncManager();
            const zenTask = makeZenTask({
                id: 'ZT-INC',
                zenState: 'zen_pause'
            });
            const result = manager.recordFromZenTask(zenTask);
            expect(result.completed).toBe(false);
        });
    });

    // =========================================================================
    // analyzeFeedback Tests
    // =========================================================================
    describe('analyzeFeedback', () => {
        it('Test 18: should return empty analysis when no history exists', () => {
            const manager = new TaskSyncManager();
            const analysis = manager.analyzeFeedback();
            expect(analysis.totalTasks).toBe(0);
            expect(analysis.avgAccuracy).toBe(1);
            expect(analysis.blockersByType.size).toBe(0);
            expect(analysis.overrunCount).toBe(0);
            expect(analysis.underrunCount).toBe(0);
            expect(analysis.suggestedCalibration).toBe(1.0);
            expect(analysis.recommendations).toEqual(['Not enough data - collect more feedback']);
        });

        it('Test 19: should calculate average accuracy across all feedback', () => {
            const manager = new TaskSyncManager({ minDataPoints: 2 });
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-A', estimatedMinutes: 30, actualMinutes: 45 // ratio 1.5
            }));
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-B', estimatedMinutes: 30, actualMinutes: 15 // ratio 0.5
            }));
            const analysis = manager.analyzeFeedback();
            expect(analysis.avgAccuracy).toBe(1.0); // (1.5 + 0.5) / 2
        });

        it('Test 20: should count overruns and underruns correctly', () => {
            const manager = new TaskSyncManager();
            // Overrun: ratio > 1.1
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-OVER', estimatedMinutes: 30, actualMinutes: 60 // ratio 2.0
            }));
            // Underrun: ratio < 0.9
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-UNDER', estimatedMinutes: 30, actualMinutes: 15 // ratio 0.5
            }));
            // On-target: ratio between 0.9 and 1.1
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-EXACT', estimatedMinutes: 30, actualMinutes: 30 // ratio 1.0
            }));
            const analysis = manager.analyzeFeedback();
            expect(analysis.overrunCount).toBe(1);
            expect(analysis.underrunCount).toBe(1);
        });

        it('Test 21: should count blockers by type', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-B1',
                blockers: [
                    makeBlocker({ type: 'dependency' }),
                    makeBlocker({ type: 'unclear' })
                ]
            }));
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-B2',
                blockers: [
                    makeBlocker({ type: 'dependency' }),
                    makeBlocker({ type: 'technical' })
                ]
            }));
            const analysis = manager.analyzeFeedback();
            expect(analysis.blockersByType.get('dependency')).toBe(2);
            expect(analysis.blockersByType.get('unclear')).toBe(1);
            expect(analysis.blockersByType.get('technical')).toBe(1);
        });

        it('Test 22: should recommend increasing estimates when avgAccuracy > 1.3', () => {
            const manager = new TaskSyncManager();
            // All tasks significantly overrun
            for (let i = 0; i < 3; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-HIGH-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 50 // ratio ~1.67
                }));
            }
            const analysis = manager.analyzeFeedback();
            expect(analysis.recommendations).toContain(
                'Tasks consistently take longer than estimated - consider increasing base estimates'
            );
        });

        it('Test 23: should recommend decreasing estimates when avgAccuracy < 0.7', () => {
            const manager = new TaskSyncManager();
            for (let i = 0; i < 3; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-LOW-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 15 // ratio 0.5
                }));
            }
            const analysis = manager.analyzeFeedback();
            expect(analysis.recommendations).toContain(
                'Tasks often complete faster than estimated - consider decreasing estimates or adding stretch goals'
            );
        });

        it('Test 24: should recommend improving clarification when many unclear blockers', () => {
            const manager = new TaskSyncManager();
            for (let i = 0; i < 3; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-UC-${i}`,
                    blockers: [makeBlocker({ type: 'unclear' })]
                }));
            }
            const analysis = manager.analyzeFeedback();
            expect(analysis.recommendations).toContain(
                'Many tasks blocked by unclear requirements - improve upfront clarification'
            );
        });

        it('Test 25: should recommend reviewing dependencies when many dependency blockers', () => {
            const manager = new TaskSyncManager();
            for (let i = 0; i < 3; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-DEP-${i}`,
                    blockers: [makeBlocker({ type: 'dependency' })]
                }));
            }
            const analysis = manager.analyzeFeedback();
            expect(analysis.recommendations).toContain(
                'Dependency blockers common - review task ordering and dependencies'
            );
        });

        it('Test 26: should recommend smaller decomposition when over 50% overrun', () => {
            const manager = new TaskSyncManager();
            // 3 overruns out of 4 tasks = 75%
            for (let i = 0; i < 3; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-OR-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 60 // ratio 2.0
                }));
            }
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-OK',
                estimatedMinutes: 30,
                actualMinutes: 30 // ratio 1.0
            }));
            const analysis = manager.analyzeFeedback();
            expect(analysis.recommendations).toContain(
                'Over 50% of tasks overrun - consider smaller task decomposition'
            );
        });
    });

    // =========================================================================
    // getPendingAdjustments & applyAdjustment Tests
    // =========================================================================
    describe('getPendingAdjustments & applyAdjustment', () => {
        it('Test 27: should return copy of the adjustment queue', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-ADJ',
                estimatedMinutes: 10,
                actualMinutes: 30 // ratio 3.0 -> triggers adjustment
            }));
            const adjustments = manager.getPendingAdjustments();
            expect(adjustments.length).toBeGreaterThan(0);

            // Verify it is a copy (modifying returned array should not affect internal)
            adjustments.length = 0;
            expect(manager.getPendingAdjustments().length).toBeGreaterThan(0);
        });

        it('Test 28: should remove adjustment from queue after applying', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-APPLY',
                estimatedMinutes: 10,
                actualMinutes: 50 // ratio 5.0
            }));
            const adjustments = manager.getPendingAdjustments();
            expect(adjustments.length).toBeGreaterThan(0);
            const initialCount = adjustments.length;

            // getPendingAdjustments returns a shallow copy of the array,
            // but the PlanAdjustment objects inside are the same references.
            // So indexOf in applyAdjustment will find and remove them.
            const adjustmentRef = adjustments[0];
            manager.applyAdjustment(adjustmentRef);

            expect(manager.getPendingAdjustments().length).toBe(initialCount - 1);
        });

        it('Test 29: should log when applying adjustment', () => {
            const manager = new TaskSyncManager();
            const adjustment: PlanAdjustment = {
                type: 'estimate',
                affectedTasks: ['TK-001'],
                suggestion: 'Increase estimate by 50%',
                confidence: 0.8,
                dataPoints: 5
            };
            manager.applyAdjustment(adjustment);
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('[TaskSync] Applied adjustment: estimate - Increase estimate by 50%')
            );
        });
    });

    // =========================================================================
    // suggestAdjustments Tests
    // =========================================================================
    describe('suggestAdjustments', () => {
        it('Test 30: should suggest estimate adjustments with enough data points', () => {
            const manager = new TaskSyncManager({ minDataPoints: 5 });
            // Record 6 tasks all overrunning
            for (let i = 0; i < 6; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-S-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 45 // ratio 1.5
                }));
            }
            const tasks = [makeAtomicTask({ id: 'TK-NEW-1' }), makeAtomicTask({ id: 'TK-NEW-2' })];
            const suggestions = manager.suggestAdjustments(tasks);
            const estimateSuggestion = suggestions.find(s => s.type === 'estimate');
            expect(estimateSuggestion).toBeDefined();
            expect(estimateSuggestion!.affectedTasks).toContain('TK-NEW-1');
            expect(estimateSuggestion!.affectedTasks).toContain('TK-NEW-2');
            expect(estimateSuggestion!.suggestion).toContain('Multiply estimates by');
        });

        it('Test 31: should NOT suggest estimate adjustments with insufficient data', () => {
            const manager = new TaskSyncManager({ minDataPoints: 10 });
            // Only 3 data points
            for (let i = 0; i < 3; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-FEW-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 60
                }));
            }
            const tasks = [makeAtomicTask()];
            const suggestions = manager.suggestAdjustments(tasks);
            const estimateSuggestion = suggestions.find(s => s.type === 'estimate');
            expect(estimateSuggestion).toBeUndefined();
        });

        it('Test 32: should suggest dependency adjustment for common blockers (>= 3)', () => {
            const manager = new TaskSyncManager();
            for (let i = 0; i < 4; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-CB-${i}`,
                    blockers: [makeBlocker({ type: 'external' })]
                }));
            }
            const tasks = [makeAtomicTask()];
            const suggestions = manager.suggestAdjustments(tasks);
            const depSuggestion = suggestions.find(s => s.type === 'dependency');
            expect(depSuggestion).toBeDefined();
            expect(depSuggestion!.suggestion).toContain('external');
            expect(depSuggestion!.suggestion).toContain('4 times');
        });

        it('Test 33: should NOT suggest dependency adjustment with fewer than 3 common blockers', () => {
            const manager = new TaskSyncManager();
            for (let i = 0; i < 2; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-FEW-B-${i}`,
                    blockers: [makeBlocker({ type: 'external' })]
                }));
            }
            const tasks = [makeAtomicTask()];
            const suggestions = manager.suggestAdjustments(tasks);
            const depSuggestion = suggestions.find(s => s.type === 'dependency');
            expect(depSuggestion).toBeUndefined();
        });

        it('Test 34: should return empty suggestions when calibration is 1.0 and no common blockers', () => {
            const manager = new TaskSyncManager({ minDataPoints: 5 });
            // Record exactly-on-target tasks
            for (let i = 0; i < 6; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-PERFECT-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 30 // ratio 1.0 exactly
                }));
            }
            const tasks = [makeAtomicTask()];
            const suggestions = manager.suggestAdjustments(tasks);
            // Calibration is 1.0, so no estimate suggestion
            const estimateSuggestion = suggestions.find(s => s.type === 'estimate');
            expect(estimateSuggestion).toBeUndefined();
        });

        it('Test 35: should cap confidence at 0.9', () => {
            const manager = new TaskSyncManager({ minDataPoints: 5 });
            // Record 50 overrunning tasks
            for (let i = 0; i < 50; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-CONF-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 45 // ratio 1.5
                }));
            }
            const tasks = [makeAtomicTask()];
            const suggestions = manager.suggestAdjustments(tasks);
            const estimateSuggestion = suggestions.find(s => s.type === 'estimate');
            expect(estimateSuggestion).toBeDefined();
            // confidence = Math.min(0.9, 50 / 20) = Math.min(0.9, 2.5) = 0.9
            expect(estimateSuggestion!.confidence).toBe(0.9);
        });
    });

    // =========================================================================
    // getImprovementStats Tests
    // =========================================================================
    describe('getImprovementStats', () => {
        it('Test 36: should return stable with recentAccuracy 1 when fewer than 10 tasks', () => {
            const manager = new TaskSyncManager();
            for (let i = 0; i < 5; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-FS-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 60
                }));
            }
            const stats = manager.getImprovementStats();
            expect(stats.trend).toBe('stable');
            expect(stats.recentAccuracy).toBe(1);
        });

        it('Test 37: should detect improving trend', () => {
            const manager = new TaskSyncManager();
            // First half: far from 1.0 (ratio 2.0)
            for (let i = 0; i < 6; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-IMP-A-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 60 // ratio 2.0, distance from 1.0 = 1.0
                }));
            }
            // Second half: closer to 1.0 (ratio 1.05)
            for (let i = 0; i < 6; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-IMP-B-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 31.5 // ratio 1.05, distance from 1.0 = 0.05
                }));
            }
            const stats = manager.getImprovementStats();
            expect(stats.trend).toBe('improving');
        });

        it('Test 38: should detect declining trend', () => {
            const manager = new TaskSyncManager();
            // First half: close to 1.0 (ratio 1.0)
            for (let i = 0; i < 6; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-DEC-A-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 30 // ratio 1.0, distance = 0
                }));
            }
            // Second half: far from 1.0 (ratio 2.0)
            for (let i = 0; i < 6; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-DEC-B-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 60 // ratio 2.0, distance = 1.0
                }));
            }
            const stats = manager.getImprovementStats();
            expect(stats.trend).toBe('declining');
        });

        it('Test 39: should detect stable trend when halves are similar', () => {
            const manager = new TaskSyncManager();
            // Both halves have similar accuracy
            for (let i = 0; i < 12; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-STB-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 36 // ratio 1.2 for all, distance = 0.2
                }));
            }
            const stats = manager.getImprovementStats();
            expect(stats.trend).toBe('stable');
        });

        it('Test 40: should return recentAccuracy from second half', () => {
            const manager = new TaskSyncManager();
            // First half: ratio 2.0
            for (let i = 0; i < 5; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-RA-A-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 60
                }));
            }
            // Second half: ratio 1.5
            for (let i = 0; i < 5; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-RA-B-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 45
                }));
            }
            const stats = manager.getImprovementStats();
            expect(stats.recentAccuracy).toBe(1.5);
        });
    });

    // =========================================================================
    // calculateCalibration Clamping Tests
    // =========================================================================
    describe('calculateCalibration (via analyzeFeedback)', () => {
        it('Test 41: should clamp calibration to minimum of 0.6', () => {
            const manager = new TaskSyncManager({ minDataPoints: 3 });
            // Record tasks with very low ratio (e.g., 0.1)
            for (let i = 0; i < 5; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-CLAMP-LOW-${i}`,
                    estimatedMinutes: 100,
                    actualMinutes: 5 // ratio 0.05
                }));
            }
            const analysis = manager.analyzeFeedback();
            expect(analysis.suggestedCalibration).toBe(0.6);
        });

        it('Test 42: should clamp calibration to maximum of 1.5', () => {
            const manager = new TaskSyncManager({ minDataPoints: 3 });
            // Record tasks with very high ratio
            for (let i = 0; i < 5; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-CLAMP-HIGH-${i}`,
                    estimatedMinutes: 10,
                    actualMinutes: 100 // ratio 10.0
                }));
            }
            const analysis = manager.analyzeFeedback();
            expect(analysis.suggestedCalibration).toBe(1.5);
        });

        it('Test 43: should return 1.0 calibration when data points below minDataPoints', () => {
            const manager = new TaskSyncManager({ minDataPoints: 10 });
            for (let i = 0; i < 3; i++) {
                manager.recordFeedback(makeFeedbackInput({
                    taskId: `TK-INSUF-${i}`,
                    estimatedMinutes: 30,
                    actualMinutes: 60
                }));
            }
            const analysis = manager.analyzeFeedback();
            expect(analysis.suggestedCalibration).toBe(1.0);
        });

        it('Test 44: should round calibration to 2 decimal places', () => {
            const manager = new TaskSyncManager({ minDataPoints: 3 });
            // Create ratio that would produce a non-round number
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-ROUND-1', estimatedMinutes: 30, actualMinutes: 33
            }));
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-ROUND-2', estimatedMinutes: 30, actualMinutes: 34
            }));
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-ROUND-3', estimatedMinutes: 30, actualMinutes: 35
            }));
            const analysis = manager.analyzeFeedback();
            // Check that the calibration has at most 2 decimal places
            const str = analysis.suggestedCalibration.toString();
            const decimalPart = str.split('.')[1] || '';
            expect(decimalPart.length).toBeLessThanOrEqual(2);
        });
    });

    // =========================================================================
    // History Management Tests
    // =========================================================================
    describe('History Management', () => {
        it('Test 45: should export a copy of history', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({ taskId: 'TK-EXP-1' }));
            manager.recordFeedback(makeFeedbackInput({ taskId: 'TK-EXP-2' }));

            const exported = manager.exportHistory();
            expect(exported).toHaveLength(2);

            // Modifying the exported array should not affect internal state
            exported.pop();
            expect(manager.exportHistory()).toHaveLength(2);
        });

        it('Test 46: should import history and prune old entries', () => {
            const manager = new TaskSyncManager({ historyRetentionDays: 7 });

            const oldEntry: TaskFeedback = {
                ...makeFeedbackInput({ taskId: 'IMP-OLD' }),
                accuracyRatio: 1.0,
                timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days old
            };
            const recentEntry: TaskFeedback = {
                ...makeFeedbackInput({ taskId: 'IMP-RECENT' }),
                accuracyRatio: 1.0,
                timestamp: new Date()
            };

            manager.importHistory([oldEntry, recentEntry]);

            const history = manager.exportHistory();
            expect(history).toHaveLength(1);
            expect(history[0].taskId).toBe('IMP-RECENT');
        });

        it('Test 47: should log import count', () => {
            const manager = new TaskSyncManager();
            const entries: TaskFeedback[] = [
                {
                    ...makeFeedbackInput({ taskId: 'IMP-1' }),
                    accuracyRatio: 1.0,
                    timestamp: new Date()
                },
                {
                    ...makeFeedbackInput({ taskId: 'IMP-2' }),
                    accuracyRatio: 1.0,
                    timestamp: new Date()
                }
            ];
            manager.importHistory(entries);
            expect(mockLogInfo).toHaveBeenCalledWith(
                '[TaskSync] Imported 2 feedback records'
            );
        });

        it('Test 48: should clear all history and adjustments', () => {
            const manager = new TaskSyncManager();
            // Add some feedback that triggers adjustments
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-CLR',
                estimatedMinutes: 10,
                actualMinutes: 50 // ratio 5.0 -> triggers adjustment
            }));
            expect(manager.exportHistory()).toHaveLength(1);
            expect(manager.getPendingAdjustments().length).toBeGreaterThan(0);

            manager.clearHistory();

            expect(manager.exportHistory()).toHaveLength(0);
            expect(manager.getPendingAdjustments()).toHaveLength(0);
        });

        it('Test 49: should log when history is cleared', () => {
            const manager = new TaskSyncManager();
            manager.clearHistory();
            expect(mockLogInfo).toHaveBeenCalledWith('[TaskSync] History cleared');
        });
    });

    // =========================================================================
    // Singleton Pattern Tests
    // =========================================================================
    describe('Singleton Pattern', () => {
        it('Test 50: should return same instance from getTaskSyncManager', () => {
            const instance1 = getTaskSyncManager();
            const instance2 = getTaskSyncManager();
            expect(instance1).toBe(instance2);
        });

        it('Test 51: should return new instance after resetTaskSyncManagerForTests', () => {
            const instance1 = getTaskSyncManager();
            resetTaskSyncManagerForTests();
            const instance2 = getTaskSyncManager();
            expect(instance1).not.toBe(instance2);
        });

        it('Test 52: should reset singleton state (history is empty after reset)', () => {
            const instance1 = getTaskSyncManager();
            instance1.recordFeedback(makeFeedbackInput({ taskId: 'TK-SINGLE' }));
            expect(instance1.exportHistory()).toHaveLength(1);

            resetTaskSyncManagerForTests();

            const instance2 = getTaskSyncManager();
            expect(instance2.exportHistory()).toHaveLength(0);
        });
    });

    // =========================================================================
    // Edge Cases & Integration Tests
    // =========================================================================
    describe('Edge Cases', () => {
        it('Test 53: should handle both overrun and blocker adjustments simultaneously', () => {
            const manager = new TaskSyncManager();
            manager.recordFeedback(makeFeedbackInput({
                taskId: 'TK-BOTH',
                estimatedMinutes: 10,
                actualMinutes: 30, // ratio 3.0 -> triggers estimate adjustment
                blockers: [
                    makeBlocker({ timeLostMinutes: 20 }),
                    makeBlocker({ timeLostMinutes: 15 })
                ] // total 35 min -> triggers dependency adjustment
            }));
            const adjustments = manager.getPendingAdjustments();
            const types = adjustments.map(a => a.type);
            expect(types).toContain('estimate');
            expect(types).toContain('dependency');
        });

        it('Test 54: should handle feedback with all fields populated', () => {
            const manager = new TaskSyncManager();
            const result = manager.recordFeedback({
                taskId: 'TK-FULL',
                estimatedMinutes: 60,
                actualMinutes: 45,
                completed: true,
                blockers: [
                    makeBlocker({ type: 'dependency', timeLostMinutes: 5 }),
                    makeBlocker({ type: 'unclear', timeLostMinutes: 3 })
                ],
                positives: ['Clean code', 'Good tests'],
                improvements: ['Could use more docs']
            });
            expect(result.accuracyRatio).toBe(0.75);
            expect(result.blockers).toHaveLength(2);
            expect(result.positives).toHaveLength(2);
            expect(result.improvements).toHaveLength(1);
            expect(result.completed).toBe(true);
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('Test 55: should handle negative estimated minutes gracefully', () => {
            const manager = new TaskSyncManager();
            // Negative estimated minutes: estimatedMinutes > 0 is false, so ratio = 1
            const result = manager.recordFeedback(makeFeedbackInput({
                estimatedMinutes: -5,
                actualMinutes: 30
            }));
            expect(result.accuracyRatio).toBe(1);
        });
    });
});
