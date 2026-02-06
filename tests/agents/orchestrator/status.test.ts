/**
 * Tests for Task Status State Machine
 */

import {
    TaskStatusManager,
    getTaskStatusManager,
    resetTaskStatusManager,
    TRIGGERS,
    TaskStatus
} from '../../../src/agents/orchestrator/status';

describe('TaskStatusManager', () => {
    let manager: TaskStatusManager;

    beforeEach(() => {
        resetTaskStatusManager();
        manager = getTaskStatusManager();
    });

    afterEach(() => {
        resetTaskStatusManager();
    });

    describe('initializeTask', () => {
        it('Test 1: should initialize task as blocked when has dependencies', () => {
            const status = manager.initializeTask('task-1', true);
            expect(status).toBe('blocked');
            expect(manager.getStatus('task-1')).toBe('blocked');
        });

        it('Test 2: should initialize task as ready when no dependencies', () => {
            const status = manager.initializeTask('task-2', false);
            expect(status).toBe('ready');
            expect(manager.getStatus('task-2')).toBe('ready');
        });
    });

    describe('transition', () => {
        it('Test 3: should allow valid transition from ready to in-progress', () => {
            manager.initializeTask('task-1', false);
            const newStatus = manager.transition('task-1', TRIGGERS.ASSIGNED);

            expect(newStatus).toBe('in-progress');
            expect(manager.getStatus('task-1')).toBe('in-progress');
        });

        it('Test 4: should allow transition from in-progress to verification', () => {
            manager.initializeTask('task-1', false);
            manager.transition('task-1', TRIGGERS.ASSIGNED);
            const newStatus = manager.transition('task-1', TRIGGERS.CODING_COMPLETE);

            expect(newStatus).toBe('verification');
        });

        it('Test 5: should allow transition from verification to done', () => {
            manager.initializeTask('task-1', false);
            manager.transition('task-1', TRIGGERS.ASSIGNED);
            manager.transition('task-1', TRIGGERS.CODING_COMPLETE);
            const newStatus = manager.transition('task-1', TRIGGERS.VERIFICATION_PASSED);

            expect(newStatus).toBe('done');
        });

        it('Test 6: should allow transition from verification to needs-revision', () => {
            manager.initializeTask('task-1', false);
            manager.transition('task-1', TRIGGERS.ASSIGNED);
            manager.transition('task-1', TRIGGERS.CODING_COMPLETE);
            const newStatus = manager.transition('task-1', TRIGGERS.VERIFICATION_FAILED);

            expect(newStatus).toBe('needs-revision');
        });

        it('Test 7: should reject invalid transitions', () => {
            manager.initializeTask('task-1', false);
            const newStatus = manager.transition('task-1', TRIGGERS.CODING_COMPLETE);

            // Can't go from ready directly to verification
            expect(newStatus).toBeNull();
            expect(manager.getStatus('task-1')).toBe('ready');
        });

        it('Test 8: should return null for non-existent task', () => {
            const newStatus = manager.transition('nonexistent', TRIGGERS.ASSIGNED);
            expect(newStatus).toBeNull();
        });
    });

    describe('canTransition', () => {
        it('Test 9: should return true for valid transitions', () => {
            manager.initializeTask('task-1', false);
            expect(manager.canTransition('task-1', TRIGGERS.ASSIGNED)).toBe(true);
        });

        it('Test 10: should return false for invalid transitions', () => {
            manager.initializeTask('task-1', false);
            expect(manager.canTransition('task-1', TRIGGERS.VERIFICATION_PASSED)).toBe(false);
        });
    });

    describe('getValidTriggers', () => {
        it('Test 11: should return valid triggers for ready state', () => {
            manager.initializeTask('task-1', false);
            const triggers = manager.getValidTriggers('task-1');

            expect(triggers).toContain(TRIGGERS.ASSIGNED);
            expect(triggers).toContain(TRIGGERS.CANCEL);
        });

        it('Test 12: should return empty array for non-existent task', () => {
            expect(manager.getValidTriggers('nonexistent')).toEqual([]);
        });
    });

    describe('forceStatus', () => {
        it('Test 13: should force status regardless of current state', () => {
            manager.initializeTask('task-1', false);
            manager.forceStatus('task-1', 'done', 'admin override');

            expect(manager.getStatus('task-1')).toBe('done');
        });

        it('Test 14: should record force transition in history', () => {
            manager.initializeTask('task-1', false);
            manager.forceStatus('task-1', 'failed', 'test reason');

            const history = manager.getHistory('task-1');
            const lastEvent = history[history.length - 1];

            expect(lastEvent.trigger).toBe('force:test reason');
            expect(lastEvent.metadata?.forced).toBe(true);
        });
    });

    describe('getSummary', () => {
        it('Test 15: should return status counts', () => {
            manager.initializeTask('task-1', false);
            manager.initializeTask('task-2', true);
            manager.initializeTask('task-3', false);
            manager.transition('task-1', TRIGGERS.ASSIGNED);

            const summary = manager.getSummary();

            expect(summary.ready).toBe(1);
            expect(summary.blocked).toBe(1);
            expect(summary['in-progress']).toBe(1);
        });
    });

    describe('getTasksByStatus', () => {
        it('Test 16: should return all tasks with given status', () => {
            manager.initializeTask('task-1', false);
            manager.initializeTask('task-2', false);
            manager.initializeTask('task-3', true);

            const readyTasks = manager.getTasksByStatus('ready');

            expect(readyTasks).toHaveLength(2);
            expect(readyTasks).toContain('task-1');
            expect(readyTasks).toContain('task-2');
        });
    });

    describe('getHistory', () => {
        it('Test 17: should track all transitions', () => {
            manager.initializeTask('task-1', false);
            manager.transition('task-1', TRIGGERS.ASSIGNED);
            manager.transition('task-1', TRIGGERS.CODING_COMPLETE);

            const history = manager.getHistory('task-1');

            expect(history).toHaveLength(3); // init + 2 transitions
            expect(history[0].toStatus).toBe('ready');
            expect(history[1].toStatus).toBe('in-progress');
            expect(history[2].toStatus).toBe('verification');
        });
    });
});
