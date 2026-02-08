/**
 * Coding Agent Task Handoff Service (MT-033.31)
 *
 * Creates complete, self-contained task handoff packages for the coding
 * agent. Each handoff package contains everything the agent needs to
 * execute a task without asking questions: task definition, acceptance
 * criteria, file references, code patterns, test specs, and constraints.
 *
 * **Simple explanation**: Like giving a contractor a complete work order —
 * the job description, blueprints, materials list, and rules — so they
 * can start building without asking a single question.
 *
 * @module services/codingHandoff
 */

import {
    AtomicTask,
    MasterTicket,
    TaskBreakdownResult,
    TaskStatus,
    AgentTeam
} from '../generators/taskBreakdown';

import {
    CompletePlan,
    FeatureBlock,
    DeveloperStory
} from '../planning/types';

// ============================================================================
// Types
// ============================================================================

/** What kind of work this task requires */
export type TaskType = 'build' | 'fix' | 'refactor' | 'test' | 'document';

/** Urgency level for the handoff */
export type HandoffUrgency = 'immediate' | 'normal' | 'low';

/** Delivery acknowledgment status */
export type AcknowledgmentStatus = 'pending' | 'acknowledged' | 'rejected' | 'timeout';

/**
 * A file reference that tells the coding agent which files to touch.
 *
 * **Simple explanation**: A pointer to a specific file with notes about what to do with it.
 */
export interface FileReference {
    /** Relative file path (e.g., "src/services/myService.ts") */
    path: string;
    /** Whether to create, modify, or delete this file */
    action: 'create' | 'modify' | 'delete';
    /** What to do with this file */
    description: string;
    /** Key sections or line ranges to focus on (optional) */
    sections?: string[];
}

/**
 * A code pattern the agent should follow.
 *
 * **Simple explanation**: "Here's how we do things around here" — examples of existing
 * patterns so the new code matches the rest of the codebase.
 */
export interface CodePattern {
    /** Name of the pattern (e.g., "Singleton Service Pattern") */
    name: string;
    /** Explanation of when/why to use it */
    description: string;
    /** Example code snippet */
    example: string;
    /** Where this pattern is already used */
    references: string[];
}

/**
 * A test specification the agent must satisfy.
 *
 * **Simple explanation**: A checklist of tests that must pass before the task is "done."
 */
export interface TestSpecification {
    /** Test file to create or update */
    testFile: string;
    /** Description of what to test */
    description: string;
    /** Minimum number of tests expected */
    minimumTestCount: number;
    /** Specific scenarios that must be tested */
    requiredScenarios: string[];
    /** Target coverage percentage */
    targetCoverage: number;
}

/**
 * A constraint the coding agent must respect.
 *
 * **Simple explanation**: Rules like "don't touch this file" or "must use this library."
 */
export interface Constraint {
    /** Type of constraint */
    type: 'no-modify' | 'must-use' | 'no-use' | 'style' | 'performance' | 'security';
    /** Human-readable description */
    description: string;
    /** Affected files or modules (optional) */
    scope?: string[];
}

/**
 * Complete task handoff package for the coding agent.
 *
 * **Simple explanation**: The full work order — everything the coding agent needs
 * to start and finish a task without asking questions.
 */
export interface HandoffPackage {
    /** Unique package ID */
    id: string;
    /** Handoff creation timestamp (ISO 8601) */
    createdAt: string;
    /** Handoff urgency (immediate / normal / low) */
    urgency: HandoffUrgency;

    // ── Task Definition ──────────────────────────────────────────────
    /** The atomic task being handed off */
    task: AtomicTask;
    /** Parent master ticket for context */
    parentTicket: MasterTicket;
    /** Type of work required */
    taskType: TaskType;
    /** One-sentence summary of what to do */
    summary: string;
    /** Detailed description of the work */
    detailedDescription: string;

    // ── Acceptance Criteria ──────────────────────────────────────────
    /** Criteria that must be satisfied for task completion */
    acceptanceCriteria: string[];
    /** Definition of "done" */
    definitionOfDone: string[];

    // ── File References ──────────────────────────────────────────────
    /** Files to create, modify, or delete */
    fileReferences: FileReference[];

    // ── Code Patterns ────────────────────────────────────────────────
    /** Patterns the agent should follow */
    codePatterns: CodePattern[];

    // ── Test Specifications ──────────────────────────────────────────
    /** Tests the agent must write or update */
    testSpecifications: TestSpecification[];

    // ── Constraints ──────────────────────────────────────────────────
    /** Rules the agent must follow */
    constraints: Constraint[];

    // ── Context ──────────────────────────────────────────────────────
    /** Related tasks that have been completed (for context) */
    completedDependencies: string[];
    /** Related tasks currently in progress */
    inProgressSiblings: string[];
    /** Technical notes from the plan */
    technicalNotes: string;
}

/**
 * Delivery receipt for a handoff package.
 *
 * **Simple explanation**: Proof that the coding agent received the work order
 * and either accepted or rejected it.
 */
export interface DeliveryReceipt {
    /** Package ID this receipt is for */
    packageId: string;
    /** When the receipt was created */
    timestamp: string;
    /** Acknowledgment status */
    status: AcknowledgmentStatus;
    /** Agent who received the package */
    receivedBy: string;
    /** Reason for rejection (if rejected) */
    rejectionReason?: string;
    /** Estimated completion time from the agent (minutes) */
    estimatedCompletionMinutes?: number;
}

/**
 * Configuration for handoff package creation.
 *
 * **Simple explanation**: Settings that control how handoff packages are generated.
 */
export interface HandoffConfig {
    /** Include code pattern examples (default: true) */
    includePatterns: boolean;
    /** Maximum number of code patterns to include (default: 5) */
    maxPatterns: number;
    /** Include test specifications (default: true) */
    includeTestSpecs: boolean;
    /** Default target test coverage (default: 85) */
    defaultTestCoverage: number;
    /** Minimum test count per task (default: 5) */
    minimumTestCount: number;
    /** Acknowledgment timeout in seconds (default: 30) */
    acknowledgmentTimeoutSeconds: number;
    /** Include sibling task info for context (default: true) */
    includeSiblingContext: boolean;
}

/**
 * Default handoff configuration.
 *
 * **Simple explanation**: Standard settings used when no custom config is provided.
 */
export const DEFAULT_HANDOFF_CONFIG: HandoffConfig = {
    includePatterns: true,
    maxPatterns: 5,
    includeTestSpecs: true,
    defaultTestCoverage: 85,
    minimumTestCount: 5,
    acknowledgmentTimeoutSeconds: 30,
    includeSiblingContext: true
};

// ============================================================================
// Task Type Detection
// ============================================================================

/**
 * Determine the type of work a task represents.
 *
 * **Simple explanation**: Reads the task description to figure out if it's
 * building something new, fixing a bug, refactoring, testing, or documenting.
 */
export function detectTaskType(task: AtomicTask): TaskType {
    const text = `${task.title} ${task.description}`.toLowerCase();

    if (/\b(fix|bug|error|issue|patch|hotfix|resolve|repair)\b/.test(text)) {
        return 'fix';
    }
    if (/\b(refactor|restructure|reorganize|simplify|clean\s?up|optimize)\b/.test(text)) {
        return 'refactor';
    }
    if (/\b(test|spec|coverage|assert|verify|validate|unit\s?test)\b/.test(text)) {
        return 'test';
    }
    if (/\b(document|docs|readme|jsdoc|comment|guide|tutorial)\b/.test(text)) {
        return 'document';
    }

    return 'build';
}

// ============================================================================
// Urgency Determination
// ============================================================================

/**
 * Determine handoff urgency based on task priority and status context.
 *
 * **Simple explanation**: P0 tasks or tasks that block others get "immediate" urgency.
 * P3 tasks get "low." Everything else is "normal."
 */
export function determineUrgency(
    task: AtomicTask,
    blockingCount: number
): HandoffUrgency {
    // P0 priority or blocking 2+ tasks → immediate
    if (task.priority === 'P0' || blockingCount >= 2) {
        return 'immediate';
    }

    // P3 priority and not blocking anything → low
    if (task.priority === 'P3' && blockingCount === 0) {
        return 'low';
    }

    return 'normal';
}

// ============================================================================
// File Reference Generation
// ============================================================================

/**
 * Generate file references from a task's file list.
 *
 * **Simple explanation**: Converts the task's file paths into structured references
 * with actions (create vs modify) and descriptions.
 */
export function generateFileReferences(
    task: AtomicTask,
    taskType: TaskType
): FileReference[] {
    return task.files.map(filePath => {
        const action = determineFileAction(filePath, taskType);
        const description = describeFileAction(filePath, action, task.title);
        return { path: filePath, action, description };
    });
}

/**
 * Determine the file action based on path conventions and task type.
 *
 * **Simple explanation**: If the file starts with "create" context or the task
 * is "build," assume we're creating it. If refactoring, we're modifying.
 */
export function determineFileAction(
    filePath: string,
    taskType: TaskType
): 'create' | 'modify' | 'delete' {
    // Test files for new features → create
    if (filePath.startsWith('tests/') && taskType === 'build') {
        return 'create';
    }
    // Source files for new features → create
    if (taskType === 'build' && !filePath.includes('extension.ts')) {
        return 'create';
    }
    // Refactor/fix → modify
    return 'modify';
}

/**
 * Generate a human-readable description of the file action.
 */
function describeFileAction(
    filePath: string,
    action: 'create' | 'modify' | 'delete',
    taskTitle: string
): string {
    switch (action) {
        case 'create':
            return `Create ${filePath} for ${taskTitle}`;
        case 'modify':
            return `Modify ${filePath} as part of ${taskTitle}`;
        case 'delete':
            return `Remove ${filePath} (no longer needed)`;
    }
}

// ============================================================================
// Code Pattern Generation
// ============================================================================

/**
 * Standard code patterns used across the COE codebase.
 *
 * **Simple explanation**: The "how we do things" reference library — a coding
 * agent looks at these before writing any code.
 */
const STANDARD_PATTERNS: CodePattern[] = [
    {
        name: 'Singleton Service Pattern',
        description: 'All core services use a module-level instance with initialize/get/reset exports.',
        example: `let instance: MyService | null = null;
export async function initializeMyService(ctx: vscode.ExtensionContext): Promise<void> {
    if (instance !== null) throw new Error('Already initialized');
    instance = new MyService();
    await instance.init(ctx);
}
export function getMyServiceInstance(): MyService {
    if (!instance) throw new Error('Not initialized');
    return instance;
}
export function resetMyServiceForTests(): void { instance = null; }`,
        references: ['src/services/orchestrator.ts', 'src/services/ticketDb.ts', 'src/services/llmService.ts']
    },
    {
        name: 'Typed Error Handling',
        description: 'All catch blocks use unknown type with instanceof Error check.',
        example: `catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(\`Operation failed: \${msg}\`);
}`,
        references: ['src/services/orchestrator.ts', 'src/agents/answerAgent.ts']
    },
    {
        name: 'Test Naming Convention',
        description: 'All test descriptions must be prefixed with "Test N: " for sequential tracking.',
        example: `it('Test 1: should initialize with default config', () => { ... });
it('Test 2: should throw when already initialized', () => { ... });`,
        references: ['tests/services/orchestrator.test.ts', 'tests/config/configService.test.ts']
    },
    {
        name: 'JSDoc with Simple Explanation',
        description: 'All public functions include a "**Simple explanation**" for beginners.',
        example: `/**
 * Brief technical summary.
 *
 * **Simple explanation**: Beginner-friendly analogy or metaphor.
 */`,
        references: ['src/services/orchestrator.ts', 'src/ui/planHandoff.ts']
    },
    {
        name: 'Generator Pattern',
        description: 'All generators are pure functions with typed config + DEFAULT constant + result interface.',
        example: `export const DEFAULT_CONFIG: MyConfig = { ... };
export function generateX(plan: CompletePlan, config?: Partial<MyConfig>): MyResult {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    // ...
    return { files: [], summary: '', warnings: [] };
}`,
        references: ['src/generators/taskBreakdown.ts', 'src/services/planExport.ts']
    }
];

/**
 * Select relevant code patterns for a task.
 *
 * **Simple explanation**: Picks the patterns most relevant to the task at hand.
 * A service task gets the singleton pattern; a test task gets the naming convention.
 */
export function selectPatterns(
    task: AtomicTask,
    taskType: TaskType,
    config: HandoffConfig
): CodePattern[] {
    if (!config.includePatterns) {
        return [];
    }

    const text = `${task.title} ${task.description}`.toLowerCase();
    const relevant: CodePattern[] = [];

    // Always include typed error handling
    const errorPattern = STANDARD_PATTERNS.find(p => p.name === 'Typed Error Handling');
    if (errorPattern) {
        relevant.push(errorPattern);
    }

    // Service-related task → singleton pattern
    if (text.includes('service') || text.includes('singleton') || text.includes('initialize')) {
        const singleton = STANDARD_PATTERNS.find(p => p.name === 'Singleton Service Pattern');
        if (singleton) {
            relevant.push(singleton);
        }
    }

    // Test-related task → naming convention
    if (taskType === 'test' || text.includes('test')) {
        const testNaming = STANDARD_PATTERNS.find(p => p.name === 'Test Naming Convention');
        if (testNaming) {
            relevant.push(testNaming);
        }
    }

    // Build/document task → JSDoc pattern
    if (taskType === 'build' || taskType === 'document') {
        const jsdoc = STANDARD_PATTERNS.find(p => p.name === 'JSDoc with Simple Explanation');
        if (jsdoc) {
            relevant.push(jsdoc);
        }
    }

    // Generator-related task → generator pattern
    if (text.includes('generator') || text.includes('generate')) {
        const generator = STANDARD_PATTERNS.find(p => p.name === 'Generator Pattern');
        if (generator) {
            relevant.push(generator);
        }
    }

    // Limit to maxPatterns
    return relevant.slice(0, config.maxPatterns);
}

// ============================================================================
// Test Specification Generation
// ============================================================================

/**
 * Generate test specifications for a task.
 *
 * **Simple explanation**: Creates a list of tests the coding agent must write
 * or verify, based on the task's acceptance criteria and type.
 */
export function generateTestSpecs(
    task: AtomicTask,
    taskType: TaskType,
    config: HandoffConfig
): TestSpecification[] {
    if (!config.includeTestSpecs) {
        return [];
    }

    // Derive test file path from task files
    const testFile = deriveTestFilePath(task);

    const requiredScenarios = buildRequiredScenarios(task, taskType);

    return [{
        testFile,
        description: `Tests for ${task.title}`,
        minimumTestCount: Math.max(config.minimumTestCount, task.acceptanceCriteria.length),
        requiredScenarios,
        targetCoverage: config.defaultTestCoverage
    }];
}

/**
 * Derive the test file path from a task's file references.
 *
 * **Simple explanation**: If the source file is "src/services/myService.ts",
 * the test file becomes "tests/services/myService.test.ts".
 */
export function deriveTestFilePath(task: AtomicTask): string {
    if (task.files.length === 0) {
        return `tests/${task.id.replace(/\./g, '-')}.test.ts`;
    }

    const primaryFile = task.files[0];
    // src/services/foo.ts → tests/services/foo.test.ts
    const testPath = primaryFile
        .replace(/^src\//, 'tests/')
        .replace(/\.ts$/, '.test.ts');
    return testPath;
}

/**
 * Build the list of required test scenarios.
 *
 * **Simple explanation**: Generates test scenario names from acceptance criteria
 * and common patterns for the task type.
 */
export function buildRequiredScenarios(
    task: AtomicTask,
    taskType: TaskType
): string[] {
    const scenarios: string[] = [];

    // Convert acceptance criteria to test scenarios
    for (const criterion of task.acceptanceCriteria) {
        scenarios.push(`should ${criterion.toLowerCase()}`);
    }

    // Add type-specific common scenarios
    switch (taskType) {
        case 'build':
            scenarios.push('should handle invalid input gracefully');
            scenarios.push('should export all public APIs');
            break;
        case 'fix':
            scenarios.push('should not reproduce the original bug');
            scenarios.push('should not break existing functionality');
            break;
        case 'refactor':
            scenarios.push('should maintain existing behavior');
            scenarios.push('should pass all existing tests');
            break;
        case 'test':
            scenarios.push('should achieve target coverage');
            break;
        case 'document':
            scenarios.push('should include JSDoc for all public functions');
            break;
    }

    return scenarios;
}

// ============================================================================
// Constraint Generation
// ============================================================================

/**
 * Generate default constraints for a task.
 *
 * **Simple explanation**: Adds standard rules like "use typed catches"
 * and "no hardcoded credentials" to every handoff.
 */
export function generateConstraints(
    task: AtomicTask,
    taskType: TaskType
): Constraint[] {
    const constraints: Constraint[] = [
        {
            type: 'style',
            description: 'Use async/await instead of .then() chains'
        },
        {
            type: 'security',
            description: 'No hardcoded credentials, API keys, or secrets'
        },
        {
            type: 'style',
            description: 'Use typed catch blocks: catch (error: unknown)'
        }
    ];

    // Build tasks should not modify extension.ts without explicit need
    if (taskType === 'build') {
        constraints.push({
            type: 'no-modify',
            description: 'Do not modify src/extension.ts unless task explicitly requires it',
            scope: ['src/extension.ts']
        });
    }

    // Refactor tasks must maintain behavior
    if (taskType === 'refactor') {
        constraints.push({
            type: 'style',
            description: 'All existing tests must continue to pass without modification'
        });
    }

    // Security constraint for service tasks
    const text = `${task.title} ${task.description}`.toLowerCase();
    if (text.includes('api') || text.includes('endpoint') || text.includes('request')) {
        constraints.push({
            type: 'security',
            description: 'Validate and sanitize all external inputs'
        });
    }

    return constraints;
}

// ============================================================================
// Dependency Context
// ============================================================================

/**
 * Collect completed dependency task IDs for context.
 *
 * **Simple explanation**: Lists which prerequisite tasks are already done,
 * so the coding agent knows what foundation exists.
 */
export function getCompletedDependencies(
    task: AtomicTask,
    allTasks: AtomicTask[]
): string[] {
    return task.dependsOn.filter(depId => {
        const dep = allTasks.find(t => t.id === depId);
        return dep && dep.status === 'done';
    });
}

/**
 * Collect sibling tasks that are currently in progress.
 *
 * **Simple explanation**: Shows what other agents are working on right now
 * so this agent can coordinate.
 */
export function getInProgressSiblings(
    task: AtomicTask,
    allTasks: AtomicTask[]
): string[] {
    return allTasks
        .filter(t =>
            t.id !== task.id &&
            t.parentId === task.parentId &&
            t.status === 'in_progress'
        )
        .map(t => `${t.id}: ${t.title}`);
}

// ============================================================================
// Summary Generation
// ============================================================================

/**
 * Generate a one-sentence summary of the task.
 *
 * **Simple explanation**: Creates a brief "do this" statement from the task details.
 */
export function generateSummary(
    task: AtomicTask,
    taskType: TaskType,
    parentTicket: MasterTicket
): string {
    const verb = getVerb(taskType);
    return `${verb} ${task.title} (part of ${parentTicket.title})`;
}

/**
 * Get the action verb for a task type.
 */
function getVerb(taskType: TaskType): string {
    switch (taskType) {
        case 'build': return 'Implement';
        case 'fix': return 'Fix';
        case 'refactor': return 'Refactor';
        case 'test': return 'Write tests for';
        case 'document': return 'Document';
    }
}

// ============================================================================
// Definition of Done
// ============================================================================

/**
 * Generate the definition of done for a task.
 *
 * **Simple explanation**: A checklist that must be fully satisfied before
 * the task can be marked as complete.
 */
export function generateDefinitionOfDone(
    task: AtomicTask,
    taskType: TaskType,
    config: HandoffConfig
): string[] {
    const dod: string[] = [
        'All acceptance criteria met',
        'Code compiles with zero TypeScript errors (npm run compile)',
        'All tests pass (npm run test:once)',
        'Zero lint errors (npm run lint)'
    ];

    if (taskType === 'build' || taskType === 'refactor') {
        dod.push(`Test coverage >= ${config.defaultTestCoverage}%`);
    }

    if (taskType === 'build') {
        dod.push('All public functions have JSDoc with **Simple explanation**');
    }

    if (task.isUI) {
        dod.push('UI renders correctly in VS Code webview');
    }

    return dod;
}

// ============================================================================
// Technical Notes
// ============================================================================

/**
 * Gather technical notes from the plan for this task.
 *
 * **Simple explanation**: Pulls relevant technical context from the feature block
 * and developer story so the agent has architectural guidance.
 */
export function gatherTechnicalNotes(
    task: AtomicTask,
    parentTicket: MasterTicket,
    plan: CompletePlan
): string {
    const notes: string[] = [];

    // Parent ticket technical notes
    if (parentTicket.technicalNotes) {
        notes.push(`Feature notes: ${parentTicket.technicalNotes}`);
    }

    // Developer story notes (if linked)
    if (task.developerStoryId && plan.developerStories) {
        for (const story of plan.developerStories) {
            if (story.id === task.developerStoryId) {
                if (story.apiNotes) {
                    notes.push(`API notes: ${story.apiNotes}`);
                }
                if (story.databaseNotes) {
                    notes.push(`Database notes: ${story.databaseNotes}`);
                }
                if (story.technicalRequirements && story.technicalRequirements.length > 0) {
                    notes.push(`Tech requirements: ${story.technicalRequirements.join(', ')}`);
                }
            }
        }
    }

    return notes.join('\n');
}

// ============================================================================
// Package ID Generation
// ============================================================================

/**
 * Generate a unique handoff package ID.
 *
 * **Simple explanation**: Creates an ID like "HO-MT-1.3-20240115T143022"
 * combining the task ID and a timestamp.
 */
export function generatePackageId(taskId: string): string {
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
    return `HO-${taskId}-${ts}`;
}

// ============================================================================
// Handoff Package Creation
// ============================================================================

/**
 * Count how many tasks depend on the given task.
 *
 * **Simple explanation**: Checks how many other tasks are waiting for this one.
 */
export function countBlockedTasks(
    taskId: string,
    allTasks: AtomicTask[]
): number {
    return allTasks.filter(t => t.dependsOn.includes(taskId)).length;
}

/**
 * Create a complete handoff package for a task.
 *
 * **Simple explanation**: Assembles everything the coding agent needs into
 * one self-contained package — task, criteria, files, patterns, tests, constraints.
 *
 * @param task - The atomic task to hand off
 * @param parentTicket - The parent master ticket
 * @param plan - The full plan (for technical context)
 * @param allTasks - All tasks in the breakdown (for dependency context)
 * @param config - Optional configuration overrides
 * @returns Complete HandoffPackage
 */
export function createHandoffPackage(
    task: AtomicTask,
    parentTicket: MasterTicket,
    plan: CompletePlan,
    allTasks: AtomicTask[],
    config?: Partial<HandoffConfig>
): HandoffPackage {
    const cfg: HandoffConfig = { ...DEFAULT_HANDOFF_CONFIG, ...config };

    const taskType = detectTaskType(task);
    const blockingCount = countBlockedTasks(task.id, allTasks);
    const urgency = determineUrgency(task, blockingCount);

    const fileReferences = generateFileReferences(task, taskType);
    const codePatterns = selectPatterns(task, taskType, cfg);
    const testSpecifications = generateTestSpecs(task, taskType, cfg);
    const constraints = generateConstraints(task, taskType);
    const completedDependencies = getCompletedDependencies(task, allTasks);
    const inProgressSiblings = cfg.includeSiblingContext
        ? getInProgressSiblings(task, allTasks)
        : [];
    const summary = generateSummary(task, taskType, parentTicket);
    const definitionOfDone = generateDefinitionOfDone(task, taskType, cfg);
    const technicalNotes = gatherTechnicalNotes(task, parentTicket, plan);

    return {
        id: generatePackageId(task.id),
        createdAt: new Date().toISOString(),
        urgency,

        task,
        parentTicket,
        taskType,
        summary,
        detailedDescription: task.description,

        acceptanceCriteria: [...task.acceptanceCriteria],
        definitionOfDone,

        fileReferences,
        codePatterns,
        testSpecifications,
        constraints,

        completedDependencies,
        inProgressSiblings,
        technicalNotes
    };
}

// ============================================================================
// Delivery & Acknowledgment
// ============================================================================

/**
 * Create a delivery receipt for a handoff package.
 *
 * **Simple explanation**: The coding agent signs for the work order,
 * saying "Yes, I got it and I'll do it" or "No, I can't."
 */
export function createDeliveryReceipt(
    packageId: string,
    agentId: string,
    status: AcknowledgmentStatus,
    rejectionReason?: string,
    estimatedMinutes?: number
): DeliveryReceipt {
    return {
        packageId,
        timestamp: new Date().toISOString(),
        status,
        receivedBy: agentId,
        rejectionReason: status === 'rejected' ? rejectionReason : undefined,
        estimatedCompletionMinutes: status === 'acknowledged' ? estimatedMinutes : undefined
    };
}

/**
 * Check if a delivery receipt indicates successful delivery.
 *
 * **Simple explanation**: Returns true only if the agent accepted the work.
 */
export function isDeliverySuccessful(receipt: DeliveryReceipt): boolean {
    return receipt.status === 'acknowledged';
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that a handoff package is complete and self-contained.
 *
 * **Simple explanation**: Pre-flight check — makes sure nothing's missing
 * before handing the work order to the coding agent.
 */
export function validateHandoffPackage(pkg: HandoffPackage): {
    valid: boolean;
    issues: string[];
} {
    const issues: string[] = [];

    // Must have a task
    if (!pkg.task || !pkg.task.id) {
        issues.push('Missing task or task ID');
    }

    // Must have a parent ticket
    if (!pkg.parentTicket || !pkg.parentTicket.id) {
        issues.push('Missing parent ticket or ticket ID');
    }

    // Must have a summary
    if (!pkg.summary || pkg.summary.trim().length === 0) {
        issues.push('Missing summary');
    }

    // Must have at least one acceptance criterion
    if (!pkg.acceptanceCriteria || pkg.acceptanceCriteria.length === 0) {
        issues.push('No acceptance criteria defined');
    }

    // Must have definition of done
    if (!pkg.definitionOfDone || pkg.definitionOfDone.length === 0) {
        issues.push('No definition of done');
    }

    // Should have file references (warning, not blocking)
    if (!pkg.fileReferences || pkg.fileReferences.length === 0) {
        issues.push('No file references — agent may not know which files to touch');
    }

    return {
        valid: issues.length === 0,
        issues
    };
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a handoff package to JSON for transmission.
 *
 * **Simple explanation**: Converts the work order to a JSON string
 * so it can be sent to the coding agent.
 */
export function serializePackage(pkg: HandoffPackage): string {
    return JSON.stringify(pkg, null, 2);
}

/**
 * Deserialize a handoff package from JSON.
 *
 * **Simple explanation**: Converts a JSON string back into a work order.
 */
export function deserializePackage(json: string): HandoffPackage {
    try {
        return JSON.parse(json) as HandoffPackage;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to deserialize handoff package: ${msg}`);
    }
}
