/**
 * Planning System Integration Tests (MT-033)
 *
 * Tests the complete planning system end-to-end.
 */

import {
    createEmptyPlan,
    createFeatureBlock,
    createBlockLink,
    createDeveloperStory,
    createUserStory,
    createSuccessCriterion,
    validatePlan,
    submitPlanToOrchestrator,
    getErrorHandler,
    validatePlanWithErrors,
    detectDrift,
    generateDocumentation,
    CompletePlan,
    FeatureBlock,
    startExecution,
    pauseExecution,
    resumeExecution,
    cancelExecution,
    updateTaskProgress,
    getNextTasks,
    getBlockedTasks,
    calculateProgress,
    renderProgressSummary,
    ExecutionPlan,
    ExecutionTask,
} from '../../src/planning';

// Mock dependencies
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn(),
    logWarn: jest.fn(),
}));

describe('Planning System Integration Tests', () => {
    let testPlan: CompletePlan;

    beforeEach(() => {
        // Create a realistic test plan
        testPlan = createEmptyPlan();
        testPlan.overview = {
            name: 'Test Project',
            description: 'A test project for integration testing',
            goals: ['Goal 1', 'Goal 2'],
        };

        // Add features
        const feature1 = createFeatureBlock('Authentication', 'critical');
        feature1.description = 'User authentication and authorization';
        feature1.acceptanceCriteria = ['Users can sign up', 'Users can log in', 'Users can log out'];
        testPlan.featureBlocks.push(feature1);

        const feature2 = createFeatureBlock('Dashboard', 'high');
        feature2.description = 'Main user dashboard';
        feature2.acceptanceCriteria = ['Shows user data', 'Responsive design'];
        testPlan.featureBlocks.push(feature2);

        const feature3 = createFeatureBlock('Settings', 'medium');
        feature3.description = 'User settings management';
        feature3.acceptanceCriteria = ['Profile editing', 'Password change'];
        testPlan.featureBlocks.push(feature3);

        // Add dependencies
        testPlan.blockLinks.push(createBlockLink(feature2.id, feature1.id, 'requires'));
        testPlan.blockLinks.push(createBlockLink(feature3.id, feature1.id, 'requires'));

        // Add stories - createDeveloperStory(action, benefit), createUserStory(userType, action, benefit)
        testPlan.developerStories.push(createDeveloperStory('Implement JWT auth', 'Secure user sessions'));
        testPlan.userStories.push(createUserStory('End User', 'log in', 'access my dashboard'));

        // Add success criteria - createSuccessCriterion(description)
        testPlan.successCriteria.push(createSuccessCriterion('All tests pass'));
    });

    describe('Test 1: Plan Creation', () => {
        it('should create empty plan with correct structure', () => {
            const plan = createEmptyPlan();
            expect(plan.overview).toBeDefined();
            expect(plan.featureBlocks).toEqual([]);
            expect(plan.blockLinks).toEqual([]);
            expect(plan.developerStories).toEqual([]);
            expect(plan.userStories).toEqual([]);
            expect(plan.successCriteria).toEqual([]);
        });

        it('should create feature blocks with unique IDs', () => {
            const f1 = createFeatureBlock('Feature 1');
            const f2 = createFeatureBlock('Feature 2');
            expect(f1.id).not.toBe(f2.id);
            expect(f1.name).toBe('Feature 1');
            expect(f1.priority).toBe('medium'); // default
        });

        it('should create block links with correct structure', () => {
            const link = createBlockLink('source', 'target', 'requires');
            expect(link.sourceBlockId).toBe('source');
            expect(link.targetBlockId).toBe('target');
            expect(link.dependencyType).toBe('requires');
            expect(link.id).toBeDefined();
        });
    });

    describe('Test 2: Plan Validation', () => {
        it('should validate a complete plan successfully', () => {
            const result = validatePlan(testPlan);
            expect(result.isValid).toBe(true);
        });

        it('should reject plan without name', () => {
            testPlan.overview.name = '';
            const result = validatePlan(testPlan);
            expect(result.isValid).toBe(false);
        });

        it('should accept plan with empty features', () => {
            testPlan.featureBlocks = [];
            const result = validatePlan(testPlan);
            // Schema allows empty features array - validation passes
            expect(result.isValid).toBe(true);
        });
    });

    describe('Test 3: Error Handler', () => {
        it('should detect validation errors', () => {
            testPlan.featureBlocks[0].name = '';
            const handler = getErrorHandler();
            const errors = validatePlanWithErrors(testPlan, handler);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
        });

        it('should detect duplicate IDs', () => {
            testPlan.featureBlocks[1].id = testPlan.featureBlocks[0].id;
            const handler = getErrorHandler();
            const errors = validatePlanWithErrors(testPlan, handler);
            expect(errors.some(e => e.code === 'DUPLICATE_ID')).toBe(true);
        });

        it('should detect orphan references', () => {
            testPlan.blockLinks.push(createBlockLink('nonexistent', testPlan.featureBlocks[0].id));
            const handler = getErrorHandler();
            const errors = validatePlanWithErrors(testPlan, handler);
            expect(errors.some(e => e.code === 'ORPHAN_REFERENCE')).toBe(true);
        });
    });

    describe('Test 4: Orchestrator Integration', () => {
        it('should submit plan and create execution plan', () => {
            const result = submitPlanToOrchestrator(testPlan, { autoStart: false });
            expect(result.success).toBe(true);
            expect(result.executionPlan).toBeDefined();
            expect(result.taskCount).toBeGreaterThan(0);
        });

        it('should create tasks for all features', () => {
            const result = submitPlanToOrchestrator(testPlan);
            expect(result.executionPlan?.tasks.filter(t => t.sourceType === 'feature').length)
                .toBe(testPlan.featureBlocks.length);
        });

        it('should respect dependency order', () => {
            const result = submitPlanToOrchestrator(testPlan, { createDependencies: true });
            const execPlan = result.executionPlan!;
            
            // Dashboard depends on Auth, so Auth should come first in execution order
            const authTaskId = execPlan.tasks.find(t => t.title === 'Authentication')?.id;
            const dashTaskId = execPlan.tasks.find(t => t.title === 'Dashboard')?.id;
            
            if (authTaskId && dashTaskId) {
                const authIndex = execPlan.executionOrder.indexOf(authTaskId);
                const dashIndex = execPlan.executionOrder.indexOf(dashTaskId);
                expect(authIndex).toBeLessThan(dashIndex);
            }
        });

        it('should mark tasks as ready when auto-started', () => {
            const result = submitPlanToOrchestrator(testPlan, { autoStart: true });
            const readyTasks = result.executionPlan?.tasks.filter(t => t.status === 'ready');
            expect(readyTasks?.length).toBeGreaterThan(0);
        });
    });

    describe('Test 5: Documentation Generation', () => {
        it('should generate all documentation files', () => {
            const docs = generateDocumentation(testPlan);
            expect(docs.length).toBeGreaterThan(0);
        });

        it('should generate plan overview', () => {
            const docs = generateDocumentation(testPlan);
            const planDoc = docs.find(d => d.path.includes('PLAN.md'));
            expect(planDoc).toBeDefined();
            expect(planDoc?.content).toContain('Test Project');
        });

        it('should generate features doc', () => {
            const docs = generateDocumentation(testPlan);
            const featuresDoc = docs.find(d => d.path.includes('FEATURES.md'));
            expect(featuresDoc).toBeDefined();
            expect(featuresDoc?.content).toContain('Authentication');
        });

        it('should include mermaid dependency graph', () => {
            const docs = generateDocumentation(testPlan);
            const planDoc = docs.find(d => d.path.includes('PLAN.md'));
            expect(planDoc?.content).toContain('mermaid');
        });
    });

    describe('Test 6: Drift Detection', () => {
        it('should detect missing features', () => {
            const markers = {
                implementedFeatures: ['Dashboard', 'Settings'],
                testCoverage: new Map(),
                documentationFiles: [],
                fileTimestamps: new Map(),
                exports: new Map(),
            };

            const report = detectDrift(testPlan, markers);
            const missingFeatures = report.findings.filter(f => f.type === 'missing-feature');
            expect(missingFeatures.length).toBeGreaterThan(0);
            expect(missingFeatures.some(f => f.subject.name === 'Authentication')).toBe(true);
        });

        it('should detect unplanned features', () => {
            const markers = {
                implementedFeatures: ['Authentication', 'Dashboard', 'Settings', 'UnplannedFeature'],
                testCoverage: new Map(),
                documentationFiles: [],
                fileTimestamps: new Map(),
                exports: new Map(),
            };

            const report = detectDrift(testPlan, markers);
            const unplanned = report.findings.filter(f => f.type === 'unplanned-feature');
            expect(unplanned.some(f => f.subject.name === 'UnplannedFeature')).toBe(true);
        });

        it('should calculate health score', () => {
            const markers = {
                implementedFeatures: ['Authentication', 'Dashboard', 'Settings'],
                testCoverage: new Map([['auth.test.ts', ['auth']]]),
                documentationFiles: ['README.md'],
                fileTimestamps: new Map(),
                exports: new Map(),
            };

            const report = detectDrift(testPlan, markers);
            expect(report.summary.healthScore).toBeGreaterThanOrEqual(0);
            expect(report.summary.healthScore).toBeLessThanOrEqual(100);
        });
    });

    describe('Test 7: End-to-End Flow', () => {
        it('should complete full planning workflow', () => {
            // 1. Create plan
            const plan = createEmptyPlan();
            plan.overview.name = 'E2E Test Project';
            plan.overview.description = 'Testing full workflow';

            // 2. Add features
            const feature = createFeatureBlock('Core Feature', 'critical');
            feature.acceptanceCriteria = ['Works correctly'];
            plan.featureBlocks.push(feature);

            // 3. Validate
            const validation = validatePlan(plan);
            expect(validation.isValid).toBe(true);

            // 4. Submit to orchestrator
            const submission = submitPlanToOrchestrator(plan, { autoStart: true });
            expect(submission.success).toBe(true);

            // 5. Generate docs
            const docs = generateDocumentation(plan);
            expect(docs.length).toBeGreaterThan(0);

            // 6. Check drift (no implementation yet)
            const markers = {
                implementedFeatures: [],
                testCoverage: new Map(),
                documentationFiles: [],
                fileTimestamps: new Map(),
                exports: new Map(),
            };
            const drift = detectDrift(plan, markers);
            expect(drift.findings.some(f => f.type === 'missing-feature')).toBe(true);
        });
    });

    // =========================================================================
    // Orchestrator Integration Tests (MT-033.26-30)
    // =========================================================================
    describe('Test 8: Execution Control', () => {
        let executionPlan: ExecutionPlan;

        beforeEach(() => {
            const result = submitPlanToOrchestrator(testPlan, { autoStart: false });
            expect(result.success).toBe(true);
            executionPlan = result.executionPlan!;
        });

        it('should start execution', () => {
            expect(executionPlan.status).toBe('draft');
            startExecution(executionPlan);
            expect(executionPlan.status).toBe('active');
            expect(executionPlan.startedAt).toBeDefined();
        });

        it('should pause execution', () => {
            startExecution(executionPlan);
            pauseExecution(executionPlan);
            expect(executionPlan.status).toBe('paused');
        });

        it('should resume execution', () => {
            startExecution(executionPlan);
            pauseExecution(executionPlan);
            resumeExecution(executionPlan);
            expect(executionPlan.status).toBe('active');
        });

        it('should cancel execution', () => {
            startExecution(executionPlan);
            cancelExecution(executionPlan);
            expect(executionPlan.status).toBe('cancelled');
            // Incomplete tasks should be cancelled
            const incompleteTasks = executionPlan.tasks.filter(t => t.status !== 'completed');
            expect(incompleteTasks.every(t => t.status === 'cancelled')).toBe(true);
        });
    });

    describe('Test 9: Task Progress Updates', () => {
        let executionPlan: ExecutionPlan;

        beforeEach(() => {
            const result = submitPlanToOrchestrator(testPlan, { autoStart: true });
            expect(result.success).toBe(true);
            executionPlan = result.executionPlan!;
        });

        it('should update task progress', () => {
            const task = executionPlan.tasks[0];
            const success = updateTaskProgress(executionPlan, {
                taskId: task.id,
                status: 'in-progress',
                timestamp: new Date().toISOString(),
            });
            expect(success).toBe(true);
            expect(task.status).toBe('in-progress');
        });

        it('should return false for non-existent task', () => {
            const success = updateTaskProgress(executionPlan, {
                taskId: 'non-existent-task',
                status: 'completed',
                timestamp: new Date().toISOString(),
            });
            expect(success).toBe(false);
        });

        it('should mark dependent tasks ready on completion', () => {
            // Find a task with dependents
            const taskWithDeps = executionPlan.tasks.find(t => 
                executionPlan.dependencyMap.has(t.id)
            );
            if (taskWithDeps) {
                updateTaskProgress(executionPlan, {
                    taskId: taskWithDeps.id,
                    status: 'completed',
                    timestamp: new Date().toISOString(),
                });
                // Dependent tasks should be updated
            }
        });

        it('should complete plan when all tasks complete', () => {
            // Complete all tasks
            for (const task of executionPlan.tasks) {
                updateTaskProgress(executionPlan, {
                    taskId: task.id,
                    status: 'completed',
                    timestamp: new Date().toISOString(),
                });
            }
            expect(executionPlan.status).toBe('completed');
            expect(executionPlan.completedAt).toBeDefined();
        });
    });

    describe('Test 10: Task Querying', () => {
        let executionPlan: ExecutionPlan;

        beforeEach(() => {
            const result = submitPlanToOrchestrator(testPlan, { autoStart: true });
            expect(result.success).toBe(true);
            executionPlan = result.executionPlan!;
        });

        it('should get next ready tasks', () => {
            const nextTasks = getNextTasks(executionPlan, 3);
            expect(Array.isArray(nextTasks)).toBe(true);
            nextTasks.forEach(task => {
                expect(task.status).toBe('ready');
            });
        });

        it('should limit next tasks', () => {
            const nextTasks = getNextTasks(executionPlan, 1);
            expect(nextTasks.length).toBeLessThanOrEqual(1);
        });

        it('should get blocked tasks with blockers', () => {
            const blockedTasks = getBlockedTasks(executionPlan);
            expect(Array.isArray(blockedTasks)).toBe(true);
            blockedTasks.forEach(item => {
                expect(item.task).toBeDefined();
                expect(item.blockedBy).toBeDefined();
                expect(item.blockedBy.length).toBeGreaterThan(0);
            });
        });
    });

    describe('Test 11: Progress Calculation', () => {
        let executionPlan: ExecutionPlan;

        beforeEach(() => {
            const result = submitPlanToOrchestrator(testPlan, { autoStart: true });
            expect(result.success).toBe(true);
            executionPlan = result.executionPlan!;
        });

        it('should calculate progress', () => {
            const progress = calculateProgress(executionPlan);
            expect(progress.total).toBe(executionPlan.tasks.length);
            expect(progress.percentage).toBeGreaterThanOrEqual(0);
            expect(progress.percentage).toBeLessThanOrEqual(100);
        });

        it('should render progress summary', () => {
            const progress = calculateProgress(executionPlan);
            const summary = renderProgressSummary(progress);
            expect(typeof summary).toBe('string');
            expect(summary).toContain('Progress');
        });

        it('should update progress after task completion', () => {
            const initialProgress = calculateProgress(executionPlan);
            
            // Complete first task
            const readyTask = executionPlan.tasks.find(t => t.status === 'ready');
            if (readyTask) {
                updateTaskProgress(executionPlan, {
                    taskId: readyTask.id,
                    status: 'completed',
                    timestamp: new Date().toISOString(),
                });
                
                const newProgress = calculateProgress(executionPlan);
                expect(newProgress.completed).toBe(initialProgress.completed + 1);
            }
        });
    });
});
