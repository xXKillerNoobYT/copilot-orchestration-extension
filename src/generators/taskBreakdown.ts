/**
 * Task Breakdown Generator (MT-033.26)
 *
 * Converts a CompletePlan from the planning wizard into executable tasks
 * for the orchestrator. Each feature block becomes a master ticket, each
 * developer story becomes an atomic task, and dependencies are preserved.
 *
 * **Simple explanation**: Translates your plan into actual work items the
 * AI agents can pick up and execute — like breaking a blueprint into
 * individual construction tasks.
 *
 * @module generators/taskBreakdown
 */

import {
    CompletePlan,
    FeatureBlock,
    DeveloperStory,
    UserStory,
    BlockLink,
    PriorityLevel
} from '../planning/types';

// ============================================================================
// Types
// ============================================================================

/**
 * A master ticket representing a feature block.
 *
 * **Simple explanation**: The big-picture work item that groups smaller tasks together.
 */
export interface MasterTicket {
    /** Unique ID — format: MT-{featureOrder} */
    id: string;
    /** Feature block this ticket represents */
    featureId: string;
    /** Display title (from feature name) */
    title: string;
    /** Full description (from feature description + purpose) */
    description: string;
    /** Priority mapping */
    priority: TaskPriority;
    /** Acceptance criteria (copied from feature block) */
    acceptanceCriteria: string[];
    /** Technical notes */
    technicalNotes: string;
    /** IDs of child atomic tasks */
    childTaskIds: string[];
    /** IDs of master tickets this depends on */
    dependsOn: string[];
    /** Estimated total minutes (sum of child tasks) */
    estimatedMinutes: number;
    /** Assigned agent team */
    assignedTeam: AgentTeam;
}

/**
 * An atomic task that can be executed by a single agent.
 *
 * **Simple explanation**: A single, concrete piece of work — like "build the login form"
 * or "write tests for the API endpoint."
 */
export interface AtomicTask {
    /** Unique ID — format: MT-{featureOrder}.{taskNumber} */
    id: string;
    /** Parent master ticket ID */
    parentId: string;
    /** Feature block ID this task belongs to */
    featureId: string;
    /** Task title */
    title: string;
    /** Detailed description */
    description: string;
    /** Priority */
    priority: TaskPriority;
    /** Estimated duration in minutes */
    estimatedMinutes: number;
    /** IDs of other tasks this depends on */
    dependsOn: string[];
    /** Acceptance criteria specific to this task */
    acceptanceCriteria: string[];
    /** Files to create or modify */
    files: string[];
    /** Whether this involves UI work */
    isUI: boolean;
    /** Assigned agent team */
    assignedTeam: AgentTeam;
    /** Task status */
    status: TaskStatus;
    /** Related developer story ID (if derived from one) */
    developerStoryId: string | null;
    /** Related user stories */
    relatedUserStoryIds: string[];
}

/** Priority levels for generated tasks */
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

/** Agent teams that can be assigned to tasks */
export type AgentTeam = 'planning' | 'coding' | 'verification' | 'research' | 'orchestrator';

/** Task status values */
export type TaskStatus = 'pending' | 'ready' | 'in_progress' | 'verification' | 'done' | 'blocked';

/**
 * Configuration for task breakdown generation.
 *
 * **Simple explanation**: Settings that control how the plan gets split into tasks.
 */
export interface TaskBreakdownConfig {
    /** Maximum estimated minutes per atomic task (default: 60) */
    maxTaskDuration: number;
    /** Minimum estimated minutes per atomic task (default: 15) */
    minTaskDuration: number;
    /** Maximum number of tasks per feature (default: 20) */
    maxTasksPerFeature: number;
    /** Whether to auto-assign agent teams based on task content (default: true) */
    autoAssignTeams: boolean;
    /** Whether to generate test tasks for each implementation task (default: true) */
    generateTestTasks: boolean;
    /** ID prefix for master tickets (default: "MT") */
    masterTicketPrefix: string;
}

/**
 * Result of task breakdown generation.
 *
 * **Simple explanation**: Everything the orchestrator needs to start executing the plan.
 */
export interface TaskBreakdownResult {
    /** All master tickets (one per feature block) */
    masterTickets: MasterTicket[];
    /** All atomic tasks across all features */
    tasks: AtomicTask[];
    /** Dependency graph: taskId → list of task IDs it depends on */
    dependencyGraph: Map<string, string[]>;
    /** Tasks in execution order (respecting dependencies) */
    executionOrder: string[];
    /** Total estimated minutes for the entire plan */
    totalEstimatedMinutes: number;
    /** Summary text */
    summary: string;
    /** Any warnings generated during breakdown */
    warnings: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default task breakdown configuration.
 *
 * **Simple explanation**: The standard settings used when no custom config is provided.
 */
export const DEFAULT_TASK_BREAKDOWN_CONFIG: TaskBreakdownConfig = {
    maxTaskDuration: 60,
    minTaskDuration: 15,
    maxTasksPerFeature: 20,
    autoAssignTeams: true,
    generateTestTasks: true,
    masterTicketPrefix: 'MT'
};

// ============================================================================
// Priority Mapping
// ============================================================================

/**
 * Map plan priority levels to task priorities.
 *
 * **Simple explanation**: Converts "critical/high/medium/low" from the plan
 * into "P0/P1/P2/P3" for the task system.
 */
export function mapPriority(level: PriorityLevel): TaskPriority {
    switch (level) {
        case 'critical': return 'P0';
        case 'high': return 'P1';
        case 'medium': return 'P2';
        case 'low': return 'P3';
        default: return 'P2';
    }
}

// ============================================================================
// Agent Team Assignment
// ============================================================================

/** UI-related keywords for team assignment */
const UI_KEYWORDS = ['ui', 'view', 'panel', 'webview', 'button', 'form', 'layout', 'display', 'render', 'css', 'html', 'style', 'visual', 'canvas', 'widget'];

/** Test-related keywords */
const TEST_KEYWORDS = ['test', 'verify', 'validate', 'assert', 'coverage', 'spec', 'check', 'qa'];

/** Research-related keywords */
const RESEARCH_KEYWORDS = ['research', 'investigate', 'analyze', 'explore', 'evaluate', 'compare', 'study', 'spike'];

/** Planning-related keywords */
const PLANNING_KEYWORDS = ['plan', 'design', 'architect', 'decompose', 'break down', 'define', 'specification'];

/**
 * Determine which agent team should handle a task based on its content.
 *
 * **Simple explanation**: Looks at the task description to figure out which
 * AI team is best suited to do the work.
 */
export function assignTeam(title: string, description: string, isUI: boolean): AgentTeam {
    const combined = `${title} ${description}`.toLowerCase();

    if (TEST_KEYWORDS.some(k => combined.includes(k))) {
        return 'verification';
    }
    if (RESEARCH_KEYWORDS.some(k => combined.includes(k))) {
        return 'research';
    }
    if (PLANNING_KEYWORDS.some(k => combined.includes(k))) {
        return 'planning';
    }
    if (isUI || UI_KEYWORDS.some(k => combined.includes(k))) {
        return 'coding';
    }
    return 'coding';
}

/**
 * Detect if a task involves UI work based on its content.
 *
 * **Simple explanation**: Checks if the task is about building something visual.
 */
export function detectIsUI(title: string, description: string, technicalNotes: string): boolean {
    const combined = `${title} ${description} ${technicalNotes}`.toLowerCase();
    return UI_KEYWORDS.some(k => combined.includes(k));
}

// ============================================================================
// Feature → Master Ticket Conversion
// ============================================================================

/**
 * Convert a feature block into a master ticket.
 *
 * **Simple explanation**: Turns one big feature from the plan into a master work item.
 */
export function featureToMasterTicket(
    feature: FeatureBlock,
    blockLinks: BlockLink[],
    allFeatures: FeatureBlock[],
    config: TaskBreakdownConfig
): MasterTicket {
    const prefix = config.masterTicketPrefix;

    // Build dependency list from block links
    const dependsOn: string[] = [];
    for (const link of blockLinks) {
        if (link.targetBlockId === feature.id &&
            (link.dependencyType === 'requires' || link.dependencyType === 'blocks')) {
            const sourceFeature = allFeatures.find(f => f.id === link.sourceBlockId);
            if (sourceFeature) {
                dependsOn.push(`${prefix}-${String(sourceFeature.order).padStart(3, '0')}`);
            }
        }
    }

    return {
        id: `${prefix}-${String(feature.order).padStart(3, '0')}`,
        featureId: feature.id,
        title: feature.name,
        description: `${feature.description}\n\nPurpose: ${feature.purpose}`,
        priority: mapPriority(feature.priority),
        acceptanceCriteria: [...feature.acceptanceCriteria],
        technicalNotes: feature.technicalNotes,
        childTaskIds: [],
        dependsOn,
        estimatedMinutes: 0,
        assignedTeam: 'orchestrator'
    };
}

// ============================================================================
// Developer Story → Atomic Task Conversion
// ============================================================================

/**
 * Convert a developer story into an atomic task.
 *
 * **Simple explanation**: Takes a dev story (e.g., "implement user auth") and
 * creates a concrete task with estimated time, files, and acceptance criteria.
 */
export function devStoryToTask(
    story: DeveloperStory,
    masterTicketId: string,
    taskNumber: number,
    feature: FeatureBlock,
    config: TaskBreakdownConfig
): AtomicTask {
    const estimatedMinutes = Math.max(
        config.minTaskDuration,
        Math.min(config.maxTaskDuration, Math.round(story.estimatedHours * 60))
    );

    const isUI = detectIsUI(story.action, story.benefit, story.apiNotes);
    const team = config.autoAssignTeams
        ? assignTeam(story.action, story.benefit, isUI)
        : 'coding';

    // Build file list from technical requirements
    const files = story.technicalRequirements
        .filter(r => r.includes('.ts') || r.includes('.js') || r.includes('.json'))
        .slice(0, 5);

    // Build acceptance criteria from the story
    const acceptanceCriteria: string[] = [];
    if (story.benefit) {
        acceptanceCriteria.push(`Achieves: ${story.benefit}`);
    }
    for (const req of story.technicalRequirements.slice(0, 3)) {
        acceptanceCriteria.push(`Implements: ${req}`);
    }
    if (story.apiNotes) {
        acceptanceCriteria.push(`API: ${story.apiNotes}`);
    }
    if (story.databaseNotes) {
        acceptanceCriteria.push(`DB: ${story.databaseNotes}`);
    }

    return {
        id: `${masterTicketId}.${taskNumber}`,
        parentId: masterTicketId,
        featureId: feature.id,
        title: story.action,
        description: `${story.action}\n\nBenefit: ${story.benefit}`,
        priority: mapPriority(feature.priority),
        estimatedMinutes,
        dependsOn: [...story.relatedTaskIds],
        acceptanceCriteria,
        files,
        isUI,
        assignedTeam: team,
        status: 'pending',
        developerStoryId: story.id,
        relatedUserStoryIds: []
    };
}

/**
 * Create a test task for an implementation task.
 *
 * **Simple explanation**: For each coding task, generates a matching test task.
 */
export function createTestTask(
    implTask: AtomicTask,
    taskNumber: number
): AtomicTask {
    return {
        id: `${implTask.parentId}.${taskNumber}`,
        parentId: implTask.parentId,
        featureId: implTask.featureId,
        title: `Write tests for: ${implTask.title}`,
        description: `Create test suite for task ${implTask.id}.\n\nTest that: ${implTask.acceptanceCriteria.join(', ')}`,
        priority: implTask.priority,
        estimatedMinutes: Math.max(15, Math.round(implTask.estimatedMinutes * 0.5)),
        dependsOn: [implTask.id],
        acceptanceCriteria: [
            'All tests pass',
            'Coverage maintained at 85%+',
            `Tests verify: ${implTask.title}`
        ],
        files: implTask.files.map(f => f.replace('src/', 'tests/')),
        isUI: false,
        assignedTeam: 'verification',
        status: 'pending',
        developerStoryId: implTask.developerStoryId,
        relatedUserStoryIds: implTask.relatedUserStoryIds
    };
}

// ============================================================================
// User Story Linking
// ============================================================================

/**
 * Link user stories to atomic tasks based on related feature blocks.
 *
 * **Simple explanation**: Connects "As a user, I want..." stories to the
 * technical tasks that implement them.
 */
export function linkUserStories(
    tasks: AtomicTask[],
    userStories: UserStory[],
    features: FeatureBlock[]
): AtomicTask[] {
    return tasks.map(task => {
        const relatedUserStoryIds: string[] = [];
        for (const story of userStories) {
            // A user story relates to a task if they share a feature block
            const taskFeature = features.find(f => f.id === task.featureId);
            if (taskFeature && story.relatedBlockIds.includes(taskFeature.id)) {
                relatedUserStoryIds.push(story.id);
            }
        }
        return { ...task, relatedUserStoryIds };
    });
}

// ============================================================================
// Dependency Resolution
// ============================================================================

/**
 * Build a dependency graph from tasks, resolving cross-feature dependencies.
 *
 * **Simple explanation**: Creates a map showing which tasks must be done before others.
 */
export function buildDependencyGraph(
    tasks: AtomicTask[],
    masterTickets: MasterTicket[]
): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const task of tasks) {
        const resolvedDeps: string[] = [];

        for (const dep of task.dependsOn) {
            // Check if dependency exists in our task list
            if (tasks.some(t => t.id === dep)) {
                resolvedDeps.push(dep);
            }
        }

        // Also add implicit dependency: task depends on its parent MT's dependencies' last tasks
        const parentMT = masterTickets.find(mt => mt.id === task.parentId);
        if (parentMT) {
            for (const mtDep of parentMT.dependsOn) {
                const depMT = masterTickets.find(mt => mt.id === mtDep);
                if (depMT && depMT.childTaskIds.length > 0) {
                    // First task in a feature depends on last task of dependency feature
                    const isFirstTask = parentMT.childTaskIds[0] === task.id;
                    if (isFirstTask) {
                        const lastTaskId = depMT.childTaskIds[depMT.childTaskIds.length - 1];
                        if (!resolvedDeps.includes(lastTaskId)) {
                            resolvedDeps.push(lastTaskId);
                        }
                    }
                }
            }
        }

        graph.set(task.id, resolvedDeps);
    }

    return graph;
}

/**
 * Compute execution order using topological sort.
 *
 * **Simple explanation**: Figures out the best order to do tasks so you never
 * start something before its prerequisites are done.
 */
export function computeExecutionOrder(
    dependencyGraph: Map<string, string[]>
): { order: string[]; warnings: string[] } {
    const order: string[] = [];
    const warnings: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    function visit(nodeId: string): void {
        if (visited.has(nodeId)) { return; }
        if (visiting.has(nodeId)) {
            warnings.push(`Circular dependency detected involving task ${nodeId}`);
            return;
        }

        visiting.add(nodeId);

        const deps = dependencyGraph.get(nodeId) ?? [];
        for (const dep of deps) {
            visit(dep);
        }

        visiting.delete(nodeId);
        visited.add(nodeId);
        order.push(nodeId);
    }

    for (const nodeId of dependencyGraph.keys()) {
        visit(nodeId);
    }

    return { order, warnings };
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generate a complete task breakdown from a plan.
 *
 * **Simple explanation**: Takes your full plan and creates all the master tickets,
 * atomic tasks, dependencies, and execution order needed to start building.
 *
 * @param plan - The complete plan from the planning wizard
 * @param config - Optional configuration overrides
 * @returns Complete task breakdown with tickets, tasks, and execution order
 */
export function generateTaskBreakdown(
    plan: CompletePlan,
    config: Partial<TaskBreakdownConfig> = {}
): TaskBreakdownResult {
    const cfg: TaskBreakdownConfig = { ...DEFAULT_TASK_BREAKDOWN_CONFIG, ...config };
    const warnings: string[] = [];

    // Validate plan has features
    if (!plan.featureBlocks || plan.featureBlocks.length === 0) {
        return {
            masterTickets: [],
            tasks: [],
            dependencyGraph: new Map(),
            executionOrder: [],
            totalEstimatedMinutes: 0,
            summary: 'No feature blocks found in plan.',
            warnings: ['Plan has no feature blocks — nothing to break down.']
        };
    }

    // ── Step 1: Create master tickets from feature blocks ──
    const masterTickets: MasterTicket[] = plan.featureBlocks.map(feature =>
        featureToMasterTicket(feature, plan.blockLinks, plan.featureBlocks, cfg)
    );

    // ── Step 2: Create atomic tasks from developer stories ──
    const allTasks: AtomicTask[] = [];

    for (const mt of masterTickets) {
        const feature = plan.featureBlocks.find(f => f.id === mt.featureId);
        if (!feature) { continue; }

        // Find developer stories related to this feature
        const relatedStories = plan.developerStories.filter(ds =>
            ds.relatedBlockIds.includes(feature.id)
        );

        let taskNumber = 1;

        if (relatedStories.length === 0) {
            // Create a single default task for features with no dev stories
            const defaultTask: AtomicTask = {
                id: `${mt.id}.${taskNumber}`,
                parentId: mt.id,
                featureId: feature.id,
                title: `Implement ${feature.name}`,
                description: feature.description,
                priority: mt.priority,
                estimatedMinutes: cfg.maxTaskDuration,
                dependsOn: [],
                acceptanceCriteria: [...feature.acceptanceCriteria],
                files: [],
                isUI: detectIsUI(feature.name, feature.description, feature.technicalNotes),
                assignedTeam: cfg.autoAssignTeams
                    ? assignTeam(feature.name, feature.description, false)
                    : 'coding',
                status: 'pending',
                developerStoryId: null,
                relatedUserStoryIds: []
            };
            allTasks.push(defaultTask);
            mt.childTaskIds.push(defaultTask.id);
            taskNumber++;

            warnings.push(`Feature "${feature.name}" has no developer stories — created default task.`);
        } else {
            // Enforce max tasks per feature
            const stories = relatedStories.slice(0, cfg.maxTasksPerFeature);
            if (relatedStories.length > cfg.maxTasksPerFeature) {
                warnings.push(
                    `Feature "${feature.name}" has ${relatedStories.length} dev stories, ` +
                    `capped at ${cfg.maxTasksPerFeature}.`
                );
            }

            for (const story of stories) {
                const task = devStoryToTask(story, mt.id, taskNumber, feature, cfg);
                allTasks.push(task);
                mt.childTaskIds.push(task.id);
                taskNumber++;

                // Generate test task if configured
                if (cfg.generateTestTasks) {
                    const testTask = createTestTask(task, taskNumber);
                    allTasks.push(testTask);
                    mt.childTaskIds.push(testTask.id);
                    taskNumber++;
                }
            }
        }

        // Update master ticket estimated time
        mt.estimatedMinutes = allTasks
            .filter(t => t.parentId === mt.id)
            .reduce((sum, t) => sum + t.estimatedMinutes, 0);
    }

    // ── Step 3: Link user stories ──
    const linkedTasks = linkUserStories(allTasks, plan.userStories, plan.featureBlocks);

    // ── Step 4: Build dependency graph ──
    const dependencyGraph = buildDependencyGraph(linkedTasks, masterTickets);

    // ── Step 5: Compute execution order ──
    const { order: executionOrder, warnings: depWarnings } = computeExecutionOrder(dependencyGraph);
    warnings.push(...depWarnings);

    // ── Step 6: Update task statuses (ready if all deps are empty) ──
    const readyTasks = linkedTasks.map(task => {
        const deps = dependencyGraph.get(task.id) ?? [];
        if (deps.length === 0) {
            return { ...task, status: 'ready' as TaskStatus };
        }
        return task;
    });

    // ── Step 7: Build summary ──
    const totalEstimatedMinutes = masterTickets.reduce((sum, mt) => sum + mt.estimatedMinutes, 0);
    const totalHours = Math.round(totalEstimatedMinutes / 60 * 10) / 10;
    const readyCount = readyTasks.filter(t => t.status === 'ready').length;

    const summary = [
        `Plan "${plan.overview.name}" broken down into:`,
        `  • ${masterTickets.length} master tickets (features)`,
        `  • ${readyTasks.length} atomic tasks`,
        `  • ${readyCount} tasks ready to start`,
        `  • ${totalEstimatedMinutes} minutes estimated (${totalHours} hours)`,
        warnings.length > 0 ? `  • ${warnings.length} warnings` : ''
    ].filter(Boolean).join('\n');

    return {
        masterTickets,
        tasks: readyTasks,
        dependencyGraph,
        executionOrder,
        totalEstimatedMinutes,
        summary,
        warnings
    };
}

// ============================================================================
// Utility: Convert to Ticket Format
// ============================================================================

/**
 * Convert a master ticket to the format expected by ticketDb.createTicket().
 *
 * **Simple explanation**: Translates our master ticket into the format the
 * ticket database understands.
 */
export function masterTicketToDbFormat(mt: MasterTicket): {
    title: string;
    status: 'open';
    priority: number;
    description: string;
    creator: string;
    assignee: string;
    taskId: string | null;
    version: number;
    resolution: string | null;
} {
    const priorityMap: Record<TaskPriority, number> = { P0: 1, P1: 2, P2: 3, P3: 4 };

    return {
        title: `[${mt.id}] ${mt.title}`,
        status: 'open',
        priority: priorityMap[mt.priority],
        description: [
            mt.description,
            '',
            '## Acceptance Criteria',
            ...mt.acceptanceCriteria.map(ac => `- ${ac}`),
            '',
            mt.technicalNotes ? `## Technical Notes\n${mt.technicalNotes}` : '',
            '',
            `## Child Tasks: ${mt.childTaskIds.length}`,
            `## Dependencies: ${mt.dependsOn.join(', ') || 'None'}`,
            `## Estimated: ${mt.estimatedMinutes} min`
        ].filter(Boolean).join('\n'),
        creator: 'planning-wizard',
        assignee: 'Orchestrator',
        taskId: mt.id,
        version: 1,
        resolution: null
    };
}

/**
 * Convert an atomic task to the format expected by ticketDb.createTicket().
 *
 * **Simple explanation**: Translates an atomic task into the format the
 * ticket database understands.
 */
export function atomicTaskToDbFormat(task: AtomicTask): {
    title: string;
    status: 'open';
    priority: number;
    description: string;
    creator: string;
    assignee: string;
    taskId: string | null;
    version: number;
    resolution: string | null;
} {
    const priorityMap: Record<TaskPriority, number> = { P0: 1, P1: 2, P2: 3, P3: 4 };
    const teamMap: Record<AgentTeam, string> = {
        planning: 'Planning Agent',
        coding: 'Coding Agent',
        verification: 'Verification Agent',
        research: 'Research Agent',
        orchestrator: 'Orchestrator'
    };

    return {
        title: `[${task.id}] ${task.title}`,
        status: 'open',
        priority: priorityMap[task.priority],
        description: [
            task.description,
            '',
            '## Acceptance Criteria',
            ...task.acceptanceCriteria.map(ac => `- ${ac}`),
            '',
            task.files.length > 0 ? `## Files\n${task.files.map(f => `- ${f}`).join('\n')}` : '',
            '',
            `## Parent: ${task.parentId}`,
            `## Dependencies: ${task.dependsOn.join(', ') || 'None'}`,
            `## Estimated: ${task.estimatedMinutes} min`,
            task.developerStoryId ? `## Dev Story: ${task.developerStoryId}` : ''
        ].filter(Boolean).join('\n'),
        creator: 'planning-wizard',
        assignee: teamMap[task.assignedTeam],
        taskId: task.id,
        version: 1,
        resolution: null
    };
}
