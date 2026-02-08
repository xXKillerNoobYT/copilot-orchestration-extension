/**
 * Plan Update Workflow (MT-033.29)
 *
 * Manages the workflow for editing a plan that's already being executed.
 * Shows impact of changes, requires approval for in-progress tasks, and
 * updates the orchestrator's task breakdown accordingly.
 *
 * **Simple explanation**: Like updating a blueprint while construction is
 * happening — carefully! Lets you edit a running plan, see what's affected,
 * approve the changes, and update all the tasks automatically.
 *
 * @module ui/planUpdates
 */

import { CompletePlan } from '../planning/types';

import {
    generateTaskBreakdown,
    TaskBreakdownResult,
    MasterTicket,
    AtomicTask,
    AgentTeam
} from '../generators/taskBreakdown';

import {
    analyzeChangeImpact,
    ChangeAnalysisResult,
    ChangeAnalysisConfig,
    RiskLevel
} from './changeAnalysis';

import {
    HandoffSession,
    ExecutionState
} from './planHandoff';

// ============================================================================
// Types
// ============================================================================

/** Status of the update workflow */
export type UpdateStatus = 'draft' | 'analyzing' | 'pending_approval' | 'approved' | 'applying' | 'applied' | 'rejected' | 'rolled_back';

/** What action to take on a task affected by the change */
export type TaskAction = 'keep' | 'reassign' | 'cancel' | 'recreate' | 'update';

/**
 * A proposed action for one affected task.
 *
 * **Simple explanation**: What should happen to this task because of the change.
 */
export interface TaskActionItem {
    /** Task ID */
    taskId: string;
    /** Task title */
    title: string;
    /** Current status */
    currentStatus: string;
    /** Proposed action */
    action: TaskAction;
    /** Reason for this action */
    reason: string;
    /** New team assignment (if reassigning) */
    newTeam?: AgentTeam;
}

/**
 * A planned update to the execution session.
 *
 * **Simple explanation**: The full change plan — what edits were made, what
 * tasks need to change, and whether it's been approved.
 */
export interface PlanUpdateRequest {
    /** Unique update ID */
    id: string;
    /** When the update was created */
    createdAt: Date;
    /** The original plan */
    originalPlan: CompletePlan;
    /** The updated plan */
    updatedPlan: CompletePlan;
    /** Impact analysis result */
    impact: ChangeAnalysisResult;
    /** Proposed task actions */
    taskActions: TaskActionItem[];
    /** Update status */
    status: UpdateStatus;
    /** Whether approval is required */
    requiresApproval: boolean;
    /** Approval/rejection reason */
    decisionReason: string | null;
    /** When the update was applied */
    appliedAt: Date | null;
    /** Rollback snapshot (the original plan for undo) */
    rollbackPlan: CompletePlan | null;
}

/**
 * Configuration for plan updates.
 *
 * **Simple explanation**: Settings for how plan updates work.
 */
export interface PlanUpdateConfig {
    /** Auto-approve low-risk changes */
    autoApproveLowRisk: boolean;
    /** Require approval for in-progress task changes */
    requireApprovalForInProgress: boolean;
    /** Whether to keep rollback history */
    enableRollback: boolean;
    /** Max number of rollback snapshots */
    maxRollbackHistory: number;
}

/** Default configuration */
export const DEFAULT_PLAN_UPDATE_CONFIG: PlanUpdateConfig = {
    autoApproveLowRisk: false,
    requireApprovalForInProgress: true,
    enableRollback: true,
    maxRollbackHistory: 10
};

/**
 * Result of applying an update.
 *
 * **Simple explanation**: What happened when the changes were applied.
 */
export interface UpdateApplyResult {
    /** Whether the update was successfully applied */
    success: boolean;
    /** New task breakdown reflecting the updated plan */
    newBreakdown: TaskBreakdownResult | null;
    /** Tasks that were cancelled */
    cancelledTaskIds: string[];
    /** Tasks that were recreated */
    recreatedTaskIds: string[];
    /** Tasks that were reassigned */
    reassignedTaskIds: string[];
    /** Summary message */
    summary: string;
    /** Any warnings */
    warnings: string[];
}

// ============================================================================
// Update Workflow
// ============================================================================

/**
 * Create a plan update request.
 *
 * **Simple explanation**: Starts the update process — analyzes the changes
 * and proposes what should happen to each affected task.
 */
export function createUpdateRequest(
    originalPlan: CompletePlan,
    updatedPlan: CompletePlan,
    session: HandoffSession | null,
    config: Partial<PlanUpdateConfig> = {}
): PlanUpdateRequest {
    const cfg = { ...DEFAULT_PLAN_UPDATE_CONFIG, ...config };

    // Analyze impact
    const impact = analyzeChangeImpact(originalPlan, updatedPlan);

    // Propose task actions
    const taskActions = proposeTaskActions(impact, session);

    // Determine if approval is needed
    const hasInProgressTasks = taskActions.some(
        a => a.currentStatus === 'in_progress' || a.currentStatus === 'verification'
    );
    const requiresApproval = cfg.requireApprovalForInProgress && hasInProgressTasks
        || impact.overallRisk !== 'low'
        || !cfg.autoApproveLowRisk;

    return {
        id: `update-${Date.now()}`,
        createdAt: new Date(),
        originalPlan,
        updatedPlan,
        impact,
        taskActions,
        status: impact.changes.length > 0 ? 'pending_approval' : 'draft',
        requiresApproval,
        decisionReason: null,
        appliedAt: null,
        rollbackPlan: cfg.enableRollback ? originalPlan : null
    };
}

/**
 * Propose actions for tasks affected by the changes.
 *
 * **Simple explanation**: For each affected task, decides whether to keep it,
 * cancel it, recreate it, or reassign it.
 */
export function proposeTaskActions(
    impact: ChangeAnalysisResult,
    session: HandoffSession | null
): TaskActionItem[] {
    const actions: TaskActionItem[] = [];

    for (const item of impact.affectedItems) {
        if (item.type !== 'task' && item.type !== 'masterTicket') { continue; }

        const currentStatus = session
            ? (session.taskStatuses.get(item.id) ?? 'pending')
            : 'pending';

        const change = impact.changes.find(c =>
            c.elementId === item.id || impact.affectedItems.some(a => a.id === item.id)
        );

        const action = determineTaskAction(currentStatus, change?.changeKind ?? 'modified', item.severity);

        actions.push({
            taskId: item.id,
            title: item.name,
            currentStatus,
            action,
            reason: item.reason
        });
    }

    return actions;
}

/**
 * Determine what action to take on a task.
 *
 * **Simple explanation**: If a task is done, keep it. If it's pending and the
 * feature was removed, cancel it. If it was modified, update or recreate it.
 */
export function determineTaskAction(
    currentStatus: string,
    changeKind: string,
    severity: RiskLevel
): TaskAction {
    // Done tasks are kept
    if (currentStatus === 'done') { return 'keep'; }

    // Removed elements → cancel pending/ready tasks
    if (changeKind === 'removed') {
        return currentStatus === 'in_progress' ? 'reassign' : 'cancel';
    }

    // Modified elements
    if (changeKind === 'modified') {
        if (currentStatus === 'in_progress' || currentStatus === 'verification') {
            return severity === 'high' || severity === 'critical' ? 'reassign' : 'update';
        }
        return severity === 'high' || severity === 'critical' ? 'recreate' : 'update';
    }

    // Added elements → keep (they'll create new tasks)
    return 'keep';
}

// ============================================================================
// Approval Workflow
// ============================================================================

/**
 * Approve a plan update request.
 *
 * **Simple explanation**: Gives the green light to apply the changes.
 */
export function approveUpdate(
    request: PlanUpdateRequest,
    reason: string = 'Approved'
): PlanUpdateRequest {
    if (request.status !== 'pending_approval') {
        throw new Error(`Cannot approve update in ${request.status} status`);
    }

    return {
        ...request,
        status: 'approved',
        decisionReason: reason
    };
}

/**
 * Reject a plan update request.
 *
 * **Simple explanation**: Blocks the changes from being applied.
 */
export function rejectUpdate(
    request: PlanUpdateRequest,
    reason: string = 'Rejected'
): PlanUpdateRequest {
    if (request.status !== 'pending_approval') {
        throw new Error(`Cannot reject update in ${request.status} status`);
    }

    return {
        ...request,
        status: 'rejected',
        decisionReason: reason
    };
}

// ============================================================================
// Apply & Rollback
// ============================================================================

/**
 * Apply an approved update to regenerate the task breakdown.
 *
 * **Simple explanation**: Executes the approved changes — regenerates tasks,
 * cancels old ones, creates new ones.
 */
export function applyUpdate(
    request: PlanUpdateRequest
): UpdateApplyResult {
    if (request.status !== 'approved') {
        return {
            success: false,
            newBreakdown: null,
            cancelledTaskIds: [],
            recreatedTaskIds: [],
            reassignedTaskIds: [],
            summary: `Cannot apply update in ${request.status} status`,
            warnings: []
        };
    }

    const warnings: string[] = [];
    const cancelledTaskIds: string[] = [];
    const recreatedTaskIds: string[] = [];
    const reassignedTaskIds: string[] = [];

    // Process task actions
    for (const action of request.taskActions) {
        switch (action.action) {
            case 'cancel':
                cancelledTaskIds.push(action.taskId);
                break;
            case 'recreate':
                recreatedTaskIds.push(action.taskId);
                break;
            case 'reassign':
                reassignedTaskIds.push(action.taskId);
                break;
            case 'update':
                // Will be handled by new breakdown
                break;
            case 'keep':
                // No action needed
                break;
        }
    }

    // Generate new breakdown from updated plan
    let newBreakdown: TaskBreakdownResult | null = null;
    try {
        newBreakdown = generateTaskBreakdown(request.updatedPlan, { generateTestTasks: false });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to generate new breakdown: ${msg}`);
    }

    const summary = [
        `Update applied.`,
        cancelledTaskIds.length > 0 ? `${cancelledTaskIds.length} task(s) cancelled.` : '',
        recreatedTaskIds.length > 0 ? `${recreatedTaskIds.length} task(s) recreated.` : '',
        reassignedTaskIds.length > 0 ? `${reassignedTaskIds.length} task(s) reassigned.` : '',
        newBreakdown ? `${newBreakdown.tasks.length} task(s) in new breakdown.` : ''
    ].filter(Boolean).join(' ');

    return {
        success: true,
        newBreakdown,
        cancelledTaskIds,
        recreatedTaskIds,
        reassignedTaskIds,
        summary,
        warnings
    };
}

/**
 * Rollback to the original plan.
 *
 * **Simple explanation**: Undoes the update and goes back to the original plan.
 */
export function rollbackUpdate(
    request: PlanUpdateRequest
): PlanUpdateRequest {
    if (!request.rollbackPlan) {
        throw new Error('No rollback plan available');
    }

    if (request.status !== 'applied' && request.status !== 'approved') {
        throw new Error(`Cannot rollback update in ${request.status} status`);
    }

    return {
        ...request,
        status: 'rolled_back',
        decisionReason: 'Rolled back to original plan'
    };
}

// ============================================================================
// Update History
// ============================================================================

/**
 * Manages update history with a max size.
 *
 * **Simple explanation**: Keeps track of past updates with a limit
 * so you can review what changed over time.
 */
export interface UpdateHistory {
    /** All update requests */
    updates: PlanUpdateRequest[];
    /** Max history size */
    maxSize: number;
}

/**
 * Create an empty update history.
 */
export function createUpdateHistory(maxSize: number = 10): UpdateHistory {
    return { updates: [], maxSize };
}

/**
 * Add an update to history, trimming old entries if over limit.
 */
export function addToHistory(
    history: UpdateHistory,
    update: PlanUpdateRequest
): UpdateHistory {
    const updates = [update, ...history.updates].slice(0, history.maxSize);
    return { ...history, updates };
}

/**
 * Get the last N updates from history.
 */
export function getRecentUpdates(
    history: UpdateHistory,
    count: number = 5
): PlanUpdateRequest[] {
    return history.updates.slice(0, count);
}

// ============================================================================
// HTML Rendering
// ============================================================================

/**
 * Render the plan update panel.
 *
 * **Simple explanation**: Creates the visual interface for the plan update workflow.
 */
export function renderUpdatePanel(request: PlanUpdateRequest): string {
    const statusColors: Record<UpdateStatus, string> = {
        draft: '#6c757d',
        analyzing: '#ffc107',
        pending_approval: '#fd7e14',
        approved: '#28a745',
        applying: '#0d6efd',
        applied: '#28a745',
        rejected: '#dc3545',
        rolled_back: '#6c757d'
    };

    const actionCounts = countActions(request.taskActions);

    return `<div class="update-panel">
  <div class="update-header">
    <h2>Plan Update</h2>
    <span class="update-status" style="background: ${statusColors[request.status]}">
      ${request.status.replace(/_/g, ' ').toUpperCase()}
    </span>
  </div>

  <div class="update-impact">
    <h3>Impact Summary</h3>
    <div class="impact-stats">
      <span>${request.impact.changes.length} changes</span>
      <span>${request.impact.summary.totalAffected} affected items</span>
      <span class="risk-${request.impact.overallRisk}">${request.impact.overallRisk.toUpperCase()} risk</span>
    </div>
  </div>

  <div class="update-actions">
    <h3>Task Actions (${request.taskActions.length})</h3>
    <div class="action-summary">
      ${actionCounts.keep > 0 ? `<span class="action-keep">${actionCounts.keep} keep</span>` : ''}
      ${actionCounts.update > 0 ? `<span class="action-update">${actionCounts.update} update</span>` : ''}
      ${actionCounts.cancel > 0 ? `<span class="action-cancel">${actionCounts.cancel} cancel</span>` : ''}
      ${actionCounts.recreate > 0 ? `<span class="action-recreate">${actionCounts.recreate} recreate</span>` : ''}
      ${actionCounts.reassign > 0 ? `<span class="action-reassign">${actionCounts.reassign} reassign</span>` : ''}
    </div>
    ${request.taskActions.map(a => `
    <div class="task-action-row action-${a.action}">
      <span class="action-badge">${a.action.toUpperCase()}</span>
      <span class="task-title">${a.title}</span>
      <span class="task-status">${a.currentStatus}</span>
    </div>`).join('\n')}
  </div>

  <div class="update-controls">
    ${request.status === 'pending_approval' ? `
    <button class="btn-approve" data-action="approve">✓ Approve Changes</button>
    <button class="btn-reject" data-action="reject">✗ Reject Changes</button>` : ''}
    ${request.status === 'approved' ? `
    <button class="btn-apply" data-action="apply">▶ Apply Changes</button>` : ''}
    ${request.status === 'applied' && request.rollbackPlan ? `
    <button class="btn-rollback" data-action="rollback">↶ Rollback</button>` : ''}
  </div>
</div>`;
}

/**
 * Get update panel styles.
 *
 * **Simple explanation**: Returns CSS for the plan update panel.
 */
export function getUpdatePanelStyles(): string {
    return `.update-panel {
  font-family: var(--vscode-font-family);
  padding: 16px;
}
.update-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.update-status { padding: 4px 12px; border-radius: 12px; color: white; font-size: 11px; font-weight: bold; }
.update-impact { margin-bottom: 16px; }
.impact-stats { display: flex; gap: 12px; font-size: 13px; }
.risk-low { color: #28a745; }
.risk-medium { color: #ffc107; }
.risk-high { color: #fd7e14; }
.risk-critical { color: #dc3545; }
.update-actions { margin-bottom: 16px; }
.action-summary { display: flex; gap: 8px; margin-bottom: 8px; }
.action-summary span { padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.action-keep { background: #e8f5e9; color: #2e7d32; }
.action-update { background: #fff3e0; color: #ef6c00; }
.action-cancel { background: #ffebee; color: #c62828; }
.action-recreate { background: #e3f2fd; color: #1565c0; }
.action-reassign { background: #f3e5f5; color: #7b1fa2; }
.task-action-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--vscode-panel-border); }
.action-badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; min-width: 60px; text-align: center; }
.task-title { flex: 1; font-size: 13px; }
.task-status { font-size: 11px; color: var(--vscode-descriptionForeground); }
.update-controls { display: flex; gap: 8px; margin-top: 16px; }
.update-controls button { padding: 6px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
.btn-approve { background: #28a745; color: white; }
.btn-reject { background: #dc3545; color: white; }
.btn-apply { background: #0d6efd; color: white; }
.btn-rollback { background: #6c757d; color: white; }
`;
}

// ============================================================================
// Helpers
// ============================================================================

/** Count task actions by type */
function countActions(actions: TaskActionItem[]): Record<TaskAction, number> {
    const counts: Record<TaskAction, number> = { keep: 0, reassign: 0, cancel: 0, recreate: 0, update: 0 };
    for (const action of actions) {
        counts[action.action]++;
    }
    return counts;
}
