/**
 * Tests for Follow-up Task Creation
 *
 * Tests for creating follow-up tasks from unmet criteria.
 */

import {
    FollowUpCreator,
    FollowUpTask,
    FollowUpConfig,
    GroupingStrategy,
    getFollowUpCreator,
    resetFollowUpCreatorForTests,
} from '../../../src/agents/verification/followUp';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import { logInfo } from '../../../src/logger';

describe('FollowUpCreator', () => {
    let creator: FollowUpCreator;

    beforeEach(() => {
        jest.clearAllMocks();
        resetFollowUpCreatorForTests();
        creator = new FollowUpCreator();
    });

    afterEach(() => {
        creator.clear();
    });

    // ============================================================================
    // Constructor Tests
    // ============================================================================
    describe('constructor', () => {
        it('Test 1: should create with default config', () => {
            const creator = new FollowUpCreator();
            expect(creator.getCreatedTasks()).toEqual([]);
        });

        it('Test 2: should accept custom config', () => {
            const creator = new FollowUpCreator({
                groupingStrategy: 'single',
                maxCriteriaPerTask: 3
            });
            
            const tasks = creator.createFollowUps('parent-1', ['criterion 1', 'criterion 2']);
            
            // With 'single' strategy, one task per criterion
            expect(tasks.length).toBe(2);
        });
    });

    // ============================================================================
    // createFollowUps Tests
    // ============================================================================
    describe('createFollowUps()', () => {
        it('Test 3: should return empty array for no criteria', () => {
            const tasks = creator.createFollowUps('parent-1', []);
            expect(tasks).toEqual([]);
        });

        it('Test 4: should create tasks with parent ID', () => {
            const tasks = creator.createFollowUps('parent-123', ['Test criterion']);
            
            expect(tasks[0].parentTaskId).toBe('parent-123');
        });

        it('Test 5: should use default priority', () => {
            const tasks = creator.createFollowUps('parent-1', ['Test criterion']);
            
            expect(tasks[0].priority).toBe(2); // Default is 2
        });

        it('Test 6: should use custom priority when provided', () => {
            const tasks = creator.createFollowUps('parent-1', ['Test criterion'], 5);
            
            expect(tasks[0].priority).toBe(5);
        });

        it('Test 7: should generate unique IDs', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1', 'c2', 'c3']);
            
            const ids = new Set(tasks.map(t => t.id));
            expect(ids.size).toBe(tasks.length);
        });

        it('Test 8: should log task creation', () => {
            creator.createFollowUps('parent-1', ['Test criterion']);
            
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Created task')
            );
        });
    });

    // ============================================================================
    // Grouping Strategy Tests: single
    // ============================================================================
    describe('groupingStrategy: single', () => {
        beforeEach(() => {
            creator = new FollowUpCreator({ groupingStrategy: 'single' });
        });

        it('Test 9: should create one task per criterion', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1', 'c2', 'c3']);
            
            expect(tasks.length).toBe(3);
        });

        it('Test 10: should extract title from criterion', () => {
            const tasks = creator.createFollowUps('parent-1', ['Should display user name']);
            
            expect(tasks[0].title).toContain('Should display user name');
        });

        it('Test 11: should set type as incomplete', () => {
            const tasks = creator.createFollowUps('parent-1', ['Test criterion']);
            
            expect(tasks[0].type).toBe('incomplete');
        });
    });

    // ============================================================================
    // Grouping Strategy Tests: by-type
    // ============================================================================
    describe('groupingStrategy: by-type', () => {
        beforeEach(() => {
            creator = new FollowUpCreator({ groupingStrategy: 'by-type' });
        });

        it('Test 12: should group test criteria', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Unit tests should pass',
                'Test coverage should be 80%'
            ]);
            
            const testTasks = tasks.filter(t => t.type === 'test');
            expect(testTasks.length).toBe(1);
            expect(testTasks[0].targetCriteria.length).toBe(2);
        });

        it('Test 13: should group documentation criteria', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Update README documentation',
                'Add JSDoc comments'
            ]);
            
            const docTasks = tasks.filter(t => t.type === 'documentation');
            expect(docTasks.length).toBe(1);
        });

        it('Test 14: should group fix criteria', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Fix the error in parser',
                'Bug: memory leak'
            ]);
            
            const fixTasks = tasks.filter(t => t.type === 'fix');
            expect(fixTasks.length).toBe(1);
        });

        it('Test 15: should put other criteria in feature group', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Implement new button',
                'Add API endpoint'
            ]);
            
            const featureTasks = tasks.filter(t => t.type === 'incomplete');
            expect(featureTasks.length).toBe(1);
        });

        it('Test 16: should separate different types', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Unit tests should pass',
                'Update README',
                'Implement feature'
            ]);
            
            expect(tasks.length).toBe(3);
        });
    });

    // ============================================================================
    // Grouping Strategy Tests: by-file
    // ============================================================================
    describe('groupingStrategy: by-file', () => {
        beforeEach(() => {
            creator = new FollowUpCreator({ groupingStrategy: 'by-file' });
        });

        it('Test 17: should group by file reference', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Update in src/utils.ts',
                'Fix error in src/utils.ts'
            ]);
            
            expect(tasks.length).toBe(1);
            expect(tasks[0].title).toContain('src/utils.ts');
        });

        it('Test 18: should handle file keyword', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Modify file config.json'
            ]);
            
            expect(tasks[0].title).toContain('config.json');
        });

        it('Test 19: should separate criteria without file references', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Update in src/test.ts',
                'General improvement needed'
            ]);
            
            expect(tasks.length).toBe(2);
        });

        it('Test 20: should group by different files', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Update in file1.ts',
                'Update in file2.ts'
            ]);
            
            expect(tasks.length).toBe(2);
        });
    });

    // ============================================================================
    // Grouping Strategy Tests: all-in-one
    // ============================================================================
    describe('groupingStrategy: all-in-one', () => {
        beforeEach(() => {
            creator = new FollowUpCreator({ groupingStrategy: 'all-in-one' });
        });

        it('Test 21: should create single task with all criteria', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1', 'c2', 'c3']);
            
            expect(tasks.length).toBe(1);
            expect(tasks[0].targetCriteria.length).toBe(3);
        });

        it('Test 22: should use generic title', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1', 'c2']);
            
            expect(tasks[0].title).toBe('Complete remaining criteria');
        });
    });

    // ============================================================================
    // Chunking Tests
    // ============================================================================
    describe('chunking', () => {
        it('Test 23: should chunk when criteria exceed max', () => {
            creator = new FollowUpCreator({ 
                groupingStrategy: 'by-type',
                maxCriteriaPerTask: 2 
            });
            
            const tasks = creator.createFollowUps('parent-1', [
                'Test 1 should pass',
                'Test 2 should pass',
                'Test 3 should pass',
                'Test 4 should pass'
            ]);
            
            // Should be split into 2 tasks (2 criteria each)
            const testTasks = tasks.filter(t => t.type === 'test');
            expect(testTasks.length).toBe(2);
        });

        it('Test 24: should add suffix for chunked tasks', () => {
            creator = new FollowUpCreator({ 
                groupingStrategy: 'by-type',
                maxCriteriaPerTask: 2 
            });
            
            const tasks = creator.createFollowUps('parent-1', [
                'Test 1 should pass',
                'Test 2 should pass',
                'Test 3 should pass'
            ]);
            
            // Should have (1) and (2) in titles
            const titles = tasks.map(t => t.title);
            expect(titles.some(t => t.includes('(1)'))).toBe(true);
            expect(titles.some(t => t.includes('(2)'))).toBe(true);
        });
    });

    // ============================================================================
    // extractTitle Tests (via createFollowUps)
    // ============================================================================
    describe('title extraction', () => {
        beforeEach(() => {
            creator = new FollowUpCreator({ groupingStrategy: 'single' });
        });

        it('Test 25: should extract first sentence', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'First sentence. Second sentence.'
            ]);
            
            expect(tasks[0].title).toContain('First sentence');
            expect(tasks[0].title).not.toContain('Second sentence');
        });

        it('Test 26: should truncate long titles', () => {
            const longCriterion = 'This is a very long criterion description that definitely exceeds the fifty character limit for titles';
            const tasks = creator.createFollowUps('parent-1', [longCriterion]);
            
            expect(tasks[0].title.length).toBeLessThanOrEqual(100); // With prefix
        });

        it('Test 27: should add ellipsis for truncated titles', () => {
            const longCriterion = 'This is a very long criterion description that definitely exceeds the limit';
            const tasks = creator.createFollowUps('parent-1', [longCriterion]);
            
            expect(tasks[0].title).toContain('...');
        });
    });

    // ============================================================================
    // buildDescription Tests (via createFollowUps)
    // ============================================================================
    describe('description building', () => {
        it('Test 28: should include all criteria as checklist', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1', 'c2']);
            
            expect(tasks[0].description).toContain('- [ ] c1');
            expect(tasks[0].description).toContain('- [ ] c2');
        });

        it('Test 29: should include header', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1']);
            
            expect(tasks[0].description).toContain('Address the following acceptance criteria');
        });
    });

    // ============================================================================
    // Estimation Tests
    // ============================================================================
    describe('estimation', () => {
        it('Test 30: should estimate based on criteria count', () => {
            creator = new FollowUpCreator({ baseEstimateMinutes: 10 });
            
            const tasks = creator.createFollowUps('parent-1', ['c1', 'c2']);
            
            expect(tasks[0].estimateMinutes).toBe(20); // 2 * 10
        });

        it('Test 31: should cap estimate at 60 minutes', () => {
            creator = new FollowUpCreator({ 
                groupingStrategy: 'all-in-one',
                baseEstimateMinutes: 15 
            });
            
            const tasks = creator.createFollowUps('parent-1', ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
            
            // 6 * 15 = 90, but capped at 60
            expect(tasks[0].estimateMinutes).toBe(60);
        });
    });

    // ============================================================================
    // toQueueTask Tests
    // ============================================================================
    describe('toQueueTask()', () => {
        it('Test 32: should convert to Task format', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1']);
            const queueTask = creator.toQueueTask(tasks[0]);
            
            expect(queueTask.id).toBe(tasks[0].id);
            expect(queueTask.title).toBe(tasks[0].title);
            expect(queueTask.priority).toBe(tasks[0].priority);
            expect(queueTask.status).toBe('pending');
        });

        it('Test 33: should set parent as dependency', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1']);
            const queueTask = creator.toQueueTask(tasks[0]);
            
            expect(queueTask.dependencies).toContain('parent-1');
        });

        it('Test 34: should include metadata', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1']);
            const queueTask = creator.toQueueTask(tasks[0]);
            
            expect(queueTask.metadata?.description).toBeDefined();
            expect(queueTask.metadata?.estimateMinutes).toBeDefined();
            expect(queueTask.metadata?.type).toBeDefined();
            expect(queueTask.metadata?.criteria).toEqual(['c1']);
        });

        it('Test 35: should set createdAt date', () => {
            const tasks = creator.createFollowUps('parent-1', ['c1']);
            const queueTask = creator.toQueueTask(tasks[0]);
            
            expect(queueTask.createdAt).toBeInstanceOf(Date);
        });
    });

    // ============================================================================
    // getCreatedTasks Tests
    // ============================================================================
    describe('getCreatedTasks()', () => {
        it('Test 36: should return copy of tasks', () => {
            creator.createFollowUps('parent-1', ['c1']);
            
            const tasks1 = creator.getCreatedTasks();
            const tasks2 = creator.getCreatedTasks();
            
            expect(tasks1).not.toBe(tasks2);
        });

        it('Test 37: should accumulate tasks', () => {
            creator.createFollowUps('parent-1', ['c1']);
            creator.createFollowUps('parent-2', ['c2']);
            
            expect(creator.getCreatedTasks().length).toBe(2);
        });
    });

    // ============================================================================
    // clear Tests
    // ============================================================================
    describe('clear()', () => {
        it('Test 38: should clear all tasks', () => {
            creator.createFollowUps('parent-1', ['c1', 'c2']);
            
            creator.clear();
            
            expect(creator.getCreatedTasks()).toEqual([]);
        });

        it('Test 39: should reset task counter', () => {
            creator.createFollowUps('parent-1', ['c1']);
            creator.clear();
            creator.createFollowUps('parent-1', ['c2']);
            
            const tasks = creator.getCreatedTasks();
            // ID should restart at 1
            expect(tasks[0].id).toContain('followup-1');
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 40: getFollowUpCreator should return singleton', () => {
            const instance1 = getFollowUpCreator();
            const instance2 = getFollowUpCreator();
            
            expect(instance1).toBe(instance2);
        });

        it('Test 41: resetFollowUpCreatorForTests should reset', () => {
            const instance1 = getFollowUpCreator();
            resetFollowUpCreatorForTests();
            const instance2 = getFollowUpCreator();
            
            expect(instance1).not.toBe(instance2);
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 42: should handle empty criteria string', () => {
            const tasks = creator.createFollowUps('parent-1', ['']);
            
            expect(tasks.length).toBe(1);
        });

        it('Test 43: should handle criteria with special characters', () => {
            const tasks = creator.createFollowUps('parent-1', [
                'Handle <html> & "quotes"'
            ]);
            
            expect(tasks[0].targetCriteria[0]).toBe('Handle <html> & "quotes"');
        });

        it('Test 44: should handle very long criterion', () => {
            const longCriterion = 'A'.repeat(500);
            const tasks = creator.createFollowUps('parent-1', [longCriterion]);
            
            expect(tasks.length).toBe(1);
        });

        it('Test 45: should handle unknown grouping strategy as all-in-one', () => {
            creator = new FollowUpCreator({ 
                groupingStrategy: 'unknown' as GroupingStrategy 
            });
            
            const tasks = creator.createFollowUps('parent-1', ['c1', 'c2']);
            
            // Should fall through to default (all-in-one)
            expect(tasks.length).toBe(1);
        });
    });
});
