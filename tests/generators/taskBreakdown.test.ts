/**
 * Task Breakdown Generator Tests (MT-033.26)
 *
 * Tests for plan parsing, task generation, dependency mapping,
 * priority assignment, team assignment, and ticket conversion.
 */

import {
    generateTaskBreakdown,
    mapPriority,
    assignTeam,
    detectIsUI,
    featureToMasterTicket,
    devStoryToTask,
    createTestTask,
    linkUserStories,
    buildDependencyGraph,
    computeExecutionOrder,
    masterTicketToDbFormat,
    atomicTaskToDbFormat,
    DEFAULT_TASK_BREAKDOWN_CONFIG,
    TaskBreakdownConfig,
    AtomicTask,
    MasterTicket
} from '../../src/generators/taskBreakdown';

import {
    CompletePlan,
    FeatureBlock,
    DeveloperStory,
    UserStory,
    BlockLink
} from '../../src/planning/types';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestFeature(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: 'feature-1',
        name: 'User Authentication',
        description: 'Login and registration system',
        purpose: 'Allow users to access their accounts',
        acceptanceCriteria: ['Users can register', 'Users can login', 'Session management works'],
        technicalNotes: 'Use JWT tokens',
        priority: 'high',
        order: 1,
        ...overrides
    };
}

function createTestDevStory(overrides: Partial<DeveloperStory> = {}): DeveloperStory {
    return {
        id: 'ds-1',
        action: 'Implement JWT authentication',
        benefit: 'Secure user sessions',
        technicalRequirements: ['src/auth/jwt.ts', 'Token validation middleware'],
        apiNotes: 'POST /api/auth/login',
        databaseNotes: 'users table',
        estimatedHours: 0.5,
        relatedBlockIds: ['feature-1'],
        relatedTaskIds: [],
        ...overrides
    };
}

function createTestUserStory(overrides: Partial<UserStory> = {}): UserStory {
    return {
        id: 'us-1',
        userType: 'customer',
        action: 'login with email',
        benefit: 'access my account',
        relatedBlockIds: ['feature-1'],
        acceptanceCriteria: ['Login form works', 'Error messages display'],
        priority: 'high',
        ...overrides
    };
}

function createTestPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    return {
        metadata: {
            id: 'plan-1',
            name: 'Test Project',
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1
        },
        overview: {
            name: 'Test Project',
            description: 'A test project',
            goals: ['Build the thing']
        },
        featureBlocks: [createTestFeature()],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [createTestUserStory()],
        developerStories: [createTestDevStory()],
        successCriteria: [],
        ...overrides
    };
}

// ============================================================================
// Priority Mapping Tests
// ============================================================================

describe('TaskBreakdown - Priority Mapping', () => {
    it('Test 1: should map critical to P0', () => {
        expect(mapPriority('critical')).toBe('P0');
    });

    it('Test 2: should map high to P1', () => {
        expect(mapPriority('high')).toBe('P1');
    });

    it('Test 3: should map medium to P2', () => {
        expect(mapPriority('medium')).toBe('P2');
    });

    it('Test 4: should map low to P3', () => {
        expect(mapPriority('low')).toBe('P3');
    });
});

// ============================================================================
// Team Assignment Tests
// ============================================================================

describe('TaskBreakdown - Team Assignment', () => {
    it('Test 5: should assign verification team for test tasks', () => {
        expect(assignTeam('Write tests for auth', 'Verify login works', false)).toBe('verification');
    });

    it('Test 6: should assign research team for investigation tasks', () => {
        expect(assignTeam('Research best practices', 'Investigate options', false)).toBe('research');
    });

    it('Test 7: should assign planning team for design tasks', () => {
        expect(assignTeam('Design the architecture', 'Plan the system', false)).toBe('planning');
    });

    it('Test 8: should assign coding team for UI tasks', () => {
        expect(assignTeam('Build widget', 'Render panel', true)).toBe('coding');
    });

    it('Test 9: should default to coding team', () => {
        expect(assignTeam('Implement feature', 'Add functionality', false)).toBe('coding');
    });
});

// ============================================================================
// UI Detection Tests
// ============================================================================

describe('TaskBreakdown - UI Detection', () => {
    it('Test 10: should detect UI work from keywords', () => {
        expect(detectIsUI('Build panel', 'description', '')).toBe(true);
        expect(detectIsUI('Create webview', 'for display', '')).toBe(true);
    });

    it('Test 11: should not detect non-UI work', () => {
        expect(detectIsUI('Implement auth', 'JWT tokens', '')).toBe(false);
    });
});

// ============================================================================
// Feature → Master Ticket Tests
// ============================================================================

describe('TaskBreakdown - Feature to Master Ticket', () => {
    it('Test 12: should convert feature to master ticket', () => {
        const feature = createTestFeature();
        const mt = featureToMasterTicket(feature, [], [feature], DEFAULT_TASK_BREAKDOWN_CONFIG);

        expect(mt.id).toBe('MT-001');
        expect(mt.title).toBe('User Authentication');
        expect(mt.priority).toBe('P1');
        expect(mt.acceptanceCriteria).toHaveLength(3);
        expect(mt.childTaskIds).toHaveLength(0);
        expect(mt.dependsOn).toHaveLength(0);
    });

    it('Test 13: should include dependencies from block links', () => {
        const feature1 = createTestFeature({ id: 'f1', order: 1 });
        const feature2 = createTestFeature({ id: 'f2', order: 2, name: 'Dashboard' });

        const links: BlockLink[] = [{
            id: 'link-1',
            sourceBlockId: 'f1',
            targetBlockId: 'f2',
            dependencyType: 'requires'
        }];

        const mt = featureToMasterTicket(feature2, links, [feature1, feature2], DEFAULT_TASK_BREAKDOWN_CONFIG);
        expect(mt.dependsOn).toContain('MT-001');
    });

    it('Test 14: should use custom prefix', () => {
        const feature = createTestFeature({ order: 5 });
        const config = { ...DEFAULT_TASK_BREAKDOWN_CONFIG, masterTicketPrefix: 'PROJ' };
        const mt = featureToMasterTicket(feature, [], [feature], config);
        expect(mt.id).toBe('PROJ-005');
    });
});

// ============================================================================
// Developer Story → Atomic Task Tests
// ============================================================================

describe('TaskBreakdown - Dev Story to Task', () => {
    it('Test 15: should convert dev story to atomic task', () => {
        const story = createTestDevStory();
        const feature = createTestFeature();
        const task = devStoryToTask(story, 'MT-001', 1, feature, DEFAULT_TASK_BREAKDOWN_CONFIG);

        expect(task.id).toBe('MT-001.1');
        expect(task.parentId).toBe('MT-001');
        expect(task.title).toBe('Implement JWT authentication');
        expect(task.estimatedMinutes).toBe(30); // 0.5 hours = 30 min
        expect(task.status).toBe('pending');
    });

    it('Test 16: should clamp duration to min/max', () => {
        const shortStory = createTestDevStory({ estimatedHours: 0.05 }); // 3 min
        const longStory = createTestDevStory({ estimatedHours: 5 }); // 300 min
        const feature = createTestFeature();

        const shortTask = devStoryToTask(shortStory, 'MT-001', 1, feature, DEFAULT_TASK_BREAKDOWN_CONFIG);
        const longTask = devStoryToTask(longStory, 'MT-001', 2, feature, DEFAULT_TASK_BREAKDOWN_CONFIG);

        expect(shortTask.estimatedMinutes).toBe(15); // min
        expect(longTask.estimatedMinutes).toBe(60); // max
    });

    it('Test 17: should extract file paths from technical requirements', () => {
        const story = createTestDevStory({
            technicalRequirements: ['src/auth/jwt.ts', 'src/auth/middleware.ts', 'Plain text req']
        });
        const task = devStoryToTask(story, 'MT-001', 1, createTestFeature(), DEFAULT_TASK_BREAKDOWN_CONFIG);
        expect(task.files).toContain('src/auth/jwt.ts');
        expect(task.files).toContain('src/auth/middleware.ts');
        expect(task.files).not.toContain('Plain text req');
    });

    it('Test 18: should build acceptance criteria from story', () => {
        const story = createTestDevStory({ benefit: 'Secure sessions', apiNotes: 'REST API', databaseNotes: 'users table' });
        const task = devStoryToTask(story, 'MT-001', 1, createTestFeature(), DEFAULT_TASK_BREAKDOWN_CONFIG);

        expect(task.acceptanceCriteria.some(ac => ac.includes('Secure sessions'))).toBe(true);
        expect(task.acceptanceCriteria.some(ac => ac.includes('REST API'))).toBe(true);
        expect(task.acceptanceCriteria.some(ac => ac.includes('users table'))).toBe(true);
    });
});

// ============================================================================
// Test Task Generation Tests
// ============================================================================

describe('TaskBreakdown - Test Task Generation', () => {
    it('Test 19: should create test task from impl task', () => {
        const implTask: AtomicTask = {
            id: 'MT-001.1',
            parentId: 'MT-001',
            featureId: 'f1',
            title: 'Implement auth',
            description: 'Auth implementation',
            priority: 'P1',
            estimatedMinutes: 30,
            dependsOn: [],
            acceptanceCriteria: ['Login works'],
            files: ['src/auth/jwt.ts'],
            isUI: false,
            assignedTeam: 'coding',
            status: 'pending',
            developerStoryId: 'ds-1',
            relatedUserStoryIds: []
        };

        const testTask = createTestTask(implTask, 2);

        expect(testTask.id).toBe('MT-001.2');
        expect(testTask.title).toContain('Write tests for');
        expect(testTask.dependsOn).toContain('MT-001.1');
        expect(testTask.assignedTeam).toBe('verification');
        expect(testTask.estimatedMinutes).toBe(15); // 30 * 0.5 = 15
    });

    it('Test 20: should map src paths to test paths', () => {
        const implTask: AtomicTask = {
            id: 'MT-001.1', parentId: 'MT-001', featureId: 'f1',
            title: 'Build', description: '', priority: 'P1', estimatedMinutes: 40,
            dependsOn: [], acceptanceCriteria: [],
            files: ['src/auth/jwt.ts', 'src/utils/helper.ts'],
            isUI: false, assignedTeam: 'coding', status: 'pending',
            developerStoryId: null, relatedUserStoryIds: []
        };

        const testTask = createTestTask(implTask, 2);
        expect(testTask.files).toContain('tests/auth/jwt.ts');
        expect(testTask.files).toContain('tests/utils/helper.ts');
    });
});

// ============================================================================
// User Story Linking Tests
// ============================================================================

describe('TaskBreakdown - User Story Linking', () => {
    it('Test 21: should link user stories to tasks sharing a feature', () => {
        const features = [createTestFeature()];
        const tasks: AtomicTask[] = [{
            id: 'MT-001.1', parentId: 'MT-001', featureId: 'feature-1',
            title: 'Build', description: '', priority: 'P1', estimatedMinutes: 30,
            dependsOn: [], acceptanceCriteria: [], files: [],
            isUI: false, assignedTeam: 'coding', status: 'pending',
            developerStoryId: null, relatedUserStoryIds: []
        }];
        const userStories = [createTestUserStory()];

        const linked = linkUserStories(tasks, userStories, features);
        expect(linked[0].relatedUserStoryIds).toContain('us-1');
    });

    it('Test 22: should not link unrelated user stories', () => {
        const features = [createTestFeature()];
        const tasks: AtomicTask[] = [{
            id: 'MT-001.1', parentId: 'MT-001', featureId: 'feature-1',
            title: 'Build', description: '', priority: 'P1', estimatedMinutes: 30,
            dependsOn: [], acceptanceCriteria: [], files: [],
            isUI: false, assignedTeam: 'coding', status: 'pending',
            developerStoryId: null, relatedUserStoryIds: []
        }];
        const unrelatedStory = createTestUserStory({ relatedBlockIds: ['other-feature'] });

        const linked = linkUserStories(tasks, [unrelatedStory], features);
        expect(linked[0].relatedUserStoryIds).toHaveLength(0);
    });
});

// ============================================================================
// Dependency Graph Tests
// ============================================================================

describe('TaskBreakdown - Dependency Graph', () => {
    it('Test 23: should build graph from task dependencies', () => {
        const tasks: AtomicTask[] = [
            { id: 'MT-001.1', parentId: 'MT-001', featureId: 'f1', title: '', description: '', priority: 'P1', estimatedMinutes: 30, dependsOn: [], acceptanceCriteria: [], files: [], isUI: false, assignedTeam: 'coding', status: 'pending', developerStoryId: null, relatedUserStoryIds: [] },
            { id: 'MT-001.2', parentId: 'MT-001', featureId: 'f1', title: '', description: '', priority: 'P1', estimatedMinutes: 15, dependsOn: ['MT-001.1'], acceptanceCriteria: [], files: [], isUI: false, assignedTeam: 'verification', status: 'pending', developerStoryId: null, relatedUserStoryIds: [] }
        ];
        const masterTickets: MasterTicket[] = [{
            id: 'MT-001', featureId: 'f1', title: '', description: '', priority: 'P1',
            acceptanceCriteria: [], technicalNotes: '', childTaskIds: ['MT-001.1', 'MT-001.2'],
            dependsOn: [], estimatedMinutes: 45, assignedTeam: 'orchestrator'
        }];

        const graph = buildDependencyGraph(tasks, masterTickets);
        expect(graph.get('MT-001.1')).toEqual([]);
        expect(graph.get('MT-001.2')).toEqual(['MT-001.1']);
    });

    it('Test 24: should add cross-feature dependencies for first task', () => {
        const tasks: AtomicTask[] = [
            { id: 'MT-001.1', parentId: 'MT-001', featureId: 'f1', title: '', description: '', priority: 'P1', estimatedMinutes: 30, dependsOn: [], acceptanceCriteria: [], files: [], isUI: false, assignedTeam: 'coding', status: 'pending', developerStoryId: null, relatedUserStoryIds: [] },
            { id: 'MT-002.1', parentId: 'MT-002', featureId: 'f2', title: '', description: '', priority: 'P1', estimatedMinutes: 20, dependsOn: [], acceptanceCriteria: [], files: [], isUI: false, assignedTeam: 'coding', status: 'pending', developerStoryId: null, relatedUserStoryIds: [] }
        ];
        const masterTickets: MasterTicket[] = [
            { id: 'MT-001', featureId: 'f1', title: '', description: '', priority: 'P1', acceptanceCriteria: [], technicalNotes: '', childTaskIds: ['MT-001.1'], dependsOn: [], estimatedMinutes: 30, assignedTeam: 'orchestrator' },
            { id: 'MT-002', featureId: 'f2', title: '', description: '', priority: 'P1', acceptanceCriteria: [], technicalNotes: '', childTaskIds: ['MT-002.1'], dependsOn: ['MT-001'], estimatedMinutes: 20, assignedTeam: 'orchestrator' }
        ];

        const graph = buildDependencyGraph(tasks, masterTickets);
        expect(graph.get('MT-002.1')).toContain('MT-001.1');
    });
});

// ============================================================================
// Execution Order Tests
// ============================================================================

describe('TaskBreakdown - Execution Order', () => {
    it('Test 25: should compute topological order', () => {
        const graph = new Map<string, string[]>();
        graph.set('A', []);
        graph.set('B', ['A']);
        graph.set('C', ['A']);
        graph.set('D', ['B', 'C']);

        const { order, warnings } = computeExecutionOrder(graph);
        expect(warnings).toHaveLength(0);
        expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
        expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
        expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
    });

    it('Test 26: should warn on circular dependencies', () => {
        const graph = new Map<string, string[]>();
        graph.set('A', ['B']);
        graph.set('B', ['A']);

        const { warnings } = computeExecutionOrder(graph);
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0]).toContain('Circular dependency');
    });
});

// ============================================================================
// Main Generator Tests
// ============================================================================

describe('TaskBreakdown - generateTaskBreakdown', () => {
    it('Test 27: should generate complete task breakdown', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan);

        expect(result.masterTickets).toHaveLength(1);
        expect(result.tasks.length).toBeGreaterThan(0);
        expect(result.summary).toContain('Test Project');
        expect(result.totalEstimatedMinutes).toBeGreaterThan(0);
    });

    it('Test 28: should create master ticket per feature', () => {
        const plan = createTestPlan({
            featureBlocks: [
                createTestFeature({ id: 'f1', order: 1, name: 'Auth' }),
                createTestFeature({ id: 'f2', order: 2, name: 'Dashboard' })
            ],
            developerStories: [
                createTestDevStory({ relatedBlockIds: ['f1'] }),
                createTestDevStory({ id: 'ds-2', relatedBlockIds: ['f2'], action: 'Build dashboard' })
            ]
        });

        const result = generateTaskBreakdown(plan);
        expect(result.masterTickets).toHaveLength(2);
        expect(result.masterTickets[0].id).toBe('MT-001');
        expect(result.masterTickets[1].id).toBe('MT-002');
    });

    it('Test 29: should generate test tasks when configured', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan, { generateTestTasks: true });

        // Should have impl + test tasks
        const testTasks = result.tasks.filter(t => t.title.startsWith('Write tests for'));
        expect(testTasks.length).toBeGreaterThan(0);
    });

    it('Test 30: should skip test tasks when configured', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan, { generateTestTasks: false });

        const testTasks = result.tasks.filter(t => t.title.startsWith('Write tests for'));
        expect(testTasks).toHaveLength(0);
    });

    it('Test 31: should handle empty plan', () => {
        const plan = createTestPlan({ featureBlocks: [] });
        const result = generateTaskBreakdown(plan);

        expect(result.masterTickets).toHaveLength(0);
        expect(result.tasks).toHaveLength(0);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('no feature blocks');
    });

    it('Test 32: should create default task for feature without dev stories', () => {
        const plan = createTestPlan({
            featureBlocks: [createTestFeature({ id: 'f-no-stories' })],
            developerStories: []
        });

        const result = generateTaskBreakdown(plan);
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].title).toContain('Implement');
        expect(result.warnings.some(w => w.includes('no developer stories'))).toBe(true);
    });

    it('Test 33: should cap tasks per feature', () => {
        const stories = Array.from({ length: 25 }, (_, i) =>
            createTestDevStory({ id: `ds-${i}`, action: `Task ${i}`, relatedBlockIds: ['feature-1'] })
        );

        const plan = createTestPlan({ developerStories: stories });
        const result = generateTaskBreakdown(plan, { maxTasksPerFeature: 10, generateTestTasks: false });

        const tasksForFeature = result.tasks.filter(t => t.parentId === 'MT-001');
        expect(tasksForFeature.length).toBeLessThanOrEqual(10);
        expect(result.warnings.some(w => w.includes('capped at'))).toBe(true);
    });

    it('Test 34: should mark tasks with no deps as ready', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan, { generateTestTasks: false });

        const readyTasks = result.tasks.filter(t => t.status === 'ready');
        expect(readyTasks.length).toBeGreaterThan(0);
    });

    it('Test 35: should provide execution order', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan);

        expect(result.executionOrder.length).toBe(result.tasks.length);
    });

    it('Test 36: should link user stories to generated tasks', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan, { generateTestTasks: false });

        // At least one task should have linked user stories
        const hasUserStories = result.tasks.some(t => t.relatedUserStoryIds.length > 0);
        expect(hasUserStories).toBe(true);
    });

    it('Test 37: should respect custom config', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan, {
            masterTicketPrefix: 'PROJ',
            minTaskDuration: 20,
            maxTaskDuration: 45
        });

        expect(result.masterTickets[0].id).toContain('PROJ');
        // Only check implementation tasks (test tasks use separate formula)
        const implTasks = result.tasks.filter(t => !t.title.startsWith('Write tests for'));
        for (const task of implTasks) {
            expect(task.estimatedMinutes).toBeGreaterThanOrEqual(20);
            expect(task.estimatedMinutes).toBeLessThanOrEqual(45);
        }
    });

    it('Test 38: should preserve feature dependencies in master tickets', () => {
        const f1 = createTestFeature({ id: 'f1', order: 1 });
        const f2 = createTestFeature({ id: 'f2', order: 2 });
        const links: BlockLink[] = [{
            id: 'link-1', sourceBlockId: 'f1', targetBlockId: 'f2', dependencyType: 'requires'
        }];

        const plan = createTestPlan({
            featureBlocks: [f1, f2],
            blockLinks: links,
            developerStories: [
                createTestDevStory({ relatedBlockIds: ['f1'] }),
                createTestDevStory({ id: 'ds-2', relatedBlockIds: ['f2'] })
            ]
        });

        const result = generateTaskBreakdown(plan);
        const mt2 = result.masterTickets.find(mt => mt.id === 'MT-002');
        expect(mt2?.dependsOn).toContain('MT-001');
    });
});

// ============================================================================
// Ticket DB Format Conversion Tests
// ============================================================================

describe('TaskBreakdown - DB Format Conversion', () => {
    it('Test 39: should convert master ticket to DB format', () => {
        const mt: MasterTicket = {
            id: 'MT-001', featureId: 'f1', title: 'Auth',
            description: 'Authentication system', priority: 'P0',
            acceptanceCriteria: ['Login works'], technicalNotes: 'JWT',
            childTaskIds: ['MT-001.1'], dependsOn: [],
            estimatedMinutes: 60, assignedTeam: 'orchestrator'
        };

        const dbFormat = masterTicketToDbFormat(mt);
        expect(dbFormat.title).toBe('[MT-001] Auth');
        expect(dbFormat.status).toBe('open');
        expect(dbFormat.priority).toBe(1); // P0 → 1
        expect(dbFormat.creator).toBe('planning-wizard');
        expect(dbFormat.assignee).toBe('Orchestrator');
        expect(dbFormat.description).toContain('Authentication system');
        expect(dbFormat.description).toContain('Login works');
    });

    it('Test 40: should convert atomic task to DB format', () => {
        const task: AtomicTask = {
            id: 'MT-001.1', parentId: 'MT-001', featureId: 'f1',
            title: 'Build login', description: 'Login form',
            priority: 'P2', estimatedMinutes: 30,
            dependsOn: [], acceptanceCriteria: ['Form validates'],
            files: ['src/auth/login.ts'], isUI: true,
            assignedTeam: 'coding', status: 'ready',
            developerStoryId: 'ds-1', relatedUserStoryIds: ['us-1']
        };

        const dbFormat = atomicTaskToDbFormat(task);
        expect(dbFormat.title).toBe('[MT-001.1] Build login');
        expect(dbFormat.priority).toBe(3); // P2 → 3
        expect(dbFormat.assignee).toBe('Coding Agent');
        expect(dbFormat.description).toContain('Form validates');
        expect(dbFormat.description).toContain('src/auth/login.ts');
    });

    it('Test 41: should map all priority levels correctly', () => {
        const makeMT = (priority: 'P0' | 'P1' | 'P2' | 'P3'): MasterTicket => ({
            id: 'MT-001', featureId: 'f1', title: 'T', description: 'D',
            priority, acceptanceCriteria: [], technicalNotes: '',
            childTaskIds: [], dependsOn: [], estimatedMinutes: 0, assignedTeam: 'orchestrator'
        });

        expect(masterTicketToDbFormat(makeMT('P0')).priority).toBe(1);
        expect(masterTicketToDbFormat(makeMT('P1')).priority).toBe(2);
        expect(masterTicketToDbFormat(makeMT('P2')).priority).toBe(3);
        expect(masterTicketToDbFormat(makeMT('P3')).priority).toBe(4);
    });

    it('Test 42: should map all agent teams to assignees', () => {
        const makeTask = (team: 'planning' | 'coding' | 'verification' | 'research' | 'orchestrator'): AtomicTask => ({
            id: 'MT-001.1', parentId: 'MT-001', featureId: 'f1', title: 'T',
            description: 'D', priority: 'P2', estimatedMinutes: 30, dependsOn: [],
            acceptanceCriteria: [], files: [], isUI: false, assignedTeam: team,
            status: 'pending', developerStoryId: null, relatedUserStoryIds: []
        });

        expect(atomicTaskToDbFormat(makeTask('planning')).assignee).toBe('Planning Agent');
        expect(atomicTaskToDbFormat(makeTask('coding')).assignee).toBe('Coding Agent');
        expect(atomicTaskToDbFormat(makeTask('verification')).assignee).toBe('Verification Agent');
        expect(atomicTaskToDbFormat(makeTask('research')).assignee).toBe('Research Agent');
        expect(atomicTaskToDbFormat(makeTask('orchestrator')).assignee).toBe('Orchestrator');
    });
});

// ============================================================================
// Summary & Warnings Tests
// ============================================================================

describe('TaskBreakdown - Summary & Warnings', () => {
    it('Test 43: should include plan name in summary', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan);
        expect(result.summary).toContain('Test Project');
    });

    it('Test 44: should include task counts in summary', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan);
        expect(result.summary).toContain('master tickets');
        expect(result.summary).toContain('atomic tasks');
    });

    it('Test 45: should include estimated time in summary', () => {
        const plan = createTestPlan();
        const result = generateTaskBreakdown(plan);
        expect(result.summary).toContain('minutes estimated');
    });
});
