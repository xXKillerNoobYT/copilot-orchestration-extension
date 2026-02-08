/**
 * Tests for Coding Agent Task Handoff Service (MT-033.31)
 *
 * Validates handoff package creation, delivery acknowledgment,
 * validation, and all helper functions.
 */

import {
    // Types
    TaskType,
    HandoffUrgency,
    AcknowledgmentStatus,
    FileReference,
    CodePattern,
    TestSpecification,
    Constraint,
    HandoffPackage,
    DeliveryReceipt,
    HandoffConfig,

    // Constants
    DEFAULT_HANDOFF_CONFIG,

    // Functions
    detectTaskType,
    determineUrgency,
    generateFileReferences,
    determineFileAction,
    selectPatterns,
    generateTestSpecs,
    deriveTestFilePath,
    buildRequiredScenarios,
    generateConstraints,
    getCompletedDependencies,
    getInProgressSiblings,
    generateSummary,
    generateDefinitionOfDone,
    gatherTechnicalNotes,
    generatePackageId,
    countBlockedTasks,
    createHandoffPackage,
    createDeliveryReceipt,
    isDeliverySuccessful,
    validateHandoffPackage,
    serializePackage,
    deserializePackage
} from '../../src/services/codingHandoff';

import {
    AtomicTask,
    MasterTicket,
    TaskStatus,
    AgentTeam,
    TaskPriority
} from '../../src/generators/taskBreakdown';

import {
    CompletePlan
} from '../../src/planning/types';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(overrides?: Partial<AtomicTask>): AtomicTask {
    return {
        id: 'MT-1.1',
        parentId: 'MT-1',
        featureId: 'feat-1',
        title: 'Build login form',
        description: 'Create a login form with username and password fields',
        priority: 'P1' as TaskPriority,
        estimatedMinutes: 30,
        dependsOn: [],
        acceptanceCriteria: ['Form renders correctly', 'Validation works'],
        files: ['src/ui/loginForm.ts'],
        isUI: true,
        assignedTeam: 'coding' as AgentTeam,
        status: 'ready' as TaskStatus,
        developerStoryId: 'ds-1',
        relatedUserStoryIds: ['us-1'],
        ...overrides
    };
}

function makeParentTicket(overrides?: Partial<MasterTicket>): MasterTicket {
    return {
        id: 'MT-1',
        featureId: 'feat-1',
        title: 'User Authentication',
        description: 'Complete authentication system',
        priority: 'P1' as TaskPriority,
        acceptanceCriteria: ['Users can log in', 'Users can sign up'],
        technicalNotes: 'Use JWT for session management',
        childTaskIds: ['MT-1.1', 'MT-1.2', 'MT-1.3'],
        dependsOn: [],
        estimatedMinutes: 120,
        assignedTeam: 'coding' as AgentTeam,
        ...overrides
    };
}

function makePlan(overrides?: Partial<CompletePlan>): CompletePlan {
    return {
        metadata: {
            id: 'plan-1',
            name: 'Test Plan',
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            version: 1
        },
        overview: {
            name: 'Test Project',
            description: 'A test project',
            goals: ['Ship it']
        },
        featureBlocks: [{
            id: 'feat-1',
            name: 'User Authentication',
            description: 'Auth system',
            purpose: 'Secure access',
            acceptanceCriteria: ['Login works'],
            technicalNotes: 'JWT based',
            priority: 'high',
            order: 1
        }],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [{
            id: 'ds-1',
            action: 'Build login',
            benefit: 'User access',
            technicalRequirements: ['Use bcrypt for hashing'],
            apiNotes: 'POST /api/auth/login',
            databaseNotes: 'Users table with password hash',
            estimatedHours: 2,
            relatedBlockIds: ['feat-1'],
            relatedTaskIds: []
        }],
        successCriteria: [],
        ...overrides
    } as CompletePlan;
}

function makeTaskList(): AtomicTask[] {
    return [
        makeTask({ id: 'MT-1.1', status: 'ready', dependsOn: [] }),
        makeTask({ id: 'MT-1.2', status: 'done', dependsOn: [], title: 'Set up auth service' }),
        makeTask({ id: 'MT-1.3', status: 'in_progress', dependsOn: ['MT-1.1'], title: 'Build signup form' }),
        makeTask({ id: 'MT-2.1', parentId: 'MT-2', status: 'pending', dependsOn: ['MT-1.1'], title: 'Dashboard widget' })
    ];
}

// ============================================================================
// Tests
// ============================================================================

describe('CodingHandoff', () => {

    // ── Task Type Detection ──────────────────────────────────────────

    describe('detectTaskType', () => {

        it('Test 1: should detect build tasks by default', () => {
            const task = makeTask({ title: 'Create login form', description: 'Implement new form' });
            expect(detectTaskType(task)).toBe('build');
        });

        it('Test 2: should detect fix tasks', () => {
            const task = makeTask({ title: 'Fix login bug', description: 'Resolve authentication error' });
            expect(detectTaskType(task)).toBe('fix');
        });

        it('Test 3: should detect refactor tasks', () => {
            const task = makeTask({ title: 'Refactor auth service', description: 'Simplify token logic' });
            expect(detectTaskType(task)).toBe('refactor');
        });

        it('Test 4: should detect test tasks', () => {
            const task = makeTask({ title: 'Write unit tests', description: 'Add test coverage' });
            expect(detectTaskType(task)).toBe('test');
        });

        it('Test 5: should detect document tasks', () => {
            const task = makeTask({ title: 'Document API', description: 'Write README guide' });
            expect(detectTaskType(task)).toBe('document');
        });

        it('Test 6: should prioritize fix over build when both keywords present', () => {
            const task = makeTask({ title: 'Fix and build new error handler', description: 'Resolve issue' });
            expect(detectTaskType(task)).toBe('fix');
        });
    });

    // ── Urgency Determination ────────────────────────────────────────

    describe('determineUrgency', () => {

        it('Test 7: should return immediate for P0 tasks', () => {
            const task = makeTask({ priority: 'P0' });
            expect(determineUrgency(task, 0)).toBe('immediate');
        });

        it('Test 8: should return immediate when blocking 2+ tasks', () => {
            const task = makeTask({ priority: 'P2' });
            expect(determineUrgency(task, 2)).toBe('immediate');
        });

        it('Test 9: should return low for P3 non-blocking tasks', () => {
            const task = makeTask({ priority: 'P3' });
            expect(determineUrgency(task, 0)).toBe('low');
        });

        it('Test 10: should return normal for middle priorities', () => {
            const task = makeTask({ priority: 'P1' });
            expect(determineUrgency(task, 1)).toBe('normal');
        });

        it('Test 11: should return normal for P3 blocking one task', () => {
            const task = makeTask({ priority: 'P3' });
            expect(determineUrgency(task, 1)).toBe('normal');
        });
    });

    // ── File References ──────────────────────────────────────────────

    describe('generateFileReferences', () => {

        it('Test 12: should generate references from task files', () => {
            const task = makeTask({ files: ['src/ui/form.ts', 'tests/ui/form.test.ts'] });
            const refs = generateFileReferences(task, 'build');
            expect(refs).toHaveLength(2);
            expect(refs[0].path).toBe('src/ui/form.ts');
            expect(refs[1].path).toBe('tests/ui/form.test.ts');
        });

        it('Test 13: should assign create action for build tasks', () => {
            const task = makeTask({ files: ['src/services/newService.ts'] });
            const refs = generateFileReferences(task, 'build');
            expect(refs[0].action).toBe('create');
        });

        it('Test 14: should assign modify action for fix tasks', () => {
            const task = makeTask({ files: ['src/services/existing.ts'] });
            const refs = generateFileReferences(task, 'fix');
            expect(refs[0].action).toBe('modify');
        });

        it('Test 15: should assign create for test files in build tasks', () => {
            const task = makeTask({ files: ['tests/services/myTest.test.ts'] });
            const refs = generateFileReferences(task, 'build');
            expect(refs[0].action).toBe('create');
        });
    });

    describe('determineFileAction', () => {

        it('Test 16: should protect extension.ts from creation', () => {
            expect(determineFileAction('src/extension.ts', 'build')).toBe('modify');
        });

        it('Test 17: should return create for new source files in build', () => {
            expect(determineFileAction('src/services/new.ts', 'build')).toBe('create');
        });

        it('Test 18: should return modify for fix task type', () => {
            expect(determineFileAction('src/services/existing.ts', 'fix')).toBe('modify');
        });
    });

    // ── Code Pattern Selection ───────────────────────────────────────

    describe('selectPatterns', () => {

        it('Test 19: should include error handling pattern by default', () => {
            const task = makeTask();
            const patterns = selectPatterns(task, 'build', DEFAULT_HANDOFF_CONFIG);
            expect(patterns.some(p => p.name === 'Typed Error Handling')).toBe(true);
        });

        it('Test 20: should include singleton pattern for service tasks', () => {
            const task = makeTask({ title: 'Create auth service' });
            const patterns = selectPatterns(task, 'build', DEFAULT_HANDOFF_CONFIG);
            expect(patterns.some(p => p.name === 'Singleton Service Pattern')).toBe(true);
        });

        it('Test 21: should include test naming for test tasks', () => {
            const task = makeTask({ title: 'Write unit tests' });
            const patterns = selectPatterns(task, 'test', DEFAULT_HANDOFF_CONFIG);
            expect(patterns.some(p => p.name === 'Test Naming Convention')).toBe(true);
        });

        it('Test 22: should include JSDoc pattern for build tasks', () => {
            const task = makeTask();
            const patterns = selectPatterns(task, 'build', DEFAULT_HANDOFF_CONFIG);
            expect(patterns.some(p => p.name === 'JSDoc with Simple Explanation')).toBe(true);
        });

        it('Test 23: should return empty array when patterns disabled', () => {
            const task = makeTask();
            const patterns = selectPatterns(task, 'build', { ...DEFAULT_HANDOFF_CONFIG, includePatterns: false });
            expect(patterns).toHaveLength(0);
        });

        it('Test 24: should respect maxPatterns limit', () => {
            const task = makeTask({ title: 'Create service with test and generator' });
            const patterns = selectPatterns(task, 'build', { ...DEFAULT_HANDOFF_CONFIG, maxPatterns: 2 });
            expect(patterns.length).toBeLessThanOrEqual(2);
        });
    });

    // ── Test Specifications ──────────────────────────────────────────

    describe('generateTestSpecs', () => {

        it('Test 25: should generate test specs for task', () => {
            const task = makeTask();
            const specs = generateTestSpecs(task, 'build', DEFAULT_HANDOFF_CONFIG);
            expect(specs).toHaveLength(1);
            expect(specs[0].targetCoverage).toBe(85);
        });

        it('Test 26: should set minimum test count from config or criteria', () => {
            const task = makeTask({ acceptanceCriteria: ['A', 'B', 'C', 'D', 'E', 'F'] });
            const specs = generateTestSpecs(task, 'build', DEFAULT_HANDOFF_CONFIG);
            // 6 criteria > 5 minimum → minimum is 6
            expect(specs[0].minimumTestCount).toBe(6);
        });

        it('Test 27: should return empty when test specs disabled', () => {
            const task = makeTask();
            const specs = generateTestSpecs(task, 'build', { ...DEFAULT_HANDOFF_CONFIG, includeTestSpecs: false });
            expect(specs).toHaveLength(0);
        });

        it('Test 28: should include type-specific required scenarios', () => {
            const task = makeTask();
            const specs = generateTestSpecs(task, 'build', DEFAULT_HANDOFF_CONFIG);
            expect(specs[0].requiredScenarios).toContain('should handle invalid input gracefully');
        });
    });

    describe('deriveTestFilePath', () => {

        it('Test 29: should convert src path to test path', () => {
            const task = makeTask({ files: ['src/services/auth.ts'] });
            expect(deriveTestFilePath(task)).toBe('tests/services/auth.test.ts');
        });

        it('Test 30: should use task ID when no files', () => {
            const task = makeTask({ files: [] });
            expect(deriveTestFilePath(task)).toBe('tests/MT-1-1.test.ts');
        });
    });

    describe('buildRequiredScenarios', () => {

        it('Test 31: should convert acceptance criteria to scenarios', () => {
            const task = makeTask({ acceptanceCriteria: ['Form renders correctly'] });
            const scenarios = buildRequiredScenarios(task, 'build');
            expect(scenarios).toContain('should form renders correctly');
        });

        it('Test 32: should add fix-specific scenarios for fix tasks', () => {
            const task = makeTask();
            const scenarios = buildRequiredScenarios(task, 'fix');
            expect(scenarios).toContain('should not reproduce the original bug');
        });

        it('Test 33: should add refactor-specific scenarios', () => {
            const task = makeTask();
            const scenarios = buildRequiredScenarios(task, 'refactor');
            expect(scenarios).toContain('should maintain existing behavior');
        });
    });

    // ── Constraint Generation ────────────────────────────────────────

    describe('generateConstraints', () => {

        it('Test 34: should include standard constraints', () => {
            const task = makeTask();
            const constraints = generateConstraints(task, 'build');
            expect(constraints.some(c => c.type === 'security')).toBe(true);
            expect(constraints.some(c => c.type === 'style')).toBe(true);
        });

        it('Test 35: should add no-modify for extension.ts on build', () => {
            const task = makeTask();
            const constraints = generateConstraints(task, 'build');
            expect(constraints.some(c =>
                c.type === 'no-modify' && c.description.includes('extension.ts')
            )).toBe(true);
        });

        it('Test 36: should add behavior preservation for refactor', () => {
            const task = makeTask();
            const constraints = generateConstraints(task, 'refactor');
            expect(constraints.some(c =>
                c.description.includes('existing tests must continue to pass')
            )).toBe(true);
        });

        it('Test 37: should add input validation for API tasks', () => {
            const task = makeTask({ title: 'Build API endpoint' });
            const constraints = generateConstraints(task, 'build');
            expect(constraints.some(c =>
                c.description.includes('Validate and sanitize')
            )).toBe(true);
        });
    });

    // ── Dependency Context ───────────────────────────────────────────

    describe('getCompletedDependencies', () => {

        it('Test 38: should return completed dependency IDs', () => {
            const tasks = makeTaskList();
            const task = makeTask({ dependsOn: ['MT-1.2', 'MT-1.3'] });
            const completed = getCompletedDependencies(task, tasks);
            expect(completed).toContain('MT-1.2');
            expect(completed).not.toContain('MT-1.3');
        });

        it('Test 39: should return empty for no dependencies', () => {
            const tasks = makeTaskList();
            const task = makeTask({ dependsOn: [] });
            expect(getCompletedDependencies(task, tasks)).toHaveLength(0);
        });
    });

    describe('getInProgressSiblings', () => {

        it('Test 40: should find in-progress siblings', () => {
            const tasks = makeTaskList();
            const task = tasks[0]; // MT-1.1
            const siblings = getInProgressSiblings(task, tasks);
            expect(siblings.length).toBe(1);
            expect(siblings[0]).toContain('MT-1.3');
        });

        it('Test 41: should exclude tasks from other parents', () => {
            const tasks = makeTaskList();
            // MT-2.1 has parentId MT-2, different from MT-1
            const task = tasks[3]; // MT-2.1
            const siblings = getInProgressSiblings(task, tasks);
            expect(siblings).toHaveLength(0);
        });
    });

    // ── Summary & DoD ────────────────────────────────────────────────

    describe('generateSummary', () => {

        it('Test 42: should generate action-oriented summary', () => {
            const task = makeTask();
            const parent = makeParentTicket();
            const summary = generateSummary(task, 'build', parent);
            expect(summary).toContain('Implement');
            expect(summary).toContain(task.title);
            expect(summary).toContain(parent.title);
        });

        it('Test 43: should use fix verb for fix tasks', () => {
            const task = makeTask();
            const parent = makeParentTicket();
            expect(generateSummary(task, 'fix', parent)).toContain('Fix');
        });
    });

    describe('generateDefinitionOfDone', () => {

        it('Test 44: should include standard quality checks', () => {
            const task = makeTask();
            const dod = generateDefinitionOfDone(task, 'build', DEFAULT_HANDOFF_CONFIG);
            expect(dod).toContain('All acceptance criteria met');
            expect(dod.some(d => d.includes('npm run compile'))).toBe(true);
            expect(dod.some(d => d.includes('npm run test:once'))).toBe(true);
        });

        it('Test 45: should include coverage for build tasks', () => {
            const task = makeTask();
            const dod = generateDefinitionOfDone(task, 'build', DEFAULT_HANDOFF_CONFIG);
            expect(dod.some(d => d.includes('85%'))).toBe(true);
        });

        it('Test 46: should include JSDoc requirement for build tasks', () => {
            const task = makeTask();
            const dod = generateDefinitionOfDone(task, 'build', DEFAULT_HANDOFF_CONFIG);
            expect(dod.some(d => d.includes('JSDoc'))).toBe(true);
        });

        it('Test 47: should include UI check for UI tasks', () => {
            const task = makeTask({ isUI: true });
            const dod = generateDefinitionOfDone(task, 'build', DEFAULT_HANDOFF_CONFIG);
            expect(dod.some(d => d.includes('webview'))).toBe(true);
        });
    });

    // ── Technical Notes ──────────────────────────────────────────────

    describe('gatherTechnicalNotes', () => {

        it('Test 48: should include parent ticket notes', () => {
            const task = makeTask();
            const parent = makeParentTicket({ technicalNotes: 'Use JWT tokens' });
            const plan = makePlan();
            const notes = gatherTechnicalNotes(task, parent, plan);
            expect(notes).toContain('Use JWT tokens');
        });

        it('Test 49: should include developer story API notes', () => {
            const task = makeTask({ developerStoryId: 'ds-1' });
            const parent = makeParentTicket();
            const plan = makePlan();
            const notes = gatherTechnicalNotes(task, parent, plan);
            expect(notes).toContain('POST /api/auth/login');
        });

        it('Test 50: should include database notes', () => {
            const task = makeTask({ developerStoryId: 'ds-1' });
            const parent = makeParentTicket();
            const plan = makePlan();
            const notes = gatherTechnicalNotes(task, parent, plan);
            expect(notes).toContain('Users table');
        });

        it('Test 51: should return empty for no technical context', () => {
            const task = makeTask({ developerStoryId: null });
            const parent = makeParentTicket({ technicalNotes: '' });
            const plan = makePlan({ developerStories: [] });
            const notes = gatherTechnicalNotes(task, parent, plan);
            expect(notes).toBe('');
        });
    });

    // ── Package ID ───────────────────────────────────────────────────

    describe('generatePackageId', () => {

        it('Test 52: should include task ID in package ID', () => {
            const id = generatePackageId('MT-1.3');
            expect(id).toContain('HO-MT-1.3-');
        });

        it('Test 53: should include timestamp', () => {
            const id = generatePackageId('MT-1.1');
            // Should have a timestamp portion after the task ID
            expect(id.length).toBeGreaterThan('HO-MT-1.1-'.length);
        });
    });

    // ── countBlockedTasks ────────────────────────────────────────────

    describe('countBlockedTasks', () => {

        it('Test 54: should count tasks depending on given task', () => {
            const tasks = makeTaskList();
            // MT-1.3 and MT-2.1 both depend on MT-1.1
            expect(countBlockedTasks('MT-1.1', tasks)).toBe(2);
        });

        it('Test 55: should return 0 for non-blocking tasks', () => {
            const tasks = makeTaskList();
            expect(countBlockedTasks('MT-1.2', tasks)).toBe(0);
        });
    });

    // ── Handoff Package Creation ─────────────────────────────────────

    describe('createHandoffPackage', () => {

        it('Test 56: should create a complete handoff package', () => {
            const task = makeTask();
            const parent = makeParentTicket();
            const plan = makePlan();
            const allTasks = makeTaskList();

            const pkg = createHandoffPackage(task, parent, plan, allTasks);

            expect(pkg.id).toContain('HO-');
            expect(pkg.task).toBe(task);
            expect(pkg.parentTicket).toBe(parent);
            expect(pkg.taskType).toBe('build');
            expect(pkg.summary).toContain(task.title);
            expect(pkg.acceptanceCriteria).toHaveLength(2);
            expect(pkg.definitionOfDone.length).toBeGreaterThan(0);
            expect(pkg.fileReferences.length).toBeGreaterThan(0);
            expect(pkg.codePatterns.length).toBeGreaterThan(0);
            expect(pkg.testSpecifications.length).toBeGreaterThan(0);
            expect(pkg.constraints.length).toBeGreaterThan(0);
        });

        it('Test 57: should respect config overrides', () => {
            const task = makeTask();
            const parent = makeParentTicket();
            const plan = makePlan();
            const allTasks = makeTaskList();

            const pkg = createHandoffPackage(task, parent, plan, allTasks, {
                includePatterns: false,
                includeTestSpecs: false,
                includeSiblingContext: false
            });

            expect(pkg.codePatterns).toHaveLength(0);
            expect(pkg.testSpecifications).toHaveLength(0);
            expect(pkg.inProgressSiblings).toHaveLength(0);
        });

        it('Test 58: should set urgency based on priority and blocking', () => {
            const allTasks = makeTaskList();
            const parent = makeParentTicket();
            const plan = makePlan();

            // MT-1.1 blocks 2 tasks → immediate
            const task = allTasks[0];
            const pkg = createHandoffPackage(task, parent, plan, allTasks);
            expect(pkg.urgency).toBe('immediate');
        });

        it('Test 59: should include completed dependencies', () => {
            const allTasks = makeTaskList();
            const task = makeTask({ id: 'MT-1.3', dependsOn: ['MT-1.1', 'MT-1.2'] });
            const parent = makeParentTicket();
            const plan = makePlan();

            const pkg = createHandoffPackage(task, parent, plan, allTasks);
            expect(pkg.completedDependencies).toContain('MT-1.2');
        });

        it('Test 60: should include in-progress siblings', () => {
            const allTasks = makeTaskList();
            const task = allTasks[0]; // MT-1.1
            const parent = makeParentTicket();
            const plan = makePlan();

            const pkg = createHandoffPackage(task, parent, plan, allTasks);
            expect(pkg.inProgressSiblings.length).toBe(1);
        });

        it('Test 61: should include technical notes from plan', () => {
            const task = makeTask({ developerStoryId: 'ds-1' });
            const parent = makeParentTicket({ technicalNotes: 'Use JWT' });
            const plan = makePlan();
            const allTasks = [task];

            const pkg = createHandoffPackage(task, parent, plan, allTasks);
            expect(pkg.technicalNotes).toContain('Use JWT');
            expect(pkg.technicalNotes).toContain('POST /api/auth/login');
        });
    });

    // ── Delivery & Acknowledgment ────────────────────────────────────

    describe('createDeliveryReceipt', () => {

        it('Test 62: should create acknowledged receipt', () => {
            const receipt = createDeliveryReceipt('HO-MT-1.1-123', 'coding-agent-1', 'acknowledged', undefined, 45);
            expect(receipt.packageId).toBe('HO-MT-1.1-123');
            expect(receipt.status).toBe('acknowledged');
            expect(receipt.receivedBy).toBe('coding-agent-1');
            expect(receipt.estimatedCompletionMinutes).toBe(45);
            expect(receipt.rejectionReason).toBeUndefined();
        });

        it('Test 63: should create rejected receipt with reason', () => {
            const receipt = createDeliveryReceipt('HO-MT-1.1-123', 'coding-agent-1', 'rejected', 'Missing context');
            expect(receipt.status).toBe('rejected');
            expect(receipt.rejectionReason).toBe('Missing context');
            expect(receipt.estimatedCompletionMinutes).toBeUndefined();
        });

        it('Test 64: should not include rejection reason for non-rejected', () => {
            const receipt = createDeliveryReceipt('pkg-1', 'agent-1', 'acknowledged', 'some random reason');
            expect(receipt.rejectionReason).toBeUndefined();
        });
    });

    describe('isDeliverySuccessful', () => {

        it('Test 65: should return true for acknowledged', () => {
            const receipt = createDeliveryReceipt('pkg-1', 'agent-1', 'acknowledged');
            expect(isDeliverySuccessful(receipt)).toBe(true);
        });

        it('Test 66: should return false for rejected', () => {
            const receipt = createDeliveryReceipt('pkg-1', 'agent-1', 'rejected');
            expect(isDeliverySuccessful(receipt)).toBe(false);
        });

        it('Test 67: should return false for pending', () => {
            const receipt = createDeliveryReceipt('pkg-1', 'agent-1', 'pending');
            expect(isDeliverySuccessful(receipt)).toBe(false);
        });

        it('Test 68: should return false for timeout', () => {
            const receipt = createDeliveryReceipt('pkg-1', 'agent-1', 'timeout');
            expect(isDeliverySuccessful(receipt)).toBe(false);
        });
    });

    // ── Validation ───────────────────────────────────────────────────

    describe('validateHandoffPackage', () => {

        it('Test 69: should validate a complete package', () => {
            const task = makeTask();
            const parent = makeParentTicket();
            const plan = makePlan();
            const allTasks = [task];

            const pkg = createHandoffPackage(task, parent, plan, allTasks);
            const result = validateHandoffPackage(pkg);
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('Test 70: should flag missing task', () => {
            const pkg = {
                task: null,
                parentTicket: makeParentTicket(),
                summary: 'Do something',
                acceptanceCriteria: ['A'],
                definitionOfDone: ['B'],
                fileReferences: [{ path: 'f.ts', action: 'create' as const, description: 'Create' }]
            } as unknown as HandoffPackage;

            const result = validateHandoffPackage(pkg);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes('task'))).toBe(true);
        });

        it('Test 71: should flag missing acceptance criteria', () => {
            const task = makeTask();
            const parent = makeParentTicket();
            const plan = makePlan();
            const allTasks = [task];

            const pkg = createHandoffPackage(task, parent, plan, allTasks);
            pkg.acceptanceCriteria = [];
            const result = validateHandoffPackage(pkg);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes('acceptance criteria'))).toBe(true);
        });

        it('Test 72: should flag missing file references', () => {
            const task = makeTask();
            const parent = makeParentTicket();
            const plan = makePlan();
            const allTasks = [task];

            const pkg = createHandoffPackage(task, parent, plan, allTasks);
            pkg.fileReferences = [];
            const result = validateHandoffPackage(pkg);
            // This is a warning, not blocking — still reports but valid depends on other issues
            expect(result.issues.some(i => i.includes('file references'))).toBe(true);
        });

        it('Test 73: should flag missing summary', () => {
            const task = makeTask();
            const parent = makeParentTicket();
            const plan = makePlan();
            const allTasks = [task];

            const pkg = createHandoffPackage(task, parent, plan, allTasks);
            pkg.summary = '';
            const result = validateHandoffPackage(pkg);
            expect(result.valid).toBe(false);
        });
    });

    // ── Serialization ────────────────────────────────────────────────

    describe('serializePackage / deserializePackage', () => {

        it('Test 74: should round-trip a handoff package', () => {
            const task = makeTask();
            const parent = makeParentTicket();
            const plan = makePlan();
            const allTasks = [task];

            const pkg = createHandoffPackage(task, parent, plan, allTasks);
            const json = serializePackage(pkg);
            const restored = deserializePackage(json);

            expect(restored.id).toBe(pkg.id);
            expect(restored.task.id).toBe(task.id);
            expect(restored.parentTicket.id).toBe(parent.id);
            expect(restored.summary).toBe(pkg.summary);
        });

        it('Test 75: should throw on invalid JSON', () => {
            expect(() => deserializePackage('not json')).toThrow('Failed to deserialize');
        });
    });

    // ── Default Config ───────────────────────────────────────────────

    describe('DEFAULT_HANDOFF_CONFIG', () => {

        it('Test 76: should have sensible defaults', () => {
            expect(DEFAULT_HANDOFF_CONFIG.includePatterns).toBe(true);
            expect(DEFAULT_HANDOFF_CONFIG.maxPatterns).toBe(5);
            expect(DEFAULT_HANDOFF_CONFIG.includeTestSpecs).toBe(true);
            expect(DEFAULT_HANDOFF_CONFIG.defaultTestCoverage).toBe(85);
            expect(DEFAULT_HANDOFF_CONFIG.minimumTestCount).toBe(5);
            expect(DEFAULT_HANDOFF_CONFIG.acknowledgmentTimeoutSeconds).toBe(30);
            expect(DEFAULT_HANDOFF_CONFIG.includeSiblingContext).toBe(true);
        });
    });
});
