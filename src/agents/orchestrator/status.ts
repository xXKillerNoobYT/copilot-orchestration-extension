/**
 * Task Status State Machine
 * 
 * **Simple explanation**: Manages valid task state transitions like
 * "pending → in-progress → verification → done/failed". Prevents
 * invalid transitions that could corrupt the workflow.
 * 
 * @module agents/orchestrator/status
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Valid task statuses
 */
export type TaskStatus = 
    | 'pending'           // Task created, waiting in queue
    | 'blocked'           // Blocked by dependencies
    | 'ready'             // Dependencies met, ready to start
    | 'in-progress'       // Coding AI is working on it
    | 'verification'      // Waiting for verification
    | 'needs-revision'    // Verification failed, needs work
    | 'done'              // Task completed successfully
    | 'failed'            // Task failed permanently
    | 'cancelled';        // Task cancelled

/**
 * State transition definition
 */
interface Transition {
    from: TaskStatus;
    to: TaskStatus;
    trigger: string;
    conditions?: string[];
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Transition[] = [
    // Initial states
    { from: 'pending', to: 'blocked', trigger: 'dependencies-detected' },
    { from: 'pending', to: 'ready', trigger: 'no-dependencies' },
    
    // Dependency resolution
    { from: 'blocked', to: 'ready', trigger: 'dependencies-resolved' },
    { from: 'blocked', to: 'cancelled', trigger: 'cancel' },
    
    // Work assignment
    { from: 'ready', to: 'in-progress', trigger: 'assigned' },
    { from: 'ready', to: 'cancelled', trigger: 'cancel' },
    
    // Task completion
    { from: 'in-progress', to: 'verification', trigger: 'coding-complete' },
    { from: 'in-progress', to: 'failed', trigger: 'fatal-error' },
    { from: 'in-progress', to: 'cancelled', trigger: 'cancel' },
    
    // Verification outcomes
    { from: 'verification', to: 'done', trigger: 'verification-passed' },
    { from: 'verification', to: 'needs-revision', trigger: 'verification-failed' },
    { from: 'verification', to: 'failed', trigger: 'max-retries-exceeded' },
    
    // Revision cycle
    { from: 'needs-revision', to: 'in-progress', trigger: 'revision-started' },
    { from: 'needs-revision', to: 'cancelled', trigger: 'cancel' },
    { from: 'needs-revision', to: 'failed', trigger: 'max-retries-exceeded' },
    
    // Recovery transitions
    { from: 'failed', to: 'pending', trigger: 'retry-requested' },
];

/**
 * Task state machine event
 */
export interface StateEvent {
    taskId: string;
    fromStatus: TaskStatus;
    toStatus: TaskStatus;
    trigger: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

/**
 * Task Status Manager
 * 
 * **Simple explanation**: Think of this as a traffic cop that only
 * allows valid state changes. You can't go from "done" back to "pending"
 * without special permission.
 */
export class TaskStatusManager {
    private statusHistory: Map<string, StateEvent[]> = new Map();
    private currentStatus: Map<string, TaskStatus> = new Map();

    /**
     * Initialize task with starting status
     */
    initializeTask(taskId: string, hasDependencies: boolean): TaskStatus {
        const initialStatus: TaskStatus = hasDependencies ? 'blocked' : 'ready';
        this.currentStatus.set(taskId, initialStatus);
        
        this.recordTransition({
            taskId,
            fromStatus: 'pending' as TaskStatus,
            toStatus: initialStatus,
            trigger: hasDependencies ? 'dependencies-detected' : 'no-dependencies',
            timestamp: new Date()
        });
        
        logInfo(`[TaskStatus] Task ${taskId} initialized as ${initialStatus}`);
        return initialStatus;
    }

    /**
     * Get current status of a task
     */
    getStatus(taskId: string): TaskStatus | undefined {
        return this.currentStatus.get(taskId);
    }

    /**
     * Attempt a state transition
     */
    transition(taskId: string, trigger: string, metadata?: Record<string, unknown>): TaskStatus | null {
        const currentStatus = this.currentStatus.get(taskId);
        if (!currentStatus) {
            logWarn(`[TaskStatus] Task ${taskId} not found`);
            return null;
        }

        // Find valid transition
        const transition = VALID_TRANSITIONS.find(
            t => t.from === currentStatus && t.trigger === trigger
        );

        if (!transition) {
            logWarn(`[TaskStatus] Invalid transition: ${currentStatus} --[${trigger}]--> ? for task ${taskId}`);
            return null;
        }

        // Execute transition
        this.currentStatus.set(taskId, transition.to);
        
        this.recordTransition({
            taskId,
            fromStatus: currentStatus,
            toStatus: transition.to,
            trigger,
            timestamp: new Date(),
            metadata
        });

        logInfo(`[TaskStatus] ${taskId}: ${currentStatus} → ${transition.to} (${trigger})`);
        return transition.to;
    }

    /**
     * Check if a transition is valid
     */
    canTransition(taskId: string, trigger: string): boolean {
        const currentStatus = this.currentStatus.get(taskId);
        if (!currentStatus) {
            return false;
        }

        return VALID_TRANSITIONS.some(
            t => t.from === currentStatus && t.trigger === trigger
        );
    }

    /**
     * Get valid triggers for current state
     */
    getValidTriggers(taskId: string): string[] {
        const currentStatus = this.currentStatus.get(taskId);
        if (!currentStatus) {
            return [];
        }

        return VALID_TRANSITIONS
            .filter(t => t.from === currentStatus)
            .map(t => t.trigger);
    }

    /**
     * Get task history
     */
    getHistory(taskId: string): StateEvent[] {
        return this.statusHistory.get(taskId) || [];
    }

    /**
     * Force a status (admin override)
     */
    forceStatus(taskId: string, status: TaskStatus, reason: string): void {
        const currentStatus = this.currentStatus.get(taskId) || ('pending' as TaskStatus);
        this.currentStatus.set(taskId, status);
        
        this.recordTransition({
            taskId,
            fromStatus: currentStatus,
            toStatus: status,
            trigger: `force:${reason}`,
            timestamp: new Date(),
            metadata: { forced: true, reason }
        });

        logWarn(`[TaskStatus] FORCED ${taskId}: ${currentStatus} → ${status} (${reason})`);
    }

    /**
     * Remove task from tracking
     */
    removeTask(taskId: string): void {
        this.currentStatus.delete(taskId);
        this.statusHistory.delete(taskId);
    }

    /**
     * Get all tasks with a specific status
     */
    getTasksByStatus(status: TaskStatus): string[] {
        const tasks: string[] = [];
        for (const [taskId, taskStatus] of this.currentStatus) {
            if (taskStatus === status) {
                tasks.push(taskId);
            }
        }
        return tasks;
    }

    /**
     * Get summary of all task statuses
     */
    getSummary(): Record<TaskStatus, number> {
        const summary: Record<TaskStatus, number> = {
            'pending': 0,
            'blocked': 0,
            'ready': 0,
            'in-progress': 0,
            'verification': 0,
            'needs-revision': 0,
            'done': 0,
            'failed': 0,
            'cancelled': 0
        };

        for (const status of this.currentStatus.values()) {
            summary[status]++;
        }

        return summary;
    }

    /**
     * Record transition to history
     */
    private recordTransition(event: StateEvent): void {
        const history = this.statusHistory.get(event.taskId) || [];
        history.push(event);
        this.statusHistory.set(event.taskId, history);
    }

    /**
     * Calculate time spent in each status
     */
    getTimeInStatus(taskId: string): Record<TaskStatus, number> {
        const history = this.getHistory(taskId);
        const times: Record<TaskStatus, number> = {
            'pending': 0,
            'blocked': 0,
            'ready': 0,
            'in-progress': 0,
            'verification': 0,
            'needs-revision': 0,
            'done': 0,
            'failed': 0,
            'cancelled': 0
        };

        for (let i = 0; i < history.length - 1; i++) {
            const event = history[i];
            const nextEvent = history[i + 1];
            const duration = nextEvent.timestamp.getTime() - event.timestamp.getTime();
            times[event.toStatus] += duration;
        }

        return times;
    }
}

// Singleton instance
let instance: TaskStatusManager | null = null;

/**
 * Get singleton instance
 */
export function getTaskStatusManager(): TaskStatusManager {
    if (!instance) {
        instance = new TaskStatusManager();
    }
    return instance;
}

/**
 * Reset for tests
 */
export function resetTaskStatusManager(): void {
    instance = null;
}

/**
 * Trigger constants for type safety
 */
export const TRIGGERS = {
    DEPENDENCIES_DETECTED: 'dependencies-detected',
    NO_DEPENDENCIES: 'no-dependencies',
    DEPENDENCIES_RESOLVED: 'dependencies-resolved',
    ASSIGNED: 'assigned',
    CODING_COMPLETE: 'coding-complete',
    VERIFICATION_PASSED: 'verification-passed',
    VERIFICATION_FAILED: 'verification-failed',
    REVISION_STARTED: 'revision-started',
    MAX_RETRIES_EXCEEDED: 'max-retries-exceeded',
    FATAL_ERROR: 'fatal-error',
    CANCEL: 'cancel',
    RETRY_REQUESTED: 'retry-requested'
} as const;
