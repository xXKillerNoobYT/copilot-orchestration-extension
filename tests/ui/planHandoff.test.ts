/**
 * Plan Handoff Workflow Tests (MT-033.27)
 *
 * Tests for session management, state transitions, execution control,
 * task status updates, progress calculation, and panel rendering.
 */

import {
    createHandoffSession,
    isValidTransition,
    transitionState,
    startExecution,
    pauseExecution,
    resumeExecution,
    cancelExecution,
    updateTaskStatus,
    getNextAvailableTasks,
    reassignTask,
    calculateProgress,
    renderHandoffPanel,
    getHandoffPanelStyles,
    HandoffSession,
    ExecutionState
} from '../../src/ui/planHandoff';

import { CompletePlan } from '../../src/planning/types';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestPlan(featureCount = 1): CompletePlan {
    const features = Array.from({ length: featureCount }, (_, i) => ({
        id: `feature-${i + 1}`,
        name: `Feature ${i + 1}`,
        description: `Description for feature ${i + 1}`,
        purpose: `Purpose ${i + 1}`,
        acceptanceCriteria: ['Works correctly'],
        technicalNotes: '',
        priority: 'high' as const,
        order: i + 1
    }));

    const devStories = features.map((f, i) => ({
        id: `ds-${i + 1}`,
        action: `Implement ${f.name}`,
        benefit: `Enable ${f.name}`,
        technicalRequirements: [`src/${f.name.toLowerCase().replace(/\s/g, '')}.ts`],
        apiNotes: '',
        databaseNotes: '',
        estimatedHours: 0.5,
        relatedBlockIds: [f.id],
        relatedTaskIds: []
    }));

    return {
        metadata: { id: 'plan-1', name: 'Test Plan', createdAt: new Date(), updatedAt: new Date(), version: 1 },
        overview: { name: 'Test Plan', description: 'Test', goals: ['Build'] },
        featureBlocks: features,
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: devStories,
        successCriteria: []
    };
}

function createRunningSession(): HandoffSession {
    const plan = createTestPlan();
    let session = createHandoffSession(plan, { generateTestTasks: false });
    session = startExecution(session);
    return session;
}

// ============================================================================
// Session Creation Tests
// ============================================================================

describe('PlanHandoff - Session Creation', () => {
    it('Test 1: should create session from plan', () => {
        const plan = createTestPlan();
        const session = createHandoffSession(plan);

        expect(session.id).toContain('handoff-');
        expect(session.state).toBe('idle');
        expect(session.startedAt).toBeNull();
        expect(session.endedAt).toBeNull();
        expect(session.breakdown.masterTickets.length).toBeGreaterThan(0);
    });

    it('Test 2: should initialize task statuses', () => {
        const plan = createTestPlan();
        const session = createHandoffSession(plan, { generateTestTasks: false });

        expect(session.taskStatuses.size).toBe(session.breakdown.tasks.length);
    });

    it('Test 3: should log initial state', () => {
        const session = createHandoffSession(createTestPlan());
        expect(session.stateLog).toHaveLength(1);
        expect(session.stateLog[0].state).toBe('idle');
    });

    it('Test 4: should accept custom breakdown config', () => {
        const session = createHandoffSession(createTestPlan(), { masterTicketPrefix: 'PROJ' });
        expect(session.breakdown.masterTickets[0].id).toContain('PROJ');
    });
});

// ============================================================================
// State Transition Tests
// ============================================================================

describe('PlanHandoff - State Transitions', () => {
    it('Test 5: should allow valid transitions', () => {
        expect(isValidTransition('idle', 'preparing')).toBe(true);
        expect(isValidTransition('preparing', 'running')).toBe(true);
        expect(isValidTransition('running', 'paused')).toBe(true);
        expect(isValidTransition('paused', 'running')).toBe(true);
        expect(isValidTransition('running', 'completed')).toBe(true);
    });

    it('Test 6: should reject invalid transitions', () => {
        expect(isValidTransition('completed', 'running')).toBe(false);
        expect(isValidTransition('cancelled', 'running')).toBe(false);
        expect(isValidTransition('idle', 'completed')).toBe(false);
    });

    it('Test 7: should transition state and log', () => {
        let session = createHandoffSession(createTestPlan());
        session = transitionState(session, 'preparing', 'Starting');

        expect(session.state).toBe('preparing');
        expect(session.stateLog).toHaveLength(2);
        expect(session.stateLog[1].reason).toBe('Starting');
    });

    it('Test 8: should throw on invalid transition', () => {
        const session = createHandoffSession(createTestPlan());
        expect(() => transitionState(session, 'completed', 'Invalid')).toThrow('Invalid state transition');
    });

    it('Test 9: should set startedAt on first run', () => {
        const session = createHandoffSession(createTestPlan());
        const started = startExecution(session);
        expect(started.startedAt).not.toBeNull();
    });

    it('Test 10: should set endedAt on completion', () => {
        let session = createRunningSession();
        // Complete all tasks
        for (const taskId of session.taskStatuses.keys()) {
            session = updateTaskStatus(session, taskId, 'done');
        }
        expect(session.endedAt).not.toBeNull();
        expect(session.state).toBe('completed');
    });

    it('Test 11: should allow retry from failed state', () => {
        let session = createRunningSession();
        session = transitionState(session, 'failed', 'Error occurred');
        session = transitionState(session, 'preparing', 'Retrying');
        expect(session.state).toBe('preparing');
    });
});

// ============================================================================
// Execution Control Tests
// ============================================================================

describe('PlanHandoff - Execution Control', () => {
    it('Test 12: should start execution', () => {
        const session = createHandoffSession(createTestPlan());
        const started = startExecution(session);
        expect(started.state).toBe('running');
    });

    it('Test 13: should pause execution', () => {
        const session = createRunningSession();
        const paused = pauseExecution(session);
        expect(paused.state).toBe('paused');
    });

    it('Test 14: should resume after pause', () => {
        let session = createRunningSession();
        session = pauseExecution(session);
        session = resumeExecution(session);
        expect(session.state).toBe('running');
    });

    it('Test 15: should cancel execution', () => {
        const session = createRunningSession();
        const cancelled = cancelExecution(session);
        expect(cancelled.state).toBe('cancelled');
        expect(cancelled.endedAt).not.toBeNull();
    });
});

// ============================================================================
// Task Status Tests
// ============================================================================

describe('PlanHandoff - Task Status', () => {
    it('Test 16: should update task status', () => {
        const session = createRunningSession();
        const taskId = session.breakdown.tasks[0].id;
        const updated = updateTaskStatus(session, taskId, 'in_progress');
        expect(updated.taskStatuses.get(taskId)).toBe('in_progress');
    });

    it('Test 17: should throw for unknown task', () => {
        const session = createRunningSession();
        expect(() => updateTaskStatus(session, 'nonexistent', 'done')).toThrow('not found');
    });

    it('Test 18: should auto-complete when all tasks done', () => {
        let session = createRunningSession();
        for (const taskId of session.taskStatuses.keys()) {
            session = updateTaskStatus(session, taskId, 'done');
        }
        expect(session.state).toBe('completed');
    });
});

// ============================================================================
// Available Tasks Tests
// ============================================================================

describe('PlanHandoff - Available Tasks', () => {
    it('Test 19: should find tasks with no dependencies', () => {
        const session = createRunningSession();
        const available = getNextAvailableTasks(session);
        expect(available.length).toBeGreaterThan(0);
    });

    it('Test 20: should return empty when not running', () => {
        const session = createHandoffSession(createTestPlan());
        const available = getNextAvailableTasks(session);
        expect(available).toHaveLength(0);
    });

    it('Test 21: should exclude in-progress and done tasks', () => {
        let session = createRunningSession();
        const taskId = session.breakdown.tasks[0].id;
        session = updateTaskStatus(session, taskId, 'in_progress');
        const available = getNextAvailableTasks(session);
        const inProgress = available.find(t => t.id === taskId);
        expect(inProgress).toBeUndefined();
    });
});

// ============================================================================
// Task Reassignment Tests
// ============================================================================

describe('PlanHandoff - Task Reassignment', () => {
    it('Test 22: should reassign task to new team', () => {
        const session = createRunningSession();
        const taskId = session.breakdown.tasks[0].id;
        const updated = reassignTask(session, taskId, 'research');
        const task = updated.breakdown.tasks.find(t => t.id === taskId);
        expect(task?.assignedTeam).toBe('research');
    });

    it('Test 23: should throw for unknown task', () => {
        const session = createRunningSession();
        expect(() => reassignTask(session, 'nonexistent', 'coding')).toThrow('not found');
    });
});

// ============================================================================
// Progress Calculation Tests
// ============================================================================

describe('PlanHandoff - Progress', () => {
    it('Test 24: should calculate initial progress at 0%', () => {
        const session = createRunningSession();
        const progress = calculateProgress(session);
        expect(progress.completedTasks).toBe(0);
        expect(progress.totalTasks).toBeGreaterThan(0);
    });

    it('Test 25: should track completed tasks', () => {
        let session = createRunningSession();
        const taskId = session.breakdown.tasks[0].id;
        session = updateTaskStatus(session, taskId, 'done');
        const progress = calculateProgress(session);
        expect(progress.completedTasks).toBe(1);
    });

    it('Test 26: should track in-progress tasks', () => {
        let session = createRunningSession();
        const taskId = session.breakdown.tasks[0].id;
        session = updateTaskStatus(session, taskId, 'in_progress');
        const progress = calculateProgress(session);
        expect(progress.inProgressTasks).toBe(1);
    });

    it('Test 27: should track blocked tasks', () => {
        let session = createRunningSession();
        const taskId = session.breakdown.tasks[0].id;
        session = updateTaskStatus(session, taskId, 'blocked');
        const progress = calculateProgress(session);
        expect(progress.blockedTasks).toBe(1);
    });

    it('Test 28: should calculate feature progress', () => {
        const session = createRunningSession();
        const progress = calculateProgress(session);
        expect(progress.featureProgress.length).toBeGreaterThan(0);
        expect(progress.featureProgress[0].masterTicketId).toBeDefined();
        expect(progress.featureProgress[0].featureName).toBe('Feature 1');
    });

    it('Test 29: should calculate team progress', () => {
        const session = createRunningSession();
        const progress = calculateProgress(session);
        const totalAcrossTeams = Object.values(progress.teamProgress).reduce((sum, t) => sum + t.total, 0);
        expect(totalAcrossTeams).toBe(progress.totalTasks);
    });

    it('Test 30: should estimate remaining time', () => {
        const session = createRunningSession();
        const progress = calculateProgress(session);
        expect(progress.estimatedMinutesRemaining).toBeGreaterThan(0);
    });

    it('Test 31: should reach 100% when all done', () => {
        let session = createRunningSession();
        for (const taskId of session.taskStatuses.keys()) {
            session = updateTaskStatus(session, taskId, 'done');
        }
        const progress = calculateProgress(session);
        expect(progress.progressPercent).toBe(100);
        expect(progress.estimatedMinutesRemaining).toBe(0);
    });
});

// ============================================================================
// Multi-Feature Tests
// ============================================================================

describe('PlanHandoff - Multi-Feature', () => {
    it('Test 32: should handle plan with multiple features', () => {
        const plan = createTestPlan(3);
        const session = createHandoffSession(plan, { generateTestTasks: false });
        expect(session.breakdown.masterTickets).toHaveLength(3);

        const progress = calculateProgress(session);
        expect(progress.featureProgress).toHaveLength(3);
    });

    it('Test 33: should track per-feature progress independently', () => {
        const plan = createTestPlan(2);
        let session = createHandoffSession(plan, { generateTestTasks: false });
        session = startExecution(session);

        // Complete all tasks for first feature only
        const feature1Tasks = session.breakdown.tasks.filter(t => t.parentId === 'MT-001');
        for (const task of feature1Tasks) {
            session = updateTaskStatus(session, task.id, 'done');
        }

        const progress = calculateProgress(session);
        const f1Progress = progress.featureProgress.find(fp => fp.masterTicketId === 'MT-001');
        const f2Progress = progress.featureProgress.find(fp => fp.masterTicketId === 'MT-002');

        expect(f1Progress?.progressPercent).toBe(100);
        expect(f2Progress?.progressPercent).toBe(0);
    });
});

// ============================================================================
// Panel Rendering Tests
// ============================================================================

describe('PlanHandoff - Panel Rendering', () => {
    it('Test 34: should render handoff panel', () => {
        const session = createHandoffSession(createTestPlan());
        const html = renderHandoffPanel(session);
        expect(html).toContain('handoff-panel');
        expect(html).toContain('Plan Execution');
        expect(html).toContain('IDLE');
    });

    it('Test 35: should show execute button when idle', () => {
        const session = createHandoffSession(createTestPlan());
        const html = renderHandoffPanel(session);
        expect(html).toContain('Execute Plan');
    });

    it('Test 36: should show pause button when running', () => {
        const session = createRunningSession();
        const html = renderHandoffPanel(session);
        expect(html).toContain('Pause');
    });

    it('Test 37: should show resume button when paused', () => {
        let session = createRunningSession();
        session = pauseExecution(session);
        const html = renderHandoffPanel(session);
        expect(html).toContain('Resume');
    });

    it('Test 38: should show feature progress', () => {
        const session = createHandoffSession(createTestPlan());
        const html = renderHandoffPanel(session);
        expect(html).toContain('Feature Progress');
        expect(html).toContain('Feature 1');
    });

    it('Test 39: should show agent teams', () => {
        const session = createHandoffSession(createTestPlan());
        const html = renderHandoffPanel(session);
        expect(html).toContain('Agent Teams');
    });

    it('Test 40: should return handoff panel styles', () => {
        const styles = getHandoffPanelStyles();
        expect(styles).toContain('.handoff-panel');
        expect(styles).toContain('.progress-bar');
        expect(styles).toContain('.btn-start');
    });
});
