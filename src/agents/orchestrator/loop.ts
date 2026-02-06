/**
 * Orchestration Loop
 * 
 * **Simple explanation**: The main event loop that coordinates all pieces.
 * Polls for ready tasks, assigns to Coding AI, manages verification queue,
 * and handles the retry/feedback cycle.
 * 
 * @module agents/orchestrator/loop
 */

import { logInfo, logWarn, logError } from '../../logger';
import { getTaskQueueInstance } from '../../services/taskQueue';
import { getTaskStatusManager, TRIGGERS, TaskStatus } from './status';
import { getCodingAIRouter, CodingAssignment } from './routing/codingAI';
import { getVerificationRouter } from './routing/verification';

/**
 * Loop configuration
 */
export interface OrchestrationLoopConfig {
    /** How often to check for ready tasks (ms) */
    pollIntervalMs: number;
    /** Whether to auto-assign ready tasks */
    autoAssign: boolean;
    /** Maximum iterations (0 = infinite) */
    maxIterations: number;
    /** Whether to pause on verification failure */
    pauseOnVerificationFailure: boolean;
    /** Deadlock detection threshold (ms without progress) */
    deadlockThresholdMs: number;
}

const DEFAULT_CONFIG: OrchestrationLoopConfig = {
    pollIntervalMs: 5000,
    autoAssign: true,
    maxIterations: 0,
    pauseOnVerificationFailure: false,
    deadlockThresholdMs: 300000 // 5 minutes
};

/**
 * Loop state
 */
export interface LoopState {
    running: boolean;
    paused: boolean;
    iteration: number;
    lastProgressAt: Date;
    lastErrors: string[];
    tasksProcessed: number;
    tasksCompleted: number;
    tasksFailed: number;
}

/**
 * Orchestration Loop Manager
 */
export class OrchestrationLoop {
    private config: OrchestrationLoopConfig;
    private state: LoopState;
    private intervalId: NodeJS.Timeout | null = null;
    private listeners: ((state: LoopState) => void)[] = [];

    constructor(config: Partial<OrchestrationLoopConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.state = {
            running: false,
            paused: false,
            iteration: 0,
            lastProgressAt: new Date(),
            lastErrors: [],
            tasksProcessed: 0,
            tasksCompleted: 0,
            tasksFailed: 0
        };
    }

    /**
     * Start the orchestration loop
     */
    start(): void {
        if (this.state.running) {
            logWarn('[OrchestrationLoop] Already running');
            return;
        }

        logInfo('[OrchestrationLoop] Starting orchestration loop');
        this.state.running = true;
        this.state.paused = false;
        this.state.iteration = 0;
        this.state.lastProgressAt = new Date();
        this.notify();

        this.intervalId = setInterval(
            () => this.tick(),
            this.config.pollIntervalMs
        );

        // Run immediately
        this.tick();
    }

    /**
     * Stop the orchestration loop
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.state.running = false;
        this.state.paused = false;
        logInfo('[OrchestrationLoop] Stopped orchestration loop');
        this.notify();
    }

    /**
     * Pause the loop (tasks in progress continue)
     */
    pause(): void {
        this.state.paused = true;
        logInfo('[OrchestrationLoop] Paused (in-progress tasks will continue)');
        this.notify();
    }

    /**
     * Resume the loop
     */
    resume(): void {
        this.state.paused = false;
        logInfo('[OrchestrationLoop] Resumed');
        this.notify();
    }

    /**
     * Main loop tick
     */
    private async tick(): Promise<void> {
        if (this.state.paused) {
            return;
        }

        this.state.iteration++;
        logInfo(`[OrchestrationLoop] Tick #${this.state.iteration}`);

        try {
            // Check for deadlock
            await this.checkDeadlock();

            // Check for timed out assignments
            await this.checkTimeouts();

            // Process ready tasks
            if (this.config.autoAssign) {
                await this.processReadyTasks();
            }

            // Check iteration limit
            if (this.config.maxIterations > 0 && this.state.iteration >= this.config.maxIterations) {
                logInfo('[OrchestrationLoop] Max iterations reached, stopping');
                this.stop();
            }

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[OrchestrationLoop] Tick error: ${msg}`);
            this.state.lastErrors.push(msg);
            if (this.state.lastErrors.length > 10) {
                this.state.lastErrors.shift();
            }
        }

        this.notify();
    }

    /**
     * Process ready tasks and assign to Coding AI
     */
    private async processReadyTasks(): Promise<void> {
        const taskQueue = getTaskQueueInstance();
        const codingRouter = getCodingAIRouter();
        const statusManager = getTaskStatusManager();

        // Check if Coding AI can accept more tasks
        if (codingRouter.getActiveCount() >= 1) {
            // Coding AI is busy
            return;
        }

        // Get next ready task
        const readyTasks = statusManager.getTasksByStatus('ready');
        if (readyTasks.length === 0) {
            return;
        }

        // Get highest priority ready task
        const taskId = readyTasks[0]; // TaskQueue already sorted by priority
        const task = await taskQueue.getTask(taskId);
        if (!task) {
            return;
        }

        // Build assignment
        // Convert priority number to P0-P3 format (1=P0, 2=P1, etc.)
        const priorityMap: Record<number, 'P0' | 'P1' | 'P2' | 'P3'> = {
            1: 'P0',
            2: 'P1',
            3: 'P2',
            4: 'P3',
            5: 'P3'
        };
        const assignment: CodingAssignment = {
            taskId: task.id,
            title: task.title,
            description: task.description || '',
            acceptanceCriteria: [],                  // TaskQueue Task doesn't have this
            targetFiles: [],                         // TaskQueue Task doesn't have this
            contextFiles: [],                        // TaskQueue Task doesn't have this
            estimatedMinutes: task.estimatedMinutes || 30,
            priority: priorityMap[task.priority] || 'P2',
            instructions: '',
            restrictions: []
        };

        // Route to Coding AI
        const result = await codingRouter.routeTask(assignment);

        if (result.success) {
            this.state.tasksProcessed++;
            this.state.lastProgressAt = new Date();
            logInfo(`[OrchestrationLoop] Assigned task ${taskId} to Coding AI`);
        } else {
            logWarn(`[OrchestrationLoop] Failed to assign task ${taskId}: ${result.message}`);
        }
    }

    /**
     * Check for timed out assignments
     */
    private async checkTimeouts(): Promise<void> {
        const codingRouter = getCodingAIRouter();
        const timedOut = codingRouter.checkTimeouts();

        for (const taskId of timedOut) {
            logWarn(`[OrchestrationLoop] Task ${taskId} timed out waiting for acknowledgment`);
            // Could implement retry or escalation logic here
        }
    }

    /**
     * Check for deadlock (no progress for threshold period)
     */
    private async checkDeadlock(): Promise<void> {
        const elapsed = Date.now() - this.state.lastProgressAt.getTime();

        if (elapsed > this.config.deadlockThresholdMs) {
            const statusManager = getTaskStatusManager();
            const summary = statusManager.getSummary();

            // Check if there's work in progress
            const hasWork = summary['in-progress'] > 0 ||
                summary['verification'] > 0 ||
                summary['needs-revision'] > 0;

            if (hasWork) {
                logWarn(`[OrchestrationLoop] Potential deadlock detected - ${elapsed}ms without progress`);
                // Could trigger investigation or notification here
            }
        }
    }

    /**
     * Record task completion
     */
    recordCompletion(passed: boolean): void {
        this.state.lastProgressAt = new Date();
        if (passed) {
            this.state.tasksCompleted++;
        } else {
            this.state.tasksFailed++;
        }
        this.notify();
    }

    /**
     * Get current state
     */
    getState(): LoopState {
        return { ...this.state };
    }

    /**
     * Add state listener
     */
    onStateChange(listener: (state: LoopState) => void): () => void {
        this.listeners.push(listener);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        };
    }

    /**
     * Notify listeners of state change
     */
    private notify(): void {
        const state = this.getState();
        for (const listener of this.listeners) {
            try {
                listener(state);
            } catch (error: unknown) {
                logError(`[OrchestrationLoop] Listener error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Get summary for display
     */
    getSummary(): string {
        const lines = [
            `Status: ${this.state.running ? (this.state.paused ? 'PAUSED' : 'RUNNING') : 'STOPPED'}`,
            `Iteration: ${this.state.iteration}`,
            `Tasks Processed: ${this.state.tasksProcessed}`,
            `Tasks Completed: ${this.state.tasksCompleted}`,
            `Tasks Failed: ${this.state.tasksFailed}`,
            `Last Progress: ${this.state.lastProgressAt.toISOString()}`
        ];
        return lines.join('\n');
    }
}

// Singleton instance
let instance: OrchestrationLoop | null = null;

/**
 * Initialize the orchestration loop
 */
export function initializeOrchestrationLoop(config: Partial<OrchestrationLoopConfig> = {}): OrchestrationLoop {
    if (instance) {
        instance.stop();
    }
    instance = new OrchestrationLoop(config);
    return instance;
}

/**
 * Get singleton instance
 */
export function getOrchestrationLoop(): OrchestrationLoop {
    if (!instance) {
        instance = new OrchestrationLoop();
    }
    return instance;
}

/**
 * Reset for tests
 */
export function resetOrchestrationLoop(): void {
    if (instance) {
        instance.stop();
    }
    instance = null;
}
