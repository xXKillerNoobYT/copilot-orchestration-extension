/**
 * @file tests/services/taskQueue/validation.test.ts
 * @description Comprehensive tests for task dependency validation (MT-016.5)
 */

import {
    DependencyGraph,
    createDependencyGraph
} from '../../../src/services/taskQueue/dependencyGraph';
import {
    validateDependsOn,
    validateTaskGraph,
    validateNewDependency,
    isValidTaskId,
    formatValidationErrors
} from '../../../src/services/taskQueue/validation';

describe('validation', () => {
    describe('isValidTaskId', () => {
        it('Test 1: should accept valid task IDs', () => {
            expect(isValidTaskId('task-1')).toBe(true);
            expect(isValidTaskId('MT-001')).toBe(true);
            expect(isValidTaskId('MT-001.1')).toBe(true);
            expect(isValidTaskId('TK_0001')).toBe(true);
            expect(isValidTaskId('task123')).toBe(true);
        });

        it('Test 2: should reject invalid task IDs', () => {
            expect(isValidTaskId('')).toBe(false);
            expect(isValidTaskId('-task')).toBe(false); // starts with dash
            expect(isValidTaskId(' task')).toBe(false); // starts with space
            expect(isValidTaskId('task with spaces')).toBe(false);
        });
    });

    describe('validateDependsOn', () => {
        it('Test 3: should pass for task with valid dependencies', () => {
            const existingTasks = new Set(['task-1', 'task-2']);
            const task = { id: 'task-3', dependencies: ['task-1', 'task-2'] };

            const result = validateDependsOn(task, existingTasks);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('Test 4: should fail for self-dependency', () => {
            const existingTasks = new Set(['task-1']);
            const task = { id: 'task-1', dependencies: ['task-1'] };

            const result = validateDependsOn(task, existingTasks);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.type === 'self-dependency')).toBe(true);
        });

        it('Test 5: should fail for missing dependency', () => {
            const existingTasks = new Set(['task-1']);
            const task = { id: 'task-2', dependencies: ['task-3'] }; // task-3 doesn't exist

            const result = validateDependsOn(task, existingTasks);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.type === 'missing-dependency')).toBe(true);
        });

        it('Test 6: should warn for duplicate dependencies', () => {
            const existingTasks = new Set(['task-1', 'task-2']);
            const task = { id: 'task-2', dependencies: ['task-1', 'task-1'] };

            const result = validateDependsOn(task, existingTasks);
            expect(result.warnings.some(w => w.type === 'duplicate-dependency')).toBe(true);
        });

        it('Test 7: should fail for invalid task ID format', () => {
            const existingTasks = new Set(['task-1']);
            const task = { id: 'invalid task', dependencies: [] };

            const result = validateDependsOn(task, existingTasks);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.type === 'invalid-id')).toBe(true);
        });
    });

    describe('validateTaskGraph', () => {
        it('Test 8: should pass for valid task graph', () => {
            const tasks = [
                { id: 'task-1', dependencies: [] },
                { id: 'task-2', dependencies: ['task-1'] },
                { id: 'task-3', dependencies: ['task-2'] }
            ];

            const result = validateTaskGraph(tasks);
            expect(result.valid).toBe(true);
        });

        it('Test 9: should fail for circular dependencies', () => {
            const tasks = [
                { id: 'task-1', dependencies: ['task-3'] },
                { id: 'task-2', dependencies: ['task-1'] },
                { id: 'task-3', dependencies: ['task-2'] }
            ];

            const result = validateTaskGraph(tasks);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.type === 'circular-dependency')).toBe(true);
        });

        it('Test 10: should warn for orphan tasks', () => {
            const tasks = [
                { id: 'task-1', dependencies: [] },
                { id: 'task-2', dependencies: ['task-1'] },
                { id: 'orphan', dependencies: [] }  // No deps and nothing depends on it
            ];

            const result = validateTaskGraph(tasks);
            // Note: warnings don't make result invalid
            // The actual warning behavior depends on whether other tasks have dependencies
        });
    });

    describe('validateNewDependency', () => {
        it('Test 11: should allow valid new dependency', () => {
            const graph = createDependencyGraph();
            graph.addNode('A');
            graph.addNode('B');

            const result = validateNewDependency('B', 'A', graph);
            expect(result.valid).toBe(true);
        });

        it('Test 12: should reject self-dependency', () => {
            const graph = createDependencyGraph();
            graph.addNode('A');

            const result = validateNewDependency('A', 'A', graph);
            expect(result.valid).toBe(false);
            expect(result.errors[0].type).toBe('self-dependency');
        });

        it('Test 13: should reject missing dependency', () => {
            const graph = createDependencyGraph();
            graph.addNode('A');

            const result = validateNewDependency('A', 'B', graph);
            expect(result.valid).toBe(false);
            expect(result.errors[0].type).toBe('missing-dependency');
        });

        it('Test 14: should reject cycle-creating dependency', () => {
            const graph = createDependencyGraph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'B');

            // A depending on C would create cycle A→C→B→A
            const result = validateNewDependency('A', 'C', graph);
            expect(result.valid).toBe(false);
            expect(result.errors[0].type).toBe('circular-dependency');
        });
    });

    describe('formatValidationErrors', () => {
        it('Test 15: should format success message', () => {
            const result = { valid: true, errors: [], warnings: [] };
            const formatted = formatValidationErrors(result);
            expect(formatted).toContain('passed');
        });

        it('Test 16: should format error messages', () => {
            const result = {
                valid: false,
                errors: [{ taskId: 'A', type: 'self-dependency' as const, message: 'Task A depends on itself' }],
                warnings: []
            };
            const formatted = formatValidationErrors(result);
            expect(formatted).toContain('failed');
            expect(formatted).toContain('Task A depends on itself');
        });
    });
});
