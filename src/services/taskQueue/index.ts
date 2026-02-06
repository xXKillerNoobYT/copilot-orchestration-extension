/**
 * @file taskQueue/index.ts
 * @module TaskQueue
 * @description Task queue management with dependency graph and topological sorting (MT-016)
 * 
 * Manages task execution order based on dependencies. Uses directed acyclic graph (DAG)
 * for dependency tracking and topological sort for execution order.
 * 
 * **Simple explanation**: A smart to-do list that knows some tasks depend on others.
 * If Task B needs Task A to finish first, this system makes sure A runs before B.
 */

import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '../../logger';

// Re-export all submodules
export * from './dependencyGraph';
export * from './topologicalSort';
export * from './priorityQueue';
// Selective exports from circularDetection (avoid conflict with topologicalSort)
export { 
    analyzeCircularDependencies, 
    findMinimumCycleBreakers, 
    wouldCreateCycle, 
    formatCycleReport,
    CircularDependencyInfo,
    CircularAnalysisResult
} from './circularDetection';
export * from './blocking';
export * from './validation';
export * from './readiness';
export * from './persistence';
export * from './visualization';

import { DependencyGraph, createDependencyGraph } from './dependencyGraph';
import { topologicalSort, detectCircularDependencies } from './topologicalSort';
import { PriorityQueue, createPriorityQueue } from './priorityQueue';

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'blocked';

export interface Task {
    id: string;
    title: string;
    description?: string;
    priority: number;           // 1 = highest, 5 = lowest
    dependencies: string[];     // Task IDs this task depends on
    status: TaskStatus;
    assignee?: string;
    estimatedMinutes?: number;
    actualMinutes?: number;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
    metadata?: Record<string, unknown>;
}

export interface TaskQueueConfig {
    maxConcurrent: number;      // Max tasks running at once
    defaultPriority: number;    // Default priority for new tasks
    autoStart: boolean;         // Auto-start ready tasks
}

export interface TaskQueueStats {
    pending: number;
    ready: number;
    running: number;
    completed: number;
    failed: number;
    blocked: number;
    total: number;
}

// ============================================================================
// TaskQueue Class
// ============================================================================

/**
 * Manages task queue with dependency resolution and priority ordering.
 * 
 * **Simple explanation**: The task manager that knows which tasks can run now,
 * which are waiting for other tasks, and which are blocked by failures.
 * 
 * @emits 'task-added' - When a task is added to the queue
 * @emits 'task-ready' - When a task becomes ready to execute
 * @emits 'task-started' - When a task begins execution
 * @emits 'task-completed' - When a task finishes successfully
 * @emits 'task-failed' - When a task fails
 * @emits 'queue-empty' - When all tasks are complete
 * @emits 'circular-dependency' - When circular dependency detected
 */
export class TaskQueue extends EventEmitter {
    private config: TaskQueueConfig;
    private tasks: Map<string, Task> = new Map();
    private dependencyGraph: DependencyGraph;
    private readyQueue: PriorityQueue<Task>;
    private runningTasks: Set<string> = new Set();

    constructor(config: Partial<TaskQueueConfig> = {}) {
        super();
        this.config = {
            maxConcurrent: config.maxConcurrent ?? 3,
            defaultPriority: config.defaultPriority ?? 3,
            autoStart: config.autoStart ?? true
        };
        this.dependencyGraph = createDependencyGraph();
        this.readyQueue = createPriorityQueue<Task>((a, b) => a.priority - b.priority);
    }

    /**
     * Add a task to the queue
     */
    addTask(task: Omit<Task, 'status' | 'createdAt'>): Task {
        if (this.tasks.has(task.id)) {
            throw new Error(`Task ${task.id} already exists`);
        }

        const fullTask: Task = {
            ...task,
            priority: task.priority ?? this.config.defaultPriority,
            status: 'pending',
            createdAt: new Date()
        };

        // Add to internal tracking
        this.tasks.set(task.id, fullTask);
        this.dependencyGraph.addNode(task.id);

        // Add dependency edges
        for (const depId of task.dependencies) {
            this.dependencyGraph.addDependency(task.id, depId);
        }

        // Check for circular dependencies
        const cycles = detectCircularDependencies(this.dependencyGraph);
        if (cycles.length > 0) {
            this.tasks.delete(task.id);
            this.emit('circular-dependency', { taskId: task.id, cycles });
            throw new Error(`Circular dependency detected: ${cycles[0].join(' -> ')}`);
        }

        this.emit('task-added', fullTask);
        logInfo(`[TaskQueue] Added task: ${task.id}`);

        // Update task statuses
        this.updateTaskStatuses();

        return fullTask;
    }

    /**
     * Add multiple tasks at once (useful for loading from plan)
     */
    addTasks(tasks: Array<Omit<Task, 'status' | 'createdAt'>>): Task[] {
        return tasks.map(t => this.addTask(t));
    }

    /**
     * Get the next task that's ready to execute
     */
    getNextTask(assignee?: string): Task | null {
        if (this.runningTasks.size >= this.config.maxConcurrent) {
            return null;
        }

        // Get highest priority ready task
        while (this.readyQueue.size() > 0) {
            const task = this.readyQueue.dequeue();
            if (task && task.status === 'ready' && !this.runningTasks.has(task.id)) {
                return task;
            }
        }

        return null;
    }

    /**
     * Start a task (mark as running)
     */
    startTask(taskId: string, assignee?: string): Task {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }
        if (task.status !== 'ready') {
            throw new Error(`Task ${taskId} is not ready (status: ${task.status})`);
        }

        task.status = 'running';
        task.startedAt = new Date();
        if (assignee) task.assignee = assignee;

        this.runningTasks.add(taskId);

        this.emit('task-started', task);
        logInfo(`[TaskQueue] Started task: ${taskId}`);

        return task;
    }

    /**
     * Mark a task as completed
     */
    completeTask(taskId: string, result?: Record<string, unknown>): Task {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }
        if (task.status !== 'running') {
            throw new Error(`Task ${taskId} is not running (status: ${task.status})`);
        }

        task.status = 'completed';
        task.completedAt = new Date();

        if (task.startedAt) {
            task.actualMinutes = Math.round((task.completedAt.getTime() - task.startedAt.getTime()) / 60000);
        }

        if (result) {
            task.metadata = { ...task.metadata, result };
        }

        this.runningTasks.delete(taskId);

        this.emit('task-completed', task);
        logInfo(`[TaskQueue] Completed task: ${taskId}`);

        // Update dependent tasks
        this.updateTaskStatuses();

        // Check if queue is empty
        if (this.getStats().running === 0 && this.getStats().ready === 0 && this.getStats().pending === 0) {
            this.emit('queue-empty');
        }

        return task;
    }

    /**
     * Mark a task as failed
     */
    failTask(taskId: string, error: string): Task {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        task.status = 'failed';
        task.error = error;
        task.completedAt = new Date();

        this.runningTasks.delete(taskId);

        // Block dependent tasks
        this.blockDependentTasks(taskId);

        this.emit('task-failed', { task, error });
        logError(`[TaskQueue] Failed task: ${taskId} - ${error}`);

        return task;
    }

    /**
     * Get a task by ID
     */
    getTask(taskId: string): Task | undefined {
        return this.tasks.get(taskId);
    }

    /**
     * Get all tasks
     */
    getAllTasks(): Task[] {
        return Array.from(this.tasks.values());
    }

    /**
     * Get tasks by status
     */
    getTasksByStatus(status: TaskStatus): Task[] {
        return this.getAllTasks().filter(t => t.status === status);
    }

    /**
     * Get execution order based on dependencies
     */
    getExecutionOrder(): string[] {
        return topologicalSort(this.dependencyGraph);
    }

    /**
     * Get queue statistics
     */
    getStats(): TaskQueueStats {
        const tasks = this.getAllTasks();
        return {
            pending: tasks.filter(t => t.status === 'pending').length,
            ready: tasks.filter(t => t.status === 'ready').length,
            running: tasks.filter(t => t.status === 'running').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length,
            blocked: tasks.filter(t => t.status === 'blocked').length,
            total: tasks.length
        };
    }

    /**
     * Update task statuses based on dependency completion
     */
    private updateTaskStatuses(): void {
        for (const task of this.tasks.values()) {
            if (task.status !== 'pending') continue;

            // Check if all dependencies are completed
            const allDepsComplete = task.dependencies.every(depId => {
                const dep = this.tasks.get(depId);
                return dep?.status === 'completed';
            });

            // Check if any dependency failed
            const anyDepFailed = task.dependencies.some(depId => {
                const dep = this.tasks.get(depId);
                return dep?.status === 'failed' || dep?.status === 'blocked';
            });

            if (anyDepFailed) {
                task.status = 'blocked';
                this.emit('task-blocked', task);
            } else if (allDepsComplete) {
                task.status = 'ready';
                this.readyQueue.enqueue(task);
                this.emit('task-ready', task);
            }
        }
    }

    /**
     * Block all tasks that depend on a failed task
     */
    private blockDependentTasks(failedTaskId: string): void {
        const dependents = this.dependencyGraph.getDependents(failedTaskId);

        for (const depId of dependents) {
            const task = this.tasks.get(depId);
            if (task && (task.status === 'pending' || task.status === 'ready')) {
                task.status = 'blocked';
                task.error = `Blocked by failed task: ${failedTaskId}`;
                this.emit('task-blocked', task);

                // Recursively block dependents
                this.blockDependentTasks(depId);
            }
        }
    }

    /**
     * Clear all tasks
     */
    clear(): void {
        this.tasks.clear();
        this.dependencyGraph = createDependencyGraph();
        this.readyQueue = createPriorityQueue<Task>((a, b) => a.priority - b.priority);
        this.runningTasks.clear();
        logInfo('[TaskQueue] Cleared all tasks');
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: TaskQueue | null = null;

export function initializeTaskQueue(config?: Partial<TaskQueueConfig>): TaskQueue {
    if (instance) {
        throw new Error('TaskQueue already initialized');
    }
    instance = new TaskQueue(config);
    return instance;
}

export function getTaskQueueInstance(): TaskQueue {
    if (!instance) {
        throw new Error('TaskQueue not initialized');
    }
    return instance;
}

export function resetTaskQueueForTests(): void {
    instance = null;
}
