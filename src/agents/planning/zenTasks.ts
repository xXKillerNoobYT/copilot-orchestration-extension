/**
 * ZenTasks Workflow Integration for Planning Team
 * 
 * **Simple explanation**: This module implements the "ZenTasks" workflow pattern -
 * a clean, focused approach to task management that minimizes context switching
 * and keeps developers in a productive flow state.
 * 
 * @module agents/planning/zenTasks
 */

import { logInfo, logWarn } from '../../logger';
import type { AtomicTask } from './decomposer';

/**
 * ZenTasks workflow state
 */
export type ZenTaskState =
    | 'zen_ready'       // Task is prepared and ready to start
    | 'zen_focus'       // Developer is actively working
    | 'zen_pause'       // Temporary pause (break, question pending)
    | 'zen_review'      // Self-review before completion
    | 'zen_complete';   // Task finished, ready for verification

/**
 * Task transition in ZenTasks workflow
 */
export interface ZenTransition {
    /** From state */
    from: ZenTaskState;
    /** To state */
    to: ZenTaskState;
    /** Transition name */
    name: string;
    /** Required action */
    action: string;
}

/**
 * ZenTask (enhanced task with workflow state)
 */
export interface ZenTask extends AtomicTask {
    /** Current ZenTasks state */
    zenState: ZenTaskState;
    /** Time entered current state */
    stateEnteredAt: Date;
    /** Focus session count */
    focusSessions: number;
    /** Total focus time in minutes */
    totalFocusMinutes: number;
    /** Interruptions (pauses) */
    interruptions: ZenInterruption[];
    /** Context notes for resuming */
    contextNotes: string[];
}

/**
 * Interruption record
 */
export interface ZenInterruption {
    /** When the interruption occurred */
    timestamp: Date;
    /** Reason for pause */
    reason: string;
    /** Duration in minutes */
    durationMinutes: number;
    /** Context saved before pause */
    savedContext: string;
}

/**
 * ZenTasks session
 */
export interface ZenSession {
    /** Session ID */
    id: string;
    /** Current task */
    currentTask: ZenTask | null;
    /** Session start time */
    startTime: Date;
    /** Last activity time */
    lastActivity: Date;
    /** Tasks completed this session */
    completedCount: number;
    /** Focus score (0-100) */
    focusScore: number;
}

/**
 * Valid transitions in ZenTasks workflow
 */
const VALID_TRANSITIONS: ZenTransition[] = [
    { from: 'zen_ready', to: 'zen_focus', name: 'start_focus', action: 'Begin focused work' },
    { from: 'zen_focus', to: 'zen_pause', name: 'pause', action: 'Take a break or handle interruption' },
    { from: 'zen_focus', to: 'zen_review', name: 'self_review', action: 'Review work before completion' },
    { from: 'zen_pause', to: 'zen_focus', name: 'resume', action: 'Resume focused work' },
    { from: 'zen_pause', to: 'zen_ready', name: 'defer', action: 'Defer task for later' },
    { from: 'zen_review', to: 'zen_focus', name: 'needs_work', action: 'Additional work needed' },
    { from: 'zen_review', to: 'zen_complete', name: 'approve', action: 'Self-approve completion' }
];

/**
 * ZenTasks configuration
 */
export interface ZenTasksConfig {
    /** Recommended focus duration in minutes */
    focusDurationMinutes: number;
    /** Break duration after focus session */
    breakDurationMinutes: number;
    /** Maximum consecutive focus sessions */
    maxConsecutiveSessions: number;
    /** Reminder interval for checking progress */
    reminderIntervalMinutes: number;
}

const DEFAULT_CONFIG: ZenTasksConfig = {
    focusDurationMinutes: 25, // Pomodoro-style
    breakDurationMinutes: 5,
    maxConsecutiveSessions: 4,
    reminderIntervalMinutes: 10
};

/**
 * ZenTasksManager class for managing workflow
 * 
 * **Simple explanation**: Like a focus coach that helps you work on one task
 * at a time without distractions, tracking your progress and reminding you
 * to take breaks.
 */
export class ZenTasksManager {
    private config: ZenTasksConfig;
    private currentSession: ZenSession | null;
    private taskHistory: ZenTask[];

    constructor(config: Partial<ZenTasksConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.currentSession = null;
        this.taskHistory = [];
    }

    /**
     * Start a new ZenTasks session
     */
    startSession(): ZenSession {
        const session: ZenSession = {
            id: `zen-${Date.now()}`,
            currentTask: null,
            startTime: new Date(),
            lastActivity: new Date(),
            completedCount: 0,
            focusScore: 100
        };

        this.currentSession = session;
        logInfo(`[ZenTasks] Session started: ${session.id}`);
        return session;
    }

    /**
     * Get current session
     */
    getSession(): ZenSession | null {
        return this.currentSession;
    }

    /**
     * Convert regular task to ZenTask
     */
    prepareTask(task: AtomicTask): ZenTask {
        const zenTask: ZenTask = {
            ...task,
            zenState: 'zen_ready',
            stateEnteredAt: new Date(),
            focusSessions: 0,
            totalFocusMinutes: 0,
            interruptions: [],
            contextNotes: []
        };

        logInfo(`[ZenTasks] Task prepared: ${task.id}`);
        return zenTask;
    }

    /**
     * Start focus on a task
     */
    startFocus(task: ZenTask): ZenTask {
        if (!this.canTransition(task, 'zen_focus')) {
            logWarn(`[ZenTasks] Cannot start focus from state: ${task.zenState}`);
            throw new Error(`Cannot start focus from state: ${task.zenState}`);
        }

        const updated: ZenTask = {
            ...task,
            zenState: 'zen_focus',
            stateEnteredAt: new Date(),
            focusSessions: task.focusSessions + 1
        };

        if (this.currentSession) {
            this.currentSession.currentTask = updated;
            this.currentSession.lastActivity = new Date();
        }

        logInfo(`[ZenTasks] Focus started on: ${task.id} (session ${updated.focusSessions})`);
        return updated;
    }

    /**
     * Pause current focus
     */
    pauseFocus(task: ZenTask, reason: string, contextNote?: string): ZenTask {
        if (!this.canTransition(task, 'zen_pause')) {
            logWarn(`[ZenTasks] Cannot pause from state: ${task.zenState}`);
            throw new Error(`Cannot pause from state: ${task.zenState}`);
        }

        const focusDuration = this.calculateFocusDuration(task);

        const interruption: ZenInterruption = {
            timestamp: new Date(),
            reason,
            durationMinutes: 0, // Will be updated on resume
            savedContext: contextNote || ''
        };

        const updated: ZenTask = {
            ...task,
            zenState: 'zen_pause',
            stateEnteredAt: new Date(),
            totalFocusMinutes: task.totalFocusMinutes + focusDuration,
            interruptions: [...task.interruptions, interruption],
            contextNotes: contextNote
                ? [...task.contextNotes, contextNote]
                : task.contextNotes
        };

        if (this.currentSession) {
            this.currentSession.currentTask = updated;
            this.currentSession.focusScore = Math.max(0, this.currentSession.focusScore - 5);
        }

        logInfo(`[ZenTasks] Focus paused on: ${task.id}, reason: ${reason}`);
        return updated;
    }

    /**
     * Resume focus after pause
     */
    resumeFocus(task: ZenTask): ZenTask {
        if (task.zenState !== 'zen_pause') {
            throw new Error(`Cannot resume from state: ${task.zenState}`);
        }

        // Update the last interruption duration
        const interruptions = [...task.interruptions];
        if (interruptions.length > 0) {
            const lastInterruption = interruptions[interruptions.length - 1];
            lastInterruption.durationMinutes = this.calculatePauseDuration(task);
        }

        const updated: ZenTask = {
            ...task,
            zenState: 'zen_focus',
            stateEnteredAt: new Date(),
            interruptions
        };

        if (this.currentSession) {
            this.currentSession.currentTask = updated;
            this.currentSession.lastActivity = new Date();
        }

        logInfo(`[ZenTasks] Focus resumed on: ${task.id}`);
        return updated;
    }

    /**
     * Enter self-review state
     */
    startReview(task: ZenTask): ZenTask {
        if (!this.canTransition(task, 'zen_review')) {
            throw new Error(`Cannot start review from state: ${task.zenState}`);
        }

        const focusDuration = this.calculateFocusDuration(task);

        const updated: ZenTask = {
            ...task,
            zenState: 'zen_review',
            stateEnteredAt: new Date(),
            totalFocusMinutes: task.totalFocusMinutes + focusDuration
        };

        logInfo(`[ZenTasks] Review started on: ${task.id}`);
        return updated;
    }

    /**
     * Complete the task
     */
    completeTask(task: ZenTask): ZenTask {
        if (task.zenState !== 'zen_review') {
            throw new Error(`Cannot complete from state: ${task.zenState}`);
        }

        const updated: ZenTask = {
            ...task,
            zenState: 'zen_complete',
            stateEnteredAt: new Date(),
            status: 'verification'
        };

        this.taskHistory.push(updated);

        if (this.currentSession) {
            this.currentSession.completedCount++;
            this.currentSession.currentTask = null;
        }

        logInfo(`[ZenTasks] Task completed: ${task.id}, total focus: ${updated.totalFocusMinutes} min`);
        return updated;
    }

    /**
     * Check if transition is valid
     */
    private canTransition(task: ZenTask, targetState: ZenTaskState): boolean {
        return VALID_TRANSITIONS.some(
            t => t.from === task.zenState && t.to === targetState
        );
    }

    /**
     * Get valid next states
     */
    getValidNextStates(task: ZenTask): ZenTransition[] {
        return VALID_TRANSITIONS.filter(t => t.from === task.zenState);
    }

    /**
     * Calculate focus duration since state entered
     */
    private calculateFocusDuration(task: ZenTask): number {
        if (task.zenState !== 'zen_focus') return 0;
        const now = new Date();
        return Math.round((now.getTime() - task.stateEnteredAt.getTime()) / 60000);
    }

    /**
     * Calculate pause duration
     */
    private calculatePauseDuration(task: ZenTask): number {
        if (task.zenState !== 'zen_pause') return 0;
        const now = new Date();
        return Math.round((now.getTime() - task.stateEnteredAt.getTime()) / 60000);
    }

    /**
     * Check if break is recommended
     */
    shouldTakeBreak(task: ZenTask): boolean {
        const focusTime = task.totalFocusMinutes + this.calculateFocusDuration(task);
        const sessionCount = task.focusSessions;

        return focusTime >= this.config.focusDurationMinutes ||
            sessionCount >= this.config.maxConsecutiveSessions;
    }

    /**
     * Get workflow summary for a task
     */
    getWorkflowSummary(task: ZenTask): string {
        const lines: string[] = [];
        lines.push(`Task: ${task.title}`);
        lines.push(`State: ${task.zenState}`);
        lines.push(`Focus sessions: ${task.focusSessions}`);
        lines.push(`Total focus time: ${task.totalFocusMinutes} minutes`);
        lines.push(`Interruptions: ${task.interruptions.length}`);

        if (task.contextNotes.length > 0) {
            lines.push('Context notes:');
            for (const note of task.contextNotes) {
                lines.push(`  - ${note}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Get session statistics
     */
    getSessionStats(): { completed: number; focusScore: number; avgFocusMinutes: number } | null {
        if (!this.currentSession) return null;

        const avgFocus = this.taskHistory.length > 0
            ? this.taskHistory.reduce((sum, t) => sum + t.totalFocusMinutes, 0) / this.taskHistory.length
            : 0;

        return {
            completed: this.currentSession.completedCount,
            focusScore: this.currentSession.focusScore,
            avgFocusMinutes: Math.round(avgFocus)
        };
    }

    /**
     * End session
     */
    endSession(): void {
        if (this.currentSession) {
            logInfo(`[ZenTasks] Session ended: ${this.currentSession.id}, completed ${this.currentSession.completedCount} tasks`);
        }
        this.currentSession = null;
    }
}

// Singleton instance
let instance: ZenTasksManager | null = null;

/**
 * Get the singleton ZenTasksManager
 */
export function getZenTasksManager(): ZenTasksManager {
    if (!instance) {
        instance = new ZenTasksManager();
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetZenTasksManagerForTests(): void {
    instance = null;
}
