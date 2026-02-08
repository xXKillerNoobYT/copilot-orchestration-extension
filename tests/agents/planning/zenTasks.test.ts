/**
 * @file Tests for ZenTasks Workflow Integration
 *
 * **Simple explanation**: Verifies the ZenTasksManager correctly manages
 * focused development workflow states (ready, focus, pause, review, complete),
 * tracks sessions, records interruptions, and enforces valid state transitions.
 */

// Mock logger
const mockLogInfo = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('../../../src/logger', () => ({
    logInfo: (...args: unknown[]) => mockLogInfo(...args),
    logWarn: (...args: unknown[]) => mockLogWarn(...args)
}));

import {
    ZenTasksManager,
    getZenTasksManager,
    resetZenTasksManagerForTests,
    type ZenTask,
    type ZenTaskState,
    type ZenTasksConfig,
    type ZenSession,
    type ZenInterruption,
    type ZenTransition
} from '../../../src/agents/planning/zenTasks';
import type { AtomicTask } from '../../../src/agents/planning/decomposer';

/**
 * Helper to create a mock AtomicTask with sensible defaults.
 */
function createMockTask(overrides: Partial<AtomicTask> = {}): AtomicTask {
    return {
        id: 'TK-001.1',
        featureId: 'feature-1',
        title: 'Implement login form',
        description: 'Build a login form component',
        files: ['src/login.ts'],
        estimateMinutes: 30,
        dependsOn: [],
        blocks: [],
        acceptanceCriteria: ['Form renders', 'Validation works'],
        patterns: [],
        isUI: true,
        priority: 'P1' as const,
        status: 'pending' as const,
        ...overrides
    };
}

describe('ZenTasksManager', () => {
    let manager: ZenTasksManager;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2025-06-15T10:00:00Z'));
        resetZenTasksManagerForTests();
        manager = new ZenTasksManager();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // =========================================================================
    // Constructor and Configuration
    // =========================================================================

    it('Test 1: should initialize with default config when no config provided', () => {
        const mgr = new ZenTasksManager();
        // Verify it was created without errors and has no active session
        expect(mgr.getSession()).toBeNull();
    });

    it('Test 2: should merge partial config with defaults', () => {
        const customConfig: Partial<ZenTasksConfig> = {
            focusDurationMinutes: 50,
            maxConsecutiveSessions: 8
        };
        const mgr = new ZenTasksManager(customConfig);

        // Verify the manager works properly with merged config
        const session = mgr.startSession();
        expect(session).toBeDefined();
        expect(session.focusScore).toBe(100);
    });

    // =========================================================================
    // Session Management
    // =========================================================================

    it('Test 3: should start a new session with correct initial values', () => {
        const session = manager.startSession();

        expect(session.id).toMatch(/^zen-/);
        expect(session.currentTask).toBeNull();
        expect(session.startTime).toBeInstanceOf(Date);
        expect(session.lastActivity).toBeInstanceOf(Date);
        expect(session.completedCount).toBe(0);
        expect(session.focusScore).toBe(100);
        expect(mockLogInfo).toHaveBeenCalledWith(
            expect.stringContaining('[ZenTasks] Session started:')
        );
    });

    it('Test 4: should return current session via getSession', () => {
        expect(manager.getSession()).toBeNull();

        const session = manager.startSession();
        expect(manager.getSession()).toBe(session);
    });

    it('Test 5: should end session and set currentSession to null', () => {
        manager.startSession();
        expect(manager.getSession()).not.toBeNull();

        manager.endSession();
        expect(manager.getSession()).toBeNull();
        expect(mockLogInfo).toHaveBeenCalledWith(
            expect.stringContaining('[ZenTasks] Session ended:')
        );
    });

    it('Test 6: should handle endSession gracefully when no session is active', () => {
        // Should not throw
        expect(() => manager.endSession()).not.toThrow();
    });

    // =========================================================================
    // Task Preparation
    // =========================================================================

    it('Test 7: should prepare an AtomicTask into a ZenTask with zen_ready state', () => {
        const task = createMockTask();
        const zenTask = manager.prepareTask(task);

        expect(zenTask.zenState).toBe('zen_ready');
        expect(zenTask.stateEnteredAt).toBeInstanceOf(Date);
        expect(zenTask.focusSessions).toBe(0);
        expect(zenTask.totalFocusMinutes).toBe(0);
        expect(zenTask.interruptions).toEqual([]);
        expect(zenTask.contextNotes).toEqual([]);
        // Original fields preserved
        expect(zenTask.id).toBe('TK-001.1');
        expect(zenTask.title).toBe('Implement login form');
        expect(zenTask.featureId).toBe('feature-1');
        expect(mockLogInfo).toHaveBeenCalledWith(
            expect.stringContaining('[ZenTasks] Task prepared: TK-001.1')
        );
    });

    // =========================================================================
    // State Transitions: Happy Path (ready -> focus -> pause -> focus -> review -> complete)
    // =========================================================================

    it('Test 8: should transition from zen_ready to zen_focus via startFocus', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());

        const focused = manager.startFocus(task);

        expect(focused.zenState).toBe('zen_focus');
        expect(focused.focusSessions).toBe(1);
        expect(mockLogInfo).toHaveBeenCalledWith(
            expect.stringContaining('[ZenTasks] Focus started on: TK-001.1 (session 1)')
        );
    });

    it('Test 9: should transition from zen_focus to zen_pause via pauseFocus', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);

        // Advance 10 minutes
        jest.advanceTimersByTime(10 * 60 * 1000);

        const paused = manager.pauseFocus(focused, 'Need a break', 'Left off at line 42');

        expect(paused.zenState).toBe('zen_pause');
        expect(paused.totalFocusMinutes).toBe(10);
        expect(paused.interruptions).toHaveLength(1);
        expect(paused.interruptions[0].reason).toBe('Need a break');
        expect(paused.interruptions[0].savedContext).toBe('Left off at line 42');
        expect(paused.contextNotes).toEqual(['Left off at line 42']);
    });

    it('Test 10: should transition from zen_pause to zen_focus via resumeFocus', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);

        jest.advanceTimersByTime(5 * 60 * 1000);
        const paused = manager.pauseFocus(focused, 'Quick break');

        jest.advanceTimersByTime(3 * 60 * 1000);
        const resumed = manager.resumeFocus(paused);

        expect(resumed.zenState).toBe('zen_focus');
        // Last interruption's durationMinutes should be updated
        expect(resumed.interruptions).toHaveLength(1);
        expect(resumed.interruptions[0].durationMinutes).toBe(3);
    });

    it('Test 11: should transition from zen_focus to zen_review via startReview', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);

        jest.advanceTimersByTime(20 * 60 * 1000);
        const reviewed = manager.startReview(focused);

        expect(reviewed.zenState).toBe('zen_review');
        expect(reviewed.totalFocusMinutes).toBe(20);
    });

    it('Test 12: should transition from zen_review to zen_complete via completeTask', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);
        const reviewed = manager.startReview(focused);

        const completed = manager.completeTask(reviewed);

        expect(completed.zenState).toBe('zen_complete');
        expect(completed.status).toBe('verification');
        expect(manager.getSession()!.completedCount).toBe(1);
        expect(manager.getSession()!.currentTask).toBeNull();
    });

    // =========================================================================
    // Full Lifecycle: ready -> focus -> review -> needs_work -> focus -> review -> complete
    // =========================================================================

    it('Test 13: should support review-to-focus-to-review cycle (needs_work path)', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);

        jest.advanceTimersByTime(15 * 60 * 1000);
        const reviewed = manager.startReview(focused);

        // Needs more work: review -> focus
        const reFocused = manager.startFocus(reviewed);
        expect(reFocused.zenState).toBe('zen_focus');
        expect(reFocused.focusSessions).toBe(2);

        jest.advanceTimersByTime(10 * 60 * 1000);
        const reviewed2 = manager.startReview(reFocused);
        const completed = manager.completeTask(reviewed2);

        expect(completed.zenState).toBe('zen_complete');
        expect(completed.totalFocusMinutes).toBe(25); // 15 + 10
        expect(completed.focusSessions).toBe(2);
    });

    // =========================================================================
    // Invalid State Transitions
    // =========================================================================

    it('Test 14: should throw when attempting to start focus from zen_complete', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);
        const reviewed = manager.startReview(focused);
        const completed = manager.completeTask(reviewed);

        expect(() => manager.startFocus(completed)).toThrow(
            'Cannot start focus from state: zen_complete'
        );
    });

    it('Test 15: should throw when attempting to pause from zen_ready', () => {
        const task = manager.prepareTask(createMockTask());

        expect(() => manager.pauseFocus(task, 'Some reason')).toThrow(
            'Cannot pause from state: zen_ready'
        );
        expect(mockLogWarn).toHaveBeenCalledWith(
            expect.stringContaining('[ZenTasks] Cannot pause from state: zen_ready')
        );
    });

    it('Test 16: should throw when attempting to resume from zen_ready', () => {
        const task = manager.prepareTask(createMockTask());

        expect(() => manager.resumeFocus(task)).toThrow(
            'Cannot resume from state: zen_ready'
        );
    });

    it('Test 17: should throw when attempting to complete from zen_focus', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);

        expect(() => manager.completeTask(focused)).toThrow(
            'Cannot complete from state: zen_focus'
        );
    });

    it('Test 18: should throw when starting review from zen_pause', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);
        const paused = manager.pauseFocus(focused, 'break');

        expect(() => manager.startReview(paused)).toThrow(
            'Cannot start review from state: zen_pause'
        );
    });

    // =========================================================================
    // Pause-to-Ready (Defer Path)
    // =========================================================================

    it('Test 19: should allow deferring a paused task back to zen_ready via startFocus from ready', () => {
        // The valid transition is zen_pause -> zen_ready (defer).
        // We verify getValidNextStates returns this transition.
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);
        const paused = manager.pauseFocus(focused, 'need to defer');

        const transitions = manager.getValidNextStates(paused);
        const deferTransition = transitions.find(t => t.name === 'defer');

        expect(deferTransition).toBeDefined();
        expect(deferTransition!.from).toBe('zen_pause');
        expect(deferTransition!.to).toBe('zen_ready');
    });

    // =========================================================================
    // Interruption Recording
    // =========================================================================

    it('Test 20: should record multiple interruptions with correct data', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        let current = manager.startFocus(task);

        // First interruption
        jest.advanceTimersByTime(8 * 60 * 1000);
        current = manager.pauseFocus(current, 'Slack message', 'Was implementing auth');

        jest.advanceTimersByTime(2 * 60 * 1000);
        current = manager.resumeFocus(current);

        // Second interruption
        jest.advanceTimersByTime(12 * 60 * 1000);
        current = manager.pauseFocus(current, 'Meeting', 'Halfway through tests');

        expect(current.interruptions).toHaveLength(2);
        expect(current.interruptions[0].reason).toBe('Slack message');
        expect(current.interruptions[0].durationMinutes).toBe(2);
        expect(current.interruptions[0].savedContext).toBe('Was implementing auth');
        expect(current.interruptions[1].reason).toBe('Meeting');
        expect(current.interruptions[1].durationMinutes).toBe(0); // Not yet resumed
    });

    it('Test 21: should not add context note when contextNote is undefined on pause', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);

        jest.advanceTimersByTime(5 * 60 * 1000);
        const paused = manager.pauseFocus(focused, 'Quick question');

        expect(paused.contextNotes).toEqual([]);
        expect(paused.interruptions[0].savedContext).toBe('');
    });

    // =========================================================================
    // Context Notes
    // =========================================================================

    it('Test 22: should accumulate context notes across multiple pauses', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        let current = manager.startFocus(task);

        jest.advanceTimersByTime(5 * 60 * 1000);
        current = manager.pauseFocus(current, 'break 1', 'Note A');
        jest.advanceTimersByTime(1 * 60 * 1000);
        current = manager.resumeFocus(current);

        jest.advanceTimersByTime(5 * 60 * 1000);
        current = manager.pauseFocus(current, 'break 2', 'Note B');

        expect(current.contextNotes).toEqual(['Note A', 'Note B']);
    });

    // =========================================================================
    // Session Stats
    // =========================================================================

    it('Test 23: should return null for session stats when no session is active', () => {
        expect(manager.getSessionStats()).toBeNull();
    });

    it('Test 24: should return correct session stats after completing tasks', () => {
        manager.startSession();

        // Complete first task with 20 min focus
        const task1 = manager.prepareTask(createMockTask({ id: 'TK-001.1' }));
        let z1 = manager.startFocus(task1);
        jest.advanceTimersByTime(20 * 60 * 1000);
        z1 = manager.startReview(z1);
        manager.completeTask(z1);

        // Complete second task with 10 min focus
        const task2 = manager.prepareTask(createMockTask({ id: 'TK-001.2', title: 'Task 2' }));
        let z2 = manager.startFocus(task2);
        jest.advanceTimersByTime(10 * 60 * 1000);
        z2 = manager.startReview(z2);
        manager.completeTask(z2);

        const stats = manager.getSessionStats();
        expect(stats).not.toBeNull();
        expect(stats!.completed).toBe(2);
        expect(stats!.focusScore).toBe(100); // No interruptions
        expect(stats!.avgFocusMinutes).toBe(15); // (20 + 10) / 2
    });

    it('Test 25: should degrade focusScore with each pause', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        let current = manager.startFocus(task);

        jest.advanceTimersByTime(5 * 60 * 1000);
        current = manager.pauseFocus(current, 'interruption 1');
        expect(manager.getSession()!.focusScore).toBe(95);

        jest.advanceTimersByTime(1 * 60 * 1000);
        current = manager.resumeFocus(current);

        jest.advanceTimersByTime(5 * 60 * 1000);
        current = manager.pauseFocus(current, 'interruption 2');
        expect(manager.getSession()!.focusScore).toBe(90);
    });

    // =========================================================================
    // Focus Duration and Break Recommendations
    // =========================================================================

    it('Test 26: should recommend a break when total focus exceeds configured duration', () => {
        const mgr = new ZenTasksManager({ focusDurationMinutes: 25 });
        mgr.startSession();
        const task = mgr.prepareTask(createMockTask());
        const focused = mgr.startFocus(task);

        // Advance 26 minutes (exceeds 25 min config)
        jest.advanceTimersByTime(26 * 60 * 1000);

        expect(mgr.shouldTakeBreak(focused)).toBe(true);
    });

    it('Test 27: should recommend a break when session count reaches max', () => {
        const mgr = new ZenTasksManager({ maxConsecutiveSessions: 2, focusDurationMinutes: 999 });
        mgr.startSession();
        const task = mgr.prepareTask(createMockTask());

        // First session
        let current = mgr.startFocus(task);
        const reviewed = mgr.startReview(current);
        // Go back for more work (session 2)
        current = mgr.startFocus(reviewed);

        // focusSessions is now 2, which equals maxConsecutiveSessions
        expect(mgr.shouldTakeBreak(current)).toBe(true);
    });

    it('Test 28: should NOT recommend a break when under thresholds', () => {
        const mgr = new ZenTasksManager({ focusDurationMinutes: 25, maxConsecutiveSessions: 4 });
        mgr.startSession();
        const task = mgr.prepareTask(createMockTask());
        const focused = mgr.startFocus(task);

        // Only 5 minutes elapsed
        jest.advanceTimersByTime(5 * 60 * 1000);

        expect(mgr.shouldTakeBreak(focused)).toBe(false);
    });

    // =========================================================================
    // Workflow Summary
    // =========================================================================

    it('Test 29: should generate a workflow summary with task details', () => {
        const task = manager.prepareTask(createMockTask({ title: 'Build login page' }));

        const summary = manager.getWorkflowSummary(task);

        expect(summary).toContain('Task: Build login page');
        expect(summary).toContain('State: zen_ready');
        expect(summary).toContain('Focus sessions: 0');
        expect(summary).toContain('Total focus time: 0 minutes');
        expect(summary).toContain('Interruptions: 0');
        expect(summary).not.toContain('Context notes:');
    });

    it('Test 30: should include context notes in workflow summary when present', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        let current = manager.startFocus(task);

        jest.advanceTimersByTime(5 * 60 * 1000);
        current = manager.pauseFocus(current, 'break', 'Remember to fix CSS');

        const summary = manager.getWorkflowSummary(current);
        expect(summary).toContain('Context notes:');
        expect(summary).toContain('  - Remember to fix CSS');
    });

    // =========================================================================
    // Valid Next States
    // =========================================================================

    it('Test 31: should return valid next states for zen_ready', () => {
        const task = manager.prepareTask(createMockTask());
        const transitions = manager.getValidNextStates(task);

        expect(transitions).toHaveLength(1);
        expect(transitions[0].to).toBe('zen_focus');
        expect(transitions[0].name).toBe('start_focus');
    });

    it('Test 32: should return valid next states for zen_focus', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);
        const transitions = manager.getValidNextStates(focused);

        expect(transitions).toHaveLength(2);
        const targetStates = transitions.map(t => t.to);
        expect(targetStates).toContain('zen_pause');
        expect(targetStates).toContain('zen_review');
    });

    it('Test 33: should return valid next states for zen_pause', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);
        const paused = manager.pauseFocus(focused, 'break');
        const transitions = manager.getValidNextStates(paused);

        expect(transitions).toHaveLength(2);
        const targetStates = transitions.map(t => t.to);
        expect(targetStates).toContain('zen_focus');
        expect(targetStates).toContain('zen_ready');
    });

    it('Test 34: should return valid next states for zen_review', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);
        const reviewed = manager.startReview(focused);
        const transitions = manager.getValidNextStates(reviewed);

        expect(transitions).toHaveLength(2);
        const targetStates = transitions.map(t => t.to);
        expect(targetStates).toContain('zen_focus');
        expect(targetStates).toContain('zen_complete');
    });

    it('Test 35: should return no valid next states for zen_complete', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);
        const reviewed = manager.startReview(focused);
        const completed = manager.completeTask(reviewed);

        const transitions = manager.getValidNextStates(completed);
        expect(transitions).toHaveLength(0);
    });

    // =========================================================================
    // Singleton Pattern
    // =========================================================================

    it('Test 36: should return the same singleton instance on repeated calls', () => {
        const instance1 = getZenTasksManager();
        const instance2 = getZenTasksManager();
        expect(instance1).toBe(instance2);
    });

    it('Test 37: should return a new instance after resetZenTasksManagerForTests', () => {
        const instance1 = getZenTasksManager();
        resetZenTasksManagerForTests();
        const instance2 = getZenTasksManager();
        expect(instance1).not.toBe(instance2);
    });

    // =========================================================================
    // Edge Cases
    // =========================================================================

    it('Test 38: should update session currentTask on startFocus', () => {
        const session = manager.startSession();
        expect(session.currentTask).toBeNull();

        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);

        expect(manager.getSession()!.currentTask).toBe(focused);
    });

    it('Test 39: should handle startFocus without an active session (no session)', () => {
        // No session started; startFocus should still work on the task itself
        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);

        expect(focused.zenState).toBe('zen_focus');
        expect(focused.focusSessions).toBe(1);
        // Session-related updates are skipped gracefully
        expect(manager.getSession()).toBeNull();
    });

    it('Test 40: should clamp focusScore to minimum of 0 after many interruptions', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());
        let current = manager.startFocus(task);

        // 21 interruptions: 100 - (21 * 5) = -5 -> should clamp to 0
        for (let i = 0; i < 21; i++) {
            jest.advanceTimersByTime(1 * 60 * 1000);
            current = manager.pauseFocus(current, `interruption ${i + 1}`);
            jest.advanceTimersByTime(1 * 60 * 1000);
            current = manager.resumeFocus(current);
        }

        expect(manager.getSession()!.focusScore).toBe(0);
    });

    it('Test 41: should calculate zero focus duration when task is not in zen_focus state', () => {
        // When shouldTakeBreak is called on a non-focus task, calculateFocusDuration returns 0
        const mgr = new ZenTasksManager({ focusDurationMinutes: 25, maxConsecutiveSessions: 4 });
        const task = mgr.prepareTask(createMockTask());

        // Task is in zen_ready, focusSessions=0, totalFocusMinutes=0
        expect(mgr.shouldTakeBreak(task)).toBe(false);
    });

    it('Test 42: should return avgFocusMinutes of 0 when no tasks completed in session stats', () => {
        manager.startSession();
        const stats = manager.getSessionStats();

        expect(stats).not.toBeNull();
        expect(stats!.completed).toBe(0);
        expect(stats!.avgFocusMinutes).toBe(0);
        expect(stats!.focusScore).toBe(100);
    });

    it('Test 43: should set task status to verification on completion', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask({ status: 'in_progress' }));
        const focused = manager.startFocus(task);
        const reviewed = manager.startReview(focused);
        const completed = manager.completeTask(reviewed);

        expect(completed.status).toBe('verification');
    });

    it('Test 44: should accumulate totalFocusMinutes across multiple focus-pause cycles', () => {
        manager.startSession();
        const task = manager.prepareTask(createMockTask());

        // Focus 10 min, pause, focus 15 min, review
        let current = manager.startFocus(task);
        jest.advanceTimersByTime(10 * 60 * 1000);
        current = manager.pauseFocus(current, 'break');
        jest.advanceTimersByTime(2 * 60 * 1000);
        current = manager.resumeFocus(current);
        jest.advanceTimersByTime(15 * 60 * 1000);
        current = manager.startReview(current);

        expect(current.totalFocusMinutes).toBe(25); // 10 + 15
    });

    it('Test 45: should update lastActivity on session when resuming focus', () => {
        const session = manager.startSession();
        const initialActivity = session.lastActivity;

        const task = manager.prepareTask(createMockTask());
        const focused = manager.startFocus(task);

        jest.advanceTimersByTime(5 * 60 * 1000);
        const paused = manager.pauseFocus(focused, 'break');

        jest.advanceTimersByTime(3 * 60 * 1000);
        manager.resumeFocus(paused);

        // lastActivity should be more recent than initial
        expect(manager.getSession()!.lastActivity.getTime()).toBeGreaterThanOrEqual(
            initialActivity.getTime()
        );
    });
});
