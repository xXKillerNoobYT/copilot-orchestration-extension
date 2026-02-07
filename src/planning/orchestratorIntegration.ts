/**
 * Orchestrator Integration (MT-033.26-30)
 *
 * **Simple explanation**: Bridges the Planning Wizard with the orchestrator
 * service. When you finalize a plan, this creates tasks in the orchestrator
 * and starts tracking their execution.
 *
 * @module planning/orchestratorIntegration
 */

import { CompletePlan, FeatureBlock, DeveloperStory, UserStory, BlockLink } from './types';

// ============================================================================
// Types
// ============================================================================

export interface PlanExecutionConfig {
    /** Plan ID being executed */
    planId: string;
    /** Auto-start execution after plan submission */
    autoStart: boolean;
    /** Create subtasks for acceptance criteria */
    createSubtasks: boolean;
    /** Assign priorities based on plan */
    respectPriorities: boolean;
    /** Create dependency relationships in orchestrator */
    createDependencies: boolean;
    /** Notify when tasks complete */
    sendNotifications: boolean;
}

export interface ExecutionTask {
    /** Task ID */
    id: string;
    /** Source type (feature, story, criterion) */
    sourceType: 'feature' | 'user-story' | 'developer-story' | 'criterion';
    /** Source ID from plan */
    sourceId: string;
    /** Task title */
    title: string;
    /** Task description */
    description: string;
    /** Priority (1-4, 1=critical) */
    priority: number;
    /** Dependencies (task IDs this depends on) */
    dependencies: string[];
    /** Tags for categorization */
    tags: string[];
    /** Estimated effort (hours) */
    estimatedHours?: number;
    /** Status */
    status: TaskStatus;
}

export type TaskStatus = 'pending' | 'ready' | 'in-progress' | 'blocked' | 'completed' | 'cancelled';

export interface ExecutionPlan {
    /** Plan ID */
    id: string;
    /** Original plan reference */
    planId: string;
    /** Plan name */
    name: string;
    /** All tasks derived from plan */
    tasks: ExecutionTask[];
    /** Task dependency graph */
    dependencyMap: Map<string, string[]>;
    /** Execution order (topologically sorted) */
    executionOrder: string[];
    /** Start time */
    startedAt?: string;
    /** Completion time */
    completedAt?: string;
    /** Current status */
    status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
}

export interface PlanSubmissionResult {
    /** Whether submission was successful */
    success: boolean;
    /** Created execution plan */
    executionPlan?: ExecutionPlan;
    /** Number of tasks created */
    taskCount: number;
    /** Any warnings during creation */
    warnings: string[];
    /** Errors if unsuccessful */
    errors: string[];
}

export interface TaskProgressUpdate {
    /** Task ID */
    taskId: string;
    /** New status */
    status: TaskStatus;
    /** Progress percentage (0-100) */
    progress?: number;
    /** Notes/comments */
    notes?: string;
    /** Timestamp */
    timestamp: string;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_EXECUTION_CONFIG: PlanExecutionConfig = {
    planId: '',
    autoStart: false,
    createSubtasks: true,
    respectPriorities: true,
    createDependencies: true,
    sendNotifications: true,
};

const PRIORITY_MAP: Record<string, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
};

// ============================================================================
// Plan Submission
// ============================================================================

/**
 * Submit a plan to the orchestrator for execution.
 *
 * **Simple explanation**: Takes your completed plan and creates actual
 * tasks in the system that can be tracked and executed.
 */
export function submitPlanToOrchestrator(
    plan: CompletePlan,
    config: Partial<PlanExecutionConfig> = {}
): PlanSubmissionResult {
    const fullConfig: PlanExecutionConfig = {
        ...DEFAULT_EXECUTION_CONFIG,
        planId: generateId(),
        ...config,
    };

    const warnings: string[] = [];
    const errors: string[] = [];

    try {
        // Generate tasks from plan
        const tasks = generateTasksFromPlan(plan, fullConfig);

        // Build dependency map
        const dependencyMap = buildDependencyMap(plan, tasks);

        // Calculate execution order
        const executionOrder = calculateExecutionOrder(tasks, dependencyMap);

        // Validate the execution plan
        const validationIssues = validateExecutionPlan(tasks, dependencyMap);
        warnings.push(...validationIssues);

        // Create execution plan
        const executionPlan: ExecutionPlan = {
            id: fullConfig.planId,
            planId: fullConfig.planId,
            name: plan.overview.name,
            tasks,
            dependencyMap,
            executionOrder,
            status: fullConfig.autoStart ? 'active' : 'draft',
            startedAt: fullConfig.autoStart ? new Date().toISOString() : undefined,
        };

        // Mark tasks as ready if they have no dependencies
        if (fullConfig.autoStart) {
            markReadyTasks(executionPlan);
        }

        return {
            success: true,
            executionPlan,
            taskCount: tasks.length,
            warnings,
            errors,
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to submit plan: ${msg}`);
        return {
            success: false,
            taskCount: 0,
            warnings,
            errors,
        };
    }
}

/**
 * Generate tasks from a plan.
 */
function generateTasksFromPlan(
    plan: CompletePlan,
    config: PlanExecutionConfig
): ExecutionTask[] {
    const tasks: ExecutionTask[] = [];

    // Create tasks for each feature block
    for (const feature of plan.featureBlocks) {
        const featureTask = createFeatureTask(feature, config);
        tasks.push(featureTask);

        // Create subtasks for acceptance criteria if configured
        if (config.createSubtasks && feature.acceptanceCriteria.length > 0) {
            for (let i = 0; i < feature.acceptanceCriteria.length; i++) {
                const criterion = feature.acceptanceCriteria[i];
                tasks.push(createCriterionTask(feature, criterion, i, featureTask.id));
            }
        }
    }

    // Create tasks for developer stories
    for (const story of plan.developerStories) {
        const feature = plan.featureBlocks.find(f => story.relatedBlockIds.includes(f.id));
        const parentTaskId = feature ? `task_${feature.id}` : undefined;
        tasks.push(createDeveloperStoryTask(story, parentTaskId, config));
    }

    // Create tasks for user stories
    for (const story of plan.userStories) {
        tasks.push(createUserStoryTask(story, config));
    }

    return tasks;
}

function createFeatureTask(feature: FeatureBlock, config: PlanExecutionConfig): ExecutionTask {
    return {
        id: `task_${feature.id}`,
        sourceType: 'feature',
        sourceId: feature.id,
        title: feature.name,
        description: feature.description || '',
        priority: config.respectPriorities ? PRIORITY_MAP[feature.priority] : 3,
        dependencies: [],
        tags: ['feature', feature.priority],
        estimatedHours: estimateFeatureHours(feature),
        status: 'pending',
    };
}

function createCriterionTask(
    feature: FeatureBlock,
    criterion: string,
    index: number,
    parentTaskId: string
): ExecutionTask {
    return {
        id: `task_${feature.id}_criterion_${index}`,
        sourceType: 'criterion',
        sourceId: `${feature.id}_${index}`,
        title: `[${feature.name}] ${criterion}`,
        description: criterion,
        priority: PRIORITY_MAP[feature.priority],
        dependencies: [parentTaskId],
        tags: ['criterion', feature.name],
        estimatedHours: 2, // Default estimate for criteria
        status: 'pending',
    };
}

function createDeveloperStoryTask(
    story: DeveloperStory,
    parentTaskId: string | undefined,
    config: PlanExecutionConfig
): ExecutionTask {
    const storyTitle = `${story.action} - ${story.benefit}`;
    return {
        id: `task_story_${story.id}`,
        sourceType: 'developer-story',
        sourceId: story.id,
        title: storyTitle,
        description: `${storyTitle}\n\nTechnical Requirements:\n${story.technicalRequirements.map(c => `- ${c}`).join('\n')}`,
        priority: 3,
        dependencies: parentTaskId ? [parentTaskId] : [],
        tags: ['developer-story'],
        estimatedHours: story.estimatedHours || story.technicalRequirements.length * 2,
        status: 'pending',
    };
}

function createUserStoryTask(story: UserStory, config: PlanExecutionConfig): ExecutionTask {
    const storyTitle = `As a ${story.userType}, I want to ${story.action} so that ${story.benefit}`;
    return {
        id: `task_userstory_${story.id}`,
        sourceType: 'user-story',
        sourceId: story.id,
        title: storyTitle,
        description: `${storyTitle}\n\nAcceptance Criteria:\n${story.acceptanceCriteria.map(c => `- ${c}`).join('\n')}`,
        priority: 3,
        dependencies: [],
        tags: ['user-story', story.userType],
        estimatedHours: story.acceptanceCriteria.length * 3,
        status: 'pending',
    };
}

function estimateFeatureHours(feature: FeatureBlock): number {
    // Basic estimation: 4 hours base + 2 hours per criterion
    const baseHours = 4;
    const hoursPerCriterion = 2;
    const priorityMultiplier = feature.priority === 'critical' ? 1.5 :
        feature.priority === 'high' ? 1.25 : 1;

    return Math.ceil((baseHours + feature.acceptanceCriteria.length * hoursPerCriterion) * priorityMultiplier);
}

// ============================================================================
// Dependency Management
// ============================================================================

/**
 * Build dependency map from plan links.
 */
function buildDependencyMap(
    plan: CompletePlan,
    tasks: ExecutionTask[]
): Map<string, string[]> {
    const map = new Map<string, string[]>();

    // Initialize all tasks with empty dependency arrays
    for (const task of tasks) {
        map.set(task.id, [...task.dependencies]);
    }

    // Add dependencies from block links
    for (const link of plan.blockLinks) {
        if (link.dependencyType === 'requires') {
            const sourceTaskId = `task_${link.sourceBlockId}`;
            const targetTaskId = `task_${link.targetBlockId}`;

            const deps = map.get(sourceTaskId) || [];
            if (!deps.includes(targetTaskId)) {
                deps.push(targetTaskId);
                map.set(sourceTaskId, deps);
            }
        }
    }

    return map;
}

/**
 * Calculate execution order using topological sort.
 */
function calculateExecutionOrder(
    tasks: ExecutionTask[],
    dependencyMap: Map<string, string[]>
): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const task of tasks) {
        inDegree.set(task.id, 0);
        adjacency.set(task.id, []);
    }

    // Build adjacency list (reverse direction for dependencies)
    for (const task of tasks) {
        const deps = dependencyMap.get(task.id) || [];
        for (const dep of deps) {
            inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
            const adj = adjacency.get(dep) || [];
            adj.push(task.id);
            adjacency.set(dep, adj);
        }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];

    for (const task of tasks) {
        if ((inDegree.get(task.id) || 0) === 0) {
            queue.push(task.id);
        }
    }

    while (queue.length > 0) {
        // Sort by priority before taking next
        queue.sort((a, b) => {
            const taskA = tasks.find(t => t.id === a);
            const taskB = tasks.find(t => t.id === b);
            return (taskA?.priority || 3) - (taskB?.priority || 3);
        });

        const taskId = queue.shift()!;
        result.push(taskId);

        const neighbors = adjacency.get(taskId) || [];
        for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) || 1) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
                queue.push(neighbor);
            }
        }
    }

    return result;
}

/**
 * Validate execution plan for issues.
 */
function validateExecutionPlan(
    tasks: ExecutionTask[],
    dependencyMap: Map<string, string[]>
): string[] {
    const warnings: string[] = [];
    const taskIds = new Set(tasks.map(t => t.id));

    // Check for missing dependencies
    for (const [taskId, deps] of dependencyMap) {
        for (const dep of deps) {
            if (!taskIds.has(dep)) {
                warnings.push(`Task ${taskId} depends on non-existent task ${dep}`);
            }
        }
    }

    // Check for cycles (already handled by topological sort, but verify)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function hasCycle(taskId: string): boolean {
        if (recursionStack.has(taskId)) return true;
        if (visited.has(taskId)) return false;

        visited.add(taskId);
        recursionStack.add(taskId);

        const deps = dependencyMap.get(taskId) || [];
        for (const dep of deps) {
            if (hasCycle(dep)) return true;
        }

        recursionStack.delete(taskId);
        return false;
    }

    for (const task of tasks) {
        if (hasCycle(task.id)) {
            warnings.push(`Cycle detected involving task ${task.id}`);
            break;
        }
    }

    return warnings;
}

/**
 * Mark tasks as ready if all dependencies are complete.
 */
function markReadyTasks(plan: ExecutionPlan): void {
    for (const task of plan.tasks) {
        if (task.status !== 'pending') continue;

        const deps = plan.dependencyMap.get(task.id) || [];
        const allDepsComplete = deps.every(depId => {
            const depTask = plan.tasks.find(t => t.id === depId);
            return depTask?.status === 'completed';
        });

        if (allDepsComplete || deps.length === 0) {
            task.status = 'ready';
        }
    }
}

// ============================================================================
// Execution Control
// ============================================================================

/**
 * Start execution of a plan.
 */
export function startExecution(plan: ExecutionPlan): void {
    plan.status = 'active';
    plan.startedAt = new Date().toISOString();
    markReadyTasks(plan);
}

/**
 * Pause execution of a plan.
 */
export function pauseExecution(plan: ExecutionPlan): void {
    plan.status = 'paused';
}

/**
 * Resume execution of a plan.
 */
export function resumeExecution(plan: ExecutionPlan): void {
    plan.status = 'active';
    markReadyTasks(plan);
}

/**
 * Cancel execution of a plan.
 */
export function cancelExecution(plan: ExecutionPlan): void {
    plan.status = 'cancelled';
    for (const task of plan.tasks) {
        if (task.status !== 'completed') {
            task.status = 'cancelled';
        }
    }
}

/**
 * Update task progress.
 */
export function updateTaskProgress(
    plan: ExecutionPlan,
    update: TaskProgressUpdate
): boolean {
    const task = plan.tasks.find(t => t.id === update.taskId);
    if (!task) return false;

    task.status = update.status;

    // If task completed, update dependent tasks
    if (update.status === 'completed') {
        markReadyTasks(plan);

        // Check if all tasks complete
        const allComplete = plan.tasks.every(t => t.status === 'completed');
        if (allComplete) {
            plan.status = 'completed';
            plan.completedAt = new Date().toISOString();
        }
    }

    return true;
}

/**
 * Get next available tasks (ready to start).
 */
export function getNextTasks(plan: ExecutionPlan, limit: number = 5): ExecutionTask[] {
    return plan.tasks
        .filter(t => t.status === 'ready')
        .sort((a, b) => a.priority - b.priority)
        .slice(0, limit);
}

/**
 * Get blocked tasks with their blockers.
 */
export function getBlockedTasks(
    plan: ExecutionPlan
): Array<{ task: ExecutionTask; blockedBy: ExecutionTask[] }> {
    return plan.tasks
        .filter(t => t.status === 'blocked' || t.status === 'pending')
        .map(task => {
            const deps = plan.dependencyMap.get(task.id) || [];
            const blockedBy = deps
                .map(depId => plan.tasks.find(t => t.id === depId))
                .filter((t): t is ExecutionTask => t !== undefined && t.status !== 'completed');

            return { task, blockedBy };
        })
        .filter(item => item.blockedBy.length > 0);
}

// ============================================================================
// Progress Tracking
// ============================================================================

export interface ExecutionProgress {
    /** Total tasks */
    total: number;
    /** Completed tasks */
    completed: number;
    /** In-progress tasks */
    inProgress: number;
    /** Ready tasks */
    ready: number;
    /** Blocked tasks */
    blocked: number;
    /** Pending tasks */
    pending: number;
    /** Completion percentage */
    percentage: number;
    /** Estimated remaining hours */
    estimatedRemainingHours: number;
}

/**
 * Calculate execution progress.
 */
export function calculateProgress(plan: ExecutionPlan): ExecutionProgress {
    const total = plan.tasks.length;
    const completed = plan.tasks.filter(t => t.status === 'completed').length;
    const inProgress = plan.tasks.filter(t => t.status === 'in-progress').length;
    const ready = plan.tasks.filter(t => t.status === 'ready').length;
    const blocked = plan.tasks.filter(t => t.status === 'blocked').length;
    const pending = plan.tasks.filter(t => t.status === 'pending').length;

    const remainingTasks = plan.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    const estimatedRemainingHours = remainingTasks.reduce((sum, t) => sum + (t.estimatedHours || 4), 0);

    return {
        total,
        completed,
        inProgress,
        ready,
        blocked,
        pending,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        estimatedRemainingHours,
    };
}

/**
 * Generate progress summary HTML.
 */
export function renderProgressSummary(progress: ExecutionProgress): string {
    return `
    <div class="execution-progress">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progress.percentage}%"></div>
      </div>
      <div class="progress-stats">
        <span class="stat">
          <span class="stat-value">${progress.percentage}%</span>
          <span class="stat-label">Complete</span>
        </span>
        <span class="stat completed">
          <span class="stat-value">${progress.completed}</span>
          <span class="stat-label">Done</span>
        </span>
        <span class="stat in-progress">
          <span class="stat-value">${progress.inProgress}</span>
          <span class="stat-label">In Progress</span>
        </span>
        <span class="stat ready">
          <span class="stat-value">${progress.ready}</span>
          <span class="stat-label">Ready</span>
        </span>
        <span class="stat blocked">
          <span class="stat-value">${progress.blocked}</span>
          <span class="stat-label">Blocked</span>
        </span>
      </div>
      <div class="progress-estimate">
        Estimated remaining: ~${progress.estimatedRemainingHours} hours
      </div>
    </div>
  `;
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
    return 'exec_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

