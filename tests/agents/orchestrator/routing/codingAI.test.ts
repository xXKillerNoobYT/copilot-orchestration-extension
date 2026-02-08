/**
 * @file Tests for CodingAI Router
 */

// Mock vscode before any imports
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn()
    })),
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
    }
}), { virtual: true });

// Mock logger
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('../../../../src/logger', () => ({
    logInfo: (...args: unknown[]) => mockLogInfo(...args),
    logError: (...args: unknown[]) => mockLogError(...args),
    logWarn: (...args: unknown[]) => mockLogWarn(...args)
}));

// Mock task status manager
const mockTransition = jest.fn();
jest.mock('../../../../src/agents/orchestrator/status', () => ({
    getTaskStatusManager: jest.fn().mockReturnValue({
        transition: mockTransition
    }),
    TRIGGERS: {
        ASSIGNED: 'ASSIGNED',
        COMPLETED: 'COMPLETED'
    }
}));

import {
    CodingAIRouter,
    initializeCodingAIRouter,
    getCodingAIRouter,
    resetCodingAIRouter,
    type CodingAssignment,
    type CodingRouterConfig
} from '../../../../src/agents/orchestrator/routing/codingAI';

describe('CodingAIRouter', () => {
    let router: CodingAIRouter;
    
    const createMockAssignment = (overrides: Partial<CodingAssignment> = {}): CodingAssignment => ({
        taskId: 'task-1',
        title: 'Implement feature X',
        description: 'Add the feature X to the codebase',
        acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
        targetFiles: ['src/feature.ts'],
        contextFiles: ['src/utils.ts'],
        estimatedMinutes: 60,
        priority: 'P1',
        instructions: 'Follow the spec',
        restrictions: [],
        ...overrides
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetCodingAIRouter();
        router = new CodingAIRouter();
    });

    describe('constructor', () => {
        it('Test 1: should create router with default config', () => {
            const r = new CodingAIRouter();
            expect(r.getActiveCount()).toBe(0);
        });

        it('Test 2: should create router with custom config', () => {
            const config: Partial<CodingRouterConfig> = {
                codingOnly: false,
                maxConcurrent: 5
            };
            const r = new CodingAIRouter(config);
            expect(r.getActiveCount()).toBe(0);
        });
    });

    describe('routeTask', () => {
        it('Test 3: should successfully route a task', async () => {
            const assignment = createMockAssignment();
            const result = await router.routeTask(assignment);
            
            expect(result.success).toBe(true);
            expect(result.message).toContain('task-1');
            expect(result.message).toContain('routed');
            expect(mockLogInfo).toHaveBeenCalled();
        });

        it('Test 4: should track active assignment after routing', async () => {
            const assignment = createMockAssignment();
            await router.routeTask(assignment);
            
            expect(router.getActiveCount()).toBe(1);
            expect(router.getActiveTaskIds()).toContain('task-1');
        });

        it('Test 5: should fail when max concurrent limit reached', async () => {
            const r = new CodingAIRouter({ maxConcurrent: 1 });
            
            // Route first task
            await r.routeTask(createMockAssignment({ taskId: 'task-1' }));
            
            // Second should fail
            const result = await r.routeTask(createMockAssignment({ taskId: 'task-2' }));
            
            expect(result.success).toBe(false);
            expect(result.message).toContain('Max concurrent');
        });

        it('Test 6: should block tasks with architecture keywords when codingOnly=true', async () => {
            const r = new CodingAIRouter({ codingOnly: true });
            const assignment = createMockAssignment({
                title: 'Design new architecture for the system'
            });
            
            const result = await r.routeTask(assignment);
            
            expect(result.success).toBe(false);
            expect(result.message).toContain('coding_only');
            expect(result.message).toContain('architecture');
        });

        it('Test 7: should block tasks with design pattern keywords', async () => {
            const r = new CodingAIRouter({ codingOnly: true });
            const assignment = createMockAssignment({
                description: 'Implement a new design pattern for state management'
            });
            
            const result = await r.routeTask(assignment);
            
            expect(result.success).toBe(false);
            expect(result.message).toContain('design pattern');
        });

        it('Test 8: should add warnings for caution keywords', async () => {
            const r = new CodingAIRouter({ codingOnly: true });
            const assignment = createMockAssignment({
                title: 'Create prototype for new feature'
            });
            
            const result = await r.routeTask(assignment);
            
            expect(result.success).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('prototype');
        });

        it('Test 9: should allow tasks without blocked keywords when codingOnly=true', async () => {
            const r = new CodingAIRouter({ codingOnly: true });
            const assignment = createMockAssignment({
                title: 'Fix bug in user service',
                description: 'Resolve issue with authentication'
            });
            
            const result = await r.routeTask(assignment);
            
            expect(result.success).toBe(true);
        });

        it('Test 10: should not block tasks when codingOnly=false', async () => {
            const r = new CodingAIRouter({ codingOnly: false });
            const assignment = createMockAssignment({
                title: 'Design new architecture'
            });
            
            const result = await r.routeTask(assignment);
            
            expect(result.success).toBe(true);
        });

        it('Test 11: should block tasks matching exclude patterns', async () => {
            const r = new CodingAIRouter({
                excludePatterns: ['test.*only', 'skip-.*']
            });
            const assignment = createMockAssignment({
                title: 'test-only: experimental feature'
            });
            
            const result = await r.routeTask(assignment);
            
            expect(result.success).toBe(false);
            expect(result.message).toContain('exclude pattern');
        });

        it('Test 12: should allow tasks not matching exclude patterns', async () => {
            const r = new CodingAIRouter({
                excludePatterns: ['test.*only']
            });
            const assignment = createMockAssignment({
                title: 'Implement user authentication'
            });
            
            const result = await r.routeTask(assignment);
            
            expect(result.success).toBe(true);
        });

        it('Test 13: should call status manager transition', async () => {
            const assignment = createMockAssignment();
            await router.routeTask(assignment);
            
            expect(mockTransition).toHaveBeenCalledWith('task-1', 'ASSIGNED');
        });

        it('Test 14: should handle errors gracefully', async () => {
            // Create a router that will throw during processing
            const r = new CodingAIRouter({ excludePatterns: ['(invalid'] });  // Invalid regex
            const assignment = createMockAssignment();
            
            const result = await r.routeTask(assignment);
            
            expect(result.success).toBe(false);
            expect(result.message).toContain('Routing error');
            expect(mockLogError).toHaveBeenCalled();
        });
    });

    describe('acknowledgeAssignment', () => {
        it('Test 15: should acknowledge existing assignment', async () => {
            const assignment = createMockAssignment();
            await router.routeTask(assignment);
            
            const result = router.acknowledgeAssignment('task-1');
            
            expect(result).toBe(true);
            expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('acknowledged'));
        });

        it('Test 16: should return false for non-existent assignment', () => {
            const result = router.acknowledgeAssignment('non-existent');
            
            expect(result).toBe(false);
            expect(mockLogWarn).toHaveBeenCalled();
        });
    });

    describe('completeAssignment', () => {
        it('Test 17: should remove assignment from active list', async () => {
            const assignment = createMockAssignment();
            await router.routeTask(assignment);
            expect(router.getActiveCount()).toBe(1);
            
            router.completeAssignment('task-1');
            
            expect(router.getActiveCount()).toBe(0);
            expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('completed'));
        });

        it('Test 18: should be no-op for non-existent assignment', () => {
            router.completeAssignment('non-existent');
            // Should not throw
            expect(router.getActiveCount()).toBe(0);
        });
    });

    describe('checkTimeouts', () => {
        it('Test 19: should return empty array when no timeouts', async () => {
            const r = new CodingAIRouter({ assignmentTimeoutMs: 60000 });
            const assignment = createMockAssignment();
            await r.routeTask(assignment);
            r.acknowledgeAssignment('task-1');
            
            const timedOut = r.checkTimeouts();
            
            expect(timedOut).toEqual([]);
        });

        it('Test 20: should detect unacknowledged assignments past timeout', async () => {
            const r = new CodingAIRouter({ assignmentTimeoutMs: -1 }); // Immediate timeout
            const assignment = createMockAssignment();
            await r.routeTask(assignment);
            
            const timedOut = r.checkTimeouts();
            
            expect(timedOut).toContain('task-1');
        });

        it('Test 21: should not include acknowledged assignments in timeouts', async () => {
            const r = new CodingAIRouter({ assignmentTimeoutMs: -1 });
            const assignment = createMockAssignment();
            await r.routeTask(assignment);
            r.acknowledgeAssignment('task-1');
            
            const timedOut = r.checkTimeouts();
            
            expect(timedOut).not.toContain('task-1');
        });
    });

    describe('getActiveCount', () => {
        it('Test 22: should return 0 initially', () => {
            expect(router.getActiveCount()).toBe(0);
        });

        it('Test 23: should return correct count after routing', async () => {
            const r = new CodingAIRouter({ codingOnly: false, maxConcurrent: 10 });
            await r.routeTask(createMockAssignment({ taskId: 'task-1' }));
            expect(r.getActiveCount()).toBe(1);
            
            await r.routeTask(createMockAssignment({ taskId: 'task-2' }));
            expect(r.getActiveCount()).toBe(2);
        });
    });

    describe('getActiveTaskIds', () => {
        it('Test 24: should return empty array initially', () => {
            expect(router.getActiveTaskIds()).toEqual([]);
        });

        it('Test 25: should return all active task IDs', async () => {
            const r = new CodingAIRouter({ codingOnly: false, maxConcurrent: 10 });
            await r.routeTask(createMockAssignment({ taskId: 'task-1' }));
            await r.routeTask(createMockAssignment({ taskId: 'task-2' }));
            
            const ids = r.getActiveTaskIds();
            
            expect(ids).toContain('task-1');
            expect(ids).toContain('task-2');
            expect(ids.length).toBe(2);
        });
    });

    describe('blocked keywords coverage', () => {
        const blockedKeywords = [
            'architecture', 'design system', 'design pattern',
            'create new framework', 'redesign', 'refactor entire',
            'overhaul', 'rewrite from scratch'
        ];

        blockedKeywords.forEach((keyword, index) => {
            it(`Test ${26 + index}: should block keyword "${keyword}" in title`, async () => {
                const r = new CodingAIRouter({ codingOnly: true });
                const result = await r.routeTask(createMockAssignment({
                    title: `Task with ${keyword} work`
                }));
                expect(result.success).toBe(false);
            });
        });

        it('Test 34: should block keyword in description', async () => {
            const r = new CodingAIRouter({ codingOnly: true });
            const result = await r.routeTask(createMockAssignment({
                description: 'Need to overhaul the entire system'
            }));
            expect(result.success).toBe(false);
        });
    });

    describe('caution keywords coverage', () => {
        const cautionKeywords = ['new approach', 'alternative', 'prototype', 'spike'];

        cautionKeywords.forEach((keyword, index) => {
            it(`Test ${35 + index}: should warn for keyword "${keyword}"`, async () => {
                const r = new CodingAIRouter({ codingOnly: true });
                const result = await r.routeTask(createMockAssignment({
                    title: `Task with ${keyword}`
                }));
                expect(result.success).toBe(true);
                expect(result.warnings.some(w => w.includes(keyword))).toBe(true);
            });
        });

        it('Test 39: should warn for caution keyword in description', async () => {
            const r = new CodingAIRouter({ codingOnly: true });
            const result = await r.routeTask(createMockAssignment({
                description: 'Exploring an alternative approach'
            }));
            expect(result.success).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
        });
    });

    describe('singleton functions', () => {
        it('Test 40: initializeCodingAIRouter should create instance', () => {
            resetCodingAIRouter();
            const router = initializeCodingAIRouter({ maxConcurrent: 10 });
            
            expect(router).toBeInstanceOf(CodingAIRouter);
            expect(getCodingAIRouter()).toBe(router);
        });

        it('Test 41: getCodingAIRouter should create instance if not exists', () => {
            resetCodingAIRouter();
            const router = getCodingAIRouter();
            
            expect(router).toBeInstanceOf(CodingAIRouter);
        });

        it('Test 42: getCodingAIRouter should return same instance', () => {
            resetCodingAIRouter();
            const router1 = getCodingAIRouter();
            const router2 = getCodingAIRouter();
            
            expect(router1).toBe(router2);
        });

        it('Test 43: resetCodingAIRouter should clear instance', () => {
            const router1 = getCodingAIRouter();
            resetCodingAIRouter();
            const router2 = getCodingAIRouter();
            
            expect(router1).not.toBe(router2);
        });
    });

    describe('exclude pattern coverage', () => {
        it('Test 44: should match exclude pattern in description', async () => {
            const r = new CodingAIRouter({
                excludePatterns: ['experimental']
            });
            const result = await r.routeTask(createMockAssignment({
                description: 'This is an experimental feature'
            }));
            expect(result.success).toBe(false);
        });

        it('Test 45: should handle multiple exclude patterns', async () => {
            const r = new CodingAIRouter({
                excludePatterns: ['skip', 'ignore', 'wip']
            });
            
            const result1 = await r.routeTask(createMockAssignment({
                title: 'Skip this task'
            }));
            expect(result1.success).toBe(false);
            
            const result2 = await r.routeTask(createMockAssignment({
                title: 'WIP: partial implementation'
            }));
            expect(result2.success).toBe(false);
        });
    });
});
