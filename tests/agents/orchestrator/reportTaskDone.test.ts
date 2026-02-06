/**
 * Tests for Orchestrator reportTaskDone handler
 */

import {
    handleReportTaskDone,
    validateReportTaskDoneRequest,
    TaskCompletionReport
} from '../../../src/agents/orchestrator/handlers/reportTaskDone';
import { initializeTaskQueue, resetTaskQueueForTests, getTaskQueueInstance } from '../../../src/services/taskQueue';

describe('reportTaskDone handler', () => {
    beforeEach(() => {
        resetTaskQueueForTests();
        initializeTaskQueue({ maxConcurrent: 3 });
    });

    afterEach(() => {
        resetTaskQueueForTests();
    });

    it('Test 1: should reject report without task ID', async () => {
        const report: TaskCompletionReport = {
            taskId: '',
            modifiedFiles: ['src/test.ts'],
            summary: 'Made some changes'
        };

        const result = await handleReportTaskDone(report);

        expect(result.accepted).toBe(false);
        expect(result.message).toContain('Task ID is required');
    });

    it('Test 2: should reject report without modified files when required', async () => {
        const report: TaskCompletionReport = {
            taskId: 'task-1',
            modifiedFiles: [],
            summary: 'Made some changes'
        };

        const result = await handleReportTaskDone(report, { requireModifiedFiles: true });

        expect(result.accepted).toBe(false);
        expect(result.message).toContain('Modified files');
    });

    it('Test 3: should reject report with short summary', async () => {
        const report: TaskCompletionReport = {
            taskId: 'task-1',
            modifiedFiles: ['src/test.ts'],
            summary: 'changes'
        };

        const result = await handleReportTaskDone(report);

        expect(result.accepted).toBe(false);
        expect(result.message).toContain('Summary must be at least 10 characters');
    });

    it('Test 4: should accept valid report for running task', async () => {
        const taskQueue = getTaskQueueInstance();

        // Add and start a task
        taskQueue.addTask({
            id: 'task-1',
            title: 'Test Task',
            priority: 1,
            dependencies: []
        });
        taskQueue.startTask('task-1');

        const report: TaskCompletionReport = {
            taskId: 'task-1',
            modifiedFiles: ['src/test.ts'],
            summary: 'Implemented the test feature with proper error handling'
        };

        const result = await handleReportTaskDone(report);

        expect(result.accepted).toBe(true);
        expect(result.newStatus).toBe('completed');
    });

    it('Test 5: should auto-pass with high confidence', async () => {
        const taskQueue = getTaskQueueInstance();

        taskQueue.addTask({
            id: 'task-1',
            title: 'Test Task',
            priority: 1,
            dependencies: []
        });
        taskQueue.startTask('task-1');

        const report: TaskCompletionReport = {
            taskId: 'task-1',
            modifiedFiles: ['src/test.ts'],
            summary: 'Implemented feature with comprehensive tests',
            confidence: 98
        };

        const result = await handleReportTaskDone(report, { minConfidenceForAutoPass: 95 });

        expect(result.accepted).toBe(true);
        expect(result.nextStep).toBe('done');
        expect(result.message.toLowerCase()).toContain('auto');
    });

    it('Test 6: should reject report for non-running task', async () => {
        const taskQueue = getTaskQueueInstance();

        // Add task but don't start it
        taskQueue.addTask({
            id: 'task-1',
            title: 'Test Task',
            priority: 1,
            dependencies: []
        });

        const report: TaskCompletionReport = {
            taskId: 'task-1',
            modifiedFiles: ['src/test.ts'],
            summary: 'Added new feature implementation'
        };

        const result = await handleReportTaskDone(report);

        expect(result.accepted).toBe(false);
        expect(result.message).toContain('not running');
    });

    it('Test 7: should reject report for non-existent task', async () => {
        const report: TaskCompletionReport = {
            taskId: 'nonexistent-task',
            modifiedFiles: ['src/test.ts'],
            summary: 'Added new feature implementation'
        };

        const result = await handleReportTaskDone(report);

        expect(result.accepted).toBe(false);
        expect(result.message).toContain('not found');
    });

    describe('validateReportTaskDoneRequest', () => {
        it('Test 8: should return null for invalid params', () => {
            expect(validateReportTaskDoneRequest(null)).toBeNull();
            expect(validateReportTaskDoneRequest(undefined)).toBeNull();
            expect(validateReportTaskDoneRequest('string')).toBeNull();
            expect(validateReportTaskDoneRequest({ noTaskId: true })).toBeNull();
        });

        it('Test 9: should parse valid params', () => {
            const result = validateReportTaskDoneRequest({
                taskId: 'task-1',
                modifiedFiles: ['src/test.ts'],
                summary: 'Done',
                confidence: 90
            });

            expect(result).not.toBeNull();
            expect(result?.taskId).toBe('task-1');
            expect(result?.modifiedFiles).toEqual(['src/test.ts']);
            expect(result?.confidence).toBe(90);
        });
    });
});
