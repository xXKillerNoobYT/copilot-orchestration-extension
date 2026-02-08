/**
 * Plan Handoff Workflow (MT-033.27)
 *
 * Bridges the planning wizard and the orchestrator by exporting a completed
 * plan into executable tasks, assigning them to agent teams, and managing
 * execution lifecycle (start, pause, resume, cancel).
 *
 * **Simple explanation**: The "Execute Plan" button — takes your finished plan,
 * converts it into tasks, hands them to the AI agents, and lets you track
 * progress with pause/resume controls.
 *
 * @module ui/planHandoff
 */

import {
    CompletePlan
} from '../planning/types';

import {
    generateTaskBreakdown,
    TaskBreakdownResult,
    TaskBreakdownConfig,
    MasterTicket,
    AtomicTask,
    TaskStatus,
    AgentTeam
} from '../generators/taskBreakdown';

// ============================================================================
// Types
// ============================================================================

/** Execution state of the plan handoff */
export type ExecutionState = 'idle' | 'preparing' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

/**
 * Progress info for a single master ticket.
 *
 * **Simple explanation**: How far along one feature is.
 */
export interface MasterTicketProgress {
    /** Master ticket ID */
    masterTicketId: string;
    /** Feature name */
    featureName: string;
    /** Total tasks under this feature */
    totalTasks: number;
    /** Completed tasks */
    completedTasks: number;
    /** In-progress tasks */
    inProgressTasks: number;
    /** Blocked tasks */
    blockedTasks: number;
    /** Progress percentage */
    progressPercent: number;
}

/**
 * Overall execution progress.
 *
 * **Simple explanation**: Dashboard data showing how the whole plan is going.
 */
export interface ExecutionProgress {
    /** Current execution state */
    state: ExecutionState;
    /** Total tasks */
    totalTasks: number;
    /** Completed tasks */
    completedTasks: number;
    /** In-progress tasks */
    inProgressTasks: number;
    /** Blocked tasks */
    blockedTasks: number;
    /** Overall progress percentage */
    progressPercent: number;
    /** Per-feature progress */
    featureProgress: MasterTicketProgress[];
    /** Estimated minutes remaining */
    estimatedMinutesRemaining: number;
    /** Execution start time */
    startedAt: Date | null;
    /** Tasks completed per agent team */
    teamProgress: Record<AgentTeam, { total: number; completed: number }>;
}

/**
 * The full handoff session — everything needed to track plan execution.
 *
 * **Simple explanation**: The control center for a plan being executed.
 */
export interface HandoffSession {
    /** Unique session ID */
    id: string;
    /** The plan being executed */
    plan: CompletePlan;
    /** Task breakdown result */
    breakdown: TaskBreakdownResult;
    /** Current task statuses (mutable) */
    taskStatuses: Map<string, TaskStatus>;
    /** Execution state */
    state: ExecutionState;
    /** When execution started */
    startedAt: Date | null;
    /** When execution ended (completed/cancelled/failed) */
    endedAt: Date | null;
    /** Log of state transitions */
    stateLog: Array<{ state: ExecutionState; timestamp: Date; reason: string }>;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new handoff session from a plan.
 *
 * **Simple explanation**: Sets up everything needed to start executing a plan.
 */
export function createHandoffSession(
    plan: CompletePlan,
    config?: Partial<TaskBreakdownConfig>
): HandoffSession {
    const breakdown = generateTaskBreakdown(plan, config);

    const taskStatuses = new Map<string, TaskStatus>();
    for (const task of breakdown.tasks) {
        taskStatuses.set(task.id, task.status);
    }

    return {
        id: `handoff-${Date.now()}`,
        plan,
        breakdown,
        taskStatuses,
        state: 'idle',
        startedAt: null,
        endedAt: null,
        stateLog: [{ state: 'idle', timestamp: new Date(), reason: 'Session created' }]
    };
}

// ============================================================================
// State Transitions
// ============================================================================

/** Valid state transitions */
const VALID_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
    idle: ['preparing', 'cancelled'],
    preparing: ['running', 'cancelled', 'failed'],
    running: ['paused', 'completed', 'cancelled', 'failed'],
    paused: ['running', 'cancelled'],
    completed: [],
    cancelled: [],
    failed: ['preparing'] // Can retry
};

/**
 * Check if a state transition is valid.
 *
 * **Simple explanation**: Makes sure we can't go from "completed" back to "running" etc.
 */
export function isValidTransition(from: ExecutionState, to: ExecutionState): boolean {
    return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Transition a session to a new state.
 *
 * **Simple explanation**: Changes the execution state (e.g., from idle to running)
 * and logs the transition.
 */
export function transitionState(
    session: HandoffSession,
    newState: ExecutionState,
    reason: string
): HandoffSession {
    if (!isValidTransition(session.state, newState)) {
        throw new Error(`Invalid state transition: ${session.state} → ${newState}`);
    }

    const now = new Date();
    const updatedSession = { ...session };
    updatedSession.state = newState;
    updatedSession.stateLog = [
        ...session.stateLog,
        { state: newState, timestamp: now, reason }
    ];

    if (newState === 'running' && !session.startedAt) {
        updatedSession.startedAt = now;
    }
    if (newState === 'completed' || newState === 'cancelled' || newState === 'failed') {
        updatedSession.endedAt = now;
    }

    return updatedSession;
}

// ============================================================================
// Execution Control
// ============================================================================

/**
 * Start plan execution — prepare and begin.
 *
 * **Simple explanation**: Presses the "Go" button on the plan.
 */
export function startExecution(session: HandoffSession): HandoffSession {
    let updated = transitionState(session, 'preparing', 'Starting plan execution');
    updated = transitionState(updated, 'running', 'Execution started');
    return updated;
}

/**
 * Pause execution.
 *
 * **Simple explanation**: Temporary stops — agents finish their current task but don't pick up new ones.
 */
export function pauseExecution(session: HandoffSession): HandoffSession {
    return transitionState(session, 'paused', 'Execution paused by user');
}

/**
 * Resume execution after pause.
 *
 * **Simple explanation**: Unpauses — agents start picking up tasks again.
 */
export function resumeExecution(session: HandoffSession): HandoffSession {
    return transitionState(session, 'running', 'Execution resumed by user');
}

/**
 * Cancel execution.
 *
 * **Simple explanation**: Stops everything permanently.
 */
export function cancelExecution(session: HandoffSession): HandoffSession {
    return transitionState(session, 'cancelled', 'Execution cancelled by user');
}

// ============================================================================
// Task Status Management
// ============================================================================

/**
 * Update a task's status within a session.
 *
 * **Simple explanation**: Marks a task as done, in-progress, blocked, etc.
 */
export function updateTaskStatus(
    session: HandoffSession,
    taskId: string,
    newStatus: TaskStatus
): HandoffSession {
    if (!session.taskStatuses.has(taskId)) {
        throw new Error(`Task ${taskId} not found in session`);
    }

    const updatedStatuses = new Map(session.taskStatuses);
    updatedStatuses.set(taskId, newStatus);

    const updated = { ...session, taskStatuses: updatedStatuses };

    // Auto-complete session if all tasks are done
    const allDone = Array.from(updatedStatuses.values()).every(s => s === 'done');
    if (allDone && updated.state === 'running') {
        return transitionState(updated, 'completed', 'All tasks completed');
    }

    return updated;
}

/**
 * Find the next available tasks that can be started.
 *
 * **Simple explanation**: Looks at the dependency graph and returns tasks whose
 * prerequisites are all done and that haven't been started yet.
 */
export function getNextAvailableTasks(session: HandoffSession): AtomicTask[] {
    if (session.state !== 'running') { return []; }

    const available: AtomicTask[] = [];

    for (const task of session.breakdown.tasks) {
        const status = session.taskStatuses.get(task.id);
        if (status !== 'pending' && status !== 'ready') { continue; }

        // Check if all dependencies are done
        const deps = session.breakdown.dependencyGraph.get(task.id) ?? [];
        const allDepsDone = deps.every(depId => session.taskStatuses.get(depId) === 'done');

        if (allDepsDone) {
            available.push(task);
        }
    }

    return available;
}

/**
 * Reassign a task to a different agent team.
 *
 * **Simple explanation**: Moves a task from one AI team to another (e.g., from
 * coding to verification).
 */
export function reassignTask(
    session: HandoffSession,
    taskId: string,
    newTeam: AgentTeam
): HandoffSession {
    const taskIndex = session.breakdown.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
        throw new Error(`Task ${taskId} not found in session`);
    }

    const updatedTasks = [...session.breakdown.tasks];
    updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], assignedTeam: newTeam };

    return {
        ...session,
        breakdown: { ...session.breakdown, tasks: updatedTasks }
    };
}

// ============================================================================
// Progress Calculation
// ============================================================================

/**
 * Calculate current execution progress.
 *
 * **Simple explanation**: Counts up how many tasks are done, in progress, blocked,
 * and calculates percentages for each feature.
 */
export function calculateProgress(session: HandoffSession): ExecutionProgress {
    const statuses = session.taskStatuses;
    const tasks = session.breakdown.tasks;

    let completedTasks = 0;
    let inProgressTasks = 0;
    let blockedTasks = 0;

    for (const status of statuses.values()) {
        if (status === 'done') { completedTasks++; }
        else if (status === 'in_progress' || status === 'verification') { inProgressTasks++; }
        else if (status === 'blocked') { blockedTasks++; }
    }

    const totalTasks = tasks.length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Per-feature progress
    const featureProgress: MasterTicketProgress[] = session.breakdown.masterTickets.map(mt => {
        const featureTasks = tasks.filter(t => t.parentId === mt.id);
        const featureCompleted = featureTasks.filter(t => statuses.get(t.id) === 'done').length;
        const featureInProgress = featureTasks.filter(t => {
            const s = statuses.get(t.id);
            return s === 'in_progress' || s === 'verification';
        }).length;
        const featureBlocked = featureTasks.filter(t => statuses.get(t.id) === 'blocked').length;

        return {
            masterTicketId: mt.id,
            featureName: mt.title,
            totalTasks: featureTasks.length,
            completedTasks: featureCompleted,
            inProgressTasks: featureInProgress,
            blockedTasks: featureBlocked,
            progressPercent: featureTasks.length > 0
                ? Math.round((featureCompleted / featureTasks.length) * 100)
                : 0
        };
    });

    // Per-team progress
    const teamProgress: Record<AgentTeam, { total: number; completed: number }> = {
        planning: { total: 0, completed: 0 },
        coding: { total: 0, completed: 0 },
        verification: { total: 0, completed: 0 },
        research: { total: 0, completed: 0 },
        orchestrator: { total: 0, completed: 0 }
    };

    for (const task of tasks) {
        teamProgress[task.assignedTeam].total++;
        if (statuses.get(task.id) === 'done') {
            teamProgress[task.assignedTeam].completed++;
        }
    }

    // Estimate remaining time
    const remainingTasks = tasks.filter(t => statuses.get(t.id) !== 'done');
    const estimatedMinutesRemaining = remainingTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);

    return {
        state: session.state,
        totalTasks,
        completedTasks,
        inProgressTasks,
        blockedTasks,
        progressPercent,
        featureProgress,
        estimatedMinutesRemaining,
        startedAt: session.startedAt,
        teamProgress
    };
}

// ============================================================================
// HTML Rendering
// ============================================================================

/**
 * Render the handoff panel HTML.
 *
 * **Simple explanation**: Creates the visual interface for the "Execute Plan" workflow,
 * showing progress bars, control buttons, and per-feature status.
 */
export function renderHandoffPanel(session: HandoffSession): string {
    const progress = calculateProgress(session);

    const stateColors: Record<ExecutionState, string> = {
        idle: '#6c757d',
        preparing: '#ffc107',
        running: '#28a745',
        paused: '#fd7e14',
        completed: '#0d6efd',
        cancelled: '#dc3545',
        failed: '#dc3545'
    };

    return `<div class="handoff-panel">
  <div class="handoff-header">
    <h2>Plan Execution</h2>
    <span class="state-badge" style="background: ${stateColors[progress.state]}">
      ${progress.state.toUpperCase()}
    </span>
  </div>

  <div class="handoff-progress">
    <div class="progress-bar-container">
      <div class="progress-bar" style="width: ${progress.progressPercent}%"></div>
    </div>
    <div class="progress-stats">
      <span>${progress.completedTasks}/${progress.totalTasks} tasks completed (${progress.progressPercent}%)</span>
      <span>${progress.estimatedMinutesRemaining} min remaining</span>
    </div>
  </div>

  <div class="handoff-controls">
    ${progress.state === 'idle' ? '<button class="btn-start" data-action="start">▶ Execute Plan</button>' : ''}
    ${progress.state === 'running' ? '<button class="btn-pause" data-action="pause">⏸ Pause</button>' : ''}
    ${progress.state === 'paused' ? '<button class="btn-resume" data-action="resume">▶ Resume</button>' : ''}
    ${progress.state === 'running' || progress.state === 'paused' ? '<button class="btn-cancel" data-action="cancel">⏹ Cancel</button>' : ''}
  </div>

  <div class="handoff-features">
    <h3>Feature Progress</h3>
    ${progress.featureProgress.map(fp => `
    <div class="feature-row">
      <span class="feature-name">${fp.featureName}</span>
      <div class="feature-progress-bar">
        <div class="feature-fill" style="width: ${fp.progressPercent}%"></div>
      </div>
      <span class="feature-count">${fp.completedTasks}/${fp.totalTasks}</span>
    </div>`).join('\n')}
  </div>

  <div class="handoff-teams">
    <h3>Agent Teams</h3>
    ${Object.entries(progress.teamProgress)
      .filter(([, data]) => data.total > 0)
      .map(([team, data]) => `
    <div class="team-row">
      <span class="team-name">${team}</span>
      <span class="team-count">${data.completed}/${data.total}</span>
    </div>`).join('\n')}
  </div>
</div>`;
}

/**
 * Get handoff panel styles.
 *
 * **Simple explanation**: Returns CSS for styling the execution panel.
 */
export function getHandoffPanelStyles(): string {
    return `.handoff-panel {
  font-family: var(--vscode-font-family);
  padding: 16px;
}
.handoff-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.state-badge { padding: 4px 12px; border-radius: 12px; color: white; font-size: 11px; font-weight: bold; }
.handoff-progress { margin-bottom: 16px; }
.progress-bar-container { height: 20px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 10px; overflow: hidden; }
.progress-bar { height: 100%; background: var(--vscode-progressBar-background); transition: width 0.3s ease; }
.progress-stats { display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; color: var(--vscode-descriptionForeground); }
.handoff-controls { display: flex; gap: 8px; margin-bottom: 16px; }
.handoff-controls button { padding: 6px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
.btn-start { background: #28a745; color: white; }
.btn-pause { background: #fd7e14; color: white; }
.btn-resume { background: #28a745; color: white; }
.btn-cancel { background: #dc3545; color: white; }
.handoff-features { margin-bottom: 16px; }
.feature-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.feature-name { flex: 1; font-size: 13px; }
.feature-progress-bar { width: 120px; height: 8px; background: var(--vscode-editor-background); border-radius: 4px; overflow: hidden; }
.feature-fill { height: 100%; background: var(--vscode-progressBar-background); }
.feature-count { font-size: 12px; color: var(--vscode-descriptionForeground); min-width: 40px; text-align: right; }
.handoff-teams { margin-bottom: 16px; }
.team-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.team-name { text-transform: capitalize; }
.team-count { color: var(--vscode-descriptionForeground); }
`;
}
