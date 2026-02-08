/**
 * Plan Update Workflow Tests (MT-033.29)
 *
 * Tests for update request creation, approval workflow, apply/rollback,
 * task action determination, history management, and panel rendering.
 */

import {
    createUpdateRequest,
    proposeTaskActions,
    determineTaskAction,
    approveUpdate,
    rejectUpdate,
    applyUpdate,
    rollbackUpdate,
    createUpdateHistory,
    addToHistory,
    getRecentUpdates,
    renderUpdatePanel,
    getUpdatePanelStyles,
    DEFAULT_PLAN_UPDATE_CONFIG,
    PlanUpdateRequest
} from '../../src/ui/planUpdates';

import {
    createHandoffSession,
    startExecution,
    updateTaskStatus,
    HandoffSession
} from '../../src/ui/planHandoff';

import { CompletePlan, FeatureBlock, DeveloperStory } from '../../src/planning/types';

// ============================================================================
// Test Helpers
// ============================================================================

function createFeature(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: 'feature-1', name: 'User Auth', description: 'Auth system',
        purpose: 'Security', acceptanceCriteria: ['Login works'],
        technicalNotes: '', priority: 'high', order: 1, ...overrides
    };
}

function createDevStory(overrides: Partial<DeveloperStory> = {}): DeveloperStory {
    return {
        id: 'ds-1', action: 'Implement login', benefit: 'Users can log in',
        technicalRequirements: ['src/auth.ts'], apiNotes: '', databaseNotes: '',
        estimatedHours: 1, relatedBlockIds: ['feature-1'], relatedTaskIds: [],
        ...overrides
    };
}

function createPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    return {
        metadata: { id: 'plan-1', name: 'Test Plan', createdAt: new Date(), updatedAt: new Date(), version: 1 },
        overview: { name: 'Test Plan', description: 'Test', goals: ['Build'] },
        featureBlocks: [createFeature()],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [createDevStory()],
        successCriteria: [],
        ...overrides
    };
}

function createRunningSession(plan: CompletePlan): HandoffSession {
    let session = createHandoffSession(plan, { generateTestTasks: false });
    session = startExecution(session);
    return session;
}

// ============================================================================
// Update Request Tests
// ============================================================================

describe('PlanUpdates - Create Request', () => {
    it('Test 1: should create update request with impact analysis', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Updated Auth' })] });

        const request = createUpdateRequest(original, updated, null);
        expect(request.id).toContain('update-');
        expect(request.impact.changes.length).toBeGreaterThan(0);
        expect(request.status).toBe('pending_approval');
    });

    it('Test 2: should set status to draft when no changes', () => {
        const plan = createPlan();
        const request = createUpdateRequest(plan, plan, null);
        expect(request.status).toBe('draft');
    });

    it('Test 3: should store original and updated plans', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });

        const request = createUpdateRequest(original, updated, null);
        expect(request.originalPlan).toBe(original);
        expect(request.updatedPlan).toBe(updated);
    });

    it('Test 4: should store rollback plan when enabled', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });

        const request = createUpdateRequest(original, updated, null, { enableRollback: true });
        expect(request.rollbackPlan).toBe(original);
    });

    it('Test 5: should not store rollback plan when disabled', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });

        const request = createUpdateRequest(original, updated, null, { enableRollback: false });
        expect(request.rollbackPlan).toBeNull();
    });
});

// ============================================================================
// Task Action Tests
// ============================================================================

describe('PlanUpdates - Task Actions', () => {
    it('Test 6: should determine keep for done tasks', () => {
        expect(determineTaskAction('done', 'modified', 'high')).toBe('keep');
    });

    it('Test 7: should determine cancel for removed pending tasks', () => {
        expect(determineTaskAction('pending', 'removed', 'medium')).toBe('cancel');
    });

    it('Test 8: should determine reassign for removed in-progress tasks', () => {
        expect(determineTaskAction('in_progress', 'removed', 'medium')).toBe('reassign');
    });

    it('Test 9: should determine update for modified low-severity tasks', () => {
        expect(determineTaskAction('pending', 'modified', 'low')).toBe('update');
    });

    it('Test 10: should determine recreate for modified high-severity tasks', () => {
        expect(determineTaskAction('pending', 'modified', 'high')).toBe('recreate');
    });

    it('Test 11: should determine keep for added elements', () => {
        expect(determineTaskAction('pending', 'added', 'low')).toBe('keep');
    });

    it('Test 12: should propose actions for affected items', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });

        const request = createUpdateRequest(original, updated, null);
        // If any task actions exist, they should have valid structure
        for (const action of request.taskActions) {
            expect(action.taskId).toBeDefined();
            expect(action.action).toBeDefined();
        }
    });
});

// ============================================================================
// Approval Workflow Tests
// ============================================================================

describe('PlanUpdates - Approval', () => {
    it('Test 13: should approve pending request', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        const request = createUpdateRequest(original, updated, null);

        const approved = approveUpdate(request, 'Looks good');
        expect(approved.status).toBe('approved');
        expect(approved.decisionReason).toBe('Looks good');
    });

    it('Test 14: should reject pending request', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        const request = createUpdateRequest(original, updated, null);

        const rejected = rejectUpdate(request, 'Too risky');
        expect(rejected.status).toBe('rejected');
        expect(rejected.decisionReason).toBe('Too risky');
    });

    it('Test 15: should throw when approving non-pending request', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        let request = createUpdateRequest(original, updated, null);
        request = approveUpdate(request);

        expect(() => approveUpdate(request)).toThrow('Cannot approve');
    });

    it('Test 16: should throw when rejecting non-pending request', () => {
        const plan = createPlan();
        const request = createUpdateRequest(plan, plan, null);
        // Status is 'draft' since no changes
        expect(() => rejectUpdate(request)).toThrow('Cannot reject');
    });
});

// ============================================================================
// Apply & Rollback Tests
// ============================================================================

describe('PlanUpdates - Apply & Rollback', () => {
    it('Test 17: should apply approved update', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        let request = createUpdateRequest(original, updated, null);
        request = approveUpdate(request);

        const result = applyUpdate(request);
        expect(result.success).toBe(true);
        expect(result.newBreakdown).not.toBeNull();
        expect(result.summary).toContain('Update applied');
    });

    it('Test 18: should fail to apply non-approved update', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        const request = createUpdateRequest(original, updated, null);

        const result = applyUpdate(request);
        expect(result.success).toBe(false);
    });

    it('Test 19: should track cancelled tasks', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        let request = createUpdateRequest(original, updated, null);

        // Add a cancel action manually
        request.taskActions.push({
            taskId: 'MT-001.1', title: 'Old task', currentStatus: 'pending',
            action: 'cancel', reason: 'Feature removed'
        });

        request = approveUpdate(request);
        const result = applyUpdate(request);
        expect(result.cancelledTaskIds).toContain('MT-001.1');
    });

    it('Test 20: should rollback applied update', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        let request = createUpdateRequest(original, updated, null);
        request = approveUpdate(request);
        request = { ...request, status: 'applied' };

        const rolledBack = rollbackUpdate(request);
        expect(rolledBack.status).toBe('rolled_back');
    });

    it('Test 21: should throw rollback without rollback plan', () => {
        const original = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        let request = createUpdateRequest(original, updated, null, { enableRollback: false });
        request = approveUpdate(request);
        request = { ...request, status: 'applied' };

        expect(() => rollbackUpdate(request)).toThrow('No rollback plan');
    });

    it('Test 22: should throw rollback from invalid status', () => {
        const plan = createPlan();
        const request = createUpdateRequest(plan, plan, null);

        expect(() => rollbackUpdate(request)).toThrow('Cannot rollback');
    });
});

// ============================================================================
// History Tests
// ============================================================================

describe('PlanUpdates - History', () => {
    it('Test 23: should create empty history', () => {
        const history = createUpdateHistory(5);
        expect(history.updates).toHaveLength(0);
        expect(history.maxSize).toBe(5);
    });

    it('Test 24: should add to history', () => {
        const history = createUpdateHistory(5);
        const request = createUpdateRequest(createPlan(), createPlan(), null);
        const updated = addToHistory(history, request);
        expect(updated.updates).toHaveLength(1);
    });

    it('Test 25: should trim old entries when over limit', () => {
        let history = createUpdateHistory(2);
        const plan = createPlan();

        for (let i = 0; i < 5; i++) {
            const request = createUpdateRequest(plan, plan, null);
            history = addToHistory(history, request);
        }

        expect(history.updates).toHaveLength(2);
    });

    it('Test 26: should get recent updates', () => {
        let history = createUpdateHistory(10);
        const plan = createPlan();

        for (let i = 0; i < 5; i++) {
            const request = createUpdateRequest(plan, plan, null);
            history = addToHistory(history, request);
        }

        const recent = getRecentUpdates(history, 3);
        expect(recent).toHaveLength(3);
    });
});

// ============================================================================
// Rendering Tests
// ============================================================================

describe('PlanUpdates - Rendering', () => {
    it('Test 27: should render update panel', () => {
        const request = createUpdateRequest(
            createPlan(),
            createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] }),
            null
        );
        const html = renderUpdatePanel(request);
        expect(html).toContain('update-panel');
        expect(html).toContain('Plan Update');
    });

    it('Test 28: should show status badge', () => {
        const request = createUpdateRequest(
            createPlan(),
            createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] }),
            null
        );
        const html = renderUpdatePanel(request);
        expect(html).toContain('PENDING APPROVAL');
    });

    it('Test 29: should show approve/reject buttons when pending', () => {
        const request = createUpdateRequest(
            createPlan(),
            createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] }),
            null
        );
        const html = renderUpdatePanel(request);
        expect(html).toContain('Approve Changes');
        expect(html).toContain('Reject Changes');
    });

    it('Test 30: should show apply button when approved', () => {
        let request = createUpdateRequest(
            createPlan(),
            createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] }),
            null
        );
        request = approveUpdate(request);
        const html = renderUpdatePanel(request);
        expect(html).toContain('Apply Changes');
    });

    it('Test 31: should show rollback button when applied', () => {
        let request = createUpdateRequest(
            createPlan(),
            createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] }),
            null
        );
        request = approveUpdate(request);
        request = { ...request, status: 'applied' };
        const html = renderUpdatePanel(request);
        expect(html).toContain('Rollback');
    });

    it('Test 32: should show impact summary', () => {
        const request = createUpdateRequest(
            createPlan(),
            createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] }),
            null
        );
        const html = renderUpdatePanel(request);
        expect(html).toContain('Impact Summary');
    });

    it('Test 33: should return update panel styles', () => {
        const styles = getUpdatePanelStyles();
        expect(styles).toContain('.update-panel');
        expect(styles).toContain('.btn-approve');
        expect(styles).toContain('.btn-reject');
        expect(styles).toContain('.btn-rollback');
    });
});

// ============================================================================
// Config Tests
// ============================================================================

describe('PlanUpdates - Config', () => {
    it('Test 34: should have sensible defaults', () => {
        expect(DEFAULT_PLAN_UPDATE_CONFIG.autoApproveLowRisk).toBe(false);
        expect(DEFAULT_PLAN_UPDATE_CONFIG.requireApprovalForInProgress).toBe(true);
        expect(DEFAULT_PLAN_UPDATE_CONFIG.enableRollback).toBe(true);
        expect(DEFAULT_PLAN_UPDATE_CONFIG.maxRollbackHistory).toBe(10);
    });

    it('Test 35: should require approval for in-progress tasks', () => {
        const plan = createPlan();
        const updated = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        const session = createRunningSession(plan);

        // Set a task to in_progress
        const taskId = session.breakdown.tasks[0].id;
        const sessionWithInProgress = updateTaskStatus(session, taskId, 'in_progress');

        const request = createUpdateRequest(plan, updated, sessionWithInProgress, {
            requireApprovalForInProgress: true
        });
        expect(request.requiresApproval).toBe(true);
    });
});
